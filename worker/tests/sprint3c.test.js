/**
 * Sprint 3C tests — Employee timesheet & self-service.
 *
 * Covers: week helpers, GET /api/my-time, manual entry CRUD,
 * current-week enforcement, source guards, audit trail columns.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { env as cfEnv }                    from 'cloudflare:test';
import { signJwt }                         from '../src/lib/jwt.js';
import * as timeEntryRoutes                from '../src/routes/time_entries.js';
import * as myTimeRoutes                   from '../src/routes/my_time.js';
import { weekStartFor, weekEndFor }        from '../src/lib/week.js';

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

let userSeq    = 600;
let projectSeq = 300;

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

// Insert a completed manual_worker entry; date defaults to today (current week).
async function seedManualEntry(userId, projectId, dateStr = null) {
  const now = new Date().toISOString();
  const d   = dateStr ?? new Date().toISOString().slice(0, 10);
  const start = `${d}T08:00:00.000Z`;
  const stop  = `${d}T10:00:00.000Z`;
  const r = await env.DB.prepare(
    `INSERT INTO TimeEntries
       (user_id, project_id, entry_source, start_time, stop_time,
        duration_minutes, rounded_duration_minutes, is_manual_entry, status,
        created_by, created_at, updated_at)
     VALUES (?, ?, 'manual_worker', ?, ?, 120, 120, 1, 'approved', ?, ?, ?)`,
  ).bind(userId, projectId, start, stop, userId, now, now).run();
  return r.meta.last_row_id;
}

// Insert an automatic (checkin/checkout) entry
async function seedAutoEntry(userId, projectId, dateStr = null) {
  const now = new Date().toISOString();
  const d   = dateStr ?? new Date().toISOString().slice(0, 10);
  const start = `${d}T06:00:00.000Z`;
  const stop  = `${d}T08:00:00.000Z`;
  const r = await env.DB.prepare(
    `INSERT INTO TimeEntries
       (user_id, project_id, entry_source, start_time, stop_time,
        duration_minutes, rounded_duration_minutes, is_manual_entry, status,
        created_by, created_at, updated_at)
     VALUES (?, ?, 'automatic', ?, ?, 120, 120, 0, 'submitted', ?, ?, ?)`,
  ).bind(userId, projectId, start, stop, userId, now, now).run();
  return r.meta.last_row_id;
}

// ── Apply all migrations once ─────────────────────────────────────────────────
beforeAll(async () => {
  for (const m of [m01,m02,m03,m04,m05,m06,m07,m08,m09,m10,m11,m12,m13,m14,m15,m16]) {
    await applyMigration(m);
  }
});

// ── TC-3C01: weekStartFor returns Monday for a Monday input ──────────────────
it('TC-3C01: weekStartFor returns Monday for Monday input', () => {
  // 2026-06-22 is a Monday
  expect(weekStartFor('2026-06-22')).toBe('2026-06-22');
});

// ── TC-3C02: weekStartFor returns Monday for Sunday input ─────────────────────
it('TC-3C02: weekStartFor returns Monday for Sunday input', () => {
  // 2026-06-28 is a Sunday → week start is Jun 22
  expect(weekStartFor('2026-06-28')).toBe('2026-06-22');
});

// ── TC-3C03: weekStartFor returns Monday for mid-week input ──────────────────
it('TC-3C03: weekStartFor returns Monday for Wednesday input', () => {
  // 2026-06-24 is a Wednesday → week start is Jun 22
  expect(weekStartFor('2026-06-24')).toBe('2026-06-22');
});

// ── TC-3C04: weekEndFor returns Sunday ────────────────────────────────────────
it('TC-3C04: weekEndFor returns Sunday of the same week', () => {
  expect(weekEndFor('2026-06-22')).toBe('2026-06-28');
  expect(weekEndFor('2026-06-24')).toBe('2026-06-28');
  expect(weekEndFor('2026-06-28')).toBe('2026-06-28');
});

// ── TC-3C05: GET /api/my-time returns entries for the requested week ──────────
it('TC-3C05: GET /api/my-time returns entries for the correct week', async () => {
  const uid = await seedUser();
  const pid = await seedProject();
  const today = new Date().toISOString().slice(0, 10);
  await seedManualEntry(uid, pid, today);

  const cook = await cookieFor(uid, 'employee');
  const req  = makeRequest('GET', `/api/my-time?week=${today}`, null, cook);
  req.params = {};
  const res  = await myTimeRoutes.myTime(req, env);
  expect(res.status).toBe(200);

  const body = await res.json();
  expect(body.data.length).toBeGreaterThan(0);
  expect(body.week_start).toBe(weekStartFor(today));
  expect(body.week_end).toBe(weekEndFor(today));
});

// ── TC-3C06: GET /api/my-time requires auth ───────────────────────────────────
it('TC-3C06: GET /api/my-time requires authentication', async () => {
  const req = makeRequest('GET', '/api/my-time');
  req.params = {};
  const res = await myTimeRoutes.myTime(req, env);
  expect(res.status).toBe(401);
});

// ── TC-3C07: GET /api/my-time excludes other weeks ───────────────────────────
it('TC-3C07: GET /api/my-time does not include entries from other weeks', async () => {
  const uid = await seedUser();
  const pid = await seedProject();
  // Seed entry 3 weeks ago — should NOT appear in this week's query
  const pastDate = new Date(Date.now() - 21 * 86400_000).toISOString().slice(0, 10);
  await seedManualEntry(uid, pid, pastDate);

  const today = new Date().toISOString().slice(0, 10);
  const cook  = await cookieFor(uid, 'employee');
  const req   = makeRequest('GET', `/api/my-time?week=${today}`, null, cook);
  req.params  = {};
  const res   = await myTimeRoutes.myTime(req, env);
  const body  = await res.json();
  expect(body.data).toHaveLength(0);
});

// ── TC-3C08: POST /api/my-time creates a manual_worker entry ─────────────────
it('TC-3C08: POST /api/my-time creates entry with entry_source=manual_worker', async () => {
  const uid = await seedUser();
  const pid = await seedProject();
  await assignProject(uid, pid);

  const today     = new Date().toISOString().slice(0, 10);
  const startTime = `${today}T09:00:00.000Z`;
  const stopTime  = `${today}T11:00:00.000Z`;
  const cook      = await cookieFor(uid, 'employee');
  const req       = makeRequest('POST', '/api/my-time', { project_id: pid, start_time: startTime, stop_time: stopTime }, cook);
  req.params = {};
  const res  = await myTimeRoutes.createMyEntry(req, env);

  expect(res.status).toBe(201);
  const body = await res.json();
  expect(body.data.entry_source).toBe('manual_worker');
  expect(body.data.project_id).toBe(pid);
});

// ── TC-3C09: POST /api/my-time rejects entry outside current week ─────────────
it('TC-3C09: POST /api/my-time rejects entry dated outside current week', async () => {
  const uid  = await seedUser();
  const pid  = await seedProject();
  await assignProject(uid, pid);

  const pastDate  = new Date(Date.now() - 14 * 86400_000).toISOString().slice(0, 10);
  const startTime = `${pastDate}T09:00:00.000Z`;
  const stopTime  = `${pastDate}T11:00:00.000Z`;
  const cook      = await cookieFor(uid, 'employee');
  const req       = makeRequest('POST', '/api/my-time', { project_id: pid, start_time: startTime, stop_time: stopTime }, cook);
  req.params = {};
  const res  = await myTimeRoutes.createMyEntry(req, env);

  expect(res.status).toBe(422);
  const body = await res.json();
  expect(body.error).toMatch(/current week/i);
});

// ── TC-3C10: POST /api/my-time rejects duration < 10 min ─────────────────────
it('TC-3C10: POST /api/my-time rejects entry shorter than 10 minutes', async () => {
  const uid  = await seedUser();
  const pid  = await seedProject();
  await assignProject(uid, pid);

  const today     = new Date().toISOString().slice(0, 10);
  const startTime = `${today}T09:00:00.000Z`;
  const stopTime  = `${today}T09:05:00.000Z`; // 5 min
  const cook      = await cookieFor(uid, 'employee');
  const req       = makeRequest('POST', '/api/my-time', { project_id: pid, start_time: startTime, stop_time: stopTime }, cook);
  req.params = {};
  const res  = await myTimeRoutes.createMyEntry(req, env);

  expect(res.status).toBe(422);
});

// ── TC-3C11: POST /api/my-time rejects unassigned project ────────────────────
it('TC-3C11: POST /api/my-time rejects project not assigned to the employee', async () => {
  const uid = await seedUser();
  const pid = await seedProject(); // NOT assigned

  const today     = new Date().toISOString().slice(0, 10);
  const startTime = `${today}T09:00:00.000Z`;
  const stopTime  = `${today}T11:00:00.000Z`;
  const cook      = await cookieFor(uid, 'employee');
  const req       = makeRequest('POST', '/api/my-time', { project_id: pid, start_time: startTime, stop_time: stopTime }, cook);
  req.params = {};
  const res  = await myTimeRoutes.createMyEntry(req, env);

  expect(res.status).toBe(400);
});

// ── TC-3C12: POST /api/my-time requires auth ──────────────────────────────────
it('TC-3C12: POST /api/my-time requires authentication', async () => {
  const req = makeRequest('POST', '/api/my-time', { project_id: 1 });
  req.params = {};
  const res = await myTimeRoutes.createMyEntry(req, env);
  expect(res.status).toBe(401);
});

// ── TC-3C13: PUT /api/my-time/:id updates manual entry ───────────────────────
it('TC-3C13: PUT /api/my-time/:id updates notes on a manual entry', async () => {
  const uid = await seedUser();
  const pid = await seedProject();
  const eid = await seedManualEntry(uid, pid);

  const today    = new Date().toISOString().slice(0, 10);
  const newStop  = `${today}T12:00:00.000Z`;
  const cook     = await cookieFor(uid, 'employee');
  const req      = makeRequest('PUT', `/api/my-time/${eid}`, { stop_time: newStop, notes: 'Updated' }, cook);
  req.params     = { id: String(eid) };
  const res      = await myTimeRoutes.updateMyEntry(req, env);

  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.data.notes).toBe('Updated');
});

// ── TC-3C14: PUT /api/my-time/:id rejects automatic entry edit ───────────────
it('TC-3C14: PUT /api/my-time/:id rejects edit of an automatic entry', async () => {
  const uid = await seedUser();
  const pid = await seedProject();
  const eid = await seedAutoEntry(uid, pid);

  const cook = await cookieFor(uid, 'employee');
  const req  = makeRequest('PUT', `/api/my-time/${eid}`, { notes: 'hack' }, cook);
  req.params = { id: String(eid) };
  const res  = await myTimeRoutes.updateMyEntry(req, env);

  expect(res.status).toBe(403);
});

// ── TC-3C15: PUT /api/my-time/:id rejects edit outside current week ───────────
it('TC-3C15: PUT /api/my-time/:id rejects edit of a historical entry', async () => {
  const uid      = await seedUser();
  const pid      = await seedProject();
  const pastDate = new Date(Date.now() - 14 * 86400_000).toISOString().slice(0, 10);
  const eid      = await seedManualEntry(uid, pid, pastDate);

  const cook = await cookieFor(uid, 'employee');
  const req  = makeRequest('PUT', `/api/my-time/${eid}`, { notes: 'edit' }, cook);
  req.params = { id: String(eid) };
  const res  = await myTimeRoutes.updateMyEntry(req, env);

  expect(res.status).toBe(422);
  const body = await res.json();
  expect(body.error).toMatch(/current week/i);
});

// ── TC-3C16: PUT /api/my-time/:id returns 404 for another user's entry ────────
it('TC-3C16: PUT /api/my-time/:id returns 404 for another user\'s entry', async () => {
  const owner  = await seedUser();
  const other  = await seedUser();
  const pid    = await seedProject();
  const eid    = await seedManualEntry(owner, pid);

  const cook = await cookieFor(other, 'employee');
  const req  = makeRequest('PUT', `/api/my-time/${eid}`, { notes: 'steal' }, cook);
  req.params = { id: String(eid) };
  const res  = await myTimeRoutes.updateMyEntry(req, env);

  expect(res.status).toBe(404);
});

// ── TC-3C17: DELETE /api/my-time/:id soft-deletes entry ──────────────────────
it('TC-3C17: DELETE /api/my-time/:id soft-deletes the entry', async () => {
  const uid = await seedUser();
  const pid = await seedProject();
  const eid = await seedManualEntry(uid, pid);

  const cook = await cookieFor(uid, 'employee');
  const req  = makeRequest('DELETE', `/api/my-time/${eid}`, null, cook);
  req.params = { id: String(eid) };
  const res  = await myTimeRoutes.deleteMyEntry(req, env);

  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.ok).toBe(true);

  // Verify it no longer appears in GET
  const getReq = makeRequest('GET', `/api/my-time`, null, cook);
  getReq.params = {};
  const getRes  = await myTimeRoutes.myTime(getReq, env);
  const getData = await getRes.json();
  expect(getData.data.find(e => e.id === eid)).toBeUndefined();
});

// ── TC-3C18: DELETE /api/my-time/:id rejects automatic entry ─────────────────
it('TC-3C18: DELETE /api/my-time/:id rejects deletion of automatic entry', async () => {
  const uid = await seedUser();
  const pid = await seedProject();
  const eid = await seedAutoEntry(uid, pid);

  const cook = await cookieFor(uid, 'employee');
  const req  = makeRequest('DELETE', `/api/my-time/${eid}`, null, cook);
  req.params = { id: String(eid) };
  const res  = await myTimeRoutes.deleteMyEntry(req, env);

  expect(res.status).toBe(403);
});

// ── TC-3C19: DELETE /api/my-time/:id rejects historical entry ────────────────
it('TC-3C19: DELETE /api/my-time/:id rejects deletion of historical manual entry', async () => {
  const uid      = await seedUser();
  const pid      = await seedProject();
  const pastDate = new Date(Date.now() - 14 * 86400_000).toISOString().slice(0, 10);
  const eid      = await seedManualEntry(uid, pid, pastDate);

  const cook = await cookieFor(uid, 'employee');
  const req  = makeRequest('DELETE', `/api/my-time/${eid}`, null, cook);
  req.params = { id: String(eid) };
  const res  = await myTimeRoutes.deleteMyEntry(req, env);

  expect(res.status).toBe(422);
});

// ── TC-3C20: DELETE /api/my-time/:id returns 404 for another user's entry ────
it('TC-3C20: DELETE /api/my-time/:id returns 404 for another user\'s entry', async () => {
  const owner = await seedUser();
  const other = await seedUser();
  const pid   = await seedProject();
  const eid   = await seedManualEntry(owner, pid);

  const cook = await cookieFor(other, 'employee');
  const req  = makeRequest('DELETE', `/api/my-time/${eid}`, null, cook);
  req.params = { id: String(eid) };
  const res  = await myTimeRoutes.deleteMyEntry(req, env);

  expect(res.status).toBe(404);
});

// ── TC-3C21: manual entry sets created_by ────────────────────────────────────
it('TC-3C21: POST /api/my-time sets created_by to the requesting user', async () => {
  const uid = await seedUser();
  const pid = await seedProject();
  await assignProject(uid, pid);

  const today     = new Date().toISOString().slice(0, 10);
  const startTime = `${today}T13:00:00.000Z`;
  const stopTime  = `${today}T15:00:00.000Z`;
  const cook      = await cookieFor(uid, 'employee');
  const req       = makeRequest('POST', '/api/my-time', { project_id: pid, start_time: startTime, stop_time: stopTime }, cook);
  req.params = {};
  const res  = await myTimeRoutes.createMyEntry(req, env);
  const body = await res.json();

  const row = await env.DB.prepare('SELECT created_by FROM TimeEntries WHERE id = ?')
    .bind(body.data.id).first();
  expect(row.created_by).toBe(uid);
});

// ── TC-3C22: manual update sets updated_by ───────────────────────────────────
it('TC-3C22: PUT /api/my-time/:id sets updated_by to the requesting user', async () => {
  const uid = await seedUser();
  const pid = await seedProject();
  const eid = await seedManualEntry(uid, pid);

  const today = new Date().toISOString().slice(0, 10);
  const cook  = await cookieFor(uid, 'employee');
  const req   = makeRequest('PUT', `/api/my-time/${eid}`, { notes: 'audit' }, cook);
  req.params  = { id: String(eid) };
  await myTimeRoutes.updateMyEntry(req, env);

  const row = await env.DB.prepare('SELECT updated_by FROM TimeEntries WHERE id = ?')
    .bind(eid).first();
  expect(row.updated_by).toBe(uid);
});

// ── TC-3C23: checkin sets created_by ─────────────────────────────────────────
it('TC-3C23: checkin sets created_by to the checking-in employee', async () => {
  const uid = await seedUser();
  const pid = await seedProject();
  const cook = await cookieFor(uid, 'employee');

  const req  = makeRequest('POST', '/api/time-entries/checkin', { project_id: pid }, cook);
  req.params = {};
  const res  = await timeEntryRoutes.checkin(req, env);
  const body = await res.json();

  const row = await env.DB.prepare('SELECT created_by FROM TimeEntries WHERE id = ?')
    .bind(body.data.id).first();
  expect(row.created_by).toBe(uid);
});

// ── TC-3C24: checkout sets updated_by ────────────────────────────────────────
it('TC-3C24: checkout sets updated_by to the checking-out employee', async () => {
  const uid = await seedUser();
  const pid = await seedProject();

  // Checkin
  const cook     = await cookieFor(uid, 'employee');
  const cinReq   = makeRequest('POST', '/api/time-entries/checkin', { project_id: pid }, cook);
  cinReq.params  = {};
  const cinRes   = await timeEntryRoutes.checkin(cinReq, env);
  const cinBody  = await cinRes.json();
  const entryId  = cinBody.data.id;

  // Backdate so checkout won't hit the 10-min guard
  const backdate = new Date(Date.now() - 20 * 60_000).toISOString();
  await env.DB.prepare('UPDATE TimeEntries SET start_time = ? WHERE id = ?').bind(backdate, entryId).run();

  const coReq   = makeRequest('POST', '/api/time-entries/checkout', {}, cook);
  coReq.params  = {};
  await timeEntryRoutes.checkout(coReq, env);

  const row = await env.DB.prepare('SELECT updated_by FROM TimeEntries WHERE id = ?')
    .bind(entryId).first();
  expect(row.updated_by).toBe(uid);
});

// ── TC-3C25: admin create sets created_by ────────────────────────────────────
it('TC-3C25: admin POST /api/time-entries sets created_by to the admin user', async () => {
  const adminId = await seedUser('administrator');
  const empId   = await seedUser();
  const pid     = await seedProject();

  const today     = new Date().toISOString().slice(0, 10);
  const startTime = `${today}T07:00:00.000Z`;
  const stopTime  = `${today}T09:00:00.000Z`;
  const cook      = await cookieFor(adminId, 'administrator');

  const req  = makeRequest('POST', '/api/time-entries',
    { user_id: empId, project_id: pid, start_time: startTime, stop_time: stopTime }, cook);
  req.params = {};
  const res  = await timeEntryRoutes.create(req, env);
  const body = await res.json();

  const row = await env.DB.prepare('SELECT created_by FROM TimeEntries WHERE id = ?')
    .bind(body.data.id).first();
  expect(row.created_by).toBe(adminId);
});

// ══ Sprint 3C.1 — Future date blocking ══════════════════════════════════════

// ── TC-3C26: employee can create entry for today ──────────────────────────────
it('TC-3C26: employee can create a manual entry dated today', async () => {
  const uid  = await seedUser();
  const pid  = await seedProject();
  await assignProject(uid, pid);
  const cook = await cookieFor(uid, 'employee');

  const today = new Date().toISOString().slice(0, 10);
  const req   = makeRequest('POST', '/api/my-time',
    { project_id: pid, start_time: `${today}T08:00:00.000Z`, stop_time: `${today}T10:00:00.000Z` },
    cook);
  req.params = {};
  const res  = await myTimeRoutes.createMyEntry(req, env);
  expect(res.status).toBe(201);
});

// ── TC-3C27: employee can create entry for an earlier day this week ───────────
it('TC-3C27: employee can create a manual entry for an earlier day in the current week', async () => {
  const uid  = await seedUser();
  const pid  = await seedProject();
  await assignProject(uid, pid);
  const cook = await cookieFor(uid, 'employee');

  // Compute Monday of current week (UTC); skip this test if today IS Monday.
  const today       = new Date().toISOString().slice(0, 10);
  const weekStart   = weekStartFor(today);
  if (weekStart === today) return; // nothing "earlier" this week — pass trivially

  const req = makeRequest('POST', '/api/my-time',
    { project_id: pid,
      start_time: `${weekStart}T08:00:00.000Z`,
      stop_time:  `${weekStart}T10:00:00.000Z` },
    cook);
  req.params = {};
  const res  = await myTimeRoutes.createMyEntry(req, env);
  expect(res.status).toBe(201);
});

// ── TC-3C28: employee cannot create entry for tomorrow ────────────────────────
it('TC-3C28: employee cannot create a manual entry dated tomorrow (422)', async () => {
  const uid  = await seedUser();
  const pid  = await seedProject();
  await assignProject(uid, pid);
  const cook = await cookieFor(uid, 'employee');

  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  // If tomorrow falls outside the current ISO week, this hits the week check first —
  // still expects 422 with the same class of error.
  const req = makeRequest('POST', '/api/my-time',
    { project_id: pid,
      start_time: `${tomorrow}T08:00:00.000Z`,
      stop_time:  `${tomorrow}T10:00:00.000Z` },
    cook);
  req.params = {};
  const res  = await myTimeRoutes.createMyEntry(req, env);
  const body = await res.json();
  expect(res.status).toBe(422);
  expect(body.error).toMatch(/future|current week/i);
});

// ── TC-3C29: employee cannot edit a future-dated entry ───────────────────────
it('TC-3C29: employee cannot edit a manual entry whose date is in the future (422)', async () => {
  const uid  = await seedUser();
  const pid  = await seedProject();
  await assignProject(uid, pid);

  // Seed a future-dated manual entry directly (bypass the route guard)
  const tomorrow  = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const entryId   = await seedManualEntry(uid, pid, tomorrow);
  const cook      = await cookieFor(uid, 'employee');

  const req  = makeRequest('PUT', `/api/my-time/${entryId}`,
    { notes: 'edited' }, cook);
  req.params = { id: String(entryId) };
  const res  = await myTimeRoutes.updateMyEntry(req, env);
  const body = await res.json();
  expect(res.status).toBe(422);
  expect(body.error).toMatch(/future|current week/i);
});

// ── TC-3C30: employee cannot delete a future-dated entry ─────────────────────
it('TC-3C30: employee cannot delete a manual entry whose date is in the future (422)', async () => {
  const uid  = await seedUser();
  const pid  = await seedProject();
  await assignProject(uid, pid);

  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const entryId  = await seedManualEntry(uid, pid, tomorrow);
  const cook     = await cookieFor(uid, 'employee');

  const req  = makeRequest('DELETE', `/api/my-time/${entryId}`, null, cook);
  req.params = { id: String(entryId) };
  const res  = await myTimeRoutes.deleteMyEntry(req, env);
  const body = await res.json();
  expect(res.status).toBe(422);
  expect(body.error).toMatch(/future|current week/i);
});

// ── TC-3C31: admin CRUD is unrestricted for future-dated entries ──────────────
it('TC-3C31: admin POST /api/time-entries still accepts future-dated entries', async () => {
  const adminId = await seedUser('administrator');
  const empId   = await seedUser();
  const pid     = await seedProject();
  const cook    = await cookieFor(adminId, 'administrator');

  const tomorrow  = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const startTime = `${tomorrow}T08:00:00.000Z`;
  const stopTime  = `${tomorrow}T10:00:00.000Z`;

  const req  = makeRequest('POST', '/api/time-entries',
    { user_id: empId, project_id: pid, start_time: startTime, stop_time: stopTime }, cook);
  req.params = {};
  const res  = await timeEntryRoutes.create(req, env);
  expect(res.status).toBe(201);
});
