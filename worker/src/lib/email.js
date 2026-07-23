/**
 * Email sending via Resend.
 * If EMAIL_API_KEY is absent (dev/test), logs the email to console instead of sending.
 *
 * All authentication emails (activation, password reset) use a bilingual EN/PL layout
 * so employees who do not speak English can still take action before logging in.
 */

const RESEND_API = 'https://api.resend.com/emails';

async function send(env, { to, subject, html, text }) {
  const from     = env.EMAIL_FROM      ?? 'noreply@zonaproperties.ae';
  const fromName = env.EMAIL_FROM_NAME ?? 'Zona Properties';
  const fromFull = fromName ? `${fromName} <${from}>` : from;

  if (!env.EMAIL_API_KEY) {
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

/** Format an ISO expiry timestamp in a human-readable UTC string. */
function formatExpiry(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  // e.g. "Mon, 28 Jul 2026 14:30:00 UTC"
  return d.toUTCString().replace(' GMT', ' UTC');
}

// ── Shared HTML building blocks ────────────────────────────────────────────────

function emailHeader() {
  return `
        <!-- Header -->
        <tr><td style="background:#1B2A4A;padding:28px 32px;">
          <p style="margin:0;font-size:18px;font-weight:700;color:#C8A46A;">Zona Time Tracker</p>
          <p style="margin:4px 0 0;font-size:13px;color:#94a3b8;">Zona Properties</p>
        </td></tr>`;
}

function actionButton(href, label) {
  return `
          <!-- Action button -->
          <table cellpadding="0" cellspacing="0" style="margin:24px 0 0;">
            <tr><td style="background:#C8A46A;border-radius:8px;">
              <a href="${href}"
                 style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;">
                ${label}
              </a>
            </td></tr>
          </table>`;
}

function sectionSeparator() {
  return `<hr style="border:none;border-top:2px solid #e5e7eb;margin:28px 0;">`;
}

function emailFooter(en, pl) {
  return `
      <!-- Footer -->
      <p style="margin:16px 0 0;font-size:12px;color:#9ca3af;text-align:center;">
        ${en}<br>${pl}
      </p>`;
}

// ── Account activation email ───────────────────────────────────────────────────

export async function sendActivationEmail(env, { name, email, token, expiresAt }) {
  const appUrl      = env.APP_URL ?? 'https://time.zonaproperties.ae';
  const activateUrl = `${appUrl}/activate?token=${token}`;
  const firstName   = name.split(' ')[0] ?? name;
  const expiry      = formatExpiry(expiresAt);

  // ── HTML ──────────────────────────────────────────────────────────────────
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Activate your Zona account / Aktywuj konto Zona</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:560px;background:#ffffff;border-radius:8px;overflow:hidden;">

        ${emailHeader()}

        <!-- Body -->
        <tr><td style="padding:32px;">

          <!-- ── English ─────────────────────────────────────────────────── -->
          <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:.08em;color:#9ca3af;text-transform:uppercase;">English</p>

          <p style="margin:8px 0 16px;font-size:15px;color:#222;">Hello ${firstName},</p>
          <p style="margin:0 0 16px;font-size:15px;color:#222;">Your Zona Time Tracker account has been created.</p>
          <p style="margin:0 0 8px;font-size:15px;color:#222;">Use the button below to activate your account and set your password.</p>
          ${expiry ? `<p style="margin:0 0 16px;font-size:13px;color:#6B7280;">This activation link expires on <strong>${expiry}</strong>.</p>` : `<p style="margin:0 0 16px;font-size:13px;color:#6B7280;">This link is valid for 7 days.</p>`}

          <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#374151;">Recommended setup on iPhone:</p>
          <ol style="margin:0 0 12px;padding-left:20px;font-size:13px;color:#374151;">
            <li style="margin-bottom:3px;">Open the link in Safari.</li>
            <li style="margin-bottom:3px;">Sign in after activation.</li>
            <li style="margin-bottom:3px;">Tap Share → &ldquo;Add to Home Screen&rdquo;.</li>
          </ol>
          <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#374151;">Recommended setup on Android:</p>
          <ol style="margin:0 0 0;padding-left:20px;font-size:13px;color:#374151;">
            <li style="margin-bottom:3px;">Open the link in Chrome.</li>
            <li style="margin-bottom:3px;">Sign in after activation.</li>
            <li style="margin-bottom:3px;">Tap ⋮ → &ldquo;Add to Home screen&rdquo; or &ldquo;Install app&rdquo;.</li>
          </ol>

          ${sectionSeparator()}

          <!-- ── Polski ──────────────────────────────────────────────────── -->
          <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:.08em;color:#9ca3af;text-transform:uppercase;">Polski</p>

          <p style="margin:8px 0 16px;font-size:15px;color:#222;">Cześć ${firstName},</p>
          <p style="margin:0 0 16px;font-size:15px;color:#222;">Twoje konto w Zona Time Tracker zostało utworzone.</p>
          <p style="margin:0 0 8px;font-size:15px;color:#222;">Użyj poniższego przycisku, aby aktywować konto i ustawić hasło.</p>
          ${expiry ? `<p style="margin:0 0 16px;font-size:13px;color:#6B7280;">Link aktywacyjny wygasa <strong>${expiry}</strong>.</p>` : `<p style="margin:0 0 16px;font-size:13px;color:#6B7280;">Link jest ważny przez 7 dni.</p>`}

          <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#374151;">Zalecana konfiguracja na iPhone:</p>
          <ol style="margin:0 0 12px;padding-left:20px;font-size:13px;color:#374151;">
            <li style="margin-bottom:3px;">Otwórz link w przeglądarce Safari.</li>
            <li style="margin-bottom:3px;">Zaloguj się po aktywacji.</li>
            <li style="margin-bottom:3px;">Dotknij Udostępnij → &ldquo;Dodaj do ekranu głównego&rdquo;.</li>
          </ol>
          <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#374151;">Zalecana konfiguracja na Android:</p>
          <ol style="margin:0 0 0;padding-left:20px;font-size:13px;color:#374151;">
            <li style="margin-bottom:3px;">Otwórz link w przeglądarce Chrome.</li>
            <li style="margin-bottom:3px;">Zaloguj się po aktywacji.</li>
            <li style="margin-bottom:3px;">Dotknij ⋮ → &ldquo;Dodaj do ekranu głównego&rdquo; lub &ldquo;Zainstaluj aplikację&rdquo;.</li>
          </ol>

          ${actionButton(activateUrl, 'Activate account&nbsp;/&nbsp;Aktywuj konto')}

          <p style="margin:24px 0 0;font-size:13px;color:#6B7280;">
            Application link / Link do aplikacji:<br>
            <a href="${appUrl}" style="color:#1B2A4A;">${appUrl}</a>
          </p>

        </td></tr>
      </table>

      ${emailFooter(
        'If you did not expect this message, you can ignore it.',
        'Jeśli nie spodziewałeś się tej wiadomości, możesz ją zignorować.',
      )}
    </td></tr>
  </table>
</body>
</html>`;

  // ── Plain text ─────────────────────────────────────────────────────────────
  const expiryLine = expiry
    ? `This activation link expires on ${expiry}.`
    : 'This link is valid for 7 days.';
  const expiryLinePL = expiry
    ? `Link aktywacyjny wygasa ${expiry}.`
    : 'Link jest ważny przez 7 dni.';

  const text = `
--- English ---

Hello ${firstName},

Your Zona Time Tracker account has been created.

Use the link below to activate your account and set your password:

${activateUrl}

${expiryLine}

Recommended setup on iPhone:
1. Open the link in Safari.
2. Sign in after activation.
3. Tap Share → "Add to Home Screen".

Recommended setup on Android:
1. Open the link in Chrome.
2. Sign in after activation.
3. Tap ⋮ → "Add to Home screen" or "Install app".

Application link: ${appUrl}

--- Polski ---

Cześć ${firstName},

Twoje konto w Zona Time Tracker zostało utworzone.

Użyj poniższego linku, aby aktywować konto i ustawić hasło:

${activateUrl}

${expiryLinePL}

Zalecana konfiguracja na iPhone:
1. Otwórz link w przeglądarce Safari.
2. Zaloguj się po aktywacji.
3. Dotknij Udostępnij → "Dodaj do ekranu głównego".

Zalecana konfiguracja na Android:
1. Otwórz link w przeglądarce Chrome.
2. Zaloguj się po aktywacji.
3. Dotknij ⋮ → "Dodaj do ekranu głównego" lub "Zainstaluj aplikację".

Link do aplikacji: ${appUrl}

---

If you did not expect this message, you can ignore it.
Jeśli nie spodziewałeś się tej wiadomości, możesz ją zignorować.
`.trim();

  return send(env, {
    to:      email,
    subject: 'Activate your Zona account / Aktywuj konto Zona',
    html,
    text,
  });
}

/** Legacy alias — kept so existing callers don't break. */
export const sendInvitation = sendActivationEmail;

// ── Password reset email ───────────────────────────────────────────────────────

export async function sendPasswordReset(env, { name, email, token, expiresAt }) {
  const appUrl    = env.APP_URL ?? 'https://time.zonaproperties.ae';
  const resetUrl  = `${appUrl}/reset-password?token=${token}`;
  const firstName = name.split(' ')[0] ?? name;
  const expiry    = formatExpiry(expiresAt);

  const expiryLine   = expiry ? `This link expires on <strong>${expiry}</strong>.` : 'This link expires in 1 hour.';
  const expiryLinePL = expiry ? `Link wygasa <strong>${expiry}</strong>.` : 'Link wygasa po 1 godzinie.';

  // ── HTML ──────────────────────────────────────────────────────────────────
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Reset your Zona password / Zresetuj hasło Zona</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:560px;background:#ffffff;border-radius:8px;overflow:hidden;">

        ${emailHeader()}

        <!-- Body -->
        <tr><td style="padding:32px;">

          <!-- ── English ─────────────────────────────────────────────────── -->
          <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:.08em;color:#9ca3af;text-transform:uppercase;">English</p>

          <p style="margin:8px 0 16px;font-size:15px;color:#222;">Hello ${firstName},</p>
          <p style="margin:0 0 16px;font-size:15px;color:#222;">We received a request to reset the password for your Zona Time Tracker account.</p>
          <p style="margin:0 0 8px;font-size:15px;color:#222;">Use the button below to set a new password.</p>
          <p style="margin:0 0 0;font-size:13px;color:#6B7280;">${expiryLine}</p>

          ${sectionSeparator()}

          <!-- ── Polski ──────────────────────────────────────────────────── -->
          <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:.08em;color:#9ca3af;text-transform:uppercase;">Polski</p>

          <p style="margin:8px 0 16px;font-size:15px;color:#222;">Cześć ${firstName},</p>
          <p style="margin:0 0 16px;font-size:15px;color:#222;">Otrzymaliśmy prośbę o zresetowanie hasła do Twojego konta w Zona Time Tracker.</p>
          <p style="margin:0 0 8px;font-size:15px;color:#222;">Użyj poniższego przycisku, aby ustawić nowe hasło.</p>
          <p style="margin:0 0 0;font-size:13px;color:#6B7280;">${expiryLinePL}</p>

          ${actionButton(resetUrl, 'Reset password&nbsp;/&nbsp;Zresetuj hasło')}

        </td></tr>
      </table>

      ${emailFooter(
        'If you did not request a password reset, you can ignore this message.',
        'Jeśli nie prosiłeś o zresetowanie hasła, możesz zignorować tę wiadomość.',
      )}
    </td></tr>
  </table>
</body>
</html>`;

  // ── Plain text ─────────────────────────────────────────────────────────────
  const expiryTxt   = expiry ? `This link expires on ${expiry}.` : 'This link expires in 1 hour.';
  const expiryTxtPL = expiry ? `Link wygasa ${expiry}.` : 'Link wygasa po 1 godzinie.';

  const text = `
--- English ---

Hello ${firstName},

We received a request to reset the password for your Zona Time Tracker account.

Use the link below to set a new password:

${resetUrl}

${expiryTxt}

--- Polski ---

Cześć ${firstName},

Otrzymaliśmy prośbę o zresetowanie hasła do Twojego konta w Zona Time Tracker.

Użyj poniższego linku, aby ustawić nowe hasło:

${resetUrl}

${expiryTxtPL}

---

If you did not request a password reset, you can ignore this message.
Jeśli nie prosiłeś o zresetowanie hasła, możesz zignorować tę wiadomość.
`.trim();

  return send(env, {
    to:      email,
    subject: 'Reset your Zona password / Zresetuj hasło Zona',
    html,
    text,
  });
}
