/**
 * Email sending via Resend.
 * If EMAIL_API_KEY is absent (dev/test), logs the email to console instead of sending.
 */

const RESEND_API = 'https://api.resend.com/emails';

async function send(env, { to, subject, html, text }) {
  const from     = env.EMAIL_FROM      ?? 'noreply@zonaproperties.ae';
  const fromName = env.EMAIL_FROM_NAME ?? 'Zona Properties';
  const fromFull = fromName ? `${fromName} <${from}>` : from;

  if (!env.EMAIL_API_KEY) {
    // Dev / test mode — log instead of sending
    console.log('[email:dev] Would send email:');
    console.log(`  To:      ${to}`);
    console.log(`  From:    ${fromFull}`);
    console.log(`  Subject: ${subject}`);
    if (text) console.log(`  Body:\n${text}`);
    return { id: 'dev-mode', dev: true };
  }

  const res = await fetch(RESEND_API, {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${env.EMAIL_API_KEY}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      from: fromFull,
      to:   Array.isArray(to) ? to : [to],
      subject,
      html,
      text,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend error ${res.status}: ${body}`);
  }

  return res.json();
}

export async function sendActivationEmail(env, { name, email, token }) {
  const appUrl     = env.APP_URL ?? 'https://time.zonaproperties.ae';
  const activateUrl = `${appUrl}/activate?token=${token}`;
  const firstName  = name.split(' ')[0] ?? name;

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:560px;background:#ffffff;border-radius:8px;overflow:hidden;">

        <!-- Header -->
        <tr><td style="background:#1B2A4A;padding:28px 32px;">
          <p style="margin:0;font-size:18px;font-weight:700;color:#C8A46A;">Zona Time Tracker</p>
          <p style="margin:4px 0 0;font-size:13px;color:#94a3b8;">Zona Properties</p>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:32px;">
          <p style="margin:0 0 16px;font-size:15px;color:#222;">Hello ${firstName},</p>
          <p style="margin:0 0 16px;font-size:15px;color:#222;">Your Zona Time Tracker account has been created.</p>
          <p style="margin:0 0 24px;font-size:15px;color:#222;">Please activate your account and set your password using the link below:</p>

          <!-- Button -->
          <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
            <tr><td style="background:#C8A46A;border-radius:8px;">
              <a href="${activateUrl}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;">Activate account</a>
            </td></tr>
          </table>

          <p style="margin:0 0 24px;font-size:13px;color:#6B7280;">This link is valid for 7 days.</p>

          <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 24px;">

          <p style="margin:0 0 12px;font-size:14px;color:#374151;font-weight:600;">After activation, you can use Zona Time Tracker to:</p>
          <ul style="margin:0 0 24px;padding-left:20px;font-size:14px;color:#374151;">
            <li style="margin-bottom:4px;">record your daily attendance</li>
            <li style="margin-bottom:4px;">enter project hours</li>
            <li style="margin-bottom:4px;">submit own cost items when needed</li>
            <li style="margin-bottom:4px;">review your submitted time</li>
          </ul>

          <p style="margin:0 0 8px;font-size:14px;color:#374151;">Application link:<br>
            <a href="${appUrl}" style="color:#1B2A4A;">${appUrl}</a>
          </p>

          <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">

          <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#374151;">Recommended setup on iPhone:</p>
          <ol style="margin:0 0 20px;padding-left:20px;font-size:13px;color:#374151;">
            <li style="margin-bottom:3px;">Open the link in Safari.</li>
            <li style="margin-bottom:3px;">Sign in after activation.</li>
            <li style="margin-bottom:3px;">Tap Share.</li>
            <li style="margin-bottom:3px;">Tap &ldquo;Add to Home Screen&rdquo;.</li>
            <li style="margin-bottom:3px;">Open Zona Time Tracker from the new icon.</li>
          </ol>

          <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#374151;">Recommended setup on Android:</p>
          <ol style="margin:0 0 24px;padding-left:20px;font-size:13px;color:#374151;">
            <li style="margin-bottom:3px;">Open the link in Chrome.</li>
            <li style="margin-bottom:3px;">Sign in after activation.</li>
            <li style="margin-bottom:3px;">Tap the three-dot menu.</li>
            <li style="margin-bottom:3px;">Tap &ldquo;Add to Home screen&rdquo; or &ldquo;Install app&rdquo;.</li>
            <li style="margin-bottom:3px;">Open Zona Time Tracker from the new icon.</li>
          </ol>

          <p style="margin:0 0 24px;font-size:13px;color:#6B7280;">
            If the link has expired, please contact Corina or Pawel and ask them to resend the activation email.
          </p>

          <p style="margin:0;font-size:14px;color:#374151;">Thank you,<br>Zona Properties</p>
        </td></tr>

      </table>

      <!-- Footer -->
      <p style="margin:16px 0 0;font-size:12px;color:#9ca3af;">
        If you did not expect this email, you can ignore it.
      </p>
    </td></tr>
  </table>
</body>
</html>`;

  const text = `Hello ${firstName},

Your Zona Time Tracker account has been created.

Please activate your account and set your password using the link below:

${activateUrl}

This link is valid for 7 days.

After activation, you can use Zona Time Tracker to:
- record your daily attendance
- enter project hours
- submit own cost items when needed
- review your submitted time

Application link:
${appUrl}

Recommended setup on iPhone:
1. Open the link in Safari.
2. Sign in after activation.
3. Tap Share.
4. Tap "Add to Home Screen".
5. Open Zona Time Tracker from the new icon.

Recommended setup on Android:
1. Open the link in Chrome.
2. Sign in after activation.
3. Tap the three-dot menu.
4. Tap "Add to Home screen" or "Install app".
5. Open Zona Time Tracker from the new icon.

If the link has expired, please contact Corina or Pawel and ask them to resend the activation email.

Thank you,
Zona Properties`;

  return send(env, {
    to:      email,
    subject: 'Activate your Zona Time Tracker account',
    html,
    text,
  });
}

/** Legacy alias — kept so existing callers don't break. */
export const sendInvitation = sendActivationEmail;

export async function sendPasswordReset(env, { name, email, token }) {
  const appUrl    = env.APP_URL ?? 'https://time.zonaproperties.ae';
  const resetUrl  = `${appUrl}/reset-password?token=${token}`;
  const firstName = name.split(' ')[0] ?? name;

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:560px;background:#ffffff;border-radius:8px;overflow:hidden;">
        <tr><td style="background:#1B2A4A;padding:28px 32px;">
          <p style="margin:0;font-size:18px;font-weight:700;color:#C8A46A;">Zona Time Tracker</p>
        </td></tr>
        <tr><td style="padding:32px;">
          <p style="margin:0 0 16px;font-size:15px;color:#222;">Hello ${firstName},</p>
          <p style="margin:0 0 24px;font-size:15px;color:#222;">A password reset was requested for your account. Click the button below to set a new password:</p>
          <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
            <tr><td style="background:#C8A46A;border-radius:8px;">
              <a href="${resetUrl}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;">Reset password</a>
            </td></tr>
          </table>
          <p style="margin:0 0 16px;font-size:13px;color:#6B7280;">This link expires in 1 hour. If you did not request a reset, you can ignore this email.</p>
          <p style="margin:0;font-size:14px;color:#374151;">Thank you,<br>Zona Properties</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = `Hello ${firstName},

A password reset was requested for your account. Use the link below to set a new password:

${resetUrl}

This link expires in 1 hour. If you did not request a reset, you can ignore this email.

Thank you,
Zona Properties`;

  return send(env, {
    to:      email,
    subject: 'Reset your Zona Time Tracker password',
    html,
    text,
  });
}
