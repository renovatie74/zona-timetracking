/**
 * Sprint 5.4 tests — Admin Access Management
 *
 * Covers:
 *   POST /api/employees/:id/activate         — account_activated
 *   POST /api/employees/:id/generate-password — password_generated
 *   DELETE /api/employees/:id                — employee_deactivated
 *   AuditLog entries for all three actions
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { env as cfEnv }                    from 'cloudflare:test';
import { signJwt }                         from '../src/lib/jwt.js';
import { verifyPassword }                  from '../src/lib/password.js';
import * as employeeRoutes                 from '../src/routes/employees.js';

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

async function applyMigration(sql) {
  const stmts = sql
    .replace(/--[^\n]*/g, '')
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0);
  for (const stmt of stmts) await env.DB.prepare(stmt).run();
}

function makeRequest(method, url, body = null, cookie = '') {
  const headers = {};
  if (body)   headers['Content-Type'] = 'application/json';
  if (cookie) headers['Cookie']       = cookie;
  return new Request(`http://localhost${url}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    params: { id: url.split('/').at(-1) },
  });
}

// itty-router attaches params; simulate it for direct route tests
function makeRouteRequest(method, id, body = null, cookie = '') {
  const url = `/api/employees/${id}/${method === 'DELETE' ? '' : ''}`;
  const headers = {};
  if (body)   headers['Content-Type'] = 'application/json';
  if (cookie) headers['Cookie']       = cookie;
  const req = new Request(`http://localhost/api/employees/${id}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  req.params = { id: String(id) };
  return req;
}

function makeActionRequest(action, id, cookie) {
  const headers = { 'Content-Type': 'application/json' };
  if (cookie) headers['Cookie'] = cookie;
  const req = new Request(`http://localhost/api/employees/${id}/${action}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({}),
  });
  req.params = { id: String(id) };
  return req;
}

async function cookieFor(userId, role) {
  const token = await signJwt(
    { sub: userId, role, exp: Math.floor(Date.now() / 1000) + 3600 },
    env.JWT_SECRET,
  );
  return `jwt=${token}`;
}

let seq = 700;
async function seedPending() {
  const n = seq++;
  const now = new Date().toISOString();
  const r = await env.DB.prepare(
    `INSERT INTO Users
       (role_id, employee_number, first_name, last_name, email,
        password_hash, mobile, is_active,
        invitation_token, invitation_token_expires_at,
        password_reset_token, password_reset_expires_at,
        created_at, updated_at)
     VALUES (1, ?, 'Pending', ?, ?, NULL, NULL, 0, NULL, NULL, NULL, NULL, ?, ?)`,
  ).bind(`E-P${n}`, `User${n}`, `pending${n}@example.com`, now, now).run();
  return { id: r.meta.last_row_id };
}

async function seedActive() {
  const n = seq++;
  const now = new Date().toISOString();
  const r = await env.DB.prepare(
    `INSERT INTO Users
       (role_id, employee_number, first_name, last_name, email,
        password_hash, mobile, is_active,
        invitation_token, invitation_token_expires_at,
        password_reset_token, password_reset_expires_at,
        created_at, updated_at)
     VALUES (1, ?, 'Active', ?, ?, 'pbkdf2:sha256:100000:fakesalt==:fakehash==', NULL, 1, NULL, NULL, NULL, NULL, ?, ?)`,
  ).bind(`E-A${n}`, `User${n}`, `active${n}@example.com`, now, now).run();
  return { id: r.meta.last_row_id };
}

let admin, manager, employee;

beforeAll(async () => {
  const migrations = [
    m01, m02, m03, m04, m05, m06, m07, m08, m09,
    m10, m11, m12, m13, m14, m15, m16, m17, m18, m19, m20,
  ];
  for (const sql of migrations) await applyMigration(sql);

  const now = new Date().toISOString();

  // admin
  const aR = await env.DB.prepare(
    `INSERT INTO Users (role_id, employee_number, first_name, last_name, email, password_hash, mobile, is_active, invitation_token, invitation_token_expires_at, password_reset_token, password_reset_expires_at, created_at, updated_at)
     VALUES (3, 'E-A01', 'Admin', 'User', 'admin54@example.com', 'x', NULL, 1, NULL, NULL, NULL, NULL, ?, ?)`,
  ).bind(now, now).run();
  admin = { id: aR.meta.last_row_id, cookie: await cookieFor(aR.meta.last_row_id, 'administrator') };

  // manager
  const mR = await env.DB.prepare(
    `INSERT INTO Users (role_id, employee_number, first_name, last_name, email, password_hash, mobile, is_active, invitation_token, invitation_token_expires_at, password_reset_token, password_reset_expires_at, created_at, updated_at)
     VALUES (2, 'E-M01', 'Manager', 'User', 'manager54@example.com', 'x', NULL, 1, NULL, NULL, NULL, NULL, ?, ?)`,
  ).bind(now, now).run();
  manager = { id: mR.meta.last_row_id, cookie: await cookieFor(mR.meta.last_row_id, 'manager') };

  // employee
  const eR = await env.DB.prepare(
    `INSERT INTO Users (role_id, employee_number, first_name, last_name, email, password_hash, mobile, is_active, invitation_token, invitation_token_expires_at, password_reset_token, password_reset_expires_at, created_at, updated_at)
     VALUES (1, 'E-E01', 'Employee', 'User', 'employee54@example.com', 'x', NULL, 1, NULL, NULL, NULL, NULL, ?, ?)`,
  ).bind(now, now).run();
  employee = { id: eR.meta.last_row_id, cookie: await cookieFor(eR.meta.last_row_id, 'employee') };
});

// ── Activation ────────────────────────────────────────────────────────────────

describe('POST /api/employees/:id/activate', () => {
  it('administrator can activate a pending user', async () => {
    const { id } = await seedPending();
    const req = makeActionRequest('activate', id, admin.cookie);
    const res = await employeeRoutes.activate(req, env);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);

    const row = await env.DB.prepare('SELECT is_active FROM Users WHERE id = ?').bind(id).first();
    expect(row.is_active).toBe(1);
  });

  it('non-admin (manager) cannot activate a pending user', async () => {
    const { id } = await seedPending();
    const req = makeActionRequest('activate', id, manager.cookie);
    const res = await employeeRoutes.activate(req, env);
    expect(res.status).toBe(403);
  });

  it('non-admin (employee) cannot activate a pending user', async () => {
    const { id } = await seedPending();
    const req = makeActionRequest('activate', id, employee.cookie);
    const res = await employeeRoutes.activate(req, env);
    expect(res.status).toBe(403);
  });

  it('activating an already-active user returns 400', async () => {
    const { id } = await seedActive();
    const req = makeActionRequest('activate', id, admin.cookie);
    const res = await employeeRoutes.activate(req, env);
    expect(res.status).toBe(400);
  });

  it('activation creates an account_activated audit log entry', async () => {
    const { id } = await seedPending();
    const req = makeActionRequest('activate', id, admin.cookie);
    await employeeRoutes.activate(req, env);

    const log = await env.DB.prepare(
      `SELECT * FROM AuditLog WHERE action = 'account_activated' AND entity_id = ? ORDER BY id DESC LIMIT 1`,
    ).bind(id).first();
    expect(log).not.toBeNull();
    expect(log.actor_id).toBe(admin.id);
    expect(log.entity_type).toBe('user');
  });
});

// ── Password generation ───────────────────────────────────────────────────────

describe('POST /api/employees/:id/generate-password', () => {
  it('administrator can generate a password for an active user', async () => {
    const { id } = await seedActive();
    const req = makeActionRequest('generate-password', id, admin.cookie);
    const res = await employeeRoutes.generatePasswordForUser(req, env);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(typeof json.password).toBe('string');
    expect(json.password.length).toBeGreaterThanOrEqual(8);
    expect(json.employee).toBeDefined();
    expect(typeof json.employee.email).toBe('string');
  });

  it('generated password replaces the old password hash in the DB', async () => {
    const { id } = await seedActive();
    const req = makeActionRequest('generate-password', id, admin.cookie);
    const res = await employeeRoutes.generatePasswordForUser(req, env);
    const { password } = await res.json();

    const row = await env.DB.prepare('SELECT password_hash FROM Users WHERE id = ?').bind(id).first();
    expect(row.password_hash).not.toBe('pbkdf2:sha256:100000:fakesalt==:fakehash==');
    const valid = await verifyPassword(password, row.password_hash);
    expect(valid).toBe(true);
  });

  it('old password hash is replaced — new hash is distinct and the new password verifies', async () => {
    const { id } = await seedActive();
    const before = await env.DB.prepare('SELECT password_hash FROM Users WHERE id = ?').bind(id).first();
    const oldHash = before.password_hash;

    const res  = await employeeRoutes.generatePasswordForUser(makeActionRequest('generate-password', id, admin.cookie), env);
    const { password: newPlain } = await res.json();

    const after = await env.DB.prepare('SELECT password_hash FROM Users WHERE id = ?').bind(id).first();
    // Hash must have changed
    expect(after.password_hash).not.toBe(oldHash);
    // New plaintext must verify against the new hash (proves old hash no longer matches new plain)
    const valid = await verifyPassword(newPlain, after.password_hash);
    expect(valid).toBe(true);
  });

  it('non-admin cannot generate a password', async () => {
    const { id } = await seedActive();
    const req = makeActionRequest('generate-password', id, manager.cookie);
    const res = await employeeRoutes.generatePasswordForUser(req, env);
    expect(res.status).toBe(403);
  });

  it('generated password is not stored in plain text', async () => {
    const { id } = await seedActive();
    const res = await employeeRoutes.generatePasswordForUser(
      makeActionRequest('generate-password', id, admin.cookie), env,
    );
    const { password } = await res.json();

    const row = await env.DB.prepare('SELECT password_hash FROM Users WHERE id = ?').bind(id).first();
    expect(row.password_hash).not.toBe(password);
    expect(row.password_hash.startsWith('pbkdf2:')).toBe(true);
  });

  it('generate-password also activates a pending user', async () => {
    const { id } = await seedPending();
    const before = await env.DB.prepare('SELECT is_active FROM Users WHERE id = ?').bind(id).first();
    expect(before.is_active).toBe(0);

    await employeeRoutes.generatePasswordForUser(
      makeActionRequest('generate-password', id, admin.cookie), env,
    );

    const after = await env.DB.prepare('SELECT is_active FROM Users WHERE id = ?').bind(id).first();
    expect(after.is_active).toBe(1);
  });

  it('password_generated audit log is created and does not log the password', async () => {
    const { id } = await seedActive();
    await employeeRoutes.generatePasswordForUser(
      makeActionRequest('generate-password', id, admin.cookie), env,
    );

    const log = await env.DB.prepare(
      `SELECT * FROM AuditLog WHERE action = 'password_generated' AND entity_id = ? ORDER BY id DESC LIMIT 1`,
    ).bind(id).first();
    expect(log).not.toBeNull();
    expect(log.actor_id).toBe(admin.id);
    // Ensure plain password is not in audit log fields
    if (log.old_values) expect(log.old_values).not.toContain('password');
    if (log.new_values) expect(log.new_values).not.toContain('pbkdf2');
    expect(log.new_values).not.toMatch(/^[A-Za-z0-9!@#$]{8,}$/);
  });
});

// ── Deactivation ──────────────────────────────────────────────────────────────

describe('DELETE /api/employees/:id (deactivate)', () => {
  it('administrator can deactivate an active user', async () => {
    const { id } = await seedActive();
    const req = makeRouteRequest('DELETE', id, null, admin.cookie);
    const res = await employeeRoutes.remove(req, env);
    expect(res.status).toBe(200);

    const row = await env.DB.prepare('SELECT is_active FROM Users WHERE id = ?').bind(id).first();
    expect(row.is_active).toBe(0);
  });

  it('deactivated user has is_active=0 and cannot satisfy login is_active check', async () => {
    const { id } = await seedActive();
    await employeeRoutes.remove(makeRouteRequest('DELETE', id, null, admin.cookie), env);

    const row = await env.DB.prepare('SELECT is_active FROM Users WHERE id = ?').bind(id).first();
    expect(row.is_active).toBe(0);
  });

  it('deactivation creates an employee_deactivated audit log entry', async () => {
    const { id } = await seedActive();
    await employeeRoutes.remove(makeRouteRequest('DELETE', id, null, admin.cookie), env);

    const log = await env.DB.prepare(
      `SELECT * FROM AuditLog WHERE action = 'employee_deactivated' AND entity_id = ? ORDER BY id DESC LIMIT 1`,
    ).bind(id).first();
    expect(log).not.toBeNull();
    expect(log.actor_id).toBe(admin.id);
    expect(log.entity_type).toBe('user');
  });
});
