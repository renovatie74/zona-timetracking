/**
 * Sprint 10 — Account Activation Email tests
 *
 * AC-01  Creating a new employee sends activation email (audit logged)
 * AC-02  New employee has invitation_token set (hashed, not plaintext)
 * AC-03  Pending user cannot log in before activation
 * AC-04  Valid token activates account (password set, is_active=1)
 * AC-05  Token cannot be reused after activation
 * AC-06  Expired token returns 400 with expired:true
 * AC-07  Invalid/unknown token returns 400
 * AC-08  Resend activation replaces old token
 * AC-09  Resend activation logs audit event
 * AC-10  Manager cannot call resend-activation (403)
 * AC-11  Employee cannot call resend-activation (403)
 * AC-12  Activation email (dev mode) contains iPhone setup instructions
 * AC-13  Activation email (dev mode) contains Android setup instructions
 * AC-14  Resend fails if user is already active
 */

import { env as cfEnv }         from 'cloudflare:test';
import { describe, it, expect, beforeAll, vi } from 'vitest';

import * as authRoutes      from '../src/routes/auth.js';
import * as employeeRoutes  from '../src/routes/employees.js';
import { sendActivationEmail } from '../src/lib/email.js';
import { hashToken }           from '../src/lib/tokens.js';
import { hashPassword }        from '../src/lib/password.js';
import { signJwt }             from '../src/lib/jwt.js';

import m01 from '../migrations/0001_initial.sql?raw';
import m02 from '../migrations/0002_projects.sql?raw';
import m03 from '../migrations/0003_time_entries.sql?raw';
import m04 from '../migrations/0004_notes.sql?raw';
import m05 from '../migrations/0005_recent.sql?raw';
import m06 from '../migrations/0006_audit.sql?raw';
import m07 from '../migrations/0007_teams.sql?raw';
import m08 from '../migrations/0008_users_team_id.sql?raw';
import m09 from '../migrations/0009_projects_v2.sql?raw';
import m10 from '../migrations/0010_clients.sql?raw';
import m11 from '../migrations/0011_projects_client_id.sql?raw';
import m12 from '../migrations/0012_employee_name_split.sql?raw';
import m13 from '../migrations/0013_project_assignments.sql?raw';
import m14 from '../migrations/0014_time_entry_status.sql?raw';
import m15 from '../migrations/0015_audit_trail.sql?raw';
import m16 from '../migrations/0016_extras.sql?raw';
import m17 from '../migrations/0017_extras_mileage.sql?raw';
import m18 from '../migrations/0018_weekly_mileage.sql?raw';
import m19 from '../migrations/0019_mileage_allow_zero.sql?raw';
import m20 from '../migrations/0020_org_settings.sql?raw';
import m21 from '../migrations/0021_normalize_timestamps.sql?raw';
import m22 from '../migrations/0022_login_audit.sql?raw';
import m23 from '../migrations/0023_login_audit_network.sql?raw';
import m24 from '../migrations/0024_daily_attendance.sql?raw';
import m25 from '../migrations/0025_extras_workflow.sql?raw';

// Base env — inherits D1 binding from cfEnv; JWT secret overridden.
// EMAIL_API_KEY deliberately set to a fake value so auth.test-style calls
// don't blow up, but AC-12/AC-13 use emailDevEnv (no key) to force dev mode.
const env = {
  ...cfEnv,
  JWT_SECRET:    'test-jwt-secret-sprint10-0000000000000000',
  APP_URL:       'https://test.example.com',
  EMAIL_FROM:    'noreply@test.example.com',
  EMAIL_API_KEY: 'fake-key-not-used', // prevents accidental real send
};

// Dev-mode email env: no key → send() logs to console instead of calling Resend
const emailDevEnv = { ...env };
delete emailDevEnv.EMAIL_API_KEY;

// ctx that swallows email promise rejections (we don't care about delivery in tests)
const silentCtx = { waitUntil: (p) => Promise.resolve(p).catch(() => {}) };

const ALL_MIGRATIONS = [
  m01,m02,m03,m04,m05,m06,m07,m08,m09,m10,
  m11,m12,m13,m14,m15,m16,m17,m18,m19,m20,
  m21,m22,m23,m24,m25,
];

async function applyMigration(sql) {
  const stmts = sql.replace(/--[^\n]*/g, '').split(';').map(s => s.trim()).filter(Boolean);
  for (const stmt of stmts) await env.DB.prepare(stmt).run();
}

