/**
 * Sprint 1 auth tests — runs in the Cloudflare Workers runtime via miniflare.
 *
 * env.DB    = in-memory D1 (fresh per test run, schema applied in beforeAll)
 * env.JWT_SECRET = 'test-jwt-secret-...' (set in vitest.config.js miniflare.vars)
 *
 * Tests call route handlers directly (not via HTTP) to avoid network latency.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { env as cfEnv }                    from 'cloudflare:test';

// Overlay test secrets that can't live in wrangler.toml (committed repo).
// The miniflare D1 binding is still taken from cfEnv.
const env = {
  ...cfEnv,
  JWT_SECRET:    'test-jwt-secret-00000000000000000000000000000000',
  EMAIL_API_KEY: 'test-api-key',
  APP_URL:       'https://test.example.com',
  EMAIL_FROM:    'noreply@test.example.com',
};

// Inline SQL at bundle time via Vite ?raw imports — Workers runtime has no host FS access
import migration01 from '../migrations/0001_initial.sql?raw';
import migration02 from '../migrations/0002_projects.sql?raw';
import migration03 from '../migrations/0003_time_entries.sql?raw';
import migration04 from '../migrations/0004_notes.sql?raw';
import migration05 from '../migrations/0005_recent.sql?raw';
import migration06 from '../migrations/0006_audit.sql?raw';
import migration07 from '../migrations/0007_teams.sql?raw';
import migration08 from '../migrations/0008_users_team_id.sql?raw';
import migration09 from '../migrations/0009_projects_v2.sql?raw';
import migration10 from '../migrations/0010_clients.sql?raw';
import migration11 from '../migrations/0011_projects_client_id.sql?raw';
import migration12 from '../migrations/0012_employee_name_split.sql?raw';

import * as authRoutes  from '../src/routes/auth.js';
import { hashPassword } from '../src/lib/password.js';
import { signJwt }      from '../src/lib/jwt.js';
import { requireRole }  from '../src/middleware/auth.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRequest(method, url, body, cookie = '') {
  const headers = {};
  if (body)   headers['Content-Type'] = 'application/json';
  if (cookie) headers['Cookie']       = cookie;
  return new Request(`http://localhost${url}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

let userSeq = 1;
async function seedUser(overrides = {}) {
  const seq  = userSeq++;
  const now  = new Date().toISOString();
  const hash = overrides.password
    ? await hashPassword(overrides.password)
    : null;
  delete overrides.password;

  const defaults = {
    role_id:                     1,           // 'employee'
    employee_number:             `E-${String(seq).padStart(3, '0')}`,
    first_name:                  'Test',
    last_name:                   `User ${seq}`,
    email:                       `user${seq}@test.example`,
    password_hash:               hash,
    is_active:                   1,
    invitation_token:            null,
    invitation_token_expires_at: null,
    password_reset_token:        null,
    password_reset_expires_at:   null,
    created_at:                  now,
    updated_at:                  now,
  };
  const u = { ...defaults, ...overrides };
  u.name = `${u.first_name} ${u.last_name}`;

  const result = await env.DB.prepare(
    `INSERT INTO Users
       (role_id, employee_number, first_name, last_name, email, password_hash, is_active,
        invitation_token, invitation_token_expires_at,
        password_reset_token, password_reset_expires_at,
        created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    u.role_id, u.employee_number, u.first_name, u.last_name, u.email,
    u.password_hash, u.is_active,
    u.invitation_token, u.invitation_token_expires_at,
    u.password_reset_token, u.password_reset_expires_at,
    u.created_at, u.updated_at,
  ).run();

  return { ...u, id: result.meta.last_row_id };
}

// D1.exec() only handles single statements. Strip comments first (some contain ';'),
// then split by ';' and run each statement separately.
async function applyMigration(sql) {
  const statements = sql
    .replace(/--[^\n]*/g, '')  // strip --comments BEFORE splitting (they may contain ';')
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0);

  for (const stmt of statements) {
    await env.DB.prepare(stmt).run();
  }
}

const MIGRATIONS = [
  migration01, migration02, migration03, migration04, migration05, migration06,
  migration07, migration08, migration09, migration10, migration11, migration12,
];

beforeAll(async () => {
  for (const sql of MIGRATIONS) {
    await applyMigration(sql);
  }
});

// ── Test cases ────────────────────────────────────────────────────────────────

