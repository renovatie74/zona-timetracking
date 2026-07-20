import { hashPassword, verifyPassword } from '../lib/password.js';
import { signJwt, jwtPayload, setJwtCookie, clearJwtCookie } from '../lib/jwt.js';
import { generateResetToken, resetExpiry, hashToken } from '../lib/tokens.js';
import { sendPasswordReset } from '../lib/email.js';
import { requireAuth } from '../middleware/auth.js';
import { writeAudit } from '../lib/audit.js';
import { writeLoginAudit } from '../lib/loginAudit.js';

// Dummy hash used when no user found — ensures PBKDF2 always runs (timing attack prevention)
const DUMMY_HASH = 'pbkdf2:sha256:100000:ZHVtbXlzYWx0c2FsdA==:ZHVtbXloYXNoaGFzaGhhc2g=';

function clientIp(request) {
  return request.headers.get('CF-Connecting-IP')
      ?? request.headers.get('X-Forwarded-For')
      ?? null;
}

export async function login(request, env) {
  const { email, password } = await request.json();

  const user = await env.DB.prepare(
    `SELECT u.id, u.password_hash, u.is_active, u.first_name, u.last_name,
            (u.first_name || ' ' || u.last_name) AS name, r.name AS role
     FROM Users u JOIN Roles r ON r.id = u.role_id WHERE u.email = ?`,
  ).bind(email).first();

  // Always run PBKDF2 — prevents timing attacks that reveal whether an email exists
  const ok = await verifyPassword(password, user?.password_hash ?? DUMMY_HASH);

  // Classify result and failure reason before any early return
  let result        = 'success';
  let failureReason = null;

  if (!user) {
    result = 'failed'; failureReason = 'unknown_user';
  } else if (!user.password_hash) {
    result = 'failed'; failureReason = 'pending_activation';
  } else if (!user.is_active) {
    result = 'failed'; failureReason = 'deactivated';
  } else if (!ok) {
    result = 'failed'; failureReason = 'invalid_password';
  }

  // Write login audit — catches errors internally; safe to await
  await writeLoginAudit(env.DB, {
    attemptedEmail: email,
    userId:        user?.id ?? null,
    result,
    failureReason,
    cfConnectingIp: request.headers.get('CF-Connecting-IP') ?? null,
    trueClientIp:   request.headers.get('True-Client-IP')   ?? null,
    xForwardedFor:  request.headers.get('X-Forwarded-For')  ?? null,
    remoteAddr:     null,
    countryCode:    request.headers.get('CF-IPCountry')     ?? null,
    userAgent:      request.headers.get('User-Agent')       ?? null,
    path:           '/api/auth/login',
  });

  if (result === 'failed') {
    return Response.json({ error: 'Invalid email or password' }, { status: 401 });
  }

  const token = await signJwt(jwtPayload(user.id, user.role), env.JWT_SECRET);

  await writeAudit(env.DB, {
    actorId: user.id, action: 'login', entityType: 'user', entityId: user.id,
    oldValues: null, newValues: null, ipAddress: clientIp(request),
  });

  return setJwtCookie(
    Response.json({ id: user.id, role: user.role, first_name: user.first_name, last_name: user.last_name, name: user.name }),
    token,
  );
}

export async function logout(request, env) {
  // Do NOT require auth — the session may already be expired.
  // Always clear the cookie so the client is signed out cleanly.
  // Try to read the JWT for the audit log, but never block logout on it.
  let userId = null;
  try {
    const cookie = request.headers.get('Cookie') ?? '';
    const match  = cookie.match(/(?:^|;\s*)jwt=([^;]+)/);
    if (match) {
      const { verifyJwt } = await import('../lib/jwt.js');
      const payload = await verifyJwt(match[1], env.JWT_SECRET);
      if (payload?.sub) userId = payload.sub;
    }
  } catch { /* ignore — expired or tampered token */ }

  if (userId) {
    await writeAudit(env.DB, {
      actorId: userId, action: 'logout', entityType: 'user', entityId: userId,
      oldValues: null, newValues: null, ipAddress: clientIp(request),
    });
  }

  return clearJwtCookie(Response.json({ ok: true }));
}

