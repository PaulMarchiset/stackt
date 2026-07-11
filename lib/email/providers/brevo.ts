import type { EmailPayload, EmailProvider } from '../sender';

/* Brevo (ex-Sendinblue) transactional email via its REST API.
   Docs: https://developers.brevo.com/reference/sendtransacemail
   Needs: BREVO_API_KEY, EMAIL_FROM, and optionally EMAIL_FROM_NAME. */
export class BrevoProvider implements EmailProvider {
  private readonly apiKey: string;
  private readonly fromEmail: string;
  private readonly fromName: string;

  constructor() {
    const apiKey = process.env.BREVO_API_KEY;
    const fromEmail = process.env.EMAIL_FROM;
    if (!apiKey) throw new Error('BREVO_API_KEY is not set');
    if (!fromEmail) throw new Error('EMAIL_FROM is not set');
    this.apiKey = apiKey;
    this.fromEmail = fromEmail;
    this.fromName = process.env.EMAIL_FROM_NAME || 'Stackt';
  }

  async send(payload: EmailPayload): Promise<void> {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': this.apiKey,
        'content-type': 'application/json',
        accept: 'application/json'
      },
      body: JSON.stringify({
        sender: { name: this.fromName, email: this.fromEmail },
        to: [{ email: payload.to }],
        subject: payload.subject,
        htmlContent: payload.html
      })
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Brevo send failed (${res.status}): ${body}`);
    }
  }
}