function makeReq(method, url, body, cookie = '') {
  const headers = {};
  if (body)   headers['Content-Type'] = 'application/json';
  if (cookie) headers['Cookie']       = cookie;
  return new Request(`http://localhost${url}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function adminJwt() {
  return signJwt(
    { sub: 1, role: 'administrator', exp: Math.floor(Date.now() / 1000) + 3600 },
    env.JWT_SECRET,
  );
}

let seq = 100;
async function seedUser(overrides = {}) {
  const n = seq++;
  const now = new Date().toISOString();
  const hash = overrides.password ? await hashPassword(overrides.password) : overrides.password_hash ?? null;
  const defaults = {
    role_id: 1, employee_number: `E-${n}`,
    first_name: 'Test', last_name: `User${n}`,
    email: `user${n}@sprint10.test`,
    password_hash: hash,
    is_active: 1,
    invitation_token: null, invitation_token_expires_at: null,
    password_reset_token: null, password_reset_expires_at: null,
    created_at: now, updated_at: now,
  };
  const u = { ...defaults, ...overrides };
  delete u.password;
  const r = await env.DB.prepare(
    `INSERT INTO Users
       (role_id, employee_number, first_name, last_name, email, password_hash, is_active,
        invitation_token, invitation_token_expires_at,
        password_reset_token, password_reset_expires_at, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).bind(
    u.role_id, u.employee_number, u.first_name, u.last_name, u.email,
    u.password_hash, u.is_active,
    u.invitation_token, u.invitation_token_expires_at,
    u.password_reset_token, u.password_reset_expires_at,
    u.created_at, u.updated_at,
  ).run();
  return { ...u, id: r.meta.last_row_id };
}

beforeAll(async () => {
  for (const sql of ALL_MIGRATIONS) await applyMigration(sql);
  // Seed role rows that the middleware needs (migration inserts them, but verify)
  const roles = await env.DB.prepare('SELECT COUNT(*) AS c FROM Roles').first();
  if (roles.c === 0) {
    await env.DB.prepare("INSERT INTO Roles (id,name) VALUES (1,'employee'),(2,'manager'),(3,'administrator')").run();
  }
  // Seed a permanent admin user (id=1 assumed by adminJwt)
  await seedUser({ role_id: 3, email: 'admin@sprint10.test', password: 'AdminPass1!' });
});

// ── AC-01 / AC-02: Creating a user generates a token and logs audit ──────────

describe('Sprint 10 — Account Activation', () => {

  it('AC-01: create employee sends activation email and logs audit event', async () => {
    const token = await adminJwt();
    const cookie = `jwt=${token}`;

    const req = makeReq('POST', '/api/employees', {
      first_name: 'Activation',
      last_name:  'Test',
      email:      `activation-test-${Date.now()}@sprint10.test`,
      role:       'employee',
    }, cookie);

    req.user = { id: 1, role: 'administrator' };
    const res = await employeeRoutes.create(req, env, silentCtx);

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.status).toBe('pending');

    // Audit: activation_email_sent
    const audit = await env.DB.prepare(
      `SELECT * FROM AuditLog WHERE entity_id = ? AND action = 'activation_email_sent'`,
    ).bind(body.data.id).first();
    expect(audit).toBeTruthy();
    expect(audit.entity_type).toBe('user');
  });

  it('AC-02: created employee has hashed invitation_token set (not plaintext)', async () => {
    const token = await adminJwt();
    const cookie = `jwt=${token}`;
    const email = `tok-check-${Date.now()}@sprint10.test`;

    const req = makeReq('POST', '/api/employees', {
      first_name: 'Token',
      last_name:  'Check',
      email,
      role: 'employee',
    }, cookie);
    req.user = { id: 1, role: 'administrator' };
    const res = await employeeRoutes.create(req, env, silentCtx);
    expect(res.status).toBe(201);
    const body = await res.json();

    const row = await env.DB.prepare(
      'SELECT invitation_token, invitation_token_expires_at FROM Users WHERE id = ?',
    ).bind(body.data.id).first();

    // Token must be set and look like a SHA-256 hex (64 hex chars)
    expect(row.invitation_token).toBeTruthy();
    expect(row.invitation_token).toMatch(/^[0-9a-f]{64}$/);
    expect(row.invitation_token_expires_at).toBeTruthy();
    // Expires in the future
    expect(new Date(row.invitation_token_expires_at) > new Date()).toBe(true);
  });

  // ── AC-03: Pending user cannot log in ──────────────────────────────────────

  it('AC-03: pending user (no password) cannot log in', async () => {
    const email = `pending-login-${Date.now()}@sprint10.test`;
    await seedUser({
      email,
      is_active: 0,
      password_hash: null,
    });

    const req = makeReq('POST', '/api/auth/login', { email, password: 'anything' });
    const res = await authRoutes.login(req, env);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Invalid email or password');
  });

  // ── AC-04: Valid token activates account ───────────────────────────────────

  it('AC-04: valid activation token sets password and activates account', async () => {
    const rawToken = 'validtoken' + '0'.repeat(54);
    const tokenH   = await hashToken(rawToken);
    const expires  = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const user = await seedUser({
      is_active: 0,
      password_hash: null,
      invitation_token: tokenH,
      invitation_token_expires_at: expires,
    });

    const req = makeReq('POST', '/api/auth/activate-account', {
      token:    rawToken,
      password: 'NewPassword1!',
    });
    const res = await authRoutes.activate(req, env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);

    const updated = await env.DB.prepare(
      'SELECT is_active, password_hash, invitation_token FROM Users WHERE id = ?',
    ).bind(user.id).first();
    expect(updated.is_active).toBe(1);
    expect(updated.password_hash).toBeTruthy();
    expect(updated.invitation_token).toBeNull();
  });

  // ── AC-05: Token cannot be reused ─────────────────────────────────────────

  it('AC-05: activation token cannot be reused after account is activated', async () => {
    const rawToken = 'reusetoken' + '0'.repeat(54);
    const tokenH   = await hashToken(rawToken);
    const expires  = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const user = await seedUser({
      is_active: 0,
      password_hash: null,
      invitation_token: tokenH,
      invitation_token_expires_at: expires,
    });

    // First activation — should succeed
    const req1 = makeReq('POST', '/api/auth/activate-account', {
      token: rawToken, password: 'FirstPass1!',
    });
    const res1 = await authRoutes.activate(req1, env);
    expect(res1.status).toBe(200);

    // Second use of the same token — should fail (token cleared on first use)
    const req2 = makeReq('POST', '/api/auth/activate-account', {
      token: rawToken, password: 'SecondPass1!',
    });
    const res2 = await authRoutes.activate(req2, env);
    expect(res2.status).toBe(400);
  });

  // ── AC-06: Expired token ───────────────────────────────────────────────────

  it('AC-06: expired token returns 400 with expired:true', async () => {
    const rawToken = 'expiredac06' + '0'.repeat(53);
    const tokenH   = await hashToken(rawToken);
    const expires  = new Date(Date.now() - 1000).toISOString(); // 1 second ago

    await seedUser({
      is_active: 0,
      password_hash: null,
      invitation_token: tokenH,
      invitation_token_expires_at: expires,
    });

    const req = makeReq('POST', '/api/auth/activate-account', {
      token: rawToken, password: 'AnyPass1!',
    });
    const res = await authRoutes.activate(req, env);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.expired).toBe(true);
    expect(body.error).toMatch(/expired/i);
  });

  // ── AC-07: Invalid/unknown token ──────────────────────────────────────────

  it('AC-07: unknown token returns 400 without leaking info', async () => {
    const req = makeReq('POST', '/api/auth/activate-account', {
      token:    'totallyfaketoken' + '0'.repeat(48),
      password: 'AnyPass1!',
    });
    const res = await authRoutes.activate(req, env);
    expect(res.status).toBe(400);
    const body = await res.json();
    // Must NOT reveal whether the email/token exists
    expect(body.error).toMatch(/invalid|expired/i);
    expect(body.expired).toBeUndefined();
  });

  // ── AC-08: Resend activation replaces old token ───────────────────────────

  it('AC-08: resend-activation replaces old token with a new one', async () => {
    const oldRaw  = 'oldtoken08' + '0'.repeat(54);
    const oldHash = await hashToken(oldRaw);
    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const user = await seedUser({
      is_active: 0,
      password_hash: null,
      invitation_token: oldHash,
      invitation_token_expires_at: expires,
    });

    const token  = await adminJwt();
    const cookie = `jwt=${token}`;
    const req    = makeReq('POST', `/api/employees/${user.id}/resend-activation`, null, cookie);
    req.params   = { id: String(user.id) };
    req.user     = { id: 1, role: 'administrator' };

    const res  = await employeeRoutes.resendActivation(req, env, silentCtx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);

    const row = await env.DB.prepare(
      'SELECT invitation_token FROM Users WHERE id = ?',
    ).bind(user.id).first();

    // Token must have changed
    expect(row.invitation_token).toBeTruthy();
    expect(row.invitation_token).not.toBe(oldHash);
    // Old raw token no longer activates the account
    const tryOld = makeReq('POST', '/api/auth/activate-account', {
      token: oldRaw, password: 'ShouldFail1!',
    });
    const oldRes = await authRoutes.activate(tryOld, env);
    expect(oldRes.status).toBe(400);
  });

  // ── AC-09: Resend logs audit event ────────────────────────────────────────

  it('AC-09: resend-activation logs activation_email_resent audit event', async () => {
    const user = await seedUser({
      is_active: 0,
      password_hash: null,
      invitation_token: await hashToken('audittoken09' + '0'.repeat(52)),
      invitation_token_expires_at: new Date(Date.now() + 86400000).toISOString(),
    });

    const token  = await adminJwt();
    const cookie = `jwt=${token}`;
    const req    = makeReq('POST', `/api/employees/${user.id}/resend-activation`, null, cookie);
    req.params   = { id: String(user.id) };
    req.user     = { id: 1, role: 'administrator' };

    await employeeRoutes.resendActivation(req, env, silentCtx);

    const audit = await env.DB.prepare(
      `SELECT * FROM AuditLog WHERE entity_id = ? AND action = 'activation_email_resent'`,
    ).bind(user.id).first();
    expect(audit).toBeTruthy();
    expect(audit.actor_id).toBe(1);
    expect(audit.entity_type).toBe('user');
  });

  // ── AC-10/AC-11: Role restrictions ────────────────────────────────────────

  it('AC-10: manager cannot call resend-activation (403)', async () => {
    const mgr   = await seedUser({ role_id: 2, password: 'MgrPass1!' });
    const target = await seedUser({ is_active: 0, password_hash: null });

    const mgrToken = await signJwt(
      { sub: mgr.id, role: 'manager', exp: Math.floor(Date.now() / 1000) + 3600 },
      env.JWT_SECRET,
    );
    const cookie = `jwt=${mgrToken}`;
    const req    = makeReq('POST', `/api/employees/${target.id}/resend-activation`, null, cookie);
    req.params   = { id: String(target.id) };

    const res = await employeeRoutes.resendActivation(req, env);
    expect(res.status).toBe(403);
  });

  it('AC-11: employee cannot call resend-activation (403)', async () => {
    const emp    = await seedUser({ role_id: 1, password: 'EmpPass1!' });
    const target = await seedUser({ is_active: 0, password_hash: null });

    const empToken = await signJwt(
      { sub: emp.id, role: 'employee', exp: Math.floor(Date.now() / 1000) + 3600 },
      env.JWT_SECRET,
    );
    const cookie = `jwt=${empToken}`;
    const req    = makeReq('POST', `/api/employees/${target.id}/resend-activation`, null, cookie);
    req.params   = { id: String(target.id) };

    const res = await employeeRoutes.resendActivation(req, env);
    expect(res.status).toBe(403);
  });

  // ── AC-12 / AC-13: Email content ──────────────────────────────────────────

  it('AC-12: activation email (dev mode) contains iPhone setup instructions', async () => {
    const logs = [];
    const origLog = console.log;
    console.log = (...args) => logs.push(args.join(' '));

    try {
      await sendActivationEmail(emailDevEnv, {
        name:  'Test User',
        email: 'iphone-test@sprint10.test',
        token: 'testtoken12',
      });
    } finally {
      console.log = origLog;
    }

    const output = logs.join('\n');
    expect(output).toContain('iPhone');
    expect(output).toContain('Safari');
    expect(output).toContain('Add to Home Screen');
  });

  it('AC-13: activation email (dev mode) contains Android setup instructions', async () => {
    const logs = [];
    const origLog = console.log;
    console.log = (...args) => logs.push(args.join(' '));

    try {
      await sendActivationEmail(emailDevEnv, {
        name:  'Test User',
        email: 'android-test@sprint10.test',
        token: 'testtoken13',
      });
    } finally {
      console.log = origLog;
    }

    const output = logs.join('\n');
    expect(output).toContain('Android');
    expect(output).toContain('Chrome');
    expect(output).toContain('Home screen');
  });

  // ── AC-14: Resend fails if already active ────────────────────────────────

  it('AC-14: resend-activation returns 400 if user is already active', async () => {
    const activeUser = await seedUser({
      is_active: 1,
      password: 'ActivePass1!',
    });

    const token  = await adminJwt();
    const cookie = `jwt=${token}`;
    const req    = makeReq('POST', `/api/employees/${activeUser.id}/resend-activation`, null, cookie);
    req.params   = { id: String(activeUser.id) };
    req.user     = { id: 1, role: 'administrator' };

    const res  = await employeeRoutes.resendActivation(req, env, silentCtx);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/already active/i);
  });

});
