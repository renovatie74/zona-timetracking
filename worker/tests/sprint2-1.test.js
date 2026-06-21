/**
 * Sprint 2.1 tests — Clients CRUD, phone validation, profile update.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { env as cfEnv }                    from 'cloudflare:test';
import { signJwt }                         from '../src/lib/jwt.js';
import * as clientRoutes   from '../src/routes/clients.js';
import * as employeeRoutes from '../src/routes/employees.js';
import * as authRoutes     from '../src/routes/auth.js';

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

const env = {
  ...cfEnv,
  JWT_SECRET:    'test-jwt-secret-00000000000000000000000000000000',
  EMAIL_API_KEY: 'test-api-key',
  APP_URL:       'https://test.example.com',
  EMAIL_FROM:    'noreply@test.example.com',
};

async function applyMigration(sql) {
  const statements = sql
    .replace(/--[^\n]*/g, '')
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0);
  for (const stmt of statements) {
    await env.DB.prepare(stmt).run();
  }
}

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

async function cookieFor(userId, role) {
  const token = await signJwt(
    { sub: userId, role, exp: Math.floor(Date.now() / 1000) + 3600 },
    env.JWT_SECRET,
  );
  return `jwt=${token}`;
}

let userSeq = 200;
async function seedUser(role = 'administrator', overrides = {}) {
  const seq = userSeq++;
  const now = new Date().toISOString();
  const ROLE_MAP = { employee: 1, manager: 2, administrator: 3 };
  const role_id  = ROLE_MAP[role] ?? 1;

  const result = await env.DB.prepare(
    `INSERT INTO Users
       (role_id, employee_number, name, email, password_hash, mobile, is_active,
        invitation_token, invitation_token_expires_at,
        password_reset_token, password_reset_expires_at,
        created_at, updated_at)
     VALUES (?, ?, ?, ?, NULL, ?, 1, NULL, NULL, NULL, NULL, ?, ?)`,
  ).bind(role_id, `E-${String(seq).padStart(3, '0')}`,
         `Test ${role} ${seq}`, `test${seq}@example.com`,
         overrides.phone ?? null,
         now, now).run();

  const id = result.meta.last_row_id;
  return { id, cookie: await cookieFor(id, role) };
}

let admin, manager, worker;

beforeAll(async () => {
  const migrations = [
    migration01, migration02, migration03, migration04,
    migration05, migration06, migration07, migration08, migration09,
    migration10, migration11,
  ];
  for (const sql of migrations) await applyMigration(sql);

  admin   = await seedUser('administrator');
  manager = await seedUser('manager');
  worker  = await seedUser('employee');
});

