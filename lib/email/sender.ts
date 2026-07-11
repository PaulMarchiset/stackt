// Email abstraction: one small interface, many possible providers.
// To switch sender, change the EMAIL_PROVIDER env var — no code change.

export interface EmailPayload {
  to: string;
  subject: string;
  html: string;
}

export interface EmailProvider {
  send(payload: EmailPayload): Promise<void>;
}

import { BrevoProvider } from './providers/brevo';
import { ConsoleProvider } from './providers/console';

/* Pick the provider from EMAIL_PROVIDER ("brevo" | "console").
   Defaults to "console" so local dev works with no API key. */
export function getEmailProvider(): EmailProvider {
  const which = (process.env.EMAIL_PROVIDER || 'console').toLowerCase();
  switch (which) {
    case 'brevo':
      return new BrevoProvider();
    case 'console':
      return new ConsoleProvider();
    default:
      throw new Error(`Unknown EMAIL_PROVIDER: "${which}" (expected "brevo" or "console")`);
  }
}
