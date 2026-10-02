/**
 * The @mention email.
 *
 * Deliberately minimal, like the invitation mail: it names who pinged you
 * and nothing else. No project name, no card title, no comment body — this
 * mail passes through a third-party sender and lives in an inbox for years,
 * and a project or card name can summarise private work in a few words.
 * Open the board to read what was said.
 */

const APP_URL = 'https://stackt.paulmarchiset.me';
const FONT = "'Helvetica Neue',Helvetica,Arial,sans-serif";

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function mentionSubject(): string {
  return 'Someone mentioned you on a Stackt card';
}

export function renderMention(pingerEmail: string): string {
  const who = esc(pingerEmail);
  const initial = esc((pingerEmail.trim()[0] || '?').toUpperCase());
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(mentionSubject())}</title>
</head>
<body style="margin:0;padding:0;background-color:#F6F4EC;font-family:${FONT};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F6F4EC;margin:0;padding:0;">
  <tr>
    <td align="center" style="padding:40px 16px;">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" border="0" style="width:480px;max-width:480px;background:#FFFFFF;border-radius:18px;overflow:hidden;">
        <tr>
          <td style="padding:32px 32px 0 32px;font-family:${FONT};">
            <div style="display:inline-block;width:38px;height:38px;background:#4B73F5;border-radius:9999px;text-align:center;font-size:16px;font-weight:700;color:#FFFFFF;line-height:38px;">${initial}</div>
            <h1 style="margin:14px 0 0 0;font-size:20px;font-weight:700;color:#1B1A17;">${who} mentioned you</h1>
            <p style="margin:10px 0 0 0;font-size:14px;line-height:1.6;color:#5E5C54;">
              Someone pinged you in a card discussion. Open the board to read the thread and reply.
            </p>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:22px 32px 28px 32px;">
            <a href="${APP_URL}/board" style="display:inline-block;padding:12px 26px;font-family:${FONT};font-size:14px;font-weight:600;color:#1B1A17;text-decoration:none;border-radius:9999px;background:#FFD43B;">Open Stackt</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}
