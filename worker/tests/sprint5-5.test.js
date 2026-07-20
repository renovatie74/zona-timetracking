/**
 * Sprint 5.5 tests — Admin Console / Login Audit
 *
 * Covers:
 *   Login audit collection (success + every failure reason)
 *   IP address, country code, user agent capture
 *   /api/admin-console/login-audit permissions + response
 *   /api/admin-console/admin-audit permissions + response
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { env as cfEnv }                    from 'cloudflare:test';
import { signJwt }                         from '../src/lib/jwt.js';
import { hashPassword }                    from '../src/lib/password.js';
import * as authRoutes                     from '../src/routes/auth.js';
import * as adminConsoleRoutes             from '../src/routes/admin_console.js';

const env = {
  ...cfEnv,
  JWT_SECRET:    'test-jwt-secret-00000000000000000000000000000000',
  EMAIL_API_KEY: 'test-api-key',
  APP_URL:       'https://test.example.com',
  EMAIL_FROM:    'noreply@test.example.com',
};

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

async function applyMigration(sql) {
  const stmts = sql.replace(/--[^\n]*/g, '').split(';').map(s => s.trim()).filter(s => s.length > 0);
  for (const stmt of stmts) await env.DB.prepare(stmt).run();
}

// ── Request helpers ────────────────────────────────────────────────────────────

function makeLoginRequest(email, password, headers = {}) {
  const h = { 'Content-Type': 'application/json', ...headers };
  return new Request('http://localhost/api/auth/login', {
    method: 'POST',
    headers: h,
    body: JSON.stringify({ email, password }),
  });
}

function makeApiRequest(path, cookie) {
  const h = {};
  if (cookie) h['Cookie'] = cookie;
  return new Request(`http://localhost${path}`, { method: 'GET', headers: h });
}

async function cookieFor(userId, role) {
  const token = await signJwt(
    { sub: userId, role, exp: Math.floor(Date.now() / 1000) + 3600 },
    env.JWT_SECRET,
  );
  return `jwt=${token}`;
}

// ── Seed helpers ───────────────────────────────────────────────────────────────

let seq = 800;

async function seedUser({ role_id = 1, is_active = 1, password = null, no_hash = false } = {}) {
  const n   = seq++;
  const now = new Date().toISOString();
  const hash = no_hash ? null : (password ? await hashPassword(password) : await hashPassword('DefaultPass1!'));
  const r = await env.DB.prepare(
    `INSERT INTO Users
       (role_id, employee_number, first_name, last_name, email,
        password_hash, mobile, is_active,
        invitation_token, invitation_token_expires_at,
        password_reset_token, password_reset_expires_at,
        created_at, updated_at)
     VALUES (?, ?, 'Test', ?, ?, ?, NULL, ?, NULL, NULL, NULL, NULL, ?, ?)`,
  ).bind(role_id, `E55-${n}`, `User${n}`, `test55_${n}@example.com`, hash, is_active, now, now).run();
  return { id: r.meta.last_row_id, email: `test55_${n}@example.com` };
}

// ── Setup ─────────────────────────────────────────────────────────────────────

let adminUser, managerUser, employeeUser;

beforeAll(async () => {
  const migrations = [
    m01, m02, m03, m04, m05, m06, m07, m08, m09,
    m10, m11, m12, m13, m14, m15, m16, m17, m18, m19, m20, m21, m22, m23,
  ];
  for (const sql of migrations) await applyMigration(sql);

  adminUser    = await seedUser({ role_id: 3 });   // administrator
  managerUser  = await seedUser({ role_id: 2 });   // manager
  employeeUser = await seedUser({ role_id: 1 });   // employee
});

// ── Login audit — collection ──────────────────────────────────────────────────

