/**
 * Sprint 6 tests — My Day (DailyAttendance + ProjectHourEntries), Extras, Week helpers
 * S6-01 through S6-19
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { env as cfEnv }                    from 'cloudflare:test';
import { signJwt }                         from '../src/lib/jwt.js';
import { hashPassword }                    from '../src/lib/password.js';
import { isoWeekNumber }                   from '../src/lib/week.js';
import * as myDayRoutes                    from '../src/routes/my_day.js';
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
import m21 from '../migrations/0021_normalize_timestamps.sql?raw';
import m22 from '../migrations/0022_login_audit.sql?raw';
import m23 from '../migrations/0023_login_audit_network.sql?raw';
import m24 from '../migrations/0024_daily_attendance.sql?raw';

// ── helpers ───────────────────────────────────────────────────────────────────

function authReq(token, { url = 'https://test.example.com/', method = 'GET', params = {}, body = null } = {}) {
  const req = new Request(url, {
    method,
    headers: { Cookie: `jwt=${token}`, 'Content-Type': 'application/json' },
    ...(body !== null ? { body: JSON.stringify(body) } : {}),
  });
  req.params = params;
  if (body !== null) req.json = async () => body;
  return req;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function thisWeekMonday() {
  const d   = new Date();
  const day = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + (day === 0 ? -6 : 1 - day));
  return d.toISOString().slice(0, 10);
}

function pastWeekDate() {
  const d = new Date(thisWeekMonday() + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - 14);
  return d.toISOString().slice(0, 10);
}

// ── setup ─────────────────────────────────────────────────────────────────────

let adminToken, empToken, emp2Token;
let empId, emp2Id, adminId;
let projectId, project2Id;

beforeAll(async () => {
  async function runMigration(sql) {
    const stmts = sql.replace(/--[^\n]*/g, '').split(';').map(s => s.trim()).filter(s => s.length > 0);
    for (const stmt of stmts) await env.DB.prepare(stmt).run();
  }

  for (const sql of [
    m01, m02, m03, m04, m05, m06, m07, m08, m09, m10,
    m11, m12, m13, m14, m15, m16, m17, m18, m19, m20,
    m21, m22, m23, m24,
  ]) {
    await runMigration(sql);
  }

  const hash = await hashPassword('TestPass1!');
  const now  = new Date().toISOString();

  const a = await env.DB.prepare(
    `INSERT INTO Users (employee_number,first_name,last_name,email,password_hash,role_id,is_active,created_at,updated_at)
     VALUES ('A001','Admin','User','admin@test.com',?,1,1,?,?)`,
  ).bind(hash, now, now).run();
  adminId = a.meta.last_row_id;

  const e1 = await env.DB.prepare(
    `INSERT INTO Users (employee_number,first_name,last_name,email,password_hash,role_id,is_active,created_at,updated_at)
     VALUES ('E001','Alice','Smith','alice@test.com',?,3,1,?,?)`,
  ).bind(hash, now, now).run();
  empId = e1.meta.last_row_id;

  const e2 = await env.DB.prepare(
    `INSERT INTO Users (employee_number,first_name,last_name,email,password_hash,role_id,is_active,created_at,updated_at)
     VALUES ('E002','Bob','Jones','bob@test.com',?,3,1,?,?)`,
  ).bind(hash, now, now).run();
  emp2Id = e2.meta.last_row_id;

  const p1 = await env.DB.prepare(
    `INSERT INTO Projects (project_code,project_code_seq,name,status,start_date,is_active,created_at,updated_at)
     VALUES ('P001',1,'Alpha','active','2025-01-01',1,?,?)`,
  ).bind(now, now).run();
  projectId = p1.meta.last_row_id;

  const p2 = await env.DB.prepare(
    `INSERT INTO Projects (project_code,project_code_seq,name,status,start_date,is_active,created_at,updated_at)
     VALUES ('P002',2,'Beta','active','2025-01-01',1,?,?)`,
  ).bind(now, now).run();
  project2Id = p2.meta.last_row_id;

  // emp → project1; emp2 → project1; emp is NOT on project2
  for (const [pid, uid] of [[projectId, empId], [projectId, emp2Id]]) {
    await env.DB.prepare('INSERT INTO ProjectAssignments (project_id,user_id,created_at) VALUES (?,?,?)')
      .bind(pid, uid, now).run();
  }

  adminToken = await signJwt({ sub: String(adminId), role: 'administrator' }, env.JWT_SECRET);
  empToken   = await signJwt({ sub: String(empId),   role: 'employee' },      env.JWT_SECRET);
  emp2Token  = await signJwt({ sub: String(emp2Id),  role: 'employee' },      env.JWT_SECRET);
});

