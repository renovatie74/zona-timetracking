/**
 * Sprint 6.2 tests — weekly summaries, week_number, extras weekly filter,
 * 12h max, 30-min increments, 15-min attendance boundaries
 */
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import worker from '../src/worker.js';
import { weekStartFor, weekEndFor } from '../src/lib/week.js';
import { signJwt } from '../src/lib/jwt.js';
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
const ALL_MIGRATIONS = [m01,m02,m03,m04,m05,m06,m07,m08,m09,m10,m11,m12,m13,m14,m15,m16,m17,m18,m19,m20,m21,m22,m23,m24];

async function runMigration(sql) {
  const stmts = sql.replace(/--[^\n]*/g, '').split(';').map(s => s.trim()).filter(s => s.length > 0);
  for (const stmt of stmts) await env.DB.prepare(stmt).run();
}

function authReq(token, { url = 'https://test.example.com/', method = 'GET', body = null } = {}) {
  const req = new Request(url, {
    method,
    headers: { Cookie: `jwt=${token}`, 'Content-Type': 'application/json' },
    ...(body !== null ? { body: JSON.stringify(body) } : {}),
  });
  if (body !== null) req.json = async () => body;
  return req;
}

async function handle(req) {
  const ctx = createExecutionContext();
  const res = await worker.fetch(req, env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

// ── Shared test data ───────────────────────────────────────────────────────────
let adminToken, empToken;
let adminId, empId, projectId;

const TODAY      = new Date().toISOString().slice(0, 10);
const WEEK_START = weekStartFor(TODAY);
const WEEK_END   = weekEndFor(WEEK_START);

beforeAll(async () => {
  for (const sql of ALL_MIGRATIONS) await runMigration(sql);

  await env.DB.prepare(
    "INSERT OR IGNORE INTO OrgSettings (key, value) VALUES ('timezone', 'UTC')"
  ).run();

  const aIns = await env.DB.prepare(
    `INSERT INTO Users (first_name, last_name, email, password_hash, role_id, is_active, employee_number, created_at, updated_at)
     VALUES ('Admin','62','admin62@test.com','x',2,1,'A062',datetime('now'),datetime('now'))`
  ).run();
  adminId    = aIns.meta.last_row_id;
  adminToken = await signJwt({ sub: adminId, role: 'administrator' }, env.JWT_SECRET);

  const eIns = await env.DB.prepare(
    `INSERT INTO Users (first_name, last_name, email, password_hash, role_id, is_active, employee_number, created_at, updated_at)
     VALUES ('Emp','62','emp62@test.com','x',1,1,'E062',datetime('now'),datetime('now'))`
  ).run();
  empId    = eIns.meta.last_row_id;
  empToken = await signJwt({ sub: empId, role: 'employee' }, env.JWT_SECRET);

  const pIns = await env.DB.prepare(
    `INSERT INTO Projects (name, project_code, project_code_seq, is_active, start_date, created_at, updated_at)
     VALUES ('Sprint6.2 Project','S62',62,1,'2025-01-01',datetime('now'),datetime('now'))`
  ).run();
  projectId = pIns.meta.last_row_id;

  await env.DB.prepare(
    `INSERT INTO ProjectAssignments (project_id, user_id, created_at) VALUES (?,?,datetime('now'))`
  ).bind(projectId, empId).run();

  // Insert ProjectHourEntry in the current week (180 min)
  await env.DB.prepare(
    `INSERT INTO ProjectHourEntries (user_id, project_id, work_date, hours_minutes, is_deleted, created_at, updated_at)
     VALUES (?,?,?,180,0,datetime('now'),datetime('now'))`
  ).bind(empId, projectId, TODAY).run();

  // Insert old-style TimeEntry in the same week (should not affect weekly summaries)
  await env.DB.prepare(
    `INSERT INTO TimeEntries (user_id, project_id, start_time, stop_time, duration_minutes, rounded_duration_minutes, entry_source, status, is_deleted, created_at, updated_at)
     VALUES (?,?,'${TODAY}T08:00:00Z','${TODAY}T16:00:00Z',480,480,'manual_admin','approved',0,datetime('now'),datetime('now'))`
  ).bind(empId, projectId).run();
});

// ── S6.2-01: project list weekly hours uses ProjectHourEntries ────────────────
describe('S6.2-01: project weekly-hours uses ProjectHourEntries', () => {
  it('returns total_minutes from ProjectHourEntries', async () => {
    const res = await handle(authReq(adminToken, {
      url: `https://test.example.com/api/projects/${projectId}/weekly-hours?week=${WEEK_START}`,
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    const employees = body.data?.employees ?? [];
    const emp = employees.find(e => e.user_id === empId);
    expect(emp).toBeTruthy();
    expect(emp.total_minutes).toBe(180);
  });
});

// ── S6.2-02: project weekly-hours has week_number ─────────────────────────────
describe('S6.2-02: project weekly-hours includes week_number', () => {
  it('week_number is a valid ISO week', async () => {
    const res = await handle(authReq(adminToken, {
      url: `https://test.example.com/api/projects/${projectId}/weekly-hours?week=${WEEK_START}`,
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.data.week_number).toBe('number');
    expect(body.data.week_number).toBeGreaterThan(0);
    expect(body.data.week_number).toBeLessThanOrEqual(53);
  });
});

// ── S6.2-03: employee weekly-hours uses ProjectHourEntries ────────────────────
describe('S6.2-03: employee weekly-hours uses ProjectHourEntries', () => {
  it('returns total_allocated_minutes from ProjectHourEntries', async () => {
    const res = await handle(authReq(adminToken, {
      url: `https://test.example.com/api/employees/${empId}/weekly-hours?week=${WEEK_START}`,
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.total_allocated_minutes).toBe(180);
  });
});

// ── S6.2-04: employee weekly-hours has week_number ────────────────────────────
describe('S6.2-04: employee weekly-hours includes week_number', () => {
  it('week_number is a valid ISO week', async () => {
    const res = await handle(authReq(adminToken, {
      url: `https://test.example.com/api/employees/${empId}/weekly-hours?week=${WEEK_START}`,
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.data.week_number).toBe('number');
    expect(body.data.week_number).toBeGreaterThan(0);
  });
});

// ── S6.2-05: old TimeEntries do NOT affect weekly summaries ───────────────────
describe('S6.2-05: old TimeEntries do not inflate weekly summaries', () => {
  it('project weekly total equals only ProjectHourEntries sum', async () => {
    const res = await handle(authReq(adminToken, {
      url: `https://test.example.com/api/projects/${projectId}/weekly-hours?week=${WEEK_START}`,
    }));
    const body = await res.json();
    const total = (body.data?.employees ?? []).reduce((s, e) => s + e.total_minutes, 0);
    // Only the 180-min PHE entry, not the 480-min TimeEntry
    expect(total).toBe(180);
  });
});

// ── S6.2-06: week filtering correct by work_date ─────────────────────────────
describe('S6.2-06: week filtering by work_date', () => {
  it('query with last week returns 0 for a current-week entry', async () => {
    // Compute previous week start
    const prevWeekStart = new Date(WEEK_START + 'T00:00:00Z');
    prevWeekStart.setUTCDate(prevWeekStart.getUTCDate() - 7);
    const prevWS = prevWeekStart.toISOString().slice(0, 10);
    const res = await handle(authReq(adminToken, {
      url: `https://test.example.com/api/projects/${projectId}/weekly-hours?week=${prevWS}`,
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    const total = (body.data?.employees ?? []).reduce((s, e) => s + e.total_minutes, 0);
    expect(total).toBe(0);
  });
});

// ── S6.2-07: createProjectHours accepts 330 min (5.5h) ───────────────────────
describe('S6.2-07: 5.5h (330 min) is a valid duration', () => {
  it('POST project-hours with hours_minutes=330 returns 201', async () => {
    const res = await handle(authReq(empToken, {
      url: 'https://test.example.com/api/my-day/project-hours',
      method: 'POST',
      body: { work_date: TODAY, project_id: projectId, hours_minutes: 330 },
    }));
    expect(res.status).toBe(201);
  });
});

// ── S6.2-08: createProjectHours accepts 720 min (12h max) ────────────────────
describe('S6.2-08: 12h (720 min) is accepted', () => {
  it('POST project-hours with hours_minutes=720 returns 201', async () => {
    const res = await handle(authReq(empToken, {
      url: 'https://test.example.com/api/my-day/project-hours',
      method: 'POST',
      body: { work_date: TODAY, project_id: projectId, hours_minutes: 720 },
    }));
    expect(res.status).toBe(201);
  });
});

// ── S6.2-09: createProjectHours rejects > 720 min ────────────────────────────
describe('S6.2-09: more than 12h is rejected', () => {
  it('POST project-hours with hours_minutes=750 returns 400', async () => {
    const res = await handle(authReq(empToken, {
      url: 'https://test.example.com/api/my-day/project-hours',
      method: 'POST',
      body: { work_date: TODAY, project_id: projectId, hours_minutes: 750 },
    }));
    expect(res.status).toBe(400);
  });
});

// ── S6.2-10: createProjectHours rejects non-30-min (45 min) ──────────────────
describe('S6.2-10: non-30-min increment is rejected', () => {
  it('POST project-hours with hours_minutes=45 returns 400', async () => {
    const res = await handle(authReq(empToken, {
      url: 'https://test.example.com/api/my-day/project-hours',
      method: 'POST',
      body: { work_date: TODAY, project_id: projectId, hours_minutes: 45 },
    }));
    expect(res.status).toBe(400);
  });
});

// ── S6.2-11: attendance rejects non-15-min boundary (08:14) ──────────────────
describe('S6.2-11: attendance rejects non-15-min start time', () => {
  it('PUT attendance with start_time=08:14 returns 400', async () => {
    const res = await handle(authReq(empToken, {
      url: 'https://test.example.com/api/my-day/attendance',
      method: 'PUT',
      body: { work_date: TODAY, start_time: '08:14', finish_time: '17:00' },
    }));
    expect(res.status).toBe(400);
  });
});