export async function me(request, env) {
  const authResult = await requireAuth(request, env);
  if (authResult) return authResult;

  const user = await env.DB.prepare(
    `SELECT u.id, u.first_name, u.last_name, (u.first_name || ' ' || u.last_name) AS name,
            u.email, u.mobile, r.name AS role
     FROM Users u JOIN Roles r ON r.id = u.role_id WHERE u.id = ?`,
  ).bind(request.user.id).first();

  if (!user) return Response.json({ error: 'User not found' }, { status: 404 });

  return Response.json({
    id: user.id, role: user.role, first_name: user.first_name, last_name: user.last_name,
    name: user.name, email: user.email, phone: user.mobile,
  });
}

export async function updateProfile(request, env) {
  const authResult = await requireAuth(request, env);
  if (authResult) return authResult;

  const body = await request.json();

  if (body.first_name !== undefined && !body.first_name?.trim()) {
    return Response.json({ error: 'First name cannot be empty' }, { status: 400 });
  }
  if (body.last_name !== undefined && !body.last_name?.trim()) {
    return Response.json({ error: 'Last name cannot be empty' }, { status: 400 });
  }
  if (body.phone !== undefined && body.phone !== null && body.phone !== '') {
    if (!/^\+\d{7,15}$/.test(body.phone)) {
      return Response.json({ error: 'Phone must be in E.164 format (e.g. +48600100200)' }, { status: 400 });
    }
  }

  const updates = [];
  const params  = [];

  if (body.first_name !== undefined) { updates.push('first_name = ?'); params.push(body.first_name.trim()); }
  if (body.last_name  !== undefined) { updates.push('last_name = ?');  params.push(body.last_name.trim()); }
  if (body.phone      !== undefined) { updates.push('mobile = ?');     params.push(body.phone || null); }

  if (updates.length === 0) {
    return Response.json({ error: 'No fields to update' }, { status: 400 });
  }

  const now = new Date().toISOString();
  updates.push('updated_at = ?');
  params.push(now, request.user.id);

  await env.DB.prepare(`UPDATE Users SET ${updates.join(', ')} WHERE id = ?`).bind(...params).run();

  await writeAudit(env.DB, {
    actorId: request.user.id, action: 'profile_updated', entityType: 'user',
    entityId: request.user.id, oldValues: null, newValues: body,
  });

  const user = await env.DB.prepare(
    `SELECT u.id, u.first_name, u.last_name, (u.first_name || ' ' || u.last_name) AS name,
            u.email, u.mobile, r.name AS role
     FROM Users u JOIN Roles r ON r.id = u.role_id WHERE u.id = ?`,
  ).bind(request.user.id).first();

  return Response.json({
    id: user.id, role: user.role, first_name: user.first_name, last_name: user.last_name,
    name: user.name, email: user.email, phone: user.mobile,
  });
}

export async function activate(request, env) {
  const { token, password } = await request.json();

  if (!token) {
    return Response.json({ error: 'Invalid or expired activation link' }, { status: 400 });
  }

  // Only the SHA-256 hash is stored — compute it before DB lookup
  const tokenHash = await hashToken(token);

  const user = await env.DB.prepare(
    `SELECT u.id, u.first_name, u.invitation_token_expires_at
     FROM Users u
     WHERE u.invitation_token = ? AND u.is_active = 0 AND u.password_hash IS NULL`,
  ).bind(tokenHash).first();

  if (!user) {
    await writeAudit(env.DB, {
      actorId: null, action: 'activation_failed_invalid_token', entityType: 'user', entityId: null,
      oldValues: null, newValues: null, ipAddress: clientIp(request),
    });
    return Response.json({ error: 'Invalid or expired activation link' }, { status: 400 });
  }

  if (new Date(user.invitation_token_expires_at) < new Date()) {
    await writeAudit(env.DB, {
      actorId: null, action: 'activation_failed_expired_token', entityType: 'user', entityId: user.id,
      oldValues: null, newValues: null, ipAddress: clientIp(request),
    });
    return Response.json({
      error: 'This activation link has expired. Please contact your administrator to resend the activation email.',
      expired: true,
    }, { status: 400 });
  }

  if (!password || password.length < 8) {
    return Response.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
  }

  const hash = await hashPassword(password);
  const now  = new Date().toISOString();

  await env.DB.prepare(
    `UPDATE Users SET
       password_hash = ?, is_active = 1,
       invitation_token = NULL, invitation_token_expires_at = NULL, updated_at = ?
     WHERE id = ?`,
  ).bind(hash, now, user.id).run();

  await writeAudit(env.DB, {
    actorId: user.id, action: 'account_activated', entityType: 'user', entityId: user.id,
    oldValues: null, newValues: { is_active: true }, ipAddress: clientIp(request),
  });

  return Response.json({ ok: true });
}

