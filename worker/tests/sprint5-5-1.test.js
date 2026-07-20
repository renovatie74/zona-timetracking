/**
 * Sprint 5.5.1 tests — Admin Console Network Transparency + User Lookup
 *
 * Covers:
 *   Raw IP header capture (cf_connecting_ip, true_client_ip, x_forwarded_for, remote_addr)
 *   Display IP priority: True-Client-IP > CF-Connecting-IP > first XFF token > remote_addr
 *   CF-IPCountry capture
 *   IPv6 support
 *   user_id filter on login-audit
 *   /api/admin-console/users endpoint (active-only default + include_inactive)
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

function makeLoginRequest(email, password, headers = {}) {
  return new Request('http://localhost/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
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

let seq = 900;

async function seedUser({ role_id = 1, is_active = 1, password = null, no_hash = false } = {}) {
  const n    = seq++;
  const now  = new Date().toISOString();
  const hash = no_hash ? null : (password ? await hashPassword(password) : await hashPassword('DefaultPass1!'));
  const r = await env.DB.prepare(
    `INSERT INTO Users
       (role_id, employee_number, first_name, last_name, email,
        password_hash, mobile, is_active,
        invitation_token, invitation_token_expires_at,
        password_reset_token, password_reset_expires_at,
        created_at, updated_at)
     VALUES (?, ?, 'Net', ?, ?, ?, NULL, ?, NULL, NULL, NULL, NULL, ?, ?)`,
  ).bind(role_id, `E551-${n}`, `User${n}`, `test551_${n}@example.com`, hash, is_active, now, now).run();
  return { id: r.meta.last_row_id, email: `test551_${n}@example.com` };
}

let adminUser;

beforeAll(async () => {
  const migrations = [
    m01, m02, m03, m04, m05, m06, m07, m08, m09,
    m10, m11, m12, m13, m14, m15, m16, m17, m18, m19, m20, m21, m22, m23,
  ];
  for (const sql of migrations) await applyMigration(sql);
  adminUser = await seedUser({ role_id: 3 });
});

// ── IP header capture ─────────────────────────────────────────────────────────

describe('IP header capture', () => {

  it('N-01: CF-Connecting-IP is stored in cf_connecting_ip column', async () => {
    const { email } = await seedUser({ password: 'Pass001!' });
    await authRoutes.login(makeLoginRequest(email, 'Pass001!', { 'CF-Connecting-IP': '10.0.0.1' }), env);

    const row = await env.DB.prepare(
      `SELECT cf_connecting_ip FROM LoginAuditEvents WHERE attempted_email = ? ORDER BY id DESC LIMIT 1`,
    ).bind(email).first();
    expect(row.cf_connecting_ip).toBe('10.0.0.1');
  });

  it('N-02: True-Client-IP is stored in true_client_ip column', async () => {
    const { email } = await seedUser({ password: 'Pass002!' });
    await authRoutes.login(
      makeLoginRequest(email, 'Pass002!', { 'True-Client-IP': '203.0.113.42', 'CF-Connecting-IP': '10.0.0.2' }),
      env,
    );

    const row = await env.DB.prepare(
      `SELECT true_client_ip FROM LoginAuditEvents WHERE attempted_email = ? ORDER BY id DESC LIMIT 1`,
    ).bind(email).first();
    expect(row.true_client_ip).toBe('203.0.113.42');
  });

  it('N-03: X-Forwarded-For is stored in x_forwarded_for column', async () => {
    const { email } = await seedUser({ password: 'Pass003!' });
    await authRoutes.login(
      makeLoginRequest(email, 'Pass003!', { 'X-Forwarded-For': '192.168.1.1, 10.1.1.1' }),
      env,
    );

    const row = await env.DB.prepare(
      `SELECT x_forwarded_for FROM LoginAuditEvents WHERE attempted_email = ? ORDER BY id DESC LIMIT 1`,
    ).bind(email).first();
    expect(row.x_forwarded_for).toBe('192.168.1.1, 10.1.1.1');
  });

  it('N-04: display IP uses True-Client-IP over CF-Connecting-IP (priority)', async () => {
    const { email } = await seedUser({ password: 'Pass004!' });
    await authRoutes.login(
      makeLoginRequest(email, 'Pass004!', {
        'True-Client-IP':   '5.5.5.5',
        'CF-Connecting-IP': '6.6.6.6',
        'X-Forwarded-For':  '7.7.7.7',
      }),
      env,
    );

    const row = await env.DB.prepare(
      `SELECT ip_address FROM LoginAuditEvents WHERE attempted_email = ? ORDER BY id DESC LIMIT 1`,
    ).bind(email).first();
    expect(row.ip_address).toBe('5.5.5.5');
  });

  it('N-05: display IP falls back to CF-Connecting-IP when True-Client-IP absent', async () => {
    const { email } = await seedUser({ password: 'Pass005!' });
    await authRoutes.login(
      makeLoginRequest(email, 'Pass005!', {
        'CF-Connecting-IP': '8.8.8.8',
        'X-Forwarded-For':  '9.9.9.9',
      }),
      env,
    );

    const row = await env.DB.prepare(
      `SELECT ip_address FROM LoginAuditEvents WHERE attempted_email = ? ORDER BY id DESC LIMIT 1`,
    ).bind(email).first();
    expect(row.ip_address).toBe('8.8.8.8');
  });

  it('N-06: display IP falls back to first XFF token when CF-Connecting-IP absent', async () => {
    const { email } = await seedUser({ password: 'Pass006!' });
    await authRoutes.login(
      makeLoginRequest(email, 'Pass006!', { 'X-Forwarded-For': '11.22.33.44, 55.66.77.88' }),
      env,
    );

    const row = await env.DB.prepare(
      `SELECT ip_address FROM LoginAuditEvents WHERE attempted_email = ? ORDER BY id DESC LIMIT 1`,
    ).bind(email).first();
    expect(row.ip_address).toBe('11.22.33.44');
  });

  it('N-07: CF-IPCountry is stored in country_code', async () => {
    const { email } = await seedUser({ password: 'Pass007!' });
    await authRoutes.login(
      makeLoginRequest(email, 'Pass007!', { 'CF-IPCountry': 'AE', 'CF-Connecting-IP': '1.1.1.1' }),
      env,
    );

    const row = await env.DB.prepare(
      `SELECT country_code FROM LoginAuditEvents WHERE attempted_email = ? ORDER BY id DESC LIMIT 1`,
    ).bind(email).first();
    expect(row.country_code).toBe('AE');
  });

  it('N-08: IPv6 addresses are stored without corruption', async () => {
    const ipv6 = '2606:4700:4700::1111';
    const { email } = await seedUser({ password: 'Pass008!' });
    await authRoutes.login(
      makeLoginRequest(email, 'Pass008!', { 'CF-Connecting-IP': ipv6 }),
      env,
    );

    const row = await env.DB.prepare(
      `SELECT ip_address, cf_connecting_ip FROM LoginAuditEvents WHERE attempted_email = ? ORDER BY id DESC LIMIT 1`,
    ).bind(email).first();
    expect(row.cf_connecting_ip).toBe(ipv6);
    expect(row.ip_address).toBe(ipv6);
  });
});

// ── login-audit user_id filter ────────────────────────────────────────────────

describe('/api/admin-console/login-audit user_id filter', () => {

  it('N-09: user_id filter returns only rows for that user', async () => {
    const userA = await seedUser({ password: 'FilterA1!' });
    const userB = await seedUser({ password: 'FilterB1!' });

    await authRoutes.login(makeLoginRequest(userA.email, 'FilterA1!'), env);
    await authRoutes.login(makeLoginRequest(userB.email, 'FilterB1!'), env);

    const cookie = await cookieFor(adminUser.id, 'administrator');
    const res  = await adminConsoleRoutes.loginAudit(
      makeApiRequest(
        `/api/admin-console/login-audit?user_id=${userA.id}&date_from=2020-01-01&date_to=2099-12-31`,
        cookie,
      ),
      env,
    );
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data.length).toBeGreaterThan(0);
    expect(json.data.every(r => r.user_id === userA.id)).toBe(true);
  });
});

// ── /api/admin-console/users endpoint ────────────────────────────────────────

describe('/api/admin-console/users', () => {

  it('N-10: returns only active users by default', async () => {
    const cookie = await cookieFor(adminUser.id, 'administrator');
    const res  = await adminConsoleRoutes.users(
      makeApiRequest('/api/admin-console/users', cookie),
      env,
    );
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(Array.isArray(json.data)).toBe(true);
    expect(json.data.every(u => u.status === 'active')).toBe(true);
  });

  it('N-11: include_inactive=1 returns inactive and pending users too', async () => {
    await seedUser({ is_active: 0, password: 'OldPass1!' });     // inactive
    await seedUser({ is_active: 0, no_hash: true });             // pending

    const cookie = await cookieFor(adminUser.id, 'administrator');

    const resActive = await adminConsoleRoutes.users(
      makeApiRequest('/api/admin-console/users', cookie),
      env,
    );
    const jsonActive = await resActive.json();

    const resAll = await adminConsoleRoutes.users(
      makeApiRequest('/api/admin-console/users?include_inactive=1', cookie),
      env,
    );
    const jsonAll = await resAll.json();

    expect(jsonAll.data.length).toBeGreaterThan(jsonActive.data.length);
    const statuses = jsonAll.data.map(u => u.status);
    expect(statuses.some(s => s === 'inactive' || s === 'pending')).toBe(true);
  });

  it('N-12: each user row has id, first_name, last_name, email, role, status fields', async () => {
    const cookie = await cookieFor(adminUser.id, 'administrator');
    const res  = await adminConsoleRoutes.users(
      makeApiRequest('/api/admin-console/users?include_inactive=1', cookie),
      env,
    );
    const json = await res.json();
    const row  = json.data[0];
    expect(row).toHaveProperty('id');
    expect(row).toHaveProperty('first_name');
    expect(row).toHaveProperty('last_name');
    expect(row).toHaveProperty('email');
    expect(row).toHaveProperty('role');
    expect(row).toHaveProperty('status');
  });

  it('N-13: non-admin (manager) gets 403 from users endpoint', async () => {
    const mgr = await seedUser({ role_id: 2 });
    const cookie = await cookieFor(mgr.id, 'manager');
    const res = await adminConsoleRoutes.users(
      makeApiRequest('/api/admin-console/users', cookie),
      env,
    );
    expect(res.status).toBe(403);
  });

  it('N-14: unauthenticated request to users endpoint returns 401', async () => {
    const res = await adminConsoleRoutes.users(
      makeApiRequest('/api/admin-console/users'),
      env,
    );
    expect(res.status).toBe(401);
  });
});