// ── S6-01: employee saves daily attendance ────────────────────────────────────
describe('S6-01: employee saves daily attendance', () => {
  it('creates an attendance record', async () => {
    const date = today();
    const req  = authReq(empToken, {
      url: 'https://test.example.com/api/my-day/attendance', method: 'PUT',
      body: { work_date: date, start_time: '08:00', finish_time: '16:30' },
    });
    const res  = await myDayRoutes.putAttendance(req, env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.work_date).toBe(date);
    expect(body.data.start_time).toBe('08:00');
    expect(body.data.finish_time).toBe('16:30');
    expect(body.data.duration_minutes).toBe(510);
  });
});

// ── S6-02: employee updates daily attendance (upsert) ────────────────────────
describe('S6-02: employee updates daily attendance', () => {
  it('second PUT for same date updates the record', async () => {
    const date = today();
    const req  = authReq(empToken, {
      url: 'https://test.example.com/api/my-day/attendance', method: 'PUT',
      body: { work_date: date, start_time: '09:00', finish_time: '17:00' },
    });
    const res  = await myDayRoutes.putAttendance(req, env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.start_time).toBe('09:00');
    expect(body.data.duration_minutes).toBe(480);
  });
});

// ── S6-03: employee adds project hours for assigned project ───────────────────
describe('S6-03: employee adds project hours for assigned project', () => {
  it('creates a ProjectHourEntry', async () => {
    const req = authReq(empToken, {
      url: 'https://test.example.com/api/my-day/project-hours', method: 'POST',
      body: { work_date: today(), project_id: projectId, hours_minutes: 240 },
    });
    const res  = await myDayRoutes.createProjectHours(req, env);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.project_id).toBe(projectId);
    expect(body.data.hours_minutes).toBe(240);
    expect(body.data.source).toBe('employee_manual');
  });
});

// ── S6-04: employee cannot add project hours to unassigned project ────────────
describe('S6-04: employee rejected for unassigned project', () => {
  it('returns 400 for project2 (not assigned)', async () => {
    const req = authReq(empToken, {
      url: 'https://test.example.com/api/my-day/project-hours', method: 'POST',
      body: { work_date: today(), project_id: project2Id, hours_minutes: 60 },
    });
    const res  = await myDayRoutes.createProjectHours(req, env);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/not assigned/i);
  });
});

// ── S6-05: employee edits own current-week project hours ─────────────────────
describe('S6-05: employee edits own current-week project hours', () => {
  it('PUT updates hours_minutes', async () => {
    const createReq = authReq(empToken, {
      url: 'https://test.example.com/api/my-day/project-hours', method: 'POST',
      body: { work_date: today(), project_id: projectId, hours_minutes: 120 },
    });
    const { data } = await (await myDayRoutes.createProjectHours(createReq, env)).json();
    const entryId  = data.id;

    const updateReq = authReq(empToken, {
      url: `https://test.example.com/api/my-day/project-hours/${entryId}`,
      method: 'PUT', params: { id: String(entryId) },
      body: { hours_minutes: 180 },
    });
    const res  = await myDayRoutes.updateProjectHours(updateReq, env);
    expect(res.status).toBe(200);
    expect((await res.json()).data.hours_minutes).toBe(180);
  });
});

