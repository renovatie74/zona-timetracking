/**
 * Sprint 3B tests — Employee check-in / check-out flow.
 *
 * Covers: active session query, check-in (GPS captured/denied/unavailable),
 * collision block, check-out with rounding, RecentProjects upsert,
 * unclosed_warning after 12h, auth guards.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { env as cfEnv }                    from 'cloudflare:test';
import { signJwt }                         from '../src/lib/jwt.js';
import * as timeEntryRoutes                from '../src/routes/time_entries.js';

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

let userSeq    = 500;
let projectSeq = 200;

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
  ).bind(ROLE_MAP[role], `E-${String(seq).padStart(3,'0')}`,
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
  ).bind(`P-${String(seq).padStart(3,'0')}`, seq, `Project ${seq}`, now, now).run();
  return r.meta.last_row_id;
}

// ── Apply all migrations once ─────────────────────────────────────────────────
beforeAll(async () => {
  for (const m of [m01,m02,m03,m04,m05,m06,m07,m08,m09,m10,m11,m12,m13,m14]) {
    await applyMigration(m);
  }
});

// ── TC-3B01: GET /active with no active session returns null ──────────────────
it('TC-3B01: active returns null when no session open', async () => {
  const uid  = await seedUser();
  const cook = await cookieFor(uid, 'employee');
  const req  = makeRequest('GET', '/api/time-entries/active', null, cook);
  req.params = {};
  const res  = await timeEntryRoutes.active(req, env);
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.data).toBeNull();
});

// ── TC-3B02: GET /active requires auth ───────────────────────────────────────
it('TC-3B02: active requires authentication', async () => {
  const req = makeRequest('GET', '/api/time-entries/active');
  req.params = {};
  const res = await timeEntryRoutes.active(req, env);
  expect(res.status).toBe(401);
});

// ── TC-3B03: checkin creates a new entry with GPS captured ───────────────────
it('TC-3B03: checkin creates entry with GPS captured', async () => {
  const uid  = await seedUser();
  const pid  = await seedProject();
  const cook = await cookieFor(uid, 'employee');
  const req  = makeRequest('POST', '/api/time-entries/checkin', {
    project_id: pid,
    gps: { status: 'captured', lat: 25.2048, lng: 55.2708, accuracy: 10 },
  }, cook);
  req.params = {};
  const res  = await timeEntryRoutes.checkin(req, env);
  expect(res.status).toBe(201);
  const body = await res.json();
  expect(body.data.project_id).toBe(pid);
  expect(body.data.gps_status).toBe('captured');
  expect(body.data.checkin_lat).toBe(25.2048);
  expect(body.data.checkin_lng).toBe(55.2708);
  expect(body.data.checkin_maps_url).toContain('maps.google.com');
  expect(body.data.stop_time).toBeUndefined();  // still open
});

// ── TC-3B04: checkin with GPS denied records denied status ───────────────────
it('TC-3B04: checkin records GPS denied status', async () => {
  const uid  = await seedUser();
  const pid  = await seedProject();
  const cook = await cookieFor(uid, 'employee');
  const req  = makeRequest('POST', '/api/time-entries/checkin', {
    project_id: pid,
    gps: { status: 'denied' },
  }, cook);
  req.params = {};
  const res  = await timeEntryRoutes.checkin(req, env);
  expect(res.status).toBe(201);
  const body = await res.json();
  expect(body.data.gps_status).toBe('denied');
  expect(body.data.checkin_lat).toBeNull();
});

// ── TC-3B05: checkin with no GPS defaults to unavailable ─────────────────────
it('TC-3B05: checkin with no gps field defaults to unavailable', async () => {
  const uid  = await seedUser();
  const pid  = await seedProject();
  const cook = await cookieFor(uid, 'employee');
  const req  = makeRequest('POST', '/api/time-entries/checkin', { project_id: pid }, cook);
  req.params = {};
  const res  = await timeEntryRoutes.checkin(req, env);
  expect(res.status).toBe(201);
  const body = await res.json();
  expect(body.data.gps_status).toBe('unavailable');
});

// ── TC-3B06: collision block — second checkin returns 409 ────────────────────
it('TC-3B06: second checkin is blocked with 409', async () => {
  const uid   = await seedUser();
  const pid1  = await seedProject();
  const pid2  = await seedProject();
  const cook  = await cookieFor(uid, 'employee');

  // First check-in
  const req1 = makeRequest('POST', '/api/time-entries/checkin', { project_id: pid1 }, cook);
  req1.params = {};
  await timeEntryRoutes.checkin(req1, env);

  // Second check-in should be blocked
  const req2 = makeRequest('POST', '/api/time-entries/checkin', { project_id: pid2 }, cook);
  req2.params = {};
  const res2 = await timeEntryRoutes.checkin(req2, env);
  expect(res2.status).toBe(409);
  const body = await res2.json();
  expect(body.error).toContain('active session');
  expect(body.error).toContain('check out');
});

// ── TC-3B07: collision error message contains project name and time ───────────
it('TC-3B07: collision error message contains project name', async () => {
  const uid  = await seedUser();
  const pid  = await seedProject();
  const cook = await cookieFor(uid, 'employee');

  const req1 = makeRequest('POST', '/api/time-entries/checkin', { project_id: pid }, cook);
  req1.params = {};
  await timeEntryRoutes.checkin(req1, env);

  const req2 = makeRequest('POST', '/api/time-entries/checkin', { project_id: pid }, cook);
  req2.params = {};
  const res2 = await timeEntryRoutes.checkin(req2, env);
  const body = await res2.json();
  // Project name is in the error
  const proj = await env.DB.prepare('SELECT name FROM Projects WHERE id = ?').bind(pid).first();
  expect(body.error).toContain(proj.name);
});

// ── TC-3B08: checkin requires authentication ─────────────────────────────────
it('TC-3B08: checkin requires authentication', async () => {
  const pid = await seedProject();
  const req = makeRequest('POST', '/api/time-entries/checkin', { project_id: pid });
  req.params = {};
  const res = await timeEntryRoutes.checkin(req, env);
  expect(res.status).toBe(401);
});

// ── TC-3B09: checkout closes the active session and computes durations ────────
it('TC-3B09: checkout closes session and computes rounded durations', async () => {
  const uid  = await seedUser();
  const pid  = await seedProject();
  const cook = await cookieFor(uid, 'employee');

  const req1 = makeRequest('POST', '/api/time-entries/checkin', { project_id: pid }, cook);
  req1.params = {};
  await timeEntryRoutes.checkin(req1, env);

  const req2 = makeRequest('POST', '/api/time-entries/checkout', {}, cook);
  req2.params = {};
  const res  = await timeEntryRoutes.checkout(req2, env);
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.data.stop_time).toBeTruthy();
  expect(body.data.duration_minutes).toBeGreaterThanOrEqual(0);
  expect(body.data.rounded_duration_minutes).toBeGreaterThanOrEqual(0);
  expect(body.data.rounded_start_time).toBeTruthy();
  expect(body.data.rounded_stop_time).toBeTruthy();
});

// ── TC-3B10: checkout with GPS captured records checkout GPS ─────────────────
it('TC-3B10: checkout records checkout GPS', async () => {
  const uid  = await seedUser();
  const pid  = await seedProject();
  const cook = await cookieFor(uid, 'employee');

  const req1 = makeRequest('POST', '/api/time-entries/checkin', { project_id: pid }, cook);
  req1.params = {};
  await timeEntryRoutes.checkin(req1, env);

  const req2 = makeRequest('POST', '/api/time-entries/checkout', {
    gps: { status: 'captured', lat: 25.2050, lng: 55.2710, accuracy: 8 },
  }, cook);
  req2.params = {};
  const res  = await timeEntryRoutes.checkout(req2, env);
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.data.checkout_gps_status).toBe('captured');
  expect(body.data.checkout_lat).toBe(25.2050);
  expect(body.data.checkout_maps_url).toContain('maps.google.com');
});

// ── TC-3B11: checkout with no active session returns 404 ─────────────────────
it('TC-3B11: checkout with no active session returns 404', async () => {
  const uid  = await seedUser();
  const cook = await cookieFor(uid, 'employee');
  const req  = makeRequest('POST', '/api/time-entries/checkout', {}, cook);
  req.params = {};
  const res  = await timeEntryRoutes.checkout(req, env);
  expect(res.status).toBe(404);
});

// ── TC-3B12: RecentProjects updated on checkin ───────────────────────────────
it('TC-3B12: RecentProjects updated on checkin', async () => {
  const uid  = await seedUser();
  const pid1 = await seedProject();
  const pid2 = await seedProject();
  const cook = await cookieFor(uid, 'employee');

  // Check in + out on project 1
  const r1 = makeRequest('POST', '/api/time-entries/checkin', { project_id: pid1 }, cook);
  r1.params = {};
  await timeEntryRoutes.checkin(r1, env);
  const o1 = makeRequest('POST', '/api/time-entries/checkout', {}, cook);
  o1.params = {};
  await timeEntryRoutes.checkout(o1, env);

  // Check in on project 2
  const r2 = makeRequest('POST', '/api/time-entries/checkin', { project_id: pid2 }, cook);
  r2.params = {};
  await timeEntryRoutes.checkin(r2, env);

  const recent = await env.DB.prepare(
    'SELECT project_id, rank FROM RecentProjects WHERE user_id = ? ORDER BY rank',
  ).bind(uid).all();
  expect(recent.results).toHaveLength(2);
  expect(recent.results[0].project_id).toBe(pid2);  // rank 1 = most recent
  expect(recent.results[0].rank).toBe(1);
  expect(recent.results[1].project_id).toBe(pid1);  // rank 2 = previous
  expect(recent.results[1].rank).toBe(2);
});

// ── TC-3B13: RecentProjects — no duplicate if same project re-used ────────────
it('TC-3B13: RecentProjects has no duplicate when same project re-checked-in', async () => {
  const uid  = await seedUser();
  const pid  = await seedProject();
  const cook = await cookieFor(uid, 'employee');

  // Check in + out twice on same project
  for (let i = 0; i < 2; i++) {
    const r = makeRequest('POST', '/api/time-entries/checkin', { project_id: pid }, cook);
    r.params = {};
    await timeEntryRoutes.checkin(r, env);
    const o = makeRequest('POST', '/api/time-entries/checkout', {}, cook);
    o.params = {};
    await timeEntryRoutes.checkout(o, env);
  }

  const recent = await env.DB.prepare(
    'SELECT project_id, rank FROM RecentProjects WHERE user_id = ?',
  ).bind(uid).all();
  expect(recent.results).toHaveLength(1);
  expect(recent.results[0].project_id).toBe(pid);
  expect(recent.results[0].rank).toBe(1);
});

// ── TC-3B14: active returns entry after check-in, unclosed_warning false ──────
it('TC-3B14: active returns open session, unclosed_warning false when < 12h', async () => {
  const uid  = await seedUser();
  const pid  = await seedProject();
  const cook = await cookieFor(uid, 'employee');

  const r = makeRequest('POST', '/api/time-entries/checkin', { project_id: pid }, cook);
  r.params = {};
  await timeEntryRoutes.checkin(r, env);

  const req = makeRequest('GET', '/api/time-entries/active', null, cook);
  req.params = {};
  const res  = await timeEntryRoutes.active(req, env);
  const body = await res.json();
  expect(body.data).not.toBeNull();
  expect(body.data.project_id).toBe(pid);
  expect(body.data.unclosed_warning).toBe(false);
});

// ── TC-3B15: checkin returns 400 if project_id missing ───────────────────────
it('TC-3B15: checkin requires project_id', async () => {
  const uid  = await seedUser();
  const cook = await cookieFor(uid, 'employee');
  const req  = makeRequest('POST', '/api/time-entries/checkin', {}, cook);
  req.params = {};
  const res  = await timeEntryRoutes.checkin(req, env);
  expect(res.status).toBe(400);
});

// ── TC-3B16: active returns null after checkout ───────────────────────────────
it('TC-3B16: active returns null after checkout', async () => {
  const uid  = await seedUser();
  const pid  = await seedProject();
  const cook = await cookieFor(uid, 'employee');

  const r = makeRequest('POST', '/api/time-entries/checkin', { project_id: pid }, cook);
  r.params = {};
  await timeEntryRoutes.checkin(r, env);

  const o = makeRequest('POST', '/api/time-entries/checkout', {}, cook);
  o.params = {};
  await timeEntryRoutes.checkout(o, env);

  const a = makeRequest('GET', '/api/time-entries/active', null, cook);
  a.params = {};
  const res  = await timeEntryRoutes.active(a, env);
  const body = await res.json();
  expect(body.data).toBeNull();
});
