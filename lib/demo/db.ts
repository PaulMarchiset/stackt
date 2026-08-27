'use client';

import type { createClient } from '@/lib/supabase/client';

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
 * A stand-in for the browser Supabase client, typed as the real one so the
 * stores can hold either without knowing which they got. The cast is the whole
 * point: it is asserted once, here, instead of leaking a union into every
 * mutation in the app.
 */
export function createDemoClient(): ReturnType<typeof createClient> {
  return {
    from: (table: string) => new DemoQuery(table)
  } as unknown as ReturnType<typeof createClient>;
}