describe('Login audit collection', () => {

  it('LA-01: successful login creates LoginAuditEvents row with result=success', async () => {
    const { email } = await seedUser({ password: 'CorrectPass1!' });
    const req = makeLoginRequest(email, 'CorrectPass1!');
    const res = await authRoutes.login(req, env);
    expect(res.status).toBe(200);

    const row = await env.DB.prepare(
      `SELECT * FROM LoginAuditEvents WHERE attempted_email = ? ORDER BY id DESC LIMIT 1`,
    ).bind(email).first();
    expect(row).not.toBeNull();
    expect(row.result).toBe('success');
    expect(row.failure_reason).toBeNull();
    expect(row.user_id).not.toBeNull();
  });

  it('LA-02: wrong password creates row with result=failed, reason=invalid_password', async () => {
    const { email } = await seedUser({ password: 'RightPass1!' });
    const req = makeLoginRequest(email, 'WrongPass99!');
    const res = await authRoutes.login(req, env);
    expect(res.status).toBe(401);

    const row = await env.DB.prepare(
      `SELECT * FROM LoginAuditEvents WHERE attempted_email = ? ORDER BY id DESC LIMIT 1`,
    ).bind(email).first();
    expect(row.result).toBe('failed');
    expect(row.failure_reason).toBe('invalid_password');
    expect(row.user_id).not.toBeNull();
  });

  it('LA-03: unknown email creates row with result=failed, reason=unknown_user, user_id null', async () => {
    const email = 'nobody_atall_555@example.com';
    const req = makeLoginRequest(email, 'anything');
    const res = await authRoutes.login(req, env);
    expect(res.status).toBe(401);

    const row = await env.DB.prepare(
      `SELECT * FROM LoginAuditEvents WHERE attempted_email = ? ORDER BY id DESC LIMIT 1`,
    ).bind(email).first();
    expect(row.result).toBe('failed');
    expect(row.failure_reason).toBe('unknown_user');
    expect(row.user_id).toBeNull();
  });

  it('LA-04: pending user (no password hash) creates row with reason=pending_activation', async () => {
    const { email } = await seedUser({ no_hash: true, is_active: 0 });
    const req = makeLoginRequest(email, 'anything');
    const res = await authRoutes.login(req, env);
    expect(res.status).toBe(401);

    const row = await env.DB.prepare(
      `SELECT * FROM LoginAuditEvents WHERE attempted_email = ? ORDER BY id DESC LIMIT 1`,
    ).bind(email).first();
    expect(row.failure_reason).toBe('pending_activation');
  });

  it('LA-05: deactivated user (has hash, is_active=0) creates row with reason=deactivated', async () => {
    const { email } = await seedUser({ password: 'OldPass1!', is_active: 0 });
    const req = makeLoginRequest(email, 'OldPass1!');
    const res = await authRoutes.login(req, env);
    expect(res.status).toBe(401);

    const row = await env.DB.prepare(
      `SELECT * FROM LoginAuditEvents WHERE attempted_email = ? ORDER BY id DESC LIMIT 1`,
    ).bind(email).first();
    expect(row.failure_reason).toBe('deactivated');
  });

  it('LA-06: CF-Connecting-IP header is captured in ip_address', async () => {
    const { email } = await seedUser({ password: 'Pass1234!' });
    const req = makeLoginRequest(email, 'Pass1234!', { 'CF-Connecting-IP': '1.2.3.4' });
    await authRoutes.login(req, env);

    const row = await env.DB.prepare(
      `SELECT ip_address FROM LoginAuditEvents WHERE attempted_email = ? ORDER BY id DESC LIMIT 1`,
    ).bind(email).first();
    expect(row.ip_address).toBe('1.2.3.4');
  });

  it('LA-07: CF-IPCountry header is captured in country_code', async () => {
    const { email } = await seedUser({ password: 'Pass5678!' });
    const req = makeLoginRequest(email, 'Pass5678!', { 'CF-IPCountry': 'AE', 'CF-Connecting-IP': '5.6.7.8' });
    await authRoutes.login(req, env);

    const row = await env.DB.prepare(
      `SELECT country_code FROM LoginAuditEvents WHERE attempted_email = ? ORDER BY id DESC LIMIT 1`,
    ).bind(email).first();
    expect(row.country_code).toBe('AE');
  });

  it('LA-08: User-Agent header is captured in user_agent', async () => {
    const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17 Mobile/15E148 Safari/604.1';
    const { email } = await seedUser({ password: 'Pass9012!' });
    const req = makeLoginRequest(email, 'Pass9012!', { 'User-Agent': ua });
    await authRoutes.login(req, env);

    const row = await env.DB.prepare(
      `SELECT user_agent, device_summary FROM LoginAuditEvents WHERE attempted_email = ? ORDER BY id DESC LIMIT 1`,
    ).bind(email).first();
    expect(row.user_agent).toBe(ua);
    expect(row.device_summary).toContain('iPhone');
  });

  it('LA-09: Chrome Desktop UA produces device_summary with Chrome / Desktop', async () => {
    const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
    const { email } = await seedUser({ password: 'Pass3456!' });
    const req = makeLoginRequest(email, 'Pass3456!', { 'User-Agent': ua });
    await authRoutes.login(req, env);

    const row = await env.DB.prepare(
      `SELECT device_summary FROM LoginAuditEvents WHERE attempted_email = ? ORDER BY id DESC LIMIT 1`,
    ).bind(email).first();
    expect(row.device_summary).toBe('Chrome / Desktop');
  });
});

// ── Admin Console API — permissions ──────────────────────────────────────────

