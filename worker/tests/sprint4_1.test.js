/**
 * Sprint 4.1 tests — Mileage Extra type.
 *
 * Covers: default type own_cost, mileage validation, create/edit/display,
 *         admin queue visibility, filter by type=mileage, process workflow.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { env as cfEnv }                    from 'cloudflare:test';
import { signJwt }                         from '../src/lib/jwt.js';
import * as extrasRoutes                   from '../src/routes/extras.js';

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
  });
}

async function cookieFor(userId, role) {
  const token = await signJwt(
    { sub: userId, role, exp: Math.floor(Date.now() / 1000) + 3600 },
    env.JWT_SECRET,
  );
  return `jwt=${token}`;
}

let userSeq = 600;
async function seedUser(role = 'employee') {
  const seq = userSeq++;
  const now = new Date().toISOString();
  const ROLE_MAP = { employee: 1, manager: 2, administrator: 3 };
  const role_id  = ROLE_MAP[role] ?? 1;
  const result = await env.DB.prepare(
    `INSERT INTO Users
       (role_id, employee_number, first_name, last_name, email, password_hash, mobile, is_active,
        invitation_token, invitation_token_expires_at,
        password_reset_token, password_reset_expires_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, NULL, NULL, 1, NULL, NULL, NULL, NULL, ?, ?)`,
  ).bind(role_id, `E-${String(seq).padStart(3,'0')}`,
         'Test', `${role}${seq}`, `test${seq}@example.com`, now, now).run();
  const id = result.meta.last_row_id;
  return { id, cookie: await cookieFor(id, role) };
}

let projectSeq = 800;
async function seedProject() {
  const seq = projectSeq++;
  const now = new Date().toISOString();
  const result = await env.DB.prepare(
    `INSERT INTO Projects (project_code, project_code_seq, name, status, start_date, is_active, created_at, updated_at)
     VALUES (?, ?, ?, 'active', '2026-01-01', 1, ?, ?)`,
  ).bind(`P-${String(seq).padStart(3,'0')}`, seq, `Project ${seq}`, now, now).run();
  return result.meta.last_row_id;
}

async function assignProject(userId, projectId) {
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO ProjectAssignments (project_id, user_id, created_at) VALUES (?, ?, ?)`,
  ).bind(projectId, userId, now).run();
}

let admin, worker, projectId;

beforeAll(async () => {
  const migrations = [
    m01, m02, m03, m04, m05, m06, m07, m08, m09,
    m10, m11, m12, m13, m14, m15, m16, m17,
  ];
  for (const sql of migrations) await applyMigration(sql);

  admin   = await seedUser('administrator');
  worker  = await seedUser('employee');
  projectId = await seedProject();
  await assignProject(worker.id, projectId);
});

// ── Default type ──────────────────────────────────────────────────────────────
describe('TC-4.1-D: Default type', () => {

  it('TC-4.1-D01: own_cost is a valid type for employee create', async () => {
    const req = makeRequest('POST', '/api/extras/mine',
      { project_id: projectId, type: 'own_cost', description: 'Bought gloves' },
      worker.cookie);
    const res = await extrasRoutes.createMine(req, env);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.type).toBe('own_cost');
  });

});

// ── Mileage validation ────────────────────────────────────────────────────────
describe('TC-4.1-V: Mileage validation', () => {

  it('TC-4.1-V01: mileage without mileage_km returns 400', async () => {
    const req = makeRequest('POST', '/api/extras/mine',
      { project_id: projectId, type: 'mileage' },
      worker.cookie);
    const res = await extrasRoutes.createMine(req, env);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/mileage_km/i);
  });

  it('TC-4.1-V02: mileage_km = 0 is rejected', async () => {
    const req = makeRequest('POST', '/api/extras/mine',
      { project_id: projectId, type: 'mileage', mileage_km: 0 },
      worker.cookie);
    const res = await extrasRoutes.createMine(req, env);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/positive/i);
  });

  it('TC-4.1-V03: negative mileage_km is rejected', async () => {
    const req = makeRequest('POST', '/api/extras/mine',
      { project_id: projectId, type: 'mileage', mileage_km: -5 },
      worker.cookie);
    const res = await extrasRoutes.createMine(req, env);
    expect(res.status).toBe(400);
  });

  it('TC-4.1-V04: decimal mileage_km (18.5) is accepted', async () => {
    const req = makeRequest('POST', '/api/extras/mine',
      { project_id: projectId, type: 'mileage', mileage_km: 18.5 },
      worker.cookie);
    const res = await extrasRoutes.createMine(req, env);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.mileage_km).toBe(18.5);
    expect(body.data.description).toBeNull();
  });

  it('TC-4.1-V05: own_cost still requires description', async () => {
    const req = makeRequest('POST', '/api/extras/mine',
      { project_id: projectId, type: 'own_cost' },
      worker.cookie);
    const res = await extrasRoutes.createMine(req, env);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/description/i);
  });

});

// ── Mileage employee CRUD ─────────────────────────────────────────────────────
describe('TC-4.1-E: Employee mileage CRUD', () => {

  let mileageId;

  it('TC-4.1-E01: employee can create mileage entry (42 km)', async () => {
    const req = makeRequest('POST', '/api/extras/mine',
      { project_id: projectId, type: 'mileage', mileage_km: 42 },
      worker.cookie);
    const res = await extrasRoutes.createMine(req, env);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.type).toBe('mileage');
    expect(body.data.mileage_km).toBe(42);
    expect(body.data.description).toBeNull();
    mileageId = body.data.id;
  });

  it('TC-4.1-E02: mileage entry appears in employee list', async () => {
    const req = makeRequest('GET', '/api/extras/mine', null, worker.cookie);
    const res = await extrasRoutes.listMine(req, env);
    expect(res.status).toBe(200);
    const body = await res.json();
    const entry = body.data.find(e => e.id === mileageId);
    expect(entry).toBeDefined();
    expect(entry.type).toBe('mileage');
    expect(entry.mileage_km).toBe(42);
  });

  it('TC-4.1-E03: employee can edit mileage_km', async () => {
    const req = makeRequest('PUT', `/api/extras/mine/${mileageId}`,
      { mileage_km: 55 },
      worker.cookie);
    req.params = { id: String(mileageId) };
    const res = await extrasRoutes.updateMine(req, env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.mileage_km).toBe(55);
  });

  it('TC-4.1-E04: editing mileage requires positive mileage_km', async () => {
    const req = makeRequest('PUT', `/api/extras/mine/${mileageId}`,
      { mileage_km: 0 },
      worker.cookie);
    req.params = { id: String(mileageId) };
    const res = await extrasRoutes.updateMine(req, env);
    expect(res.status).toBe(400);
  });

});

// ── Admin mileage ─────────────────────────────────────────────────────────────
describe('TC-4.1-A: Admin mileage queue', () => {

  let adminMileageId;

  it('TC-4.1-A01: admin can create mileage entry', async () => {
    const req = makeRequest('POST', '/api/extras',
      { user_id: worker.id, project_id: projectId, type: 'mileage', mileage_km: 12 },
      admin.cookie);
    const res = await extrasRoutes.create(req, env);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.type).toBe('mileage');
    expect(body.data.mileage_km).toBe(12);
    expect(body.data.description).toBeNull();
    adminMileageId = body.data.id;
  });

  it('TC-4.1-A02: mileage entries appear in admin list', async () => {
    const req = makeRequest('GET', '/api/extras?status=open', null, admin.cookie);
    const res = await extrasRoutes.list(req, env);
    expect(res.status).toBe(200);
    const body = await res.json();
    const entry = body.data.find(e => e.id === adminMileageId);
    expect(entry).toBeDefined();
    expect(entry.mileage_km).toBe(12);
  });

  it('TC-4.1-A03: admin can filter by type=mileage', async () => {
    const req = makeRequest('GET', '/api/extras?status=all&type=mileage', null, admin.cookie);
    const res = await extrasRoutes.list(req, env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.length).toBeGreaterThan(0);
    expect(body.data.every(e => e.type === 'mileage')).toBe(true);
  });

  it('TC-4.1-A04: admin can process a mileage entry', async () => {
    const req = makeRequest('POST', `/api/extras/${adminMileageId}/process`, {}, admin.cookie);
    req.params = { id: String(adminMileageId) };
    const res = await extrasRoutes.process(req, env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it('TC-4.1-A05: admin can reopen a processed mileage entry', async () => {
    const req = makeRequest('POST', `/api/extras/${adminMileageId}/reopen`, {}, admin.cookie);
    req.params = { id: String(adminMileageId) };
    const res = await extrasRoutes.reopen(req, env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it('TC-4.1-A06: admin can edit mileage entry', async () => {
    const req = makeRequest('PUT', `/api/extras/${adminMileageId}`,
      { user_id: worker.id, project_id: projectId, type: 'mileage', mileage_km: 25 },
      admin.cookie);
    req.params = { id: String(adminMileageId) };
    const res = await extrasRoutes.update(req, env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.mileage_km).toBe(25);
  });

  it('TC-4.1-A07: mileage entry has null description in DB', async () => {
    const row = await env.DB.prepare(
      'SELECT description, mileage_km FROM Extras WHERE id = ?',
    ).bind(adminMileageId).first();
    expect(row.description).toBeNull();
    expect(row.mileage_km).toBe(25);
  });

});
