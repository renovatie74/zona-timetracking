/**
 * Sprint 4.3 tests — Mileage via Extras UX model.
 *
 * POST /api/extras/mine with type='mileage' now routes to WeeklyMileage (upsert).
 * listMine returns combined Extras + mileage cards from WeeklyMileage.
 * km=0 is allowed (migration 0019 relaxed constraint to >= 0).
 * Admin Extras list still only returns own_cost/extra_work (no mileage).
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

let userSeq = 1000;
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
  ).bind(role_id, `E-${String(seq).padStart(4,'0')}`,
         'Test', `${role}${seq}`, `test${seq}@example.com`, now, now).run();
  const id = result.meta.last_row_id;
  return { id, cookie: await cookieFor(id, role) };
}

let projectSeq = 1100;
async function seedProject() {
  const seq = projectSeq++;
  const now = new Date().toISOString();
  const result = await env.DB.prepare(
    `INSERT INTO Projects (project_code, project_code_seq, name, status, start_date, is_active, created_at, updated_at)
     VALUES (?, ?, ?, 'active', '2026-01-01', 1, ?, ?)`,
  ).bind(`P-${String(seq).padStart(4,'0')}`, seq, `Project ${seq}`, now, now).run();
  return result.meta.last_row_id;
}

async function assignProject(userId, projectId) {
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO ProjectAssignments (project_id, user_id, created_at) VALUES (?, ?, ?)`,
  ).bind(projectId, userId, now).run();
}

function currentWeekStart() {
  const d      = new Date();
  const utcDay = d.getUTCDay();
  const diff   = utcDay === 0 ? -6 : 1 - utcDay;
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + diff));
  return monday.toISOString().slice(0, 10);
}

let admin, worker, projectId;

beforeAll(async () => {
  const migrations = [
    m01, m02, m03, m04, m05, m06, m07, m08, m09,
    m10, m11, m12, m13, m14, m15, m16, m17, m18, m19,
  ];
  for (const sql of migrations) await applyMigration(sql);

  admin     = await seedUser('administrator');
  worker    = await seedUser('employee');
  projectId = await seedProject();
  await assignProject(worker.id, projectId);
});

// ── POST mileage via extras endpoint ─────────────────────────────────────────
describe('TC-4.3-E: Employee mileage via extras', () => {

  it('TC-4.3-E01: POST mileage returns 201 with mileage card shape', async () => {
    const req = makeRequest('POST', '/api/extras/mine',
      { type: 'mileage', mileage_km: 42.5 },
      worker.cookie);
    const res = await extrasRoutes.createMine(req, env);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.type).toBe('mileage');
    expect(body.data.mileage_km).toBe(42.5);
    expect(body.data.week_start).toBe(currentWeekStart());
    expect(body.data.id).toBeNull();
    expect(body.data.wm_id).toBeGreaterThan(0);
    expect(body.data.status).toBe('open');
    expect(body.data.project_id).toBeNull();
    expect(body.data.description).toBeNull();
  });

  it('TC-4.3-E02: posting mileage twice upserts (does not create duplicate)', async () => {
    const req1 = makeRequest('POST', '/api/extras/mine',
      { type: 'mileage', mileage_km: 10 }, worker.cookie);
    await extrasRoutes.createMine(req1, env);

    const req2 = makeRequest('POST', '/api/extras/mine',
      { type: 'mileage', mileage_km: 99 }, worker.cookie);
    const res2 = await extrasRoutes.createMine(req2, env);
    expect(res2.status).toBe(201);
    const body = await res2.json();
    expect(body.data.mileage_km).toBe(99);

    // Verify only one WeeklyMileage row for this user+week
    const week = currentWeekStart();
    const { results } = await env.DB.prepare(
      `SELECT COUNT(*) AS cnt FROM WeeklyMileage WHERE user_id = ? AND week_start = ?`,
    ).bind(worker.id, week).all();
    expect(results[0].cnt).toBe(1);
  });

  it('TC-4.3-E03: mileage_km = 0 is allowed (migration 0019)', async () => {
    const req = makeRequest('POST', '/api/extras/mine',
      { type: 'mileage', mileage_km: 0 },
      worker.cookie);
    const res = await extrasRoutes.createMine(req, env);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.mileage_km).toBe(0);
  });

  it('TC-4.3-E04: negative mileage_km is rejected', async () => {
    const req = makeRequest('POST', '/api/extras/mine',
      { type: 'mileage', mileage_km: -5 },
      worker.cookie);
    const res = await extrasRoutes.createMine(req, env);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  it('TC-4.3-E05: missing mileage_km is rejected', async () => {
    const req = makeRequest('POST', '/api/extras/mine',
      { type: 'mileage' },
      worker.cookie);
    const res = await extrasRoutes.createMine(req, env);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/mileage_km/i);
  });

});

// ── listMine returns combined Extras + mileage cards ─────────────────────────
describe('TC-4.3-L: listMine combined response', () => {

  it('TC-4.3-L01: list includes mileage card alongside regular extras', async () => {
    // Create a regular extra first
    const regReq = makeRequest('POST', '/api/extras/mine',
      { project_id: projectId, type: 'own_cost', description: 'Safety gear' },
      worker.cookie);
    await extrasRoutes.createMine(regReq, env);

    const listReq = makeRequest('GET', '/api/extras/mine', null, worker.cookie);
    const listRes = await extrasRoutes.listMine(listReq, env);
    expect(listRes.status).toBe(200);
    const body = await listRes.json();
    expect(Array.isArray(body.data)).toBe(true);

    const mileageCards = body.data.filter(e => e.type === 'mileage');
    expect(mileageCards.length).toBeGreaterThan(0);

    const regularCards = body.data.filter(e => e.type !== 'mileage');
    expect(regularCards.length).toBeGreaterThan(0);
  });

  it('TC-4.3-L02: mileage card in list has correct shape', async () => {
    const req = makeRequest('GET', '/api/extras/mine', null, worker.cookie);
    const res = await extrasRoutes.listMine(req, env);
    const body = await res.json();
    const card = body.data.find(e => e.type === 'mileage');
    expect(card).toBeDefined();
    expect(card.wm_id).toBeGreaterThan(0);
    expect(card.id).toBeNull();
    expect(card.week_start).toBe(currentWeekStart());
    expect(card.status).toBe('open');
    expect(card.project_id).toBeNull();
    expect(card.description).toBeNull();
    expect(typeof card.mileage_km).toBe('number');
  });

  it('TC-4.3-L03: unauthenticated list returns 401', async () => {
    const req = makeRequest('GET', '/api/extras/mine');
    const res = await extrasRoutes.listMine(req, env);
    expect(res.status).toBe(401);
  });

});

// ── Admin Extras list never contains mileage ─────────────────────────────────
describe('TC-4.3-A: Admin Extras queue excludes mileage', () => {

  it('TC-4.3-A01: admin extras list has no mileage-type entries', async () => {
    const req = makeRequest('GET', '/api/extras', null, admin.cookie);
    const res = await extrasRoutes.list(req, env);
    expect(res.status).toBe(200);
    const body = await res.json();
    const mileageEntries = body.data.filter(e => e.type === 'mileage');
    expect(mileageEntries.length).toBe(0);
  });

  it('TC-4.3-A02: admin can still create own_cost and extra_work', async () => {
    const req = makeRequest('POST', '/api/extras',
      { user_id: worker.id, project_id: projectId, type: 'extra_work', description: 'Site visit' },
      admin.cookie);
    const res = await extrasRoutes.create(req, env);
    expect(res.status).toBe(201);
    expect((await res.json()).data.type).toBe('extra_work');
  });

});
