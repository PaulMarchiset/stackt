'use client';

import type { Toast as ToastData } from '@/lib/useToast';

/* Renders whatever useToast() is holding — nothing when it holds null, so a
   caller drops <Toast toast={toast} /> at the foot of the page and is done. */
export default function Toast({ toast }: { toast: ToastData | null }) {
  if (!toast) return null;
  return <div className={'toast show' + (toast.err ? ' error' : '')}>{toast.msg}</div>;
}
