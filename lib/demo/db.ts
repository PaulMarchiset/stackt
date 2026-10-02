'use client';

import type { createClient } from '@/lib/supabase/client';
import { DEMO_USER } from './fixture';

/**
 * The database the demo writes to: none.
 *
 * The demo is a real, live app — you can drag cards, tick them off, rename a
 * group, add a project — it just has nowhere to save. Every store reaches its
 * data through a Supabase query builder, so the smallest honest way to say
 * "this session is a sandbox" is to hand it a builder that answers the way
 * Supabase would and forgets. Local state moves (that is what the screenshot
 * needs), the write succeeds silently, and a reload brings the fixture back.
 *
 * Only the handful of shapes the app actually builds are supported —
 * `.insert().select().single()`, `.update().eq()`, `.delete().eq()`,
 * `.upsert()` — because this stands in for lib/supabase/client, not for
 * supabase-js. Reads answer empty: in demo mode the rows come from the server
 * as props (lib/demo/fixture.ts), never from a query in the browser.
 */

type Row = Record<string, unknown>;

/* Columns the database would have filled in for a row the app just created.
   Without them a freshly added card or project is missing the fields the board
   reads a moment later, and the demo breaks exactly where it is being filmed. */
const DEFAULTS: Record<string, Row> = {
  projects: {
    active_version_id: null, group_id: null, favorite: false, repo_url: '',
    position: 999, dev_mode: null, remind: true
  },
  project_groups: { color_index: null, position: 0 },
  versions: { color_index: null, completed: false, completed_at: null, ship_date: null, position: 0 },
  cards: {
    comment: '', version_id: null, target_date: null, end_date: null,
    status: 'todo', done: false, done_at: null, type: 'update', branch: '', position: 0
  },
  card_assignees: {},
  card_comments: { body: '' },
  card_mentions: { read_at: null },
  user_prefs: {}
};

let n = 0;
function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return 'demo-' + Date.now() + '-' + ++n;
  }
}

const stamp = (table: string, row: Row): Row => ({
  ...(DEFAULTS[table] ?? {}), id: newId(), ...row
});

/**
 * One query. Every filter/ordering method returns `this` and does nothing —
 * there is no store to filter — and awaiting it resolves to whatever the write
 * put in, in the shape the caller asked for.
 */
class DemoQuery implements PromiseLike<{ data: unknown; error: null }> {
  private rows: Row[] = [];
  private one = false;

  constructor(private table: string) {}

  insert(values: Row | Row[]) {
    this.rows = (Array.isArray(values) ? values : [values]).map((r) => stamp(this.table, r));
    return this;
  }

  upsert(values: Row | Row[]) {
    return this.insert(values);
  }

  update(_values: Row) { return this; }
  delete() { return this; }
  select(_cols?: string) { return this; }
  eq(_col: string, _val: unknown) { return this; }
  order(_col: string, _opts?: unknown) { return this; }

  single() { this.one = true; return this; }
  maybeSingle() { this.one = true; return this; }

  then<R1 = { data: unknown; error: null }, R2 = never>(
    onfulfilled?: ((value: { data: unknown; error: null }) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null
  ): PromiseLike<R1 | R2> {
    const data = this.one ? this.rows[0] ?? null : this.rows;
    return Promise.resolve({ data, error: null }).then(onfulfilled, onrejected);
  }
}

/**
 * Stored procedures, stubbed the same way the tables are.
 *
 * create_project is the one that matters: since the collaborative work, making
 * a project is an RPC rather than an insert (a plain `insert ... select` cannot
 * satisfy the membership policy that guards its own RETURNING — see migration
 * 0012). Without a stand-in here, "Create" in the demo would call a method the
 * stub doesn't have and throw. Anything else resolves to null, which is what a
 * function with nothing to say returns.
 */
class DemoRpc implements PromiseLike<{ data: unknown; error: null }> {
  constructor(private fn: string, private args: Row) {}

  then<R1 = { data: unknown; error: null }, R2 = never>(
    onfulfilled?: ((value: { data: unknown; error: null }) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null
  ): PromiseLike<R1 | R2> {
    let data: unknown = null;

    if (this.fn === 'create_project') {
      data = stamp('projects', {
        name: (this.args.p_name as string) || 'New project',
        repo_url: (this.args.p_repo_url as string) ?? '',
        dev_mode: (this.args.p_dev_mode as boolean | null) ?? null
      });
    } else if (this.fn === 'project_members_detailed') {
      /* A populated sharing panel, for the same reason the board is populated:
         this is the surface being photographed, and an empty members list is
         not what the feature looks like in use. The demo user is the owner, so
         the invite form and the role controls are all on screen. */
      data = [
        { user_id: DEMO_USER.id, email: DEMO_USER.email, role: 'owner', joined_at: '2026-01-04T09:00:00Z' },
        { user_id: 'demo-mate-1', email: 'lena@example.com', role: 'editor', joined_at: '2026-02-11T09:00:00Z' },
        { user_id: 'demo-mate-2', email: 'sam@example.com', role: 'editor', joined_at: '2026-03-02T09:00:00Z' }
      ];
    } else if (this.fn === 'project_invites_pending') {
      data = [{ id: 'demo-inv-1', email: 'noor@example.com', role: 'editor', expires_at: '2099-01-01T00:00:00Z' }];
    } else if (this.fn === 'add_comment_with_mentions') {
      /* Comment posting in demo mode: build the row the database would have
         returned so the thread updates locally (nothing is kept — a reload
         brings the fixture back, like every other demo write). */
      const now = new Date().toISOString();
      data = stamp('card_comments', {
        card_id: this.args.c,
        user_id: DEMO_USER.id,
        body: (this.args.b as string) ?? '',
        created_at: now,
        updated_at: now
      });
    }

    return Promise.resolve({ data, error: null }).then(onfulfilled, onrejected);
  }
}

/**
 * A stand-in for the browser Supabase client, typed as the real one so the
 * stores can hold either without knowing which they got. The cast is the whole
 * point: it is asserted once, here, instead of leaking a union into every
 * mutation in the app.
 */
export function createDemoClient(): ReturnType<typeof createClient> {
  return {
    from: (table: string) => new DemoQuery(table),
    rpc: (fn: string, args?: Row) => new DemoRpc(fn, args ?? {})
  } as unknown as ReturnType<typeof createClient>;
}
