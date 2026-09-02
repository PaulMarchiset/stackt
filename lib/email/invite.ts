/**
 * The invitation email.
 *
 * It names who invited you and nothing else. No project name, no board
 * contents, no task titles — the same rule the daily digest follows, for the
 * same reasons: this mail passes through a third-party sender that keeps it in
 * its logs, lands in an inbox that will hold it for years, and shows up on a
 * lock screen. A project name is the single most revealing field in the whole
 * database ("Refonte site Client X" summarises everything in three words), so
 * it stays where it is.
 *
 * The inviter's address does go in, and earns its place: without it the mail is
 * indistinguishable from spam, and the recipient has no way to tell whether
 * they were expecting it. That address was volunteered by the person who chose
 * to invite, which is not the same as disclosing someone's work.
 */

const APP_URL = 'https://stackt.paulmarchiset.me';
const FONT = "'Helvetica Neue',Helvetica,Arial,sans-serif";

/* Same escaper as the digest: the inviter's address is the one piece of
   attacker-influenced text in here (anyone can sign up with an odd address). */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function inviteSubject(): string {
  return 'You have been invited to a Stackt board';
}

export function renderInvite(inviterEmail: string): string {
  const who = esc(inviterEmail);
  /* First letter of the address, for the avatar disc. Escaped like everything
     else — an address beginning with "<" is unusual but perfectly legal, and a
     single character is no less capable of closing a tag than a whole one. */
  const initial = esc((inviterEmail.trim()[0] || '?').toUpperCase());
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<title>${esc(inviteSubject())}</title>
</head>
<body style="margin:0;padding:0;background-color:#F6F4EC;font-family:${FONT};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;font-family:${FONT};">${who} wants to plan something with you.</div>
<div style="display:none;max-height:0;overflow:hidden;">${'&#8203;&nbsp;'.repeat(30)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F6F4EC;margin:0;padding:0;">
  <tr>
    <td align="center" style="padding:40px 16px;">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" border="0" style="width:480px;max-width:480px;background:#FFFFFF;border-radius:18px;overflow:hidden;">
        <!-- Header — the logo rebuilt in HTML, so no image can be blocked -->
        <tr>
          <td style="padding:32px 32px 0 32px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="vertical-align:middle;padding-right:11px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                    <tr><td width="30" align="right"><div style="width:30px;height:7px;background:#E58E36;border-radius:2px;font-size:0;line-height:0;">&nbsp;</div></td></tr>
                    <tr><td height="2" style="font-size:0;line-height:2px;">&nbsp;</td></tr>
                    <tr><td width="30" align="right"><div style="width:22px;height:7px;background:#4B73F5;border-radius:2px;font-size:0;line-height:0;">&nbsp;</div></td></tr>
                    <tr><td height="2" style="font-size:0;line-height:2px;">&nbsp;</td></tr>
                    <tr><td width="30" align="right"><div style="width:16px;height:7px;background:#2CBE3D;border-radius:2px;font-size:0;line-height:0;">&nbsp;</div></td></tr>
                  </table>
                </td>
                <td style="vertical-align:middle;font-family:${FONT};font-size:22px;font-weight:700;letter-spacing:-0.5px;color:#1B1A17;">
                  Stackt
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Who this is from, set apart from what it says.
             The address used to sit inside the headline, where it read as part
             of a sentence and the eye slid over it. It is the one fact that
             decides whether this mail is expected or junk, so it gets its own
             block: initial, address, and the claim underneath it. -->
        <tr>
          <td style="padding:24px 32px 0 32px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                   style="background:#F6F4EC;border-radius:12px;">
              <tr>
                <td style="padding:14px 16px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td width="38" style="vertical-align:middle;padding-right:12px;">
                        <table role="presentation" cellpadding="0" cellspacing="0" border="0"
                               style="width:38px;height:38px;background:#4B73F5;border-radius:9999px;">
                          <tr>
                            <td align="center" style="width:38px;height:38px;font-family:${FONT};font-size:16px;font-weight:700;color:#FFFFFF;line-height:38px;">
                              ${initial}
                            </td>
                          </tr>
                        </table>
                      </td>
                      <td style="vertical-align:middle;font-family:${FONT};">
                        <div style="font-family:${FONT};font-size:14px;font-weight:600;line-height:1.35;color:#1B1A17;word-break:break-all;">${who}</div>
                        <div style="margin-top:2px;font-family:${FONT};font-size:12.5px;font-weight:400;line-height:1.4;color:#5E5C54;">invited you to a board</div>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td style="padding:20px 32px 4px 32px;font-family:${FONT};">
            <h1 style="margin:0;font-family:${FONT};font-size:20px;font-weight:700;line-height:1.3;color:#1B1A17;letter-spacing:-0.4px;">
              You have been added to a Stackt board
            </h1>
            <p style="margin:10px 0 0 0;font-family:${FONT};font-size:14px;font-weight:400;line-height:1.6;color:#5E5C54;">
              Stackt is a simple board for planning what you are going to ship. Sign in with
              <b style="color:#1B1A17;">this email address</b> and the board will be waiting for you —
              there is nothing to accept.
            </p>
            <p style="margin:14px 0 0 0;font-family:${FONT};font-size:13px;font-weight:400;line-height:1.6;color:#97948A;">
              Don't have an account yet? Create one with this same address and you will land straight on it.
            </p>
          </td>
        </tr>

        <tr>
          <td align="center" style="padding:22px 32px 4px 32px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td align="center" bgcolor="#FFD43B" style="border-radius:9999px;">
                  <a href="${APP_URL}/login" style="display:inline-block;padding:12px 26px;font-family:${FONT};font-size:14px;font-weight:600;color:#1B1A17;text-decoration:none;border-radius:9999px;">Open Stackt</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td style="padding:24px 32px 28px 32px;">
            <div style="height:1px;background:#ECEAE1;font-size:0;line-height:0;">&nbsp;</div>
            <!-- The recipient may have no account and no relationship with us,
                 yet we now hold their address. Article 14 GDPR says they must
                 be told who has it and why, and this mail is the only moment
                 we can tell them — so the link is not decoration. -->
            <p style="margin:16px 0 0 0;font-family:${FONT};font-size:11.5px;font-weight:400;line-height:1.6;color:#97948A;">
              Not expecting this? Ignore it — nothing was created for you, and the invitation expires on its own.
              We hold your address only to deliver this invitation and to connect you to the board if you sign in;
              see our <a href="${APP_URL}/privacy" style="color:#4B73F5;text-decoration:none;">Privacy Policy</a>.
            </p>
          </td>
        </tr>
      </table>

      <p style="margin:18px 0 0 0;font-family:${FONT};font-size:11px;font-weight:400;color:#B3B0A6;">Stackt · Plan and track your updates</p>
    </td>
  </tr>
</table>
</body>
</html>`;
}
