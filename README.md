# Update Tracker — web (Next.js + Supabase)

The web version of the tracker: a Next.js app with Supabase for storage and
**login**, so each person has their own private boards. Same design as the
local app, plus a **calendar view**.

> The original local app (vanilla JS + `server.js`) still lives in the repo root
> as a reference. This `web/` folder is the deployable web app.

## What's inside
- **Auth**: email magic-link + Google sign-in (Supabase Auth, cookie sessions).
- **Data**: Postgres tables `projects` and `cards` with **row-level security** —
  users can only ever read/write their own rows.
- **Board**: projects, three columns, drag-and-drop, inline editor, versions
  (per-version colors, mark-completed/archive), bugs (+ filter), overdue dates.
- **Calendar**: month view placing cards on their target date, in the same style.

---

## 1. Create a Supabase project
1. Go to <https://supabase.com> → **New project**. Pick a name + database password.
2. When it's ready, open **Project Settings → API** and copy:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## 2. Create the tables + security
In the Supabase dashboard → **SQL Editor** → paste the contents of
[`supabase/schema.sql`](./supabase/schema.sql) and **Run**. This creates the
tables, the row-level-security policies, and a trigger that seeds a first
project for each new user.

## 3. Configure auth
In the dashboard → **Authentication**:
- **Providers → Email**: leave enabled (magic links work out of the box).
- **Providers → Google** (optional): enable it and paste a Google OAuth client
  id/secret (Google Cloud Console → OAuth credentials). Skip this if you only
  want email links.
- **URL Configuration → Redirect URLs**: add
  - `http://localhost:3000/auth/callback` (local dev)
  - `https://YOUR-DOMAIN/auth/callback` (after you deploy)

## 4. Environment variables
```bash
cp .env.example .env.local
```
Fill `.env.local` with the URL + anon key from step 1.

## 5. Run it
```bash
npm install      # already done if you see node_modules
npm run dev
```
Open <http://localhost:3000> → you'll be sent to **/login**. Sign in, and the
board appears (with a seeded starter project).

## 6. Deploy (Vercel)
1. Push the repo to GitHub.
2. <https://vercel.com> → **New Project** → import the repo. Set the **Root
   Directory** to `web`.
3. Add the two env vars (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`).
4. Deploy, then add your Vercel URL to Supabase **Redirect URLs** (step 3).

(Netlify/Cloudflare Pages work too — any Next.js host.)

---

## Project layout
```
web/
  app/
    layout.tsx            fonts + global styles
    page.tsx              → redirects to /board
    login/                magic-link + Google sign-in
    auth/callback         exchanges the auth code for a session
    auth/signout          sign-out route
    board/page.tsx        server: loads the user's projects + cards
    board/BoardApp.tsx    the interactive board (client)
    board/Calendar.tsx    month calendar view
    globals.css           the full design system
  lib/
    supabase/             browser + server + middleware clients
    types.ts util.ts      shared types & pure helpers
  supabase/schema.sql     run this once in Supabase
  middleware.ts           refreshes sessions, guards routes
```

## Notes
- The `process.version ... Edge Runtime` line during `next build` is a known,
  harmless warning from `@supabase/ssr` in middleware; the build succeeds.
- Export/Import (the JSON backup buttons from the local app) aren't ported yet —
  with a real database your data is already persisted and synced. Say the word
  if you still want a manual export.
- All changes save per-action straight to Supabase (you'll see `saving… / saved`
  in the top bar).
