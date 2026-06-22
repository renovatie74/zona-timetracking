/**
 * Sprint 4.1 tests — updated for Sprint 4.2 model.
 *
 * Original Sprint 4.1 added mileage as an Extra type. Sprint 4.2 removed it
 * in favour of a separate WeeklyMileage table. Tests updated accordingly:
 *   - mileage type is now invalid for Extras
 *   - own_cost/extra_work type flows remain valid and are tested here
 *   - admin process/reopen workflow still verified on extra_work entry
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
import m18 from '../migrations/0018_weekly_mileage.sql?raw';
import m19 from '../migrations/0019_mileage_allow_zero.sql?raw';

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
    m10, m11, m12, m13, m14, m15, m16, m17, m18, m19,
  ];
  for (const sql of migrations) await applyMigration(sql);

  admin   = await seedUser('administrator');
  worker  = await seedUser('employee');
  projectId = await seedProject();
  await assignProject(worker.id, projectId);
});

// ── Valid types ───────────────────────────────────────────────────────────────
describe('TC-4.1-D: Valid Extra types', () => {

  it('TC-4.1-D01: own_cost is a valid type for employee create', async () => {
    const req = makeRequest('POST', '/api/extras/mine',
      { project_id: projectId, type: 'own_cost', description: 'Bought gloves' },
      worker.cookie);
    const res = await extrasRoutes.createMine(req, env);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.type).toBe('own_cost');
  });

  it('TC-4.1-D02: extra_work is a valid type for employee create', async () => {
    const req = makeRequest('POST', '/api/extras/mine',
      { project_id: projectId, type: 'extra_work', description: 'Weekend work' },
      worker.cookie);
    const res = await extrasRoutes.createMine(req, env);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.type).toBe('extra_work');
  });

});

// ── Mileage type no longer accepted in Extras ─────────────────────────────────
describe('TC-4.1-V: Mileage removed from Extras (Sprint 4.2)', () => {

  it('TC-4.1-V01: mileage type via extras routes to WeeklyMileage (Sprint 4.3)', async () => {
    const req = makeRequest('POST', '/api/extras/mine',
      { type: 'mileage', mileage_km: 42 },
      worker.cookie);
    const res = await extrasRoutes.createMine(req, env);
    // Sprint 4.3: mileage is accepted and upserts WeeklyMileage, not rejected
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.type).toBe('mileage');
    expect(body.data.mileage_km).toBe(42);
  });

  it('TC-4.1-V02: mileage type returns 400 for admin create', async () => {
    const req = makeRequest('POST', '/api/extras',
      { user_id: worker.id, project_id: projectId, type: 'mileage', mileage_km: 12 },
      admin.cookie);
    const res = await extrasRoutes.create(req, env);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid type/i);
  });

  it('TC-4.1-V03: own_cost still requires description', async () => {
    const req = makeRequest('POST', '/api/extras/mine',
      { project_id: projectId, type: 'own_cost' },
      worker.cookie);
    const res = await extrasRoutes.createMine(req, env);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/description/i);
  });

  it('TC-4.1-V04: extra_work still requires description', async () => {
    const req = makeRequest('POST', '/api/extras/mine',
      { project_id: projectId, type: 'extra_work' },
      worker.cookie);
    const res = await extrasRoutes.createMine(req, env);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/description/i);
  });

  it('TC-4.1-V05: unknown type rejected', async () => {
    const req = makeRequest('POST', '/api/extras/mine',
      { project_id: projectId, type: 'bonus', description: 'Something' },
      worker.cookie);
    const res = await extrasRoutes.createMine(req, env);
    expect(res.status).toBe(400);
  });

});

// ── Admin process/reopen workflow ─────────────────────────────────────────────
describe('TC-4.1-A: Admin process/reopen workflow', () => {

  let entryId;

  it('TC-4.1-A01: admin can create extra_work entry', async () => {
    const req = makeRequest('POST', '/api/extras',
      { user_id: worker.id, project_id: projectId, type: 'extra_work', description: 'Extra shift' },
      admin.cookie);
    const res = await extrasRoutes.create(req, env);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.type).toBe('extra_work');
    entryId = body.data.id;
  });

  it('TC-4.1-A02: admin can process an extras entry', async () => {
    const req = makeRequest('POST', `/api/extras/${entryId}/process`, {}, admin.cookie);
    req.params = { id: String(entryId) };
    const res = await extrasRoutes.process(req, env);
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
  });

  it('TC-4.1-A03: admin can reopen a processed entry', async () => {
    const req = makeRequest('POST', `/api/extras/${entryId}/reopen`, {}, admin.cookie);
    req.params = { id: String(entryId) };
    const res = await extrasRoutes.reopen(req, env);
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
  });

  it('TC-4.1-A04: admin can edit an extras entry', async () => {
    const req = makeRequest('PUT', `/api/extras/${entryId}`,
      { user_id: worker.id, project_id: projectId, type: 'own_cost', description: 'Updated desc' },
      admin.cookie);
    req.params = { id: String(entryId) };
    const res = await extrasRoutes.update(req, env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.type).toBe('own_cost');
    expect(body.data.description).toBe('Updated desc');
  });

});
