import type { EmailPayload, EmailProvider } from '../sender';

/* No-op provider for local dev: logs instead of sending.
   Selected when EMAIL_PROVIDER is unset or "console". */
export class ConsoleProvider implements EmailProvider {
  async send(payload: EmailPayload): Promise<void> {
    console.log('[email:console] would send', {
      to: payload.to,
      subject: payload.subject,
      htmlLength: payload.html.length
    });
  }
}