describe('Auth — Sprint 1', () => {

  // 1. Successful login
  it('TC-01: successful login returns user data and JWT cookie', async () => {
    const user = await seedUser({ role_id: 3, email: 'admin@test.example', password: 'Password1!' });

    const req = makeRequest('POST', '/api/auth/login', {
      email:    user.email,
      password: 'Password1!',
    });
    const res = await authRoutes.login(req, env);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(user.id);
    expect(body.role).toBe('administrator');
    expect(body.first_name).toBe(user.first_name);
    expect(body.last_name).toBe(user.last_name);
    expect(body.name).toBe(user.name);
    expect(res.headers.get('Set-Cookie')).toMatch(/^jwt=/);
    expect(res.headers.get('Set-Cookie')).toMatch(/HttpOnly/);
  });

  // 2. Invalid password
  it('TC-02: invalid password returns 401', async () => {
    const user = await seedUser({ password: 'RealPass1!' });

    const req = makeRequest('POST', '/api/auth/login', {
      email:    user.email,
      password: 'WrongPass!',
    });
    const res = await authRoutes.login(req, env);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Invalid email or password');
  });

  // 3. Disabled user
  it('TC-03: disabled user (is_active=0) returns 401', async () => {
    const user = await seedUser({ is_active: 0, password: 'Password1!' });

    const req = makeRequest('POST', '/api/auth/login', {
      email:    user.email,
      password: 'Password1!',
    });
    const res = await authRoutes.login(req, env);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Invalid email or password');
  });

  // 4. Invitation activation — valid token
  it('TC-04: activate account with valid invitation token sets password and auto-logs in', async () => {
    const expires = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
    const user = await seedUser({
      is_active:                   0,
      password_hash:               null,
      invitation_token:            'abc123def456abc123def456abc123def456abc123def456',
      invitation_token_expires_at: expires,
    });

    const req = makeRequest('POST', '/api/auth/activate-account', {
      token:    'abc123def456abc123def456abc123def456abc123def456',
      password: 'NewPass1234!',
    });
    const res = await authRoutes.activate(req, env);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(user.id);
    expect(res.headers.get('Set-Cookie')).toMatch(/^jwt=/);

    // User should now be active
    const updated = await env.DB.prepare('SELECT is_active FROM Users WHERE id = ?').bind(user.id).first();
    expect(updated.is_active).toBe(1);
  });

  // 5. Expired invitation token
  it('TC-05: expired invitation token returns 400', async () => {
    const expires = new Date(Date.now() - 1000).toISOString(); // 1 second ago
    await seedUser({
      is_active:                   0,
      invitation_token:            'expiredtoken0000000000000000000000000000000000000',
      invitation_token_expires_at: expires,
    });

    const req = makeRequest('POST', '/api/auth/activate-account', {
      token:    'expiredtoken0000000000000000000000000000000000000',
      password: 'NewPass1234!',
    });
    const res = await authRoutes.activate(req, env);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/expired/i);
  });

  // 6. Password reset — valid token
  it('TC-06: reset password with valid token updates hash', async () => {
    const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const user = await seedUser({
      password: 'OldPass1!',
      password_reset_token:      'resettoken00000000000000000000000000000000000000',
      password_reset_expires_at: expires,
    });

    const req = makeRequest('POST', '/api/auth/reset-password', {
      token:    'resettoken00000000000000000000000000000000000000',
      password: 'NewSecure1!',
    });
    const res = await authRoutes.resetPassword(req, env);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);

    // Token should be cleared
    const updated = await env.DB.prepare(
      'SELECT password_reset_token FROM Users WHERE id = ?'
    ).bind(user.id).first();
    expect(updated.password_reset_token).toBeNull();
  });

  // 7. Expired reset token
  it('TC-07: expired reset token returns 400', async () => {
    const expires = new Date(Date.now() - 1000).toISOString();
    await seedUser({
      password: 'Pass1!',
      password_reset_token:      'expiredresettoken00000000000000000000000000000000',
      password_reset_expires_at: expires,
    });

    const req = makeRequest('POST', '/api/auth/reset-password', {
      token:    'expiredresettoken00000000000000000000000000000000',
      password: 'NewPass1!',
    });
    const res = await authRoutes.resetPassword(req, env);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/expired/i);
  });

  // 8. Change password — requires auth
  it('TC-08: change password with correct current password succeeds', async () => {
    const user = await seedUser({ role_id: 2, password: 'OldPass1!' });

    // Create a JWT cookie for this user (role = manager, id from seed)
    const token = await signJwt(
      { sub: user.id, role: 'manager', exp: Math.floor(Date.now() / 1000) + 3600 },
      env.JWT_SECRET,
    );
    const cookie = `jwt=${token}`;

    const req = makeRequest('POST', '/api/auth/change-password', {
      current_password: 'OldPass1!',
      new_password:     'NewPass1234!',
    }, cookie);
    const res = await authRoutes.changePassword(req, env);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  // 9. JWT expiration — expired token is rejected
  it('TC-09: expired JWT returns 401 on GET /api/auth/me', async () => {
    const user = await seedUser({ password: 'Pass1234!' });

    // Create a JWT with exp in the past
    const expiredToken = await signJwt(
      { sub: user.id, role: 'employee', exp: Math.floor(Date.now() / 1000) - 1 },
      env.JWT_SECRET,
    );
    const cookie = `jwt=${expiredToken}`;

    const req = makeRequest('GET', '/api/auth/me', null, cookie);
    const res = await authRoutes.me(req, env);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/expired|invalid/i);
  });

  // 10. Role authorization — requireRole blocks wrong roles
  it('TC-10: requireRole blocks user without required role (403)', async () => {
    const user = await seedUser({ role_id: 1, password: 'Pass1234!' }); // employee

    const token = await signJwt(
      { sub: user.id, role: 'employee', exp: Math.floor(Date.now() / 1000) + 3600 },
      env.JWT_SECRET,
    );
    const cookie = `jwt=${token}`;

    const req = makeRequest('GET', '/api/admin/anything', null, cookie);
    const checkRole = requireRole('manager', 'administrator');
    const res = await checkRole(req, env);

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('Forbidden');
  });

});
