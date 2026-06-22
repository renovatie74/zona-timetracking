/**
 * Sprint 4 tests — Extras module.
 *
 * Covers: employee CRUD, access control, processed/open guards,
 *         admin CRUD, process/reopen, soft-delete,
 *         manager scope, open_extras_count on project/employee lists.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { env as cfEnv }                    from 'cloudflare:test';
import { signJwt }                         from '../src/lib/jwt.js';
import * as extrasRoutes                   from '../src/routes/extras.js';
import * as projectRoutes                  from '../src/routes/projects.js';
import * as employeeRoutes                 from '../src/routes/employees.js';

const env = {
  ...cfEnv,
  JWT_SECRET:    'test-jwt-secret-00000000000000000000000000000000',
  EMAIL_API_KEY: 'test-api-key',
  APP_URL:       'https://test.example.com',
  EMAIL_FROM:    'noreply@test.example.com',
};

// ── Migration imports ─────────────────────────────────────────────────────────
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

async function cookieFor(id, role) {
  const token = await signJwt(
    { sub: id, role, exp: Math.floor(Date.now() / 1000) + 3600 },
    env.JWT_SECRET,
  );
  return `jwt=${token}`;
}

let userSeq    = 700;
let projectSeq = 400;

async function seedUser(role = 'employee') {
  const seq = userSeq++;
  const now = new Date().toISOString();
  const ROLE_MAP = { employee: 1, manager: 2, administrator: 3 };
  const r = await env.DB.prepare(
    `INSERT INTO Users
       (role_id, employee_number, first_name, last_name, email, password_hash, is_active,
        team_id, invitation_token, invitation_token_expires_at,
        password_reset_token, password_reset_expires_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, NULL, 1, NULL, NULL, NULL, NULL, NULL, ?, ?)`,
  ).bind(ROLE_MAP[role], `E-${String(seq).padStart(3, '0')}`,
    'Test', `${role}${seq}`, `u${seq}@example.com`,
    now, now).run();
  return r.meta.last_row_id;
}

async function seedProject() {
  const seq = projectSeq++;
  const now = new Date().toISOString();
  const r = await env.DB.prepare(
    `INSERT INTO Projects (project_code, project_code_seq, name, status, start_date, is_active, created_at, updated_at)
     VALUES (?, ?, ?, 'active', '2026-01-01', 1, ?, ?)`,
  ).bind(`P-${String(seq).padStart(3, '0')}`, seq, `Project ${seq}`, now, now).run();
  return r.meta.last_row_id;
}

async function assignProject(userId, projectId) {
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO ProjectAssignments (project_id, user_id, created_at) VALUES (?, ?, ?)`,
  ).bind(projectId, userId, now).run();
}

async function seedExtra(userId, projectId, status = 'open') {
  const now = new Date().toISOString();
  const r = await env.DB.prepare(
    `INSERT INTO Extras (user_id, project_id, type, description, status, created_by, created_at, updated_at)
     VALUES (?, ?, 'extra_work', 'Test extra description', ?, ?, ?, ?)`,
  ).bind(userId, projectId, status, userId, now, now).run();
  return r.meta.last_row_id;
}

// ── Apply all migrations once ─────────────────────────────────────────────────
beforeAll(async () => {
  for (const m of [m01,m02,m03,m04,m05,m06,m07,m08,m09,m10,m11,m12,m13,m14,m15,m16,m17]) {
    await applyMigration(m);
  }
});

// ══ Employee self-service ════════════════════════════════════════════════════

// ── TC-4-E01: employee can create own Extra ───────────────────────────────────
it('TC-4-E01: employee can create own Extra (201)', async () => {
  const uid  = await seedUser();
  const pid  = await seedProject();
  await assignProject(uid, pid);
  const cook = await cookieFor(uid, 'employee');

  const req  = makeRequest('POST', '/api/extras/mine',
    { project_id: pid, type: 'extra_work', description: 'Worked extra hours on site' }, cook);
  req.params = {};
  const res  = await extrasRoutes.createMine(req, env);
  const body = await res.json();

  expect(res.status).toBe(201);
  expect(body.data.type).toBe('extra_work');
  expect(body.data.status).toBe('open');
  expect(body.data.description).toBe('Worked extra hours on site');
});

// ── TC-4-E02: employee can view own Extras ────────────────────────────────────
it('TC-4-E02: employee GET /api/extras/mine returns own extras', async () => {
  const uid  = await seedUser();
  const pid  = await seedProject();
  await assignProject(uid, pid);
  await seedExtra(uid, pid);

  const cook = await cookieFor(uid, 'employee');
  const req  = makeRequest('GET', '/api/extras/mine', null, cook);
  req.params = {};
  const res  = await extrasRoutes.listMine(req, env);
  const body = await res.json();

  expect(res.status).toBe(200);
  expect(body.data.length).toBeGreaterThan(0);
  body.data.forEach(ex => expect(ex.description).toBeDefined());
});

// ── TC-4-E03: employee cannot view another employee's Extras ──────────────────
it('TC-4-E03: GET /api/extras/mine returns only own extras, not others', async () => {
  const uid1 = await seedUser();
  const uid2 = await seedUser();
  const pid  = await seedProject();
  await assignProject(uid1, pid);
  await assignProject(uid2, pid);
  await seedExtra(uid1, pid);
  await seedExtra(uid2, pid);

  const cook = await cookieFor(uid1, 'employee');
  const req  = makeRequest('GET', '/api/extras/mine', null, cook);
  req.params = {};
  const res  = await extrasRoutes.listMine(req, env);
  const body = await res.json();

  expect(res.status).toBe(200);
  body.data.forEach(ex => {
    // We can't check user_id directly (it's not in the employee response),
    // but we can check the extras count is consistent with seeding
    expect(ex.description).toBeDefined();
  });
  // uid2's extras should not appear — seeded description is the same, so verify by
  // fetching uid2's and confirming they're separate entries
  const cook2 = await cookieFor(uid2, 'employee');
  const req2  = makeRequest('GET', '/api/extras/mine', null, cook2);
  req2.params = {};
  const res2  = await extrasRoutes.listMine(req2, env);
  const body2 = await res2.json();

  expect(body.data.length).toBe(1);
  expect(body2.data.length).toBe(1);
});

// ── TC-4-E04: employee can edit own Open Extra ────────────────────────────────
it('TC-4-E04: employee can edit own Open Extra (200)', async () => {
  const uid     = await seedUser();
  const pid     = await seedProject();
  await assignProject(uid, pid);
  const extraId = await seedExtra(uid, pid, 'open');
  const cook    = await cookieFor(uid, 'employee');

  const req  = makeRequest('PUT', `/api/extras/mine/${extraId}`,
    { description: 'Updated description' }, cook);
  req.params = { id: String(extraId) };
  const res  = await extrasRoutes.updateMine(req, env);
  const body = await res.json();

  expect(res.status).toBe(200);
  expect(body.data.description).toBe('Updated description');
});

// ── TC-4-E05: employee cannot edit Processed Extra ───────────────────────────
it('TC-4-E05: employee cannot edit Processed Extra (403)', async () => {
  const uid     = await seedUser();
  const pid     = await seedProject();
  await assignProject(uid, pid);
  const extraId = await seedExtra(uid, pid, 'processed');
  const cook    = await cookieFor(uid, 'employee');

  const req  = makeRequest('PUT', `/api/extras/mine/${extraId}`,
    { description: 'Trying to edit processed' }, cook);
  req.params = { id: String(extraId) };
  const res  = await extrasRoutes.updateMine(req, env);

  expect(res.status).toBe(403);
  const body = await res.json();
  expect(body.error).toMatch(/processed/i);
});

// ── TC-4-E06: employee can delete own Open Extra ──────────────────────────────
it('TC-4-E06: employee can delete own Open Extra (200)', async () => {
  const uid     = await seedUser();
  const pid     = await seedProject();
  await assignProject(uid, pid);
  const extraId = await seedExtra(uid, pid, 'open');
  const cook    = await cookieFor(uid, 'employee');

  const req  = makeRequest('DELETE', `/api/extras/mine/${extraId}`, null, cook);
  req.params = { id: String(extraId) };
  const res  = await extrasRoutes.deleteMine(req, env);
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.ok).toBe(true);

  // Verify it's soft-deleted (not visible in list)
  const row = await env.DB.prepare('SELECT is_deleted FROM Extras WHERE id = ?').bind(extraId).first();
  expect(row.is_deleted).toBe(1);
});

// ── TC-4-E07: employee cannot delete Processed Extra ─────────────────────────
it('TC-4-E07: employee cannot delete Processed Extra (403)', async () => {
  const uid     = await seedUser();
  const pid     = await seedProject();
  await assignProject(uid, pid);
  const extraId = await seedExtra(uid, pid, 'processed');
  const cook    = await cookieFor(uid, 'employee');

  const req  = makeRequest('DELETE', `/api/extras/mine/${extraId}`, null, cook);
  req.params = { id: String(extraId) };
  const res  = await extrasRoutes.deleteMine(req, env);
  expect(res.status).toBe(403);
  const body = await res.json();
  expect(body.error).toMatch(/processed/i);
});

// ── TC-4-E08: employee cannot access another employee's Extra by ID ───────────
it("TC-4-E08: employee cannot edit another employee's Extra (404)", async () => {
  const uid1    = await seedUser();
  const uid2    = await seedUser();
  const pid     = await seedProject();
  await assignProject(uid1, pid);
  const extraId = await seedExtra(uid1, pid, 'open');
  const cook2   = await cookieFor(uid2, 'employee');

  const req  = makeRequest('PUT', `/api/extras/mine/${extraId}`,
    { description: 'Hijack attempt' }, cook2);
  req.params = { id: String(extraId) };
  const res  = await extrasRoutes.updateMine(req, env);
  expect(res.status).toBe(404);
});

// ── TC-4-E09: create fails if project not assigned ───────────────────────────
it('TC-4-E09: createMine rejects project not assigned to employee (400)', async () => {
  const uid  = await seedUser();
  const pid  = await seedProject();
  // No assignProject call
  const cook = await cookieFor(uid, 'employee');

  const req  = makeRequest('POST', '/api/extras/mine',
    { project_id: pid, type: 'own_cost', description: 'Bought supplies' }, cook);
  req.params = {};
  const res  = await extrasRoutes.createMine(req, env);
  expect(res.status).toBe(400);
});

// ── TC-4-E10: create fails if description missing ────────────────────────────
it('TC-4-E10: createMine rejects empty description (400)', async () => {
  const uid  = await seedUser();
  const pid  = await seedProject();
  await assignProject(uid, pid);
  const cook = await cookieFor(uid, 'employee');

  const req  = makeRequest('POST', '/api/extras/mine',
    { project_id: pid, type: 'extra_work', description: '   ' }, cook);
  req.params = {};
  const res  = await extrasRoutes.createMine(req, env);
  expect(res.status).toBe(400);
});

// ── TC-4-E11: status filter works for employee list ──────────────────────────
it('TC-4-E11: GET /api/extras/mine?status=open returns only open extras', async () => {
  const uid  = await seedUser();
  const pid  = await seedProject();
  await assignProject(uid, pid);
  await seedExtra(uid, pid, 'open');
  await seedExtra(uid, pid, 'processed');
  const cook = await cookieFor(uid, 'employee');

  const req  = makeRequest('GET', '/api/extras/mine?status=open', null, cook);
  req.params = {};
  const res  = await extrasRoutes.listMine(req, env);
  const body = await res.json();

  expect(res.status).toBe(200);
  body.data.forEach(ex => expect(ex.status).toBe('open'));
});

// ══ Admin CRUD ════════════════════════════════════════════════════════════════

// ── TC-4-A01: admin can view all Extras ──────────────────────────────────────
it('TC-4-A01: admin GET /api/extras returns all extras (default: open)', async () => {
  const adminId = await seedUser('administrator');
  const uid     = await seedUser();
  const pid     = await seedProject();
  await seedExtra(uid, pid, 'open');

  const cook = await cookieFor(adminId, 'administrator');
  const req  = makeRequest('GET', '/api/extras?status=all', null, cook);
  req.params = {};
  const res  = await extrasRoutes.list(req, env);
  const body = await res.json();

  expect(res.status).toBe(200);
  expect(Array.isArray(body.data)).toBe(true);
  expect(body.data.length).toBeGreaterThan(0);
});

// ── TC-4-A02: admin can filter by project ────────────────────────────────────
it('TC-4-A02: admin can filter extras by project_id', async () => {
  const adminId = await seedUser('administrator');
  const uid     = await seedUser();
  const pid1    = await seedProject();
  const pid2    = await seedProject();
  await seedExtra(uid, pid1, 'open');
  await seedExtra(uid, pid2, 'open');

  const cook = await cookieFor(adminId, 'administrator');
  const req  = makeRequest('GET', `/api/extras?project_id=${pid1}&status=all`, null, cook);
  req.params = {};
  const res  = await extrasRoutes.list(req, env);
  const body = await res.json();

  expect(res.status).toBe(200);
  body.data.forEach(ex => expect(ex.project_id).toBe(pid1));
});

// ── TC-4-A03: admin can filter by employee ───────────────────────────────────
it('TC-4-A03: admin can filter extras by user_id', async () => {
  const adminId = await seedUser('administrator');
  const uid1    = await seedUser();
  const uid2    = await seedUser();
  const pid     = await seedProject();
  await seedExtra(uid1, pid, 'open');
  await seedExtra(uid2, pid, 'open');

  const cook = await cookieFor(adminId, 'administrator');
  const req  = makeRequest('GET', `/api/extras?user_id=${uid1}&status=all`, null, cook);
  req.params = {};
  const res  = await extrasRoutes.list(req, env);
  const body = await res.json();

  expect(res.status).toBe(200);
  body.data.forEach(ex => expect(ex.user_id).toBe(uid1));
});

// ── TC-4-A04: admin can mark Extra as Processed ──────────────────────────────
it('TC-4-A04: admin POST /api/extras/:id/process marks Extra as processed', async () => {
  const adminId = await seedUser('administrator');
  const uid     = await seedUser();
  const pid     = await seedProject();
  const extraId = await seedExtra(uid, pid, 'open');
  const cook    = await cookieFor(adminId, 'administrator');

  const req  = makeRequest('POST', `/api/extras/${extraId}/process`, {}, cook);
  req.params = { id: String(extraId) };
  const res  = await extrasRoutes.process(req, env);
  expect(res.status).toBe(200);

  const row = await env.DB.prepare('SELECT status, processed_by FROM Extras WHERE id = ?').bind(extraId).first();
  expect(row.status).toBe('processed');
  expect(row.processed_by).toBe(adminId);
});

// ── TC-4-A05: process already-processed returns 409 ─────────────────────────
it('TC-4-A05: process already-processed Extra returns 409', async () => {
  const adminId = await seedUser('administrator');
  const uid     = await seedUser();
  const pid     = await seedProject();
  const extraId = await seedExtra(uid, pid, 'processed');
  const cook    = await cookieFor(adminId, 'administrator');

  const req  = makeRequest('POST', `/api/extras/${extraId}/process`, {}, cook);
  req.params = { id: String(extraId) };
  const res  = await extrasRoutes.process(req, env);
  expect(res.status).toBe(409);
});

// ── TC-4-A06: admin can reopen Processed Extra ───────────────────────────────
it('TC-4-A06: admin POST /api/extras/:id/reopen reopens a processed Extra', async () => {
  const adminId = await seedUser('administrator');
  const uid     = await seedUser();
  const pid     = await seedProject();
  const extraId = await seedExtra(uid, pid, 'processed');
  const cook    = await cookieFor(adminId, 'administrator');

  const req  = makeRequest('POST', `/api/extras/${extraId}/reopen`, {}, cook);
  req.params = { id: String(extraId) };
  const res  = await extrasRoutes.reopen(req, env);
  expect(res.status).toBe(200);

  const row = await env.DB.prepare('SELECT status FROM Extras WHERE id = ?').bind(extraId).first();
  expect(row.status).toBe('open');
});

// ── TC-4-A07: reopen already-open returns 409 ────────────────────────────────
it('TC-4-A07: reopen already-open Extra returns 409', async () => {
  const adminId = await seedUser('administrator');
  const uid     = await seedUser();
  const pid     = await seedProject();
  const extraId = await seedExtra(uid, pid, 'open');
  const cook    = await cookieFor(adminId, 'administrator');

  const req  = makeRequest('POST', `/api/extras/${extraId}/reopen`, {}, cook);
  req.params = { id: String(extraId) };
  const res  = await extrasRoutes.reopen(req, env);
  expect(res.status).toBe(409);
});

// ── TC-4-A08: admin can soft-delete Extra ────────────────────────────────────
it('TC-4-A08: admin DELETE /api/extras/:id soft-deletes the Extra', async () => {
  const adminId = await seedUser('administrator');
  const uid     = await seedUser();
  const pid     = await seedProject();
  const extraId = await seedExtra(uid, pid, 'open');
  const cook    = await cookieFor(adminId, 'administrator');

  const req  = makeRequest('DELETE', `/api/extras/${extraId}`, null, cook);
  req.params = { id: String(extraId) };
  const res  = await extrasRoutes.remove(req, env);
  expect(res.status).toBe(200);

  const row = await env.DB.prepare('SELECT is_deleted FROM Extras WHERE id = ?').bind(extraId).first();
  expect(row.is_deleted).toBe(1);
});

// ── TC-4-A09: soft-deleted Extra not returned in list ────────────────────────
it('TC-4-A09: soft-deleted Extra is excluded from admin list', async () => {
  const adminId = await seedUser('administrator');
  const uid     = await seedUser();
  const pid     = await seedProject();
  const extraId = await seedExtra(uid, pid, 'open');

  // Soft-delete it
  await env.DB.prepare('UPDATE Extras SET is_deleted = 1 WHERE id = ?').bind(extraId).run();

  const cook = await cookieFor(adminId, 'administrator');
  const req  = makeRequest('GET', `/api/extras?user_id=${uid}&status=all`, null, cook);
  req.params = {};
  const res  = await extrasRoutes.list(req, env);
  const body = await res.json();

  expect(res.status).toBe(200);
  const ids = body.data.map(ex => ex.id);
  expect(ids).not.toContain(extraId);
});

// ── TC-4-A10: admin can edit any Extra ───────────────────────────────────────
it('TC-4-A10: admin PUT /api/extras/:id updates description and type', async () => {
  const adminId = await seedUser('administrator');
  const uid     = await seedUser();
  const pid     = await seedProject();
  const extraId = await seedExtra(uid, pid, 'open');
  const cook    = await cookieFor(adminId, 'administrator');

  const req  = makeRequest('PUT', `/api/extras/${extraId}`,
    { type: 'own_cost', description: 'Admin corrected description' }, cook);
  req.params = { id: String(extraId) };
  const res  = await extrasRoutes.update(req, env);
  const body = await res.json();

  expect(res.status).toBe(200);
  expect(body.data.type).toBe('own_cost');
  expect(body.data.description).toBe('Admin corrected description');
});

// ── TC-4-A11: admin can create Extra on behalf of employee ───────────────────
it('TC-4-A11: admin POST /api/extras creates Extra for any employee', async () => {
  const adminId = await seedUser('administrator');
  const uid     = await seedUser();
  const pid     = await seedProject();
  const cook    = await cookieFor(adminId, 'administrator');

  const req  = makeRequest('POST', '/api/extras',
    { user_id: uid, project_id: pid, type: 'own_cost', description: 'Admin created for employee' }, cook);
  req.params = {};
  const res  = await extrasRoutes.create(req, env);
  const body = await res.json();

  expect(res.status).toBe(201);
  expect(body.data.user_id).toBe(uid);
  expect(body.data.status).toBe('open');
});

// ── TC-4-A12: unauthenticated request to admin endpoint returns 401 ───────────
it('TC-4-A12: unauthenticated GET /api/extras returns 401', async () => {
  const req  = makeRequest('GET', '/api/extras', null, '');
  req.params = {};
  const res  = await extrasRoutes.list(req, env);
  expect(res.status).toBe(401);
});

// ── TC-4-A13: employee cannot access admin extras list ───────────────────────
it('TC-4-A13: employee cannot GET /api/extras (403)', async () => {
  const uid  = await seedUser('employee');
  const cook = await cookieFor(uid, 'employee');

  const req  = makeRequest('GET', '/api/extras', null, cook);
  req.params = {};
  const res  = await extrasRoutes.list(req, env);
  expect(res.status).toBe(403);
});

// ── TC-4-A14: type filter works ──────────────────────────────────────────────
it('TC-4-A14: admin can filter extras by type', async () => {
  const adminId = await seedUser('administrator');
  const uid     = await seedUser();
  const pid     = await seedProject();
  // Seed one extra_work and one own_cost
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO Extras (user_id, project_id, type, description, status, created_by, created_at, updated_at)
     VALUES (?, ?, 'own_cost', 'Cost item', 'open', ?, ?, ?)`,
  ).bind(uid, pid, uid, now, now).run();

  const cook = await cookieFor(adminId, 'administrator');
  const req  = makeRequest('GET', `/api/extras?type=own_cost&user_id=${uid}&status=all`, null, cook);
  req.params = {};
  const res  = await extrasRoutes.list(req, env);
  const body = await res.json();

  expect(res.status).toBe(200);
  body.data.forEach(ex => expect(ex.type).toBe('own_cost'));
});

// ══ Project / Employee list integration ══════════════════════════════════════

// ── TC-4-I01: open_extras_count appears on project list ──────────────────────
it('TC-4-I01: project list includes open_extras_count', async () => {
  const adminId = await seedUser('administrator');
  const uid     = await seedUser();
  const pid     = await seedProject();
  await seedExtra(uid, pid, 'open');
  await seedExtra(uid, pid, 'open');
  // One processed — should NOT be counted
  await seedExtra(uid, pid, 'processed');

  const cook = await cookieFor(adminId, 'administrator');
  const req  = makeRequest('GET', `/api/projects?status=all`, null, cook);
  req.params = {};
  const res  = await projectRoutes.list(req, env);
  const body = await res.json();

  expect(res.status).toBe(200);
  const project = (body?.data ?? body).find(p => p.id === pid);
  expect(project).toBeDefined();
  expect(project.open_extras_count).toBe(2);
});

// ── TC-4-I02: open_extras_count is 0 when no open extras ─────────────────────
it('TC-4-I02: project with no open extras has open_extras_count = 0', async () => {
  const adminId = await seedUser('administrator');
  const pid     = await seedProject();

  const cook = await cookieFor(adminId, 'administrator');
  const req  = makeRequest('GET', `/api/projects?status=all`, null, cook);
  req.params = {};
  const res  = await projectRoutes.list(req, env);
  const body = await res.json();

  const project = (body?.data ?? body).find(p => p.id === pid);
  expect(project).toBeDefined();
  expect(project.open_extras_count ?? 0).toBe(0);
});

// ── TC-4-I03: open_extras_count appears on employee list ─────────────────────
it('TC-4-I03: employee list includes open_extras_count', async () => {
  const adminId = await seedUser('administrator');
  const uid     = await seedUser();
  const pid     = await seedProject();
  await seedExtra(uid, pid, 'open');
  await seedExtra(uid, pid, 'open');
  await seedExtra(uid, pid, 'processed'); // should not count

  const cook = await cookieFor(adminId, 'administrator');
  const req  = makeRequest('GET', `/api/employees?status=all`, null, cook);
  req.params = {};
  const res  = await employeeRoutes.list(req, env);
  const body = await res.json();

  expect(res.status).toBe(200);
  const employees = body?.data ?? body;
  const emp = employees.find(e => e.id === uid);
  expect(emp).toBeDefined();
  expect(emp.open_extras_count).toBe(2);
});

// ── TC-4-I04: employee list open_extras_count excludes deleted extras ─────────
it('TC-4-I04: deleted extras not counted in open_extras_count', async () => {
  const adminId = await seedUser('administrator');
  const uid     = await seedUser();
  const pid     = await seedProject();
  const extraId = await seedExtra(uid, pid, 'open');
  // Soft-delete the extra
  await env.DB.prepare('UPDATE Extras SET is_deleted = 1 WHERE id = ?').bind(extraId).run();

  const cook = await cookieFor(adminId, 'administrator');
  const req  = makeRequest('GET', `/api/employees?status=all`, null, cook);
  req.params = {};
  const res  = await employeeRoutes.list(req, env);
  const body = await res.json();

  const employees = body?.data ?? body;
  const emp = employees.find(e => e.id === uid);
  expect(emp).toBeDefined();
  expect(emp.open_extras_count ?? 0).toBe(0);
});

// ── TC-4-A15: admin extras default filter is open ────────────────────────────
it('TC-4-A15: GET /api/extras with no status param defaults to open extras only', async () => {
  const adminId = await seedUser('administrator');
  const uid     = await seedUser();
  const pid     = await seedProject();
  await seedExtra(uid, pid, 'open');
  await seedExtra(uid, pid, 'processed');

  const cook = await cookieFor(adminId, 'administrator');
  const req  = makeRequest('GET', `/api/extras?user_id=${uid}`, null, cook);
  req.params = {};
  const res  = await extrasRoutes.list(req, env);
  const body = await res.json();

  expect(res.status).toBe(200);
  body.data.forEach(ex => expect(ex.status).toBe('open'));
});