export async function forgotPassword(request, env, ctx) {
  const { email } = await request.json();

  const user = await env.DB.prepare(
    `SELECT id, (first_name || ' ' || last_name) AS name, email FROM Users WHERE email = ? AND is_active = 1`,
  ).bind(email).first();

  if (user) {
    const token   = generateResetToken();
    const expires = resetExpiry();
    const now     = new Date().toISOString();

    await env.DB.prepare(
      `UPDATE Users SET password_reset_token = ?, password_reset_expires_at = ?, updated_at = ? WHERE id = ?`,
    ).bind(token, expires, now, user.id).run();

    // Fire-and-forget: don't block the response on email delivery
    ctx?.waitUntil(sendPasswordReset(env, { name: user.name, email: user.email, token }));

    await writeAudit(env.DB, {
      actorId: user.id, action: 'password_reset_requested', entityType: 'user', entityId: user.id,
      oldValues: null, newValues: null, ipAddress: clientIp(request),
    });
  }

  // Always 200 — never reveal whether the email exists
  return Response.json({ ok: true });
}

export async function resetPassword(request, env) {
  const { token, password } = await request.json();

  const user = await env.DB.prepare(
    `SELECT id, password_reset_expires_at FROM Users WHERE password_reset_token = ? AND is_active = 1`,
  ).bind(token).first();

  if (!user || new Date(user.password_reset_expires_at) < new Date()) {
    return Response.json({ error: 'Invalid or expired reset link' }, { status: 400 });
  }

  const hash = await hashPassword(password);
  const now  = new Date().toISOString();

  await env.DB.prepare(
    `UPDATE Users SET
       password_hash = ?, password_reset_token = NULL, password_reset_expires_at = NULL, updated_at = ?
     WHERE id = ?`,
  ).bind(hash, now, user.id).run();

  await writeAudit(env.DB, {
    actorId: user.id, action: 'password_reset', entityType: 'user', entityId: user.id,
    oldValues: null, newValues: null, ipAddress: clientIp(request),
  });

  return Response.json({ ok: true });
}

export async function changePassword(request, env) {
  const authResult = await requireAuth(request, env);
  if (authResult) return authResult;

  const { current_password, new_password } = await request.json();

  const user = await env.DB.prepare(
    `SELECT id, password_hash FROM Users WHERE id = ?`,
  ).bind(request.user.id).first();

  const ok = await verifyPassword(current_password, user?.password_hash ?? DUMMY_HASH);
  if (!ok) {
    return Response.json({ error: 'Current password is incorrect' }, { status: 400 });
  }

  const hash = await hashPassword(new_password);
  const now  = new Date().toISOString();

  await env.DB.prepare(
    `UPDATE Users SET password_hash = ?, updated_at = ? WHERE id = ?`,
  ).bind(hash, now, user.id).run();

  await writeAudit(env.DB, {
    actorId: user.id, action: 'password_changed', entityType: 'user', entityId: user.id,
    oldValues: null, newValues: null, ipAddress: clientIp(request),
  });

  return Response.json({ ok: true });
}
