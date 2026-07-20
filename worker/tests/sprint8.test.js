/**
 * Sprint 8 tests — exception drill-down pages
 *
 * DB-01  GET /api/dashboard/missing-timesheets returns employees with no hours or attendance
 * DB-02  Employee WITH project hours is NOT in missing list
 * DB-03  Employee WITH attendance is NOT in missing list
 * DB-04  Inactive employee is excluded from missing list
 * DB-05  Missing count matches dashboard notSubmitted metric
 * DB-06  not_submitted_weekly alert link contains week_start param
 * DB-07  waiting_review alert link points to waiting_for_manager filter
 * DB-08  stale_extras alert link contains older_than_days=3
 * DB-09  GET /api/extras with older_than_days=1 excludes recent entries
 * DB-10  GET /api/extras older_than_days filters to entries older than N days
 * DB-11  Non-admin gets 403 on missing-timesheets endpoint
 */
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import worker from '../src/worker.js';
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
import m25 from '../migrations/0025_extras_workflow.sql?raw';

const ALL_MIGRATIONS = [
  m01,m02,m03,m04,m05,m06,m07,m08,m09,m10,
  m11,m12,m13,m14,m15,m16,m17,m18,m19,m20,
  m21,m22,m23,m24,m25,
];

async function runMigration(sql) {
  const stmts = sql.replace(/--[^\n]*/g, '').split(';').map(s => s.trim()).filter(s => s.length > 0);
  for (const stmt of stmts) await env.DB.prepare(stmt).run();
}

