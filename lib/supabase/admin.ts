import { createClient } from '@supabase/supabase-js';

/* Service-role Supabase client for trusted server-only contexts (e.g. the cron
   job) that must read across all users. It bypasses row-level security, so it
   must NEVER be imported into client code. Requires SUPABASE_SERVICE_ROLE_KEY. */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set');
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}
