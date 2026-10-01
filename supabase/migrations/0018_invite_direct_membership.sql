-- ============================================================
-- Migration 0018 — fixes the hole that made a shared board invisible:
--   • invite_to_project()      : membership NOW when the invitee has an account
--   • project_members.added_by : who let them in (and the honest rate-limit count)
--   • claim_project_invites()  : early exit, so it is cheap enough to call often
--
-- What went wrong. An invitation wrote a row to project_invites, and ONLY
-- claim_project_invites() turned that into the project_members row every policy
-- actually reads. That function ran in exactly two places — the magic-link
-- callback and the OTP form — both on the sign-in path. Someone already signed
-- in (a Supabase session survives for weeks) passed through neither, so:
--
--   invitation exists → membership does not → projects_select_member excludes
--   the project → it is absent from All projects and the board is unreachable.
--
-- The invitee gets the email, is told they have been added, and finds nothing.
-- No error anywhere: the invitation is real, it is simply never redeemed. The
-- UI even said so out loud — "They join as soon as they sign in" — which is
-- precisely the bug, written down as a feature.
--
-- The fix is in two halves, and both are needed:
--
--   B (this function) — if the address already belongs to a confirmed account,
--     write the membership immediately and skip project_invites entirely. This
--     is what the invitation email has always implied.
--   A (the client)    — /projects calls claim_project_invites() on load, so the
--     invitations already sitting in the table, including ones sent before this
--     migration, are picked up without anybody signing out.
--
-- Run it in the Supabase SQL editor, after 0017.
-- ============================================================

begin;

-- ---------- Who added this person ----------
-- Null for a membership that came from claim_project_invites(): there the
-- inviter is already recorded on the invitation row, and counting it here as
-- well would charge one invitation to the rate limit twice — see the count in
-- invite_to_project(), which is the reason this column exists.
alter table public.project_members
  add column if not exists added_by uuid references auth.users (id) on delete set null;

-- ---------- Inviting, in one call ----------
-- Returns a status rather than raising for the ordinary outcomes: "already a
-- member" and "already invited" are things the caller displays, not failures,
-- and matching on an exception message is a fragile way to tell them apart.
-- Authorization is the one thing that raises — a non-owner reaching this is not
-- a state the UI should be rendering a friendly note about.
--
--   'member'          → added, they have access right now
--   'invited'         → no account yet; invitation stored, claimed on sign-in
--   'already_member'  → nothing done
--   'already_invited' → nothing done
--   'self'            → nothing done
--   'rate_limited'    → nothing done
create or replace function public.invite_to_project(p uuid, addr text)
returns text
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  uid    uuid := auth.uid();
  v_email text := lower(btrim(addr));
  cutoff timestamptz := now() - interval '1 hour';
  target uuid;
  recent integer;
begin
  if uid is null then
    raise exception 'invite_to_project: no authenticated user';
  end if;
  if not public.is_project_owner(p) then
    raise exception 'invite_to_project: not an owner of project %', p;
  end if;
  if v_email = '' then
    raise exception 'invite_to_project: no address';
  end if;

  /* The cap that stops a free signup being used as a mail relay. It has to
     count both shapes of invitation now, or half of them stop counting the day
     this function starts writing memberships instead of invites.

     Both halves are attributed to the person who acted: invitations by
     invited_by, memberships by added_by. A membership written by
     claim_project_invites() has added_by null and is not counted again — the
     invitation it came from was already charged when it was sent, possibly to
     a different hour, and charging the inviter a second time when someone else
     signs in would rate-limit them for another person's action.

     Ten, generous on purpose: onboarding a real team of eight in one sitting
     must not trip it; sending a hundred must. */
  select count(*) into recent
  from (
    select 1 from public.project_invites i
      where i.invited_by = uid and i.created_at > cutoff
    union all
    select 1 from public.project_members m
      where m.added_by = uid and m.created_at > cutoff
  ) x;

  if recent >= 10 then
    return 'rate_limited';
  end if;

  /* Confirmed accounts only. An unconfirmed row in auth.users is an address
     somebody typed, not an address anybody has proven they hold — handing it a
     membership would let a signup with your colleague's email walk into the
     board. Falling through to the invitation path is the right answer for
     those: it is redeemed on first sign-in, which is the moment the address is
     proven. */
  select u.id into target
  from auth.users u
  where lower(u.email) = v_email
    and u.email_confirmed_at is not null
  order by u.created_at
  limit 1;

  if target = uid then
    return 'self';
  end if;

  -- ---- They have an account: straight in ----
  if target is not null then
    if exists (
      select 1 from public.project_members m
      where m.project_id = p and m.user_id = target
    ) then
      return 'already_member';
    end if;

    /* No INSERT grant on project_members exists for `authenticated` — this
       function being SECURITY DEFINER is the whole reason the write lands, and
       the owner check above is the whole reason it is allowed to. */
    insert into public.project_members (project_id, user_id, role, added_by)
    values (p, target, 'editor', uid);

    /* An invitation to the same address is spent the moment they are a member;
       leaving it would show them under "Invited, not yet joined" forever. */
    delete from public.project_invites i where i.project_id = p and i.email = v_email;

    return 'member';
  end if;

  -- ---- No account yet: the invitation waits for them ----
  if exists (
    select 1 from public.project_invites i
    where i.project_id = p and i.email = v_email
  ) then
    return 'already_invited';
  end if;

  insert into public.project_invites (project_id, email, invited_by)
  values (p, v_email, uid);

  return 'invited';
end;
$$;

revoke all on function public.invite_to_project(uuid, text) from public, anon;
grant execute on function public.invite_to_project(uuid, text) to authenticated;

-- ---------- Claiming, cheap enough to call on every page load ----------
-- Unchanged in what it does; the early exit is what is new. /projects now calls
-- this on load, and the old body wrote on every single one of them: the DELETE
-- at the end ran whether or not there was anything to delete. The probe below
-- uses project_invites_email_idx and touches nothing when there is no
-- invitation, which is the overwhelmingly common case.
create or replace function public.claim_project_invites()
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  uid   uuid := auth.uid();
  addr  text;
  taken integer := 0;
begin
  if uid is null then
    raise exception 'claim_project_invites: no authenticated user';
  end if;

  select lower(u.email) into addr from auth.users u where u.id = uid;
  if addr is null then return 0; end if;

  -- Nothing addressed to us: read-only and out, no write, no lock.
  if not exists (select 1 from public.project_invites i where i.email = addr) then
    return 0;
  end if;

  insert into public.project_members (project_id, user_id, role)
  select i.project_id, uid, i.role
  from public.project_invites i
  where i.email = addr and i.expires_at > now()
  on conflict (project_id, user_id) do nothing;

  get diagnostics taken = row_count;

  -- Expired ones go too: they were addressed to this person and are spent.
  delete from public.project_invites where email = addr;
  return taken;
end;
$$;

revoke all on function public.claim_project_invites() from public, anon;
grant execute on function public.claim_project_invites() to authenticated;

commit;
