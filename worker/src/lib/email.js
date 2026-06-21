/**
 * Resend email wrapper.
 * All email sends go through this module; Sprint 1 implements the templates.
 */

const RESEND_API = 'https://api.resend.com/emails';

async function send(env, { to, subject, html }) {
  const res = await fetch(RESEND_API, {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${env.EMAIL_API_KEY}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      from:    env.EMAIL_FROM,
      to:      Array.isArray(to) ? to : [to],
      subject,
      html,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend error ${res.status}: ${body}`);
  }

  return res.json();
}

export async function sendInvitation(env, { name, email, token }) {
  const link = `${env.APP_URL}/activate?token=${token}`;
  return send(env, {
    to:      email,
    subject: 'You have been invited to Zona Time Tracker',
    html:    `<p>Hi ${name},</p>
              <p>You have been invited to Zona Time Tracker. Click the link below to set your password and activate your account:</p>
              <p><a href="${link}">${link}</a></p>
              <p>This link expires in 72 hours.</p>`,
  });
}

export async function sendPasswordReset(env, { name, email, token }) {
  const link = `${env.APP_URL}/reset-password?token=${token}`;
  return send(env, {
    to:      email,
    subject: 'Reset your Zona Time Tracker password',
    html:    `<p>Hi ${name},</p>
              <p>A password reset was requested for your account. Click the link below to set a new password:</p>
              <p><a href="${link}">${link}</a></p>
              <p>This link expires in 1 hour. If you did not request a reset, you can ignore this email.</p>`,
  });
}