// ═══════════════════════════════════════════════════════════════════════════════
// CLIENTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('Clients — Sprint 2.1', () => {

  let createdClientId;

  it('TC-CL01: admin can create a client (generates client_code)', async () => {
    const req = makeRequest('POST', '/api/clients', {
      name: 'Acme Corp', contact_person: 'John Doe',
      phone: '+48600100200', email: 'john@acme.com',
    }, admin.cookie);
    const res = await clientRoutes.create(req, env);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.client_code).toMatch(/^C-\d{3}$/);
    expect(body.data.name).toBe('Acme Corp');
    createdClientId = body.data.id;
  });

  it('TC-CL02: admin can list clients', async () => {
    const req = makeRequest('GET', '/api/clients', null, admin.cookie);
    const res = await clientRoutes.list(req, env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThanOrEqual(1);
  });

  it('TC-CL03: manager can list clients (read access)', async () => {
    const req = makeRequest('GET', '/api/clients', null, manager.cookie);
    const res = await clientRoutes.list(req, env);
    expect(res.status).toBe(200);
  });

  it('TC-CL04: worker cannot list clients (403)', async () => {
    const req = makeRequest('GET', '/api/clients', null, worker.cookie);
    const res = await clientRoutes.list(req, env);
    expect(res.status).toBe(403);
  });

  it('TC-CL05: admin can get client by id', async () => {
    const req = makeRequest('GET', `/api/clients/${createdClientId}`, null, admin.cookie);
    req.params = { id: String(createdClientId) };
    const res = await clientRoutes.get(req, env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.id).toBe(createdClientId);
    expect(body.data.name).toBe('Acme Corp');
  });

  it('TC-CL06: admin can update a client', async () => {
    const req = makeRequest('PUT', `/api/clients/${createdClientId}`,
      { contact_person: 'Jane Doe' }, admin.cookie);
    req.params = { id: String(createdClientId) };
    const res = await clientRoutes.update(req, env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.contact_person).toBe('Jane Doe');
  });

  it('TC-CL07: manager cannot create a client (403)', async () => {
    const req = makeRequest('POST', '/api/clients', { name: 'Manager Client' }, manager.cookie);
    const res = await clientRoutes.create(req, env);
    expect(res.status).toBe(403);
  });

  it('TC-CL08: search clients by name', async () => {
    const req = makeRequest('GET', '/api/clients?search=Acme', null, admin.cookie);
    const res = await clientRoutes.list(req, env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.some(c => c.name.includes('Acme'))).toBe(true);
  });

  it('TC-CL09: admin can deactivate a client', async () => {
    const req = makeRequest('DELETE', `/api/clients/${createdClientId}`, null, admin.cookie);
    req.params = { id: String(createdClientId) };
    const res = await clientRoutes.remove(req, env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it('TC-CL10: get non-existent client returns 404', async () => {
    const req = makeRequest('GET', '/api/clients/99999', null, admin.cookie);
    req.params = { id: '99999' };
    const res = await clientRoutes.get(req, env);
    expect(res.status).toBe(404);
  });

});

// ═══════════════════════════════════════════════════════════════════════════════
// PHONE VALIDATION
// ═══════════════════════════════════════════════════════════════════════════════

describe('Phone validation — Sprint 2.1', () => {

  it('TC-PH01: valid Polish E.164 accepted', async () => {
    const req = makeRequest('POST', '/api/employees', {
      name: 'Polish Worker', email: 'polish@example.com',
      phone: '+48600100200',
    }, admin.cookie);
    const res = await employeeRoutes.create(req, env, { waitUntil: () => {} });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.phone).toBe('+48600100200');
  });

  it('TC-PH02: valid Dutch E.164 accepted', async () => {
    const req = makeRequest('POST', '/api/employees', {
      name: 'Dutch Worker', email: 'dutch@example.com',
      phone: '+31612345678',
    }, admin.cookie);
    const res = await employeeRoutes.create(req, env, { waitUntil: () => {} });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.phone).toBe('+31612345678');
  });

  it('TC-PH03: valid UAE E.164 accepted', async () => {
    const req = makeRequest('POST', '/api/employees', {
      name: 'UAE Worker', email: 'uae@example.com',
      phone: '+971501234567',
    }, admin.cookie);
    const res = await employeeRoutes.create(req, env, { waitUntil: () => {} });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.phone).toBe('+971501234567');
  });

  it('TC-PH04: invalid phone rejected (no + prefix)', async () => {
    const req = makeRequest('POST', '/api/employees', {
      name: 'Bad Phone', email: 'badphone@example.com',
      phone: '48600100200',
    }, admin.cookie);
    const res = await employeeRoutes.create(req, env, { waitUntil: () => {} });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/E\.164/i);
  });

  it('TC-PH05: phone is optional (null accepted)', async () => {
    const req = makeRequest('POST', '/api/employees', {
      name: 'No Phone', email: 'nophone@example.com',
    }, admin.cookie);
    const res = await employeeRoutes.create(req, env, { waitUntil: () => {} });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.phone).toBeNull();
  });

});

// ═══════════════════════════════════════════════════════════════════════════════
// PROFILE UPDATE
// ═══════════════════════════════════════════════════════════════════════════════

describe('Profile update — Sprint 2.1', () => {

  it('TC-PR01: user can update their own name', async () => {
    const req = makeRequest('PATCH', '/api/profile', { name: 'Updated Name' }, admin.cookie);
    req.user = { id: admin.id };
    const res = await authRoutes.updateProfile(req, env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe('Updated Name');
  });

  it('TC-PR02: user can update their own phone', async () => {
    const req = makeRequest('PATCH', '/api/profile', { phone: '+48600999888' }, admin.cookie);
    req.user = { id: admin.id };
    const res = await authRoutes.updateProfile(req, env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.phone).toBe('+48600999888');
  });

  it('TC-PR03: invalid phone rejected in profile update', async () => {
    const req = makeRequest('PATCH', '/api/profile', { phone: 'invalid' }, admin.cookie);
    req.user = { id: admin.id };
    const res = await authRoutes.updateProfile(req, env);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/E\.164/i);
  });

  it('TC-PR04: empty name rejected in profile update', async () => {
    const req = makeRequest('PATCH', '/api/profile', { name: '' }, admin.cookie);
    req.user = { id: admin.id };
    const res = await authRoutes.updateProfile(req, env);
    expect(res.status).toBe(400);
  });

  it('TC-PR05: me endpoint returns phone field', async () => {
    const req = makeRequest('GET', '/api/auth/me', null, admin.cookie);
    req.user = { id: admin.id };
    const res = await authRoutes.me(req, env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect('phone' in body).toBe(true);
  });

  it('TC-PR06: unauthenticated profile update returns 401', async () => {
    const req = makeRequest('PATCH', '/api/profile', { name: 'Hacker' }, '');
    const res = await authRoutes.updateProfile(req, env);
    expect(res.status).toBe(401);
  });

});