describe('/api/admin-console permissions', () => {

  it('LA-10: administrator can access login-audit (200)', async () => {
    const cookie = await cookieFor(adminUser.id, 'administrator');
    const req = makeApiRequest('/api/admin-console/login-audit', cookie);
    const res = await adminConsoleRoutes.loginAudit(req, env);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(Array.isArray(json.data)).toBe(true);
  });

  it('LA-11: manager cannot access login-audit (403)', async () => {
    const cookie = await cookieFor(managerUser.id, 'manager');
    const req = makeApiRequest('/api/admin-console/login-audit', cookie);
    const res = await adminConsoleRoutes.loginAudit(req, env);
    expect(res.status).toBe(403);
  });

  it('LA-12: employee cannot access login-audit (403)', async () => {
    const cookie = await cookieFor(employeeUser.id, 'employee');
    const req = makeApiRequest('/api/admin-console/login-audit', cookie);
    const res = await adminConsoleRoutes.loginAudit(req, env);
    expect(res.status).toBe(403);
  });

  it('LA-13: unauthenticated request to login-audit returns 401', async () => {
    const req = makeApiRequest('/api/admin-console/login-audit');
    const res = await adminConsoleRoutes.loginAudit(req, env);
    expect(res.status).toBe(401);
  });

  it('LA-14: administrator can access admin-audit (200)', async () => {
    const cookie = await cookieFor(adminUser.id, 'administrator');
    const req = makeApiRequest('/api/admin-console/admin-audit', cookie);
    const res = await adminConsoleRoutes.adminAudit(req, env);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(Array.isArray(json.data)).toBe(true);
  });

  it('LA-15: manager cannot access admin-audit (403)', async () => {
    const cookie = await cookieFor(managerUser.id, 'manager');
    const req = makeApiRequest('/api/admin-console/admin-audit', cookie);
    const res = await adminConsoleRoutes.adminAudit(req, env);
    expect(res.status).toBe(403);
  });
});

// ── Admin Console API — data correctness ─────────────────────────────────────

describe('/api/admin-console/login-audit data', () => {

  it('LA-16: login-audit returns rows for the seeded login attempts', async () => {
    const cookie = await cookieFor(adminUser.id, 'administrator');
    // Use a wide date range to catch all test rows
    const req = makeApiRequest(
      '/api/admin-console/login-audit?date_from=2020-01-01&date_to=2099-12-31',
      cookie,
    );
    const res  = await adminConsoleRoutes.loginAudit(req, env);
    const json = await res.json();
    expect(json.data.length).toBeGreaterThan(0);
    // Every row has the required fields
    const row = json.data[0];
    expect(row).toHaveProperty('attempted_email');
    expect(row).toHaveProperty('result');
    expect(row).toHaveProperty('created_at');
  });

  it('LA-17: result filter returns only matching rows', async () => {
    const { email } = await seedUser({ password: 'FilterTest1!' });
    // Successful login
    await authRoutes.login(makeLoginRequest(email, 'FilterTest1!'), env);
    // Failed login
    await authRoutes.login(makeLoginRequest(email, 'WrongPass!'), env);

    const cookie = await cookieFor(adminUser.id, 'administrator');

    const resSuccess = await adminConsoleRoutes.loginAudit(
      makeApiRequest(`/api/admin-console/login-audit?result=success&date_from=2020-01-01&date_to=2099-12-31&email=${encodeURIComponent(email)}`, cookie),
      env,
    );
    const jsonS = await resSuccess.json();
    expect(jsonS.data.every(r => r.result === 'success')).toBe(true);

    const resFailed = await adminConsoleRoutes.loginAudit(
      makeApiRequest(`/api/admin-console/login-audit?result=failed&date_from=2020-01-01&date_to=2099-12-31&email=${encodeURIComponent(email)}`, cookie),
      env,
    );
    const jsonF = await resFailed.json();
    expect(jsonF.data.every(r => r.result === 'failed')).toBe(true);
  });

  it('LA-18: response includes total count', async () => {
    const cookie = await cookieFor(adminUser.id, 'administrator');
    const req  = makeApiRequest('/api/admin-console/login-audit?date_from=2020-01-01&date_to=2099-12-31', cookie);
    const res  = await adminConsoleRoutes.loginAudit(req, env);
    const json = await res.json();
    expect(typeof json.total).toBe('number');
    expect(json.total).toBeGreaterThanOrEqual(json.data.length);
  });
});

describe('/api/admin-console/admin-audit data', () => {

  it('LA-19: admin-audit only returns admin action types, not login/logout', async () => {
    const cookie = await cookieFor(adminUser.id, 'administrator');
    const req  = makeApiRequest('/api/admin-console/admin-audit?date_from=2020-01-01&date_to=2099-12-31', cookie);
    const res  = await adminConsoleRoutes.adminAudit(req, env);
    const json = await res.json();
    const actions = json.data.map(r => r.action);
    const noLogin = actions.every(a => a !== 'login' && a !== 'logout');
    expect(noLogin).toBe(true);
  });
});
