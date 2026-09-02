import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import SettingsView from './SettingsView';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Settings', robots: { index: false, follow: false } };

export default async function SettingsPage({
  searchParams
}: {
  searchParams: { deleted?: string };
}) {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  return (
    <SettingsView
      userId={user.id}
      userEmail={user.email ?? ''}
      userName={(user.user_metadata?.username as string) ?? ''}
      deleteFailed={searchParams.deleted === 'partial'}
    />
  );
}
