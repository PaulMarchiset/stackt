<div align="center">

# Stackt

**Plan your updates. Ship with less chaos.**

A dead-simple board for planning releases — versions, bugs and a timeline —
whether you're flying solo or shipping with a team.

[**stackt.paulmarchiset.me**](https://stackt.paulmarchiset.me) · built by [Paul Marchiset](https://paulmarchiset.me)

</div>

---

## Why this exists

I needed somewhere to keep track of my own projects.

Not a sprint planner. Not a workspace with a 12-step onboarding and a permissions
matrix. Just a place to write down what I was going to ship, which version it
belonged to, and what was on fire — without spending an afternoon configuring it
first.

So I built one. It started as a **local app**: vanilla JS, a tiny `server.js`, a
JSON file on disk. It did the job for exactly one person on exactly one machine,
which was the point.

Then it kept being useful. Opening a laptop and not having my board there got
annoying, so I rebuilt it on **Next.js + Supabase** — real accounts, real
database, row-level security so every board stays private to its owner, and the
same thing waiting for you on any device.

Somewhere along the way it stopped being only a developer tool. The structure —
things to do, grouped into releases, some of them urgent — turns out to be how
plenty of people organise work that has nothing to do with code. So Stackt ships
with **two dialects** (see below): one that says *Version* and *Bug*, one that
says *Phase* and *Urgent*. Same app underneath, different words on top.

## What it does

- **A board that gets out of the way.** To do · In progress · Done. Drag a card,
  it moves. No setup, no ceremony.
- **Versioned by design.** Group cards by version, give each release its own
  colour, archive it in one click when it ships.
- **Bugs, not buried.** Log one the second you find it, then filter the board
  down to just bugs when it's time to squash them.
- **Timeline view.** A horizontal calendar of what's due, day by day — with a
  vertical agenda on mobile.
- **Daily reminder email.** One mail a morning with what's overdue, due today,
  coming up, or sitting undated. You pick the projects, the sections and the
  horizon; a live preview shows exactly what will land.
- **Many projects, one home.** Side projects, client work, that thing you'll
  definitely finish — switch between them instantly.
- **Private by default.** Every row is owned by a user and guarded by row-level
  security in Postgres.

### Developer mode

A per-device default (overridable per project) that swaps the vocabulary and the
git-flavoured extras:

|                | Developer mode on | Developer mode off |
| -------------- | ----------------- | ------------------ |
| Planned item   | Update            | Task               |
| Problem        | Bug               | Urgent             |
| Grouping       | Version (`v1.2.0`) | Phase (`Launch`)  |
| Extras         | Repo link + branch field on cards | hidden |

The data model never changes — only the words. Everything funnels through
[`lib/labels.ts`](./lib/labels.ts), so re-wording the whole app is one edit.

---

## Running it yourself

### 1. Create a Supabase project

<https://supabase.com> → **New project**. Once it's up, open
**Project Settings → API** and copy the **Project URL** and the **anon public** key.

### 2. Create the tables

**SQL Editor** → paste [`supabase/schema.sql`](./supabase/schema.sql) → **Run**.
That creates the tables, the row-level-security policies, and the trigger that
seeds a starter project for each new user.

> Already have a database from an earlier version? Don't re-run `schema.sql` —
> apply the numbered files in [`supabase/migrations/`](./supabase/migrations/)
> in order instead.

### 3. Configure auth

**Authentication → Providers**: Email is enabled out of the box (magic links).
For Google, enable the provider and paste an OAuth client id/secret from the
Google Cloud Console.

> The **Continue with Google** button is currently always rendered on the login
> screen. If you don't enable the provider in Supabase, it will show and fail —
> so either enable Google or remove the button.

**URL Configuration → Redirect URLs**, add:

```
http://localhost:3000/auth/callback     # local
https://YOUR-DOMAIN/auth/callback       # once deployed
```

The sign-in email templates live in [`supabase/`](./supabase/) — paste them into
**Authentication → Email Templates** if you want the branded versions.

### 4. Environment

```bash
cp .env.example .env.local
```

| Variable | Needed for |
| -------- | ---------- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | everything |
| `SUPABASE_SERVICE_ROLE_KEY` | deleting the auth record on account deletion (server-only) |
| `EMAIL_PROVIDER`, `BREVO_API_KEY`, `EMAIL_FROM` | sending the daily reminder |
| `CRON_SECRET` | locking down the cron endpoint |

`EMAIL_PROVIDER` defaults to `console`, which just logs the mail — local dev
needs no API key.

### 5. Run

```bash
npm install
npm run dev
```

<http://localhost:3000> → sign in → your board.

### 6. Deploy (Vercel)

Import the repo, set the **Root Directory** to `web`, add the env vars, deploy —
then add your deployed URL to Supabase **Redirect URLs**.

The daily email is a Vercel cron declared in [`vercel.json`](./vercel.json),
hitting `/api/cron/daily` at **08:00 UTC**. Set `CRON_SECRET` in Vercel so nobody
else can trigger it.

---

## Layout

```
app/
  page.tsx              landing page
  board/                the board: kanban, timeline, mobile agenda, card editor
  projects/             all-projects home
  settings/             profile, preferences, email reminder builder
  api/cron/daily/       the reminder cron target
  auth/                 callback · signout · account deletion
  globals.css           the whole design system
lib/
  email/                digest template + swappable providers (console · brevo)
  supabase/             browser · server · middleware clients
  labels.ts             the two vocabularies (developer / plain)
  types.ts  util.ts     shared types and pure helpers
supabase/
  schema.sql            fresh install
  migrations/           ordered changes to an existing database
middleware.ts           refreshes sessions, guards routes
```

## Notes

- Every change saves per-action straight to Supabase — watch `saving… / saved` in
  the top bar.
- The `process.version … Edge Runtime` warning during `next build` comes from
  `@supabase/ssr` in middleware. It's known and harmless; the build succeeds.
- The reminder email is rendered by the same function the settings preview uses
  ([`lib/email/template.ts`](./lib/email/template.ts)), so what you see in
  Settings is what lands in your inbox.

---

<div align="center">
Made by <a href="https://paulmarchiset.me"><strong>Paul Marchiset</strong></a>
</div>