// ── S6-06: employee cannot edit outside current week ─────────────────────────
describe('S6-06: employee blocked editing outside current week', () => {
  it('returns 422 for a past-week entry', async () => {
    const pastDate = pastWeekDate();
    const now      = new Date().toISOString();
    const ins = await env.DB.prepare(
      `INSERT INTO ProjectHourEntries
         (user_id,project_id,work_date,hours_minutes,source,created_by,updated_by,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
    ).bind(empId, projectId, pastDate, 90, 'employee_manual', empId, empId, now, now).run();
    const pastId = ins.meta.last_row_id;

    const req = authReq(empToken, {
      url: `https://test.example.com/api/my-day/project-hours/${pastId}`,
      method: 'PUT', params: { id: String(pastId) },
      body: { hours_minutes: 999 },
    });
    const res = await myDayRoutes.updateProjectHours(req, env);
    expect(res.status).toBe(422);
  });
});

// ── S6-07: admin can edit outside current week ────────────────────────────────
describe('S6-07: admin can edit outside current week', () => {
  it('admin 200s on a past-week entry it owns', async () => {
    const pastDate = pastWeekDate();
    const now      = new Date().toISOString();
    const ins = await env.DB.prepare(
      `INSERT INTO ProjectHourEntries
         (user_id,project_id,work_date,hours_minutes,source,created_by,updated_by,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
    ).bind(adminId, projectId, pastDate, 60, 'admin_manual', adminId, adminId, now, now).run();
    const entryId = ins.meta.last_row_id;

    const req = authReq(adminToken, {
      url: `https://test.example.com/api/my-day/project-hours/${entryId}`,
      method: 'PUT', params: { id: String(entryId) },
      body: { hours_minutes: 120 },
    });
    const res = await myDayRoutes.updateProjectHours(req, env);
    expect(res.status).toBe(200);
    expect((await res.json()).data.hours_minutes).toBe(120);
  });
});

// ── S6-08: variance is returned without error even when ≠ 0 ──────────────────
describe('S6-08: variance allowed (attendance ≠ allocated)', () => {
  it('GET /api/my-day returns variance without erroring', async () => {
    const req = authReq(empToken, {
      url: `https://test.example.com/api/my-day?date=${today()}`,
    });
    const res  = await myDayRoutes.getDay(req, env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.totals).toBeDefined();
    expect(typeof body.data.totals.variance_minutes).toBe('number');
  });
});

// ── S6-09: variance calculation ───────────────────────────────────────────────
describe('S6-09: variance calculated correctly', () => {
  it('variance = allocated_minutes - attendance_minutes', async () => {
    const testDate = thisWeekMonday();
    const now      = new Date().toISOString();

    await env.DB.prepare(
      `INSERT INTO DailyAttendance
         (user_id,work_date,start_time,finish_time,duration_minutes,
          created_by,updated_by,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?)
       ON CONFLICT(user_id,work_date) DO UPDATE
         SET start_time=excluded.start_time,finish_time=excluded.finish_time,
             duration_minutes=excluded.duration_minutes,is_deleted=0`,
    ).bind(emp2Id, testDate, '08:00', '16:00', 480, emp2Id, emp2Id, now, now).run();

    await env.DB.prepare(
      `INSERT INTO ProjectHourEntries
         (user_id,project_id,work_date,hours_minutes,source,created_by,updated_by,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
    ).bind(emp2Id, projectId, testDate, 300, 'employee_manual', emp2Id, emp2Id, now, now).run();

    const req  = authReq(emp2Token, {
      url: `https://test.example.com/api/my-day?date=${testDate}`,
    });
    const body = await (await myDayRoutes.getDay(req, env)).json();
    expect(body.data.totals.attendance_minutes).toBe(480);
    expect(body.data.totals.allocated_project_minutes).toBe(300);
    expect(body.data.totals.variance_minutes).toBe(-180);
  });
});

// ── S6-10: project weekly-hours returns per-employee totals ──────────────────
describe('S6-10: GET /api/projects/:id/weekly-hours', () => {
  it('returns employee breakdown for the week', async () => {
    const req = authReq(adminToken, {
      url:    `https://test.example.com/api/projects/${projectId}/weekly-hours?week=${today()}`,
      params: { id: String(projectId) },
    });
    const res  = await projectRoutes.weeklyHours(req, env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.data.employees)).toBe(true);
    const found = body.data.employees.find(e => e.user_id === empId);
    expect(found).toBeDefined();
    expect(found.total_minutes).toBeGreaterThan(0);
  });
});

