-- ============================================================
-- Isolation check for the access model — run it in the SQL editor.
--
-- Not a one-off for a single migration: this is the regression test for every
-- rule that decides who can reach what. Re-run it after ANY change to a policy,
-- a grant, or one of the security-definer functions. RLS mistakes are silent —
-- nothing errors, data is simply visible to someone it should not be — so a
-- script you can paste in one go is the cheapest way to keep them from shipping.
--
-- 0010 rewrote every access policy on projects, versions and cards. This proves,
-- against the real database, that the rewrite kept strangers out and let members
-- in. It creates two throwaway users, asserts, and rolls everything back —
-- nothing survives, including on failure.
--
-- Step 0 checks the test harness itself before testing anything else. Supabase
-- has shipped two spellings of the impersonation setting over the years, and
-- auth.uid() reads whichever its own version was built against. If it comes back
-- null, `user_id` defaults to null, `user_id = auth.uid()` is null rather than
-- true, and every insert fails an RLS check — which looks exactly like a broken
-- policy but isn't. Both spellings are set below, and step 0 refuses to continue
-- unless auth.uid() actually answers.
--
-- No output but the final notice = everything held.
-- ============================================================

begin;

do $$
declare
  alice uuid := gen_random_uuid();
  bob   uuid := gen_random_uuid();
  proj  uuid;
  seen  uuid;
  n     integer;
begin
  insert into auth.users (id, email, instance_id, aud, role)
  values (alice, 'alice.rlscheck@example.invalid', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
         (bob,   'bob.rlscheck@example.invalid',   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

  -- ---------- become Alice ----------
  perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', alice::text, true);
  set local role authenticated;

  -- ---------- 0. Does the impersonation even work? ----------
  seen := (select auth.uid());
  if seen is null then
    raise exception
      'SETUP: auth.uid() returned null. The harness cannot impersonate on this Postgres, so nothing below would mean anything. This is not a policy failure.';
  elsif seen <> alice then
    raise exception 'SETUP: auth.uid() is % but should be %', seen, alice;
  end if;

  -- ---------- 1. Creating a project makes you its owner ----------
  -- Through create_project(), which is how the app does it and why 0012 exists:
  -- a bare `insert ... returning` has its RETURNING checked by the SELECT
  -- policy before the AFTER trigger has made you a member, so it fails even
  -- though the row is created. That is the bug this test originally tripped on.
  proj := (public.create_project('Alice private')).id;

  if not public.is_project_owner(proj) then
    raise exception 'FAIL 1: creator is not the owner';
  end if;

  -- ---------- 2. The owner sees it ----------
  select count(*) into n from public.projects where id = proj;
  if n <> 1 then raise exception 'FAIL 2: owner cannot see own project (got %)', n; end if;

  -- ---------- become Bob ----------
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', bob, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', bob::text, true);
  set local role authenticated;

  -- ---------- 3. A stranger sees nothing ----------
  select count(*) into n from public.projects where id = proj;
  if n <> 0 then raise exception 'FAIL 3: stranger can SEE another user''s project'; end if;

  select count(*) into n from public.cards where project_id = proj;
  if n <> 0 then raise exception 'FAIL 3b: stranger can see another user''s cards'; end if;

  -- ---------- 4. A stranger cannot let themselves in ----------
  -- There is no INSERT grant on project_members at all, so this must error.
  begin
    insert into public.project_members (project_id, user_id, role) values (proj, bob, 'owner');
    raise exception 'FAIL 4: stranger added themselves to a project';
  exception
    when insufficient_privilege or check_violation then null;   -- expected
  end;

  -- ---------- 5. An invitation lets them in, case-insensitively ----------
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', alice::text, true);
  set local role authenticated;

  insert into public.project_invites (project_id, email, role)
  values (proj, '  BOB.RLSCheck@Example.Invalid ', 'editor');   -- mixed case and padding on purpose

  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', bob, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', bob::text, true);
  set local role authenticated;

  if public.claim_project_invites() <> 1 then
    raise exception 'FAIL 5: invite was not claimed (email normalisation?)';
  end if;

  select count(*) into n from public.projects where id = proj;
  if n <> 1 then raise exception 'FAIL 5b: member still cannot see the project'; end if;

  -- ---------- 6. An editor is not an owner ----------
  if public.is_project_owner(proj) then
    raise exception 'FAIL 6: editor came out as owner';
  end if;

  delete from public.projects where id = proj;                  -- silently filtered by RLS
  select count(*) into n from public.projects where id = proj;
  if n <> 1 then raise exception 'FAIL 6b: an editor deleted the project'; end if;

  -- ---------- 7. An editor cannot promote themselves ----------
  begin
    update public.project_members set role = 'owner' where project_id = proj and user_id = bob;
    -- No error is still a failure if the value actually moved.
    if public.is_project_owner(proj) then
      raise exception 'FAIL 7: editor promoted themselves to owner';
    end if;
  exception
    when insufficient_privilege then null;                      -- expected: no grant on `role`
  end;

  -- ---------- 8. ...but can set their own reminder ----------
  update public.project_members set remind = true where project_id = proj and user_id = bob;
  select count(*) into n from public.project_members
    where project_id = proj and user_id = bob and remind;
  if n <> 1 then raise exception 'FAIL 8: member cannot set their own remind flag'; end if;

  -- ---------- 8b. Personal settings do not leak between members ----------
  -- The guarantee migrations 0010 and 0014 exist for: two people on one board
  -- disagree about it freely. Bob starred it above; Alice must not inherit that.
  update public.project_members set favorite = true, position = 7
  where project_id = proj and user_id = bob;

  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', alice::text, true);
  set local role authenticated;

  select count(*) into n from public.project_members
    where project_id = proj and user_id = alice and (favorite or position = 7 or remind);
  if n <> 0 then
    raise exception 'FAIL 8b: one member''s favourite/order/reminder reached another';
  end if;

  -- ---------- 9. A project cannot be left ownerless ----------
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', alice::text, true);
  set local role authenticated;

  begin
    perform public.remove_project_member(proj, alice);
    raise exception 'FAIL 9: project was left without an owner';
  exception
    when raise_exception then
      if sqlerrm like 'FAIL 9%' then raise; end if;             -- our own assertion, not the guard's
  end;

  -- ---------- 10. ...yet the owner can still delete it outright ----------
  -- This is the cascade guard from 0010: the membership rows go with the
  -- project without the last-owner check blocking the delete.
  delete from public.projects where id = proj;
  select count(*) into n from public.projects where id = proj;
  if n <> 0 then raise exception 'FAIL 10: owner cannot delete the project'; end if;

  reset role;
  raise notice 'All checks passed (harness + 10 assertions).';
end $$;

-- Nothing is kept, pass or fail.
rollback;
