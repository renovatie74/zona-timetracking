/**
 * Sprint 6.1 tests — week labels, simplified dashboard, 30-min increments
 */
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import worker from '../src/worker.js';
import { isoWeekNumber, weekStartFor } from '../src/lib/week.js';
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

async function handle(req) {
  const ctx = createExecutionContext();
  const res = await worker.fetch(req, env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

// ── Test data ─────────────────────────────────────────────────────────────────
let adminToken, empToken;
let adminId, empId, projectId;

const TODAY = new Date().toISOString().slice(0, 10);
const WEEK_START = weekStartFor(TODAY);

beforeAll(async () => {
  for (const sql of ALL_MIGRATIONS) {
    await runMigration(sql);
  }

  // Org settings
  await env.DB.prepare(
    "INSERT OR IGNORE INTO OrgSettings (key, value) VALUES ('timezone', 'UTC')"
  ).run();

  // Admin user
  const adminIns = await env.DB.prepare(
    `INSERT INTO Users (first_name, last_name, email, password_hash, role_id, is_active, employee_number, created_at, updated_at)
     VALUES ('Admin','6.1','admin61@test.com','x',2,1,'A001',datetime('now'),datetime('now'))`
  ).run();
  adminId    = adminIns.meta.last_row_id;
  adminToken = await signJwt({ sub: adminId, role: 'administrator' }, env.JWT_SECRET);

  // Employee user
  const empIns = await env.DB.prepare(
    `INSERT INTO Users (first_name, last_name, email, password_hash, role_id, is_active, employee_number, created_at, updated_at)
     VALUES ('Emp','6.1','emp61@test.com','x',1,1,'E001',datetime('now'),datetime('now'))`
  ).run();
  empId    = empIns.meta.last_row_id;
  empToken = await signJwt({ sub: empId, role: 'employee' }, env.JWT_SECRET);

  // Project + assignment
  const projIns = await env.DB.prepare(
    `INSERT INTO Projects (name, project_code, project_code_seq, is_active, start_date, created_at, updated_at)
     VALUES ('Sprint6.1 Project','S61',61,1,'2025-01-01',datetime('now'),datetime('now'))`
  ).run();
  projectId = projIns.meta.last_row_id;

  await env.DB.prepare(
    `INSERT INTO ProjectAssignments (project_id, user_id, created_at) VALUES (?,?,datetime('now'))`
  ).bind(projectId, empId).run();
});

// ── S6.1-01: isoWeekNumber returns correct week ───────────────────────────────
describe('S6.1-01: isoWeekNumber correctness', () => {
  it('2025-01-01 is week 1 of 2025', () => {
    const { week, year } = isoWeekNumber('2025-01-01');
    expect(week).toBe(1);
    expect(year).toBe(2025);
  });
  it('2024-12-30 is week 1 of 2025', () => {
    const { week, year } = isoWeekNumber('2024-12-30');
    expect(week).toBe(1);
    expect(year).toBe(2025);
  });
  it('2024-07-04 is week 27 of 2024', () => {
    const { week, year } = isoWeekNumber('2024-07-04');
    expect(week).toBe(27);
    expect(year).toBe(2024);
  });
});

// ── S6.1-02: getWeek response includes week_number ────────────────────────────
describe('S6.1-02: getWeek includes week_number in response', () => {
  it('GET /api/my-day/week returns week_number field', async () => {
    const req = authReq(empToken, { url: `https://test.example.com/api/my-day/week?week=${WEEK_START}` });
    const res = await handle(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.data.week_number).toBe('number');
    expect(body.data.week_number).toBeGreaterThan(0);
    expect(body.data.week_number).toBeLessThanOrEqual(53);
  });
});

// ── S6.1-03: dashboard returns hours_today_minutes (new model) ────────────────
describe('S6.1-03: dashboard uses new model (project hour allocations)', () => {
  it('GET /api/dashboard/operations returns hours_today_minutes', async () => {
    const req = authReq(adminToken, { url: 'https://test.example.com/api/dashboard/operations' });
    const res = await handle(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.today).toHaveProperty('hours_today_minutes');
    expect(typeof body.data.today.hours_today_minutes).toBe('number');
  });

  it('dashboard does NOT return live_checkins', async () => {
    const req = authReq(adminToken, { url: 'https://test.example.com/api/dashboard/operations' });
    const res = await handle(req);
    const body = await res.json();
    expect(body.data).not.toHaveProperty('live_checkins');
  });

  it('dashboard does NOT return active_now or checked_out_today', async () => {
    const req = authReq(adminToken, { url: 'https://test.example.com/api/dashboard/operations' });
    const res = await handle(req);
    const body = await res.json();
    expect(body.data.today).not.toHaveProperty('active_now');
    expect(body.data.today).not.toHaveProperty('checked_out_today');
  });
});

// ── S6.1-04: dashboard open_extras does not expose extra_work as active ────────
describe('S6.1-04: dashboard extras subtext hides extra_work as active', () => {
  it('today response has open_legacy not open_extra_work', async () => {
    const req = authReq(adminToken, { url: 'https://test.example.com/api/dashboard/operations' });
    const res = await handle(req);
    const body = await res.json();
    expect(body.data.today).toHaveProperty('open_legacy');
    expect(body.data.today).not.toHaveProperty('open_extra_work');
  });
});

// ── S6.1-05: dashboard no_activity_today uses new model ───────────────────────
describe('S6.1-05: no_activity_today counts employees with no attendance AND no project hours', () => {
  it('returns no_activity_today in today object', async () => {
    const req = authReq(adminToken, { url: 'https://test.example.com/api/dashboard/operations' });
    const res = await handle(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.today).toHaveProperty('no_activity_today');
    expect(typeof body.data.today.no_activity_today).toBe('number');
  });
});

// ── S6.1-06: 30-min increment — valid value accepted ─────────────────────────
describe('S6.1-06: project hours POST accepts 30-minute increments', () => {
  it('30 minutes is accepted (201)', async () => {
    const req = authReq(empToken, {
      url: 'https://test.example.com/api/my-day/project-hours',
      method: 'POST',
      body: { work_date: TODAY, project_id: projectId, hours_minutes: 30 },
    });
    const res = await handle(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.hours_minutes).toBe(30);
  });

  it('90 minutes (1.5h) is accepted (201)', async () => {
    const req = authReq(empToken, {
      url: 'https://test.example.com/api/my-day/project-hours',
      method: 'POST',
      body: { work_date: TODAY, project_id: projectId, hours_minutes: 90 },
    });
    const res = await handle(req);
    expect(res.status).toBe(201);
  });

  it('480 minutes (8h) is accepted (201)', async () => {
    const req = authReq(empToken, {
      url: 'https://test.example.com/api/my-day/project-hours',
      method: 'POST',
      body: { work_date: TODAY, project_id: projectId, hours_minutes: 480 },
    });
    const res = await handle(req);
    expect(res.status).toBe(201);
  });
});

// ── S6.1-07: 30-min increment — invalid values rejected ───────────────────────
describe('S6.1-07: project hours POST rejects non-30-minute values', () => {
  it('45 minutes is rejected (400)', async () => {
    const req = authReq(empToken, {
      url: 'https://test.example.com/api/my-day/project-hours',
      method: 'POST',
      body: { work_date: TODAY, project_id: projectId, hours_minutes: 45 },
    });
    const res = await handle(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/multiple of 30/i);
  });

  it('100 minutes is rejected (400)', async () => {
    const req = authReq(empToken, {
      url: 'https://test.example.com/api/my-day/project-hours',
      method: 'POST',
      body: { work_date: TODAY, project_id: projectId, hours_minutes: 100 },
    });
    const res = await handle(req);
    expect(res.status).toBe(400);
  });

  it('0 minutes is rejected (400)', async () => {
    const req = authReq(empToken, {
      url: 'https://test.example.com/api/my-day/project-hours',
      method: 'POST',
      body: { work_date: TODAY, project_id: projectId, hours_minutes: 0 },
    });
    const res = await handle(req);
    expect(res.status).toBe(400);
  });
});

// ── S6.1-08: allocated hours can differ from attendance (no blocking) ──────────
describe('S6.1-08: allocated hours vs attendance mismatch does not block save', () => {
  it('can save attendance, then save different project hours (no 422)', async () => {
    // Save attendance: 8h
    const attReq = authReq(empToken, {
      url: 'https://test.example.com/api/my-day/attendance',
      method: 'PUT',
      body: { work_date: TODAY, start_time: '08:00', finish_time: '16:00' },
    });
    const attRes = await handle(attReq);
    expect(attRes.status).toBe(200);

    // Save 3h project hours (only 3h allocated vs 8h attendance — variance is fine)
    const phReq = authReq(empToken, {
      url: 'https://test.example.com/api/my-day/project-hours',
      method: 'POST',
      body: { work_date: TODAY, project_id: projectId, hours_minutes: 180 },
    });
    const phRes = await handle(phReq);
    expect(phRes.status).toBe(201);
  });
});

// ── S6.1-09: project weekly-hours returns employee breakdown ──────────────────
describe('S6.1-09: GET /api/projects/:id/weekly-hours returns employee breakdown', () => {
  it('returns employees array with total_minutes', async () => {
    const req = authReq(adminToken, {
      url: `https://test.example.com/api/projects/${projectId}/weekly-hours?week=${WEEK_START}`,
      params: { id: String(projectId) },
    });
    const res = await handle(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveProperty('employees');
    expect(Array.isArray(body.data.employees)).toBe(true);
    // Employee entry should have hours from tests above
    const emp = body.data.employees.find(e => e.user_id === empId);
    expect(emp).toBeTruthy();
    expect(emp.total_minutes).toBeGreaterThan(0);
  });
});

// ── S6.1-10: employee weekly-hours returns project breakdown ──────────────────
describe('S6.1-10: GET /api/employees/:id/weekly-hours returns project breakdown', () => {
  it('returns projects array and attendance summary', async () => {
    const req = authReq(adminToken, {
      url: `https://test.example.com/api/employees/${empId}/weekly-hours?week=${WEEK_START}`,
      params: { id: String(empId) },
    });
    const res = await handle(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveProperty('projects');
    expect(body.data).toHaveProperty('total_attendance_minutes');
    expect(body.data).toHaveProperty('days_present');
    expect(body.data).toHaveProperty('total_allocated_minutes');
    expect(Array.isArray(body.data.projects)).toBe(true);
    const proj = body.data.projects.find(p => p.project_id === projectId);
    expect(proj).toBeTruthy();
    expect(proj.total_minutes).toBeGreaterThan(0);
    expect(proj.project_name).toBeTruthy();
  });
});

// ── S6.1-11: dashboard hours_today_minutes increases with project hour entries ─
describe('S6.1-11: dashboard hours_today_minutes reflects new project hour entries', () => {
  it('hours_today_minutes is > 0 after entries are recorded', async () => {
    const req = authReq(adminToken, { url: 'https://test.example.com/api/dashboard/operations' });
    const res = await handle(req);
    const body = await res.json();
    // We added entries in earlier tests for TODAY
    expect(body.data.today.hours_today_minutes).toBeGreaterThan(0);
  });
});

// ── S6.1-12: PUT project-hours: non-30-min update is rejected ─────────────────
describe('S6.1-12: PUT project-hours rejects non-30-minute updates', () => {
  it('updating to 45 minutes returns 400', async () => {
    // First create a valid entry
    const createReq = authReq(empToken, {
      url: 'https://test.example.com/api/my-day/project-hours',
      method: 'POST',
      body: { work_date: TODAY, project_id: projectId, hours_minutes: 60 },
    });
    const createRes = await handle(createReq);
    expect(createRes.status).toBe(201);
    const { data: entry } = await createRes.json();

    // Try to update to 45 (invalid)
    const updateReq = authReq(empToken, {
      url: `https://test.example.com/api/my-day/project-hours/${entry.id}`,
      method: 'PUT',
      params: { id: String(entry.id) },
      body: { hours_minutes: 45 },
    });
    const updateRes = await handle(updateReq);
    expect(updateRes.status).toBe(400);
    const body = await updateRes.json();
    expect(body.error).toMatch(/multiple of 30/i);
  });
});