// ── S6-11: employee weekly-hours returns per-project totals ──────────────────
describe('S6-11: GET /api/employees/:id/weekly-hours', () => {
  it('returns project breakdown for the employee', async () => {
    const req = authReq(adminToken, {
      url:    `https://test.example.com/api/employees/${empId}/weekly-hours?week=${today()}`,
      params: { id: String(empId) },
    });
    const res  = await employeeRoutes.weeklyHours(req, env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.data.projects)).toBe(true);
    expect(body.data.projects.length).toBeGreaterThan(0);
    expect(body.data.projects[0].total_minutes).toBeGreaterThan(0);
  });
});

// ── S6-12: ISO week number helper ────────────────────────────────────────────
describe('S6-12: isoWeekNumber helper', () => {
  it('2025-01-01 is week 1 of 2025', () => {
    expect(isoWeekNumber('2025-01-01')).toEqual({ week: 1, year: 2025 });
  });

  it('2024-12-30 is week 1 of 2025', () => {
    expect(isoWeekNumber('2024-12-30')).toEqual({ week: 1, year: 2025 });
  });

  it('2024-12-28 is week 52 of 2024', () => {
    expect(isoWeekNumber('2024-12-28')).toEqual({ week: 52, year: 2024 });
  });
});

// ── S6-13: Extra Work cannot be created (employee) ───────────────────────────
describe('S6-13: Extra Work blocked for new creation (employee)', () => {
  it('POST /api/extras/mine with type=extra_work returns 400', async () => {
    const req = authReq(empToken, {
      url: 'https://test.example.com/api/extras/mine', method: 'POST',
      body: { type: 'extra_work', project_id: projectId, description: 'some work' },
    });
    const res  = await extrasRoutes.createMine(req, env);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/cannot create/i);
  });
});

// ── S6-13b: Extra Work cannot be created (admin) ─────────────────────────────
describe('S6-13b: Extra Work blocked for new creation (admin)', () => {
  it('POST /api/extras with type=extra_work returns 400', async () => {
    const req = authReq(adminToken, {
      url: 'https://test.example.com/api/extras', method: 'POST',
      body: { user_id: empId, project_id: projectId, type: 'extra_work', description: 'bd' },
    });
    const res  = await extrasRoutes.create(req, env);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/cannot create/i);
  });
});

// ── S6-14: legacy extra_work records visible in list ─────────────────────────
describe('S6-14: legacy extra_work records do not crash list', () => {
  it('listMine returns legacy extra_work rows without error', async () => {
    const now = new Date().toISOString();
    await env.DB.prepare(
      `INSERT INTO Extras (user_id,project_id,type,description,status,created_by,created_at,updated_at)
       VALUES (?,?,'extra_work','Old overtime','open',?,?,?)`,
    ).bind(empId, projectId, empId, now, now).run();

    const req  = authReq(empToken, { url: 'https://test.example.com/api/extras/mine' });
    const res  = await extrasRoutes.listMine(req, env);
    expect(res.status).toBe(200);
    expect((await res.json()).data.find(r => r.type === 'extra_work')).toBeDefined();
  });
});

// ── S6-15: Own Cost still works ───────────────────────────────────────────────
describe('S6-15: Own Cost creation still works', () => {
  it('employee can create own_cost extra', async () => {
    const req = authReq(empToken, {
      url: 'https://test.example.com/api/extras/mine', method: 'POST',
      body: { type: 'own_cost', project_id: projectId, description: 'Tool purchase' },
    });
    const res  = await extrasRoutes.createMine(req, env);
    expect(res.status).toBe(201);
    expect((await res.json()).data.type).toBe('own_cost');
  });
});

// ── S6-16: Mileage still works ────────────────────────────────────────────────
describe('S6-16: Mileage creation still works', () => {
  it('employee can create mileage extra', async () => {
    const req = authReq(empToken, {
      url: 'https://test.example.com/api/extras/mine', method: 'POST',
      body: { type: 'mileage', mileage_km: 42.5 },
    });
    const res  = await extrasRoutes.createMine(req, env);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.type).toBe('mileage');
    expect(body.data.mileage_km).toBe(42.5);
  });
});