function authReq(token, { url, method = 'GET', body = null } = {}) {
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

const WEEK = '2026-07-07'; // Monday of test week
const WEEK_END = '2026-07-13';

let adminToken, empToken;
let adminId;
// employees: empMissing = no hours, empHours = has project hours, empAttendance = has attendance, empInactive = inactive
let empMissingId, empHoursId, empAttendanceId, empInactiveId;
let projectId;

beforeAll(async () => {
  for (const sql of ALL_MIGRATIONS) await runMigration(sql);

  await env.DB.prepare(
    "INSERT OR IGNORE INTO OrgSettings (key, value) VALUES ('timezone', 'UTC')"
  ).run();

  // Admin user
  const aIns = await env.DB.prepare(
    `INSERT INTO Users (first_name, last_name, email, password_hash, role_id, is_active, employee_number, created_at, updated_at)
     VALUES ('Admin','S8','admins8@test.com','x',2,1,'AS08',datetime('now'),datetime('now'))`
  ).run();
  adminId    = aIns.meta.last_row_id;
  adminToken = await signJwt({ sub: adminId, role: 'administrator' }, env.JWT_SECRET);

  // Employee 1: missing (no hours, no attendance)
  const e1 = await env.DB.prepare(
    `INSERT INTO Users (first_name, last_name, email, password_hash, role_id, is_active, employee_number, created_at, updated_at)
     VALUES ('Missing','EmpS8','missing8@test.com','x',1,1,'MS08',datetime('now'),datetime('now'))`
  ).run();
  empMissingId = e1.meta.last_row_id;

  // Employee 2: has project hours for the week
  const e2 = await env.DB.prepare(
    `INSERT INTO Users (first_name, last_name, email, password_hash, role_id, is_active, employee_number, created_at, updated_at)
     VALUES ('Hours','EmpS8','hours8@test.com','x',1,1,'HS08',datetime('now'),datetime('now'))`
  ).run();
  empHoursId = e2.meta.last_row_id;

  // Employee 3: has attendance for the week
  const e3 = await env.DB.prepare(
    `INSERT INTO Users (first_name, last_name, email, password_hash, role_id, is_active, employee_number, created_at, updated_at)
     VALUES ('Attend','EmpS8','attend8@test.com','x',1,1,'AT08',datetime('now'),datetime('now'))`
  ).run();
  empAttendanceId = e3.meta.last_row_id;

  // Employee 4: inactive
  const e4 = await env.DB.prepare(
    `INSERT INTO Users (first_name, last_name, email, password_hash, role_id, is_active, employee_number, created_at, updated_at)
     VALUES ('Inactive','EmpS8','inactive8@test.com','x',1,0,'IN08',datetime('now'),datetime('now'))`
  ).run();
  empInactiveId = e4.meta.last_row_id;

  empToken = await signJwt({ sub: empMissingId, role: 'employee' }, env.JWT_SECRET);

  // Project for project hours
  const pIns = await env.DB.prepare(
    `INSERT INTO Projects (name, project_code, project_code_seq, status, start_date, is_active, created_at, updated_at)
     VALUES ('S8 Project','S8P',1,'active','2024-01-01',1,datetime('now'),datetime('now'))`
  ).run();
  projectId = pIns.meta.last_row_id;

  // ProjectHourEntry for empHours within the test week
  await env.DB.prepare(
    `INSERT INTO ProjectHourEntries (user_id, project_id, work_date, hours_minutes, created_by, is_deleted, created_at, updated_at)
     VALUES (?, ?, ?, 480, ?, 0, datetime('now'), datetime('now'))`
  ).bind(empHoursId, projectId, WEEK, empHoursId).run();

  // DailyAttendance for empAttendance within the test week
  await env.DB.prepare(
    `INSERT INTO DailyAttendance (user_id, work_date, start_time, finish_time, is_deleted, created_at, updated_at)
     VALUES (?, ?, '08:00', '16:00', 0, datetime('now'), datetime('now'))`
  ).bind(empAttendanceId, WEEK).run();
});

describe('Sprint 8 — Exception drill-down pages', () => {

  it('DB-01: GET missing-timesheets returns employees with no submissions', async () => {
    const res = await handle(authReq(adminToken, {
      url: `https://test.example.com/api/dashboard/missing-timesheets?week_start=${WEEK}`,
    }));
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.week_start).toBe(WEEK);
    expect(data.week_end).toBe(WEEK_END);
    const ids = data.employees.map(e => e.id);
    expect(ids).toContain(empMissingId);
  });

  it('DB-02: employee WITH project hours is NOT in missing list', async () => {
    const res = await handle(authReq(adminToken, {
      url: `https://test.example.com/api/dashboard/missing-timesheets?week_start=${WEEK}`,
    }));
    const { data } = await res.json();
    const ids = data.employees.map(e => e.id);
    expect(ids).not.toContain(empHoursId);
  });

  it('DB-03: employee WITH attendance is NOT in missing list', async () => {
    const res = await handle(authReq(adminToken, {
      url: `https://test.example.com/api/dashboard/missing-timesheets?week_start=${WEEK}`,
    }));
    const { data } = await res.json();
    const ids = data.employees.map(e => e.id);
    expect(ids).not.toContain(empAttendanceId);
  });

  it('DB-04: inactive employee is excluded from missing list', async () => {
    const res = await handle(authReq(adminToken, {
      url: `https://test.example.com/api/dashboard/missing-timesheets?week_start=${WEEK}`,
    }));
    const { data } = await res.json();
    const ids = data.employees.map(e => e.id);
    expect(ids).not.toContain(empInactiveId);
  });

  it('DB-05: missing count matches dashboard notSubmitted metric', async () => {
    const [missingRes, dashRes] = await Promise.all([
      handle(authReq(adminToken, {
        url: `https://test.example.com/api/dashboard/missing-timesheets?week_start=${WEEK}`,
      })),
      handle(authReq(adminToken, {
        url: `https://test.example.com/api/dashboard/operations?week_start=${WEEK}`,
      })),
    ]);

    const { data: missingData } = await missingRes.json();
    const { data: dashData }    = await dashRes.json();

    const notSubmitted = dashData.week.total_active_employees - dashData.week.employees_submitted;
    expect(missingData.employees.length).toBe(notSubmitted);
  });

  it('DB-06: not_submitted_weekly alert link contains week_start', async () => {
    const res = await handle(authReq(adminToken, {
      url: `https://test.example.com/api/dashboard/operations?week_start=${WEEK}`,
    }));
    const { data } = await res.json();
    const alert = data.alerts.find(a => a.type === 'not_submitted_weekly');
    expect(alert).toBeTruthy();
    expect(alert.link).toContain('/dashboard/missing-timesheets');
    expect(alert.link).toContain(`week_start=${WEEK}`);
  });

  it('DB-07: waiting_review alert link points to waiting_for_manager filter', async () => {
    // Create a waiting_for_manager extra to trigger the alert
    await env.DB.prepare(
      `INSERT INTO Extras (user_id, project_id, type, description, status, is_deleted, created_by, created_at, updated_at)
       VALUES (?, ?, 'own_cost', 'test extra', 'waiting_for_manager', 0, ?, datetime('now'), datetime('now'))`
    ).bind(empMissingId, projectId, empMissingId).run();

    const res = await handle(authReq(adminToken, {
      url: `https://test.example.com/api/dashboard/operations?week_start=${WEEK}`,
    }));
    const { data } = await res.json();
    const alert = data.alerts.find(a => a.type === 'waiting_review');
    expect(alert).toBeTruthy();
    expect(alert.link).toContain('waiting_for_manager');
  });

  it('DB-08: stale_extras alert link contains older_than_days=3', async () => {
    // Create an open extra older than 3 days
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 4);
    await env.DB.prepare(
      `INSERT INTO Extras (user_id, project_id, type, description, status, is_deleted, created_by, created_at, updated_at)
       VALUES (?, ?, 'own_cost', 'stale extra', 'open', 0, ?, ?, datetime('now'))`
    ).bind(empMissingId, projectId, empMissingId, oldDate.toISOString()).run();

    const res = await handle(authReq(adminToken, {
      url: `https://test.example.com/api/dashboard/operations?week_start=${WEEK}`,
    }));
    const { data } = await res.json();
    const alert = data.alerts.find(a => a.type === 'stale_extras');
    expect(alert).toBeTruthy();
    expect(alert.link).toContain('older_than_days=3');
    expect(alert.link).toContain('status=open');
  });

  it('DB-09: GET /api/extras with older_than_days=1 excludes entries created today', async () => {
    // Create a fresh extra (today)
    await env.DB.prepare(
      `INSERT INTO Extras (user_id, project_id, type, description, status, is_deleted, created_by, created_at, updated_at)
       VALUES (?, ?, 'own_cost', 'fresh extra today', 'open', 0, ?, datetime('now'), datetime('now'))`
    ).bind(empMissingId, projectId, empMissingId).run();

    const res = await handle(authReq(adminToken, {
      url: `https://test.example.com/api/extras?status=open&older_than_days=1`,
    }));
    expect(res.status).toBe(200);
    const { data } = await res.json();
    const fresh = data.filter(e => e.description === 'fresh extra today');
    expect(fresh.length).toBe(0);
  });

  it('DB-10: GET /api/extras older_than_days filters to entries older than N days', async () => {
    const res = await handle(authReq(adminToken, {
      url: `https://test.example.com/api/extras?status=open&older_than_days=3`,
    }));
    expect(res.status).toBe(200);
    const { data } = await res.json();
    // The stale extra (created 4 days ago) should appear
    const stale = data.filter(e => e.description === 'stale extra');
    expect(stale.length).toBeGreaterThan(0);
    // The fresh extra (today) should NOT appear
    const fresh = data.filter(e => e.description === 'fresh extra today');
    expect(fresh.length).toBe(0);
  });

  it('DB-11: non-admin gets 403 on missing-timesheets endpoint', async () => {
    const res = await handle(authReq(empToken, {
      url: `https://test.example.com/api/dashboard/missing-timesheets?week_start=${WEEK}`,
    }));
    expect(res.status).toBe(403);
  });

});
