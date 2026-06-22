/**
 * Sprint 3A tests — Project Assignments, Manual Time Entry CRUD,
 * Manager visibility scoping, Approval status.
 *
 * Runs in the Cloudflare Workers runtime via miniflare (vitest-pool-workers).
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { env as cfEnv }                    from 'cloudflare:test';
import { signJwt }                         from '../src/lib/jwt.js';
import * as projectRoutes    from '../src/routes/projects.js';
import * as timeEntryRoutes  from '../src/routes/time_entries.js';

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

async function cookieFor(id, role) {
  const token = await signJwt(
    { sub: id, role, exp: Math.floor(Date.now() / 1000) + 3600 },
    env.JWT_SECRET,
  );
  return `jwt=${token}`;
}

let userSeq    = 200;
let projectSeq = 100;
async function seedUser(role = 'employee', teamId = null) {
  const seq = userSeq++;
  const now = new Date().toISOString();
  const ROLE_MAP = { employee: 1, manager: 2, administrator: 3 };
  const r = await env.DB.prepare(
    `INSERT INTO Users
       (role_id, employee_number, first_name, last_name, email, password_hash, is_active,
        team_id, invitation_token, invitation_token_expires_at,
        password_reset_token, password_reset_expires_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, NULL, 1, ?, NULL, NULL, NULL, NULL, ?, ?)`,
  ).bind(ROLE_MAP[role], `E-${String(seq).padStart(3,'0')}`,
         'Test', `${role}${seq}`, `u${seq}@example.com`,
         teamId, now, now).run();
  const id = r.meta.last_row_id;
  return { id, cookie: await cookieFor(id, role) };
}

async function seedProject(clientId = null) {
  const seq = projectSeq++;
  const now = new Date().toISOString();
  const r = await env.DB.prepare(
    `INSERT INTO Projects
       (project_code, project_code_seq, name, client_id, status,
        start_date, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'active', '2026-01-01', 1, ?, ?)`,
  ).bind(`P-${String(seq).padStart(3,'0')}`, seq, `Project ${seq}`, clientId, now, now).run();
  return r.meta.last_row_id;
}

// ── Test actors + shared state ────────────────────────────────────────────────
let admin, manager, outsiderManager, emp1, emp2, empOutside;
let teamA, teamB;
let projectOpen, projectRestricted;

beforeAll(async () => {
  for (const m of [m01,m02,m03,m04,m05,m06,m07,m08,m09,m10,m11,m12,m13,m14,m15,m16,m17,m18]) {
    await applyMigration(m);
  }

  // Create two teams
  const now = new Date().toISOString();
  const r1 = await env.DB.prepare(
    `INSERT INTO Teams (name, is_active, created_at, updated_at) VALUES ('Team A', 1, ?, ?)`,
  ).bind(now, now).run();
  teamA = r1.meta.last_row_id;

  const r2 = await env.DB.prepare(
    `INSERT INTO Teams (name, is_active, created_at, updated_at) VALUES ('Team B', 1, ?, ?)`,
  ).bind(now, now).run();
  teamB = r2.meta.last_row_id;

  // Admin
  admin = await seedUser('administrator');

  // Manager supervises Team A
  manager = await seedUser('manager', teamA);
  await env.DB.prepare('UPDATE Teams SET supervisor_id = ? WHERE id = ?').bind(manager.id, teamA).run();

  // Manager who supervises Team B (outsider from manager's perspective)
  outsiderManager = await seedUser('manager', teamB);
  await env.DB.prepare('UPDATE Teams SET supervisor_id = ? WHERE id = ?').bind(outsiderManager.id, teamB).run();

  // Employees
  emp1        = await seedUser('employee', teamA);   // in manager's team
  emp2        = await seedUser('employee', teamA);   // also in manager's team
  empOutside  = await seedUser('employee', teamB);   // NOT in manager's team

  // Projects
  projectOpen       = await seedProject();   // no assignments → open to all
  projectRestricted = await seedProject();   // will receive specific assignments
});

// ═══════════════════════════════════════════════════════════════════════════════
// PROJECT ASSIGNMENTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('Project Assignments', () => {

  it('TC-PA01: admin can set assignments for a project', async () => {
    const req = makeRequest('PUT', `/api/projects/${projectRestricted}/assignments`,
      { user_ids: [emp1.id, emp2.id] }, admin.cookie);
    req.params = { id: String(projectRestricted) };
    const res = await projectRoutes.setAssignments(req, env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(2);
    expect(body.data.map(u => u.id).sort()).toEqual([emp1.id, emp2.id].sort());
  });

  it('TC-PA02: admin can list assignments', async () => {
    const req = makeRequest('GET', `/api/projects/${projectRestricted}/assignments`, null, admin.cookie);
    req.params = { id: String(projectRestricted) };
    const res = await projectRoutes.listAssignments(req, env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(2);
  });

  it('TC-PA03: manager can read assignments', async () => {
    const req = makeRequest('GET', `/api/projects/${projectRestricted}/assignments`, null, manager.cookie);
    req.params = { id: String(projectRestricted) };
    const res = await projectRoutes.listAssignments(req, env);
    expect(res.status).toBe(200);
  });

  it('TC-PA04: manager cannot set assignments (admin-only)', async () => {
    const req = makeRequest('PUT', `/api/projects/${projectRestricted}/assignments`,
      { user_ids: [emp1.id] }, manager.cookie);
    req.params = { id: String(projectRestricted) };
    const res = await projectRoutes.setAssignments(req, env);
    expect(res.status).toBe(403);
  });

  it('TC-PA05: setting assignments replaces the full list atomically', async () => {
    // First set: emp1 + emp2
    const r1 = makeRequest('PUT', `/api/projects/${projectRestricted}/assignments`,
      { user_ids: [emp1.id, emp2.id] }, admin.cookie);
    r1.params = { id: String(projectRestricted) };
    await projectRoutes.setAssignments(r1, env);

    // Replace with just emp1
    const r2 = makeRequest('PUT', `/api/projects/${projectRestricted}/assignments`,
      { user_ids: [emp1.id] }, admin.cookie);
    r2.params = { id: String(projectRestricted) };
    const res = await projectRoutes.setAssignments(r2, env);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe(emp1.id);
  });

  it('TC-PA06: setting empty array clears all assignments (project becomes open)', async () => {
    // Set assignments first
    const r1 = makeRequest('PUT', `/api/projects/${projectRestricted}/assignments`,
      { user_ids: [emp1.id] }, admin.cookie);
    r1.params = { id: String(projectRestricted) };
    await projectRoutes.setAssignments(r1, env);

    // Clear
    const r2 = makeRequest('PUT', `/api/projects/${projectRestricted}/assignments`,
      { user_ids: [] }, admin.cookie);
    r2.params = { id: String(projectRestricted) };
    const res = await projectRoutes.setAssignments(r2, env);
    const body = await res.json();
    expect(body.data).toHaveLength(0);
  });

  it('TC-PA07: assignments 404 on non-existent project', async () => {
    const req = makeRequest('GET', '/api/projects/99999/assignments', null, admin.cookie);
    req.params = { id: '99999' };
    const res = await projectRoutes.listAssignments(req, env);
    expect(res.status).toBe(404);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// MANAGER VISIBILITY SCOPE
// ═══════════════════════════════════════════════════════════════════════════════

describe('Manager Visibility — Projects', () => {

  beforeAll(async () => {
    // projectRestricted has emp1 assigned (from previous describe)
    const r = makeRequest('PUT', `/api/projects/${projectRestricted}/assignments`,
      { user_ids: [emp1.id] }, admin.cookie);
    r.params = { id: String(projectRestricted) };
    await projectRoutes.setAssignments(r, env);
  });

  it('TC-MV01: manager sees open projects (no assignments)', async () => {
    const req = makeRequest('GET', '/api/projects', null, manager.cookie);
    const res = await projectRoutes.list(req, env);
    const body = await res.json();
    const ids  = body.data.map(p => p.id);
    expect(ids).toContain(projectOpen);
  });

  it('TC-MV02: manager sees project where their employee is assigned', async () => {
    const req = makeRequest('GET', '/api/projects', null, manager.cookie);
    const res = await projectRoutes.list(req, env);
    const body = await res.json();
    const ids  = body.data.map(p => p.id);
    expect(ids).toContain(projectRestricted);
  });

  it('TC-MV03: outsider manager does not see restricted project (emp1 not in their team)', async () => {
    // Create a project only emp1 is assigned to
    const restrictedForOutsider = await seedProject();
    const r = makeRequest('PUT', `/api/projects/${restrictedForOutsider}/assignments`,
      { user_ids: [emp1.id] }, admin.cookie);
    r.params = { id: String(restrictedForOutsider) };
    await projectRoutes.setAssignments(r, env);

    const req = makeRequest('GET', '/api/projects', null, outsiderManager.cookie);
    const res = await projectRoutes.list(req, env);
    const body = await res.json();
    const ids  = body.data.map(p => p.id);
    expect(ids).not.toContain(restrictedForOutsider);
  });

  it('TC-MV04: admin sees all projects regardless of assignments', async () => {
    const req = makeRequest('GET', '/api/projects?status=all', null, admin.cookie);
    const res = await projectRoutes.list(req, env);
    const body = await res.json();
    const ids  = body.data.map(p => p.id);
    expect(ids).toContain(projectOpen);
    expect(ids).toContain(projectRestricted);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TIME ENTRY CRUD
// ═══════════════════════════════════════════════════════════════════════════════

describe('Time Entries — Manual CRUD', () => {

  let createdEntryId;

  const START = '2026-06-22T07:00:00.000Z';
  const STOP  = '2026-06-22T15:30:00.000Z';

  it('TC-TE01: admin can create a manual time entry', async () => {
    const req = makeRequest('POST', '/api/time-entries', {
      user_id:    emp1.id,
      project_id: projectOpen,
      start_time: START,
      stop_time:  STOP,
      notes:      'Initial pour',
    }, admin.cookie);
    const res = await timeEntryRoutes.create(req, env);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.entry_source).toBe('manual_admin');
    expect(body.data.is_manual_entry).toBe(1);
    expect(body.data.status).toBe('approved');
    expect(body.data.duration_minutes).toBe(510);         // 8h30
    expect(body.data.rounded_duration_minutes).toBeTypeOf('number');
    createdEntryId = body.data.id;
  });

  it('TC-TE02: 15-min rounding applied correctly', async () => {
    // 07:00 → rounded start = 07:00 (exactly on boundary)
    // 15:30 → rounded stop  = 15:30 (exactly on boundary)
    const req = makeRequest('POST', '/api/time-entries', {
      user_id:    emp1.id,
      project_id: projectOpen,
      start_time: '2026-06-22T07:07:00.000Z',  // 7 min past: rounds to 07:00
      stop_time:  '2026-06-22T15:31:00.000Z',  // 1 min past 15:30: rounds UP to 15:45
    }, admin.cookie);
    const res  = await timeEntryRoutes.create(req, env);
    const body = await res.json();
    // actual duration 07:07→15:31 = 504 min → Math.round(504/15)*15 = 510 min
    expect(body.data.rounded_duration_minutes).toBe(510);
  });

  it('TC-TE03: stop before start is rejected', async () => {
    const req = makeRequest('POST', '/api/time-entries', {
      user_id:    emp1.id,
      project_id: projectOpen,
      start_time: STOP,
      stop_time:  START,
    }, admin.cookie);
    const res = await timeEntryRoutes.create(req, env);
    expect(res.status).toBe(400);
  });

  it('TC-TE04: admin can list time entries', async () => {
    const req = makeRequest('GET', '/api/time-entries', null, admin.cookie);
    const res = await timeEntryRoutes.list(req, env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThanOrEqual(1);
  });

  it('TC-TE05: list can be filtered by user_id', async () => {
    const req = makeRequest('GET', `/api/time-entries?user_id=${emp1.id}`, null, admin.cookie);
    const res = await timeEntryRoutes.list(req, env);
    const body = await res.json();
    expect(body.data.every(e => e.user_id === emp1.id)).toBe(true);
  });

  it('TC-TE06: list can be filtered by date range', async () => {
    const req = makeRequest('GET', '/api/time-entries?date_from=2026-06-22&date_to=2026-06-22', null, admin.cookie);
    const res = await timeEntryRoutes.list(req, env);
    const body = await res.json();
    expect(body.data.length).toBeGreaterThanOrEqual(1);
    expect(body.data.every(e => e.start_time.startsWith('2026-06-22'))).toBe(true);
  });

  it('TC-TE07: admin can update a time entry', async () => {
    const req = makeRequest('PUT', `/api/time-entries/${createdEntryId}`, {
      stop_time: '2026-06-22T16:00:00.000Z',
      notes:     'Corrected checkout time',
    }, admin.cookie);
    req.params = { id: String(createdEntryId) };
    const res  = await timeEntryRoutes.update(req, env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.notes).toBe('Corrected checkout time');
    expect(body.data.duration_minutes).toBe(540);  // 9h
  });

  it('TC-TE08: admin can soft-delete a time entry', async () => {
    // Create a throwaway entry
    const cr = makeRequest('POST', '/api/time-entries', {
      user_id: emp2.id, project_id: projectOpen,
      start_time: '2026-06-20T08:00:00.000Z',
      stop_time:  '2026-06-20T16:00:00.000Z',
    }, admin.cookie);
    const cres = await timeEntryRoutes.create(cr, env);
    const { data: { id } } = await cres.json();

    const dr = makeRequest('DELETE', `/api/time-entries/${id}`, null, admin.cookie);
    dr.params = { id: String(id) };
    const dres = await timeEntryRoutes.remove(dr, env);
    expect(dres.status).toBe(200);

    // Verify it no longer appears in the list
    const lr = makeRequest('GET', `/api/time-entries?user_id=${emp2.id}`, null, admin.cookie);
    const lres = await timeEntryRoutes.list(lr, env);
    const body = await lres.json();
    expect(body.data.every(e => e.id !== id)).toBe(true);
  });

  it('TC-TE09: new entries default to approved status', async () => {
    const req = makeRequest('POST', '/api/time-entries', {
      user_id:    emp1.id,
      project_id: projectOpen,
      start_time: '2026-06-23T09:00:00.000Z',
      stop_time:  '2026-06-23T17:00:00.000Z',
    }, admin.cookie);
    const res  = await timeEntryRoutes.create(req, env);
    const body = await res.json();
    expect(body.data.status).toBe('approved');
  });

  it('TC-TE10: employee (non-admin) cannot call time entry endpoints', async () => {
    const req = makeRequest('GET', '/api/time-entries', null, emp1.cookie);
    const res = await timeEntryRoutes.list(req, env);
    expect(res.status).toBe(403);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// MANAGER VISIBILITY — TIME ENTRIES
// ═══════════════════════════════════════════════════════════════════════════════

describe('Manager Visibility — Time Entries', () => {

  let insideEntryId, outsideEntryId;

  beforeAll(async () => {
    // Create entry for emp1 (inside manager's team)
    const r1 = makeRequest('POST', '/api/time-entries', {
      user_id: emp1.id, project_id: projectOpen,
      start_time: '2026-06-24T07:00:00.000Z',
      stop_time:  '2026-06-24T15:00:00.000Z',
    }, admin.cookie);
    const res1 = await timeEntryRoutes.create(r1, env);
    insideEntryId = (await res1.json()).data.id;

    // Create entry for empOutside (NOT in manager's team)
    const r2 = makeRequest('POST', '/api/time-entries', {
      user_id: empOutside.id, project_id: projectOpen,
      start_time: '2026-06-24T07:00:00.000Z',
      stop_time:  '2026-06-24T15:00:00.000Z',
    }, admin.cookie);
    const res2 = await timeEntryRoutes.create(r2, env);
    outsideEntryId = (await res2.json()).data.id;
  });

  it('TC-MTE01: manager sees entries for their team employees', async () => {
    const req  = makeRequest('GET', '/api/time-entries', null, manager.cookie);
    const res  = await timeEntryRoutes.list(req, env);
    const body = await res.json();
    const ids  = body.data.map(e => e.id);
    expect(ids).toContain(insideEntryId);
  });

  it('TC-MTE02: manager does NOT see entries for employees outside their teams', async () => {
    const req  = makeRequest('GET', '/api/time-entries', null, manager.cookie);
    const res  = await timeEntryRoutes.list(req, env);
    const body = await res.json();
    const ids  = body.data.map(e => e.id);
    expect(ids).not.toContain(outsideEntryId);
  });

  it('TC-MTE03: manager can create entry for employee in their team', async () => {
    const req = makeRequest('POST', '/api/time-entries', {
      user_id: emp1.id, project_id: projectOpen,
      start_time: '2026-06-25T08:00:00.000Z',
      stop_time:  '2026-06-25T16:00:00.000Z',
    }, manager.cookie);
    const res = await timeEntryRoutes.create(req, env);
    expect(res.status).toBe(201);
  });

  it('TC-MTE04: manager CANNOT create entry for employee outside their teams', async () => {
    const req = makeRequest('POST', '/api/time-entries', {
      user_id: empOutside.id, project_id: projectOpen,
      start_time: '2026-06-25T08:00:00.000Z',
      stop_time:  '2026-06-25T16:00:00.000Z',
    }, manager.cookie);
    const res = await timeEntryRoutes.create(req, env);
    expect(res.status).toBe(403);
  });

  it('TC-MTE05: manager CANNOT delete entry belonging to outside employee', async () => {
    const req = makeRequest('DELETE', `/api/time-entries/${outsideEntryId}`, null, manager.cookie);
    req.params = { id: String(outsideEntryId) };
    const res = await timeEntryRoutes.remove(req, env);
    expect(res.status).toBe(403);
  });
});
