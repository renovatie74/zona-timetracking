/**
 * Sprint 4.2 tests — Weekly Mileage.
 *
 * Covers: mileage not in Extras, weekly mileage CRUD, current-week
 * enforcement, admin/manager access, manager scope, Extra Work/Own Cost
 * behavior unchanged.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { env as cfEnv }                    from 'cloudflare:test';
import { signJwt }                         from '../src/lib/jwt.js';
import * as extrasRoutes                   from '../src/routes/extras.js';
import * as mileageRoutes                  from '../src/routes/mileage.js';

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

let userSeq = 700;
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

let projectSeq = 900;
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

// Compute current Monday in Europe/Amsterdam (mirrors worker business logic)
function currentWeekStart() {
  const today  = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Amsterdam' });
  const d      = new Date(today + 'T00:00:00Z');
  const day    = d.getUTCDay();
  const diff   = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

function prevWeekStart() {
  const d = new Date(currentWeekStart() + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - 7);
  return d.toISOString().slice(0, 10);
}

let admin, worker, worker2, projectId;
const CUR_WEEK = currentWeekStart();
const PREV_WEEK = prevWeekStart();

beforeAll(async () => {
  const migrations = [
    m01, m02, m03, m04, m05, m06, m07, m08, m09,
    m10, m11, m12, m13, m14, m15, m16, m17, m18, m19,
  ];
  for (const sql of migrations) await applyMigration(sql);

  admin   = await seedUser('administrator');
  worker  = await seedUser('employee');
  worker2 = await seedUser('employee');
  projectId = await seedProject();
  await assignProject(worker.id, projectId);
});

// ── Extras no longer accepts mileage type ─────────────────────────────────────
describe('TC-4.2-X: Extras rejects mileage type', () => {

  it('TC-4.2-X01: employee mileage via extras routes to WeeklyMileage (Sprint 4.3)', async () => {
    const req = makeRequest('POST', '/api/extras/mine',
      { type: 'mileage', mileage_km: 42 },
      worker.cookie);
    const res = await extrasRoutes.createMine(req, env);
    // Sprint 4.3: mileage type is accepted and upserts WeeklyMileage
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.type).toBe('mileage');
  });

  it('TC-4.2-X02: mileage type rejected by admin create', async () => {
    const req = makeRequest('POST', '/api/extras',
      { user_id: worker.id, project_id: projectId, type: 'mileage', mileage_km: 42 },
      admin.cookie);
    const res = await extrasRoutes.create(req, env);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/cannot create/i);
  });

  it('TC-4.2-X03: own_cost still works', async () => {
    const req = makeRequest('POST', '/api/extras/mine',
      { project_id: projectId, type: 'own_cost', description: 'Overtime equipment' },
      worker.cookie);
    const res = await extrasRoutes.createMine(req, env);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.type).toBe('own_cost');
    expect(body.data.description).toBe('Overtime equipment');
  });

  it('TC-4.2-X04: own_cost still works', async () => {
    const req = makeRequest('POST', '/api/extras/mine',
      { project_id: projectId, type: 'own_cost', description: 'Safety boots' },
      worker.cookie);
    const res = await extrasRoutes.createMine(req, env);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.type).toBe('own_cost');
  });

});

// ── Employee mileage CRUD ─────────────────────────────────────────────────────
describe('TC-4.2-E: Employee weekly mileage', () => {

  it('TC-4.2-E01: employee can create mileage for current week', async () => {
    const req = makeRequest('PUT', '/api/my-mileage',
      { week_start: CUR_WEEK, mileage_km: 87.5 },
      worker.cookie);
    const res = await mileageRoutes.upsertMyMileage(req, env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.week_start).toBe(CUR_WEEK);
    expect(body.data.mileage_km).toBe(87.5);
  });

  it('TC-4.2-E02: employee can update mileage for current week', async () => {
    const req = makeRequest('PUT', '/api/my-mileage',
      { week_start: CUR_WEEK, mileage_km: 120 },
      worker.cookie);
    const res = await mileageRoutes.upsertMyMileage(req, env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.mileage_km).toBe(120);
  });

  it('TC-4.2-E03: employee cannot update mileage for a past week', async () => {
    const req = makeRequest('PUT', '/api/my-mileage',
      { week_start: PREV_WEEK, mileage_km: 50 },
      worker.cookie);
    const res = await mileageRoutes.upsertMyMileage(req, env);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/current week/i);
  });

  it('TC-4.2-E04: mileage_km = 0 is allowed (Sprint 4.3 migration 0019)', async () => {
    const req = makeRequest('PUT', '/api/my-mileage',
      { week_start: CUR_WEEK, mileage_km: 0 },
      worker.cookie);
    const res = await mileageRoutes.upsertMyMileage(req, env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.mileage_km).toBe(0);
  });

  it('TC-4.2-E05: week_start must be a Monday', async () => {
    // Use a known non-Monday (e.g. 2026-06-23 is a Tuesday)
    const req = makeRequest('PUT', '/api/my-mileage',
      { week_start: '2026-06-23', mileage_km: 50 },
      worker.cookie);
    const res = await mileageRoutes.upsertMyMileage(req, env);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/monday/i);
  });

  it('TC-4.2-E06: employee can list their own mileage', async () => {
    const req = makeRequest('GET', '/api/my-mileage', null, worker.cookie);
    const res = await mileageRoutes.listMyMileage(req, env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.data)).toBe(true);
    const entry = body.data.find(r => r.week_start === CUR_WEEK);
    expect(entry).toBeDefined();
    // E04 upserted 0 (km=0 now valid); E06 sees the latest value
    expect(entry.mileage_km).toBe(0);
  });

  it('TC-4.2-E07: employee can get mileage for a specific week', async () => {
    const req = makeRequest('GET', `/api/my-mileage?week_start=${CUR_WEEK}`, null, worker.cookie);
    const res = await mileageRoutes.listMyMileage(req, env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).not.toBeNull();
    // E04 upserted 0; current value is 0
    expect(body.data.mileage_km).toBe(0);
  });

  it('TC-4.2-E08: missing week returns null', async () => {
    const req = makeRequest('GET', `/api/my-mileage?week_start=${PREV_WEEK}`, null, worker.cookie);
    const res = await mileageRoutes.listMyMileage(req, env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toBeNull();
  });

  it('TC-4.2-E09: mileage is not project-based — no project_id required', async () => {
    const req = makeRequest('PUT', '/api/my-mileage',
      { week_start: CUR_WEEK, mileage_km: 55 },
      worker.cookie);
    const res = await mileageRoutes.upsertMyMileage(req, env);
    // No project_id sent — should still succeed
    expect(res.status).toBe(200);
  });

});

// ── Admin mileage ─────────────────────────────────────────────────────────────
describe('TC-4.2-A: Admin weekly mileage', () => {

  it('TC-4.2-A01: admin can create mileage for any employee', async () => {
    const req = makeRequest('PUT', `/api/mileage/${worker2.id}/${CUR_WEEK}`,
      { mileage_km: 200 },
      admin.cookie);
    req.params = { user_id: String(worker2.id), week_start: CUR_WEEK };
    const res = await mileageRoutes.upsertMileageAdmin(req, env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.mileage_km).toBe(200);
    expect(body.data.user_id).toBe(worker2.id);
  });

  it('TC-4.2-A02: admin can edit past week mileage', async () => {
    const req = makeRequest('PUT', `/api/mileage/${worker.id}/${PREV_WEEK}`,
      { mileage_km: 99 },
      admin.cookie);
    req.params = { user_id: String(worker.id), week_start: PREV_WEEK };
    const res = await mileageRoutes.upsertMileageAdmin(req, env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.mileage_km).toBe(99);
  });

  it('TC-4.2-A03: admin can list all mileage', async () => {
    const req = makeRequest('GET', '/api/mileage', null, admin.cookie);
    const res = await mileageRoutes.listMileage(req, env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
    // All records have employee info
    expect(body.data[0]).toHaveProperty('employee_name');
    expect(body.data[0]).toHaveProperty('employee_code');
  });

  it('TC-4.2-A04: admin can filter mileage by week_start', async () => {
    const req = makeRequest('GET', `/api/mileage?week_start=${CUR_WEEK}`, null, admin.cookie);
    const res = await mileageRoutes.listMileage(req, env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.every(r => r.week_start === CUR_WEEK)).toBe(true);
  });

  it('TC-4.2-A05: admin can filter mileage by user_id', async () => {
    const req = makeRequest('GET', `/api/mileage?user_id=${worker.id}`, null, admin.cookie);
    const res = await mileageRoutes.listMileage(req, env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.every(r => r.user_id === worker.id)).toBe(true);
  });

  it('TC-4.2-A06: invalid week_start rejected by admin upsert', async () => {
    const req = makeRequest('PUT', `/api/mileage/${worker.id}/2026-06-23`,
      { mileage_km: 50 },
      admin.cookie);
    req.params = { user_id: String(worker.id), week_start: '2026-06-23' };
    const res = await mileageRoutes.upsertMileageAdmin(req, env);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/monday/i);
  });

});
