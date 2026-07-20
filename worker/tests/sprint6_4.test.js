/**
 * Sprint 6.4 tests — Employee and Project Timesheet Matrix endpoints
 */
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import worker from '../src/worker.js';
import { weekStartFor } from '../src/lib/week.js';
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
const ALL_MIGRATIONS = [m01,m02,m03,m04,m05,m06,m07,m08,m09,m10,m11,m12,m13,m14,m15,m16,m17,m18,m19,m20,m21,m22,m23,m24,m25];

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

let adminToken, empToken;
let adminId, empId, projectId, project2Id;

// Use a fixed Monday as anchor for predictable week math
const ANCHOR_WEEK = '2026-06-01'; // Mon 2026-06-01 (W23)
const WEEK2       = '2026-06-08'; // Mon W24
const WEEK3       = '2026-06-15'; // Mon W25

beforeAll(async () => {
  for (const sql of ALL_MIGRATIONS) await runMigration(sql);

  await env.DB.prepare(
    "INSERT OR IGNORE INTO OrgSettings (key, value) VALUES ('timezone', 'UTC')"
  ).run();

  const aIns = await env.DB.prepare(
    `INSERT INTO Users (first_name, last_name, email, password_hash, role_id, is_active, employee_number, created_at, updated_at)
     VALUES ('Admin','64','admin64@test.com','x',3,1,'A064',datetime('now'),datetime('now'))`
  ).run();
  adminId    = aIns.meta.last_row_id;
  adminToken = await signJwt({ sub: adminId, role: 'administrator' }, env.JWT_SECRET);

  const eIns = await env.DB.prepare(
    `INSERT INTO Users (first_name, last_name, email, password_hash, role_id, is_active, employee_number, created_at, updated_at)
     VALUES ('Alice','Smith','alice64@test.com','x',1,1,'E064',datetime('now'),datetime('now'))`
  ).run();
  empId    = eIns.meta.last_row_id;
  empToken = await signJwt({ sub: empId, role: 'employee' }, env.JWT_SECRET);

  const pIns = await env.DB.prepare(
    `INSERT INTO Projects (name, project_code, project_code_seq, status, start_date, is_active, created_at, updated_at)
     VALUES ('Alpha','ZP-ALPHA',1,'active','2026-01-01',1,datetime('now'),datetime('now'))`
  ).run();
  projectId = pIns.meta.last_row_id;

  const p2Ins = await env.DB.prepare(
    `INSERT INTO Projects (name, project_code, project_code_seq, status, start_date, is_active, created_at, updated_at)
     VALUES ('Beta','ZP-BETA',2,'active','2026-01-01',1,datetime('now'),datetime('now'))`
  ).run();
  project2Id = p2Ins.meta.last_row_id;

  // Insert hours: empId on projectId (ANCHOR_WEEK Mon+Tue = 8+7.5h) and on project2Id (ANCHOR_WEEK Wed = 4h)
  // Also WEEK2 Mon = 6h on projectId
  await env.DB.prepare(
    `INSERT INTO ProjectHourEntries (user_id, project_id, work_date, hours_minutes, is_deleted, created_at, updated_at)
     VALUES (?,?,?,?,0,datetime('now'),datetime('now'))`
  ).bind(empId, projectId, ANCHOR_WEEK, 480).run();              // 8h Mon W23
  await env.DB.prepare(
    `INSERT INTO ProjectHourEntries (user_id, project_id, work_date, hours_minutes, is_deleted, created_at, updated_at)
     VALUES (?,?,?,?,0,datetime('now'),datetime('now'))`
  ).bind(empId, projectId, '2026-06-02', 450).run();             // 7.5h Tue W23
  await env.DB.prepare(
    `INSERT INTO ProjectHourEntries (user_id, project_id, work_date, hours_minutes, is_deleted, created_at, updated_at)
     VALUES (?,?,?,?,0,datetime('now'),datetime('now'))`
  ).bind(empId, project2Id, '2026-06-03', 240).run();            // 4h Wed W23 project2
  await env.DB.prepare(
    `INSERT INTO ProjectHourEntries (user_id, project_id, work_date, hours_minutes, is_deleted, created_at, updated_at)
     VALUES (?,?,?,?,0,datetime('now'),datetime('now'))`
  ).bind(empId, projectId, WEEK2, 360).run();                    // 6h Mon W24

  // Deleted entry — must be excluded
  await env.DB.prepare(
    `INSERT INTO ProjectHourEntries (user_id, project_id, work_date, hours_minutes, is_deleted, created_at, updated_at)
     VALUES (?,?,?,?,1,datetime('now'),datetime('now'))`
  ).bind(empId, projectId, '2026-06-04', 120).run();
});

// ── Employee matrix ────────────────────────────────────────────────────────────

describe('GET /api/employees/:id/timesheet-matrix', () => {
  it('T1 — returns correct shape and week metadata', async () => {
    const res  = await handle(authReq(adminToken, { url: `https://t.t/api/employees/${empId}/timesheet-matrix?weeks=2&end_week_start=${WEEK2}` }));
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.employee.id).toBe(empId);
    expect(data.employee.employee_code).toBe('E064');
    expect(data.weeks).toHaveLength(2);
    expect(data.weeks[0].week_start).toBe(ANCHOR_WEEK);
    expect(data.weeks[1].week_start).toBe(WEEK2);
    expect(data.weeks[0].week_number).toBe(23);
    expect(data.weeks[1].week_number).toBe(24);
  });

  it('T2 — aggregates hours by project and week correctly', async () => {
    const res  = await handle(authReq(adminToken, { url: `https://t.t/api/employees/${empId}/timesheet-matrix?weeks=2&end_week_start=${WEEK2}` }));
    const { data } = await res.json();
    const alpha = data.rows.find(r => r.project_code === 'ZP-ALPHA');
    expect(alpha).toBeTruthy();
    // W23: 480+450 = 930 min = 15.5h
    expect(alpha.weekly_hours[ANCHOR_WEEK]).toBe(15.5);
    // W24: 360 min = 6h
    expect(alpha.weekly_hours[WEEK2]).toBe(6);
    expect(alpha.total_hours).toBe(21.5);
  });

  it('T3 — second project row shows W23 hours, absent W24', async () => {
    const res  = await handle(authReq(adminToken, { url: `https://t.t/api/employees/${empId}/timesheet-matrix?weeks=2&end_week_start=${WEEK2}` }));
    const { data } = await res.json();
    const beta = data.rows.find(r => r.project_code === 'ZP-BETA');
    expect(beta).toBeTruthy();
    expect(beta.weekly_hours[ANCHOR_WEEK]).toBe(4);
    expect(beta.weekly_hours[WEEK2]).toBeUndefined();
    expect(beta.total_hours).toBe(4);
  });

  it('T4 — totals_by_week and grand_total_hours are correct', async () => {
    const res  = await handle(authReq(adminToken, { url: `https://t.t/api/employees/${empId}/timesheet-matrix?weeks=2&end_week_start=${WEEK2}` }));
    const { data } = await res.json();
    // W23: 15.5 + 4 = 19.5h; W24: 6h
    expect(data.totals_by_week[ANCHOR_WEEK]).toBe(19.5);
    expect(data.totals_by_week[WEEK2]).toBe(6);
    expect(data.grand_total_hours).toBe(25.5);
  });

  it('T5 — deleted entries are excluded', async () => {
    // Thu 2026-06-04 W23 has a deleted 2h entry; totals should not include it
    const res  = await handle(authReq(adminToken, { url: `https://t.t/api/employees/${empId}/timesheet-matrix?weeks=1&end_week_start=${ANCHOR_WEEK}` }));
    const { data } = await res.json();
    const alpha = data.rows.find(r => r.project_code === 'ZP-ALPHA');
    // Only 480+450 = 930 min = 15.5h, deleted 120 min not counted
    expect(alpha.weekly_hours[ANCHOR_WEEK]).toBe(15.5);
  });

  it('T6 — employee role is rejected (403)', async () => {
    const res = await handle(authReq(empToken, { url: `https://t.t/api/employees/${empId}/timesheet-matrix?weeks=2&end_week_start=${WEEK2}` }));
    expect(res.status).toBe(403);
  });

  it('T7 — unknown employee returns 404', async () => {
    const res = await handle(authReq(adminToken, { url: `https://t.t/api/employees/99999/timesheet-matrix?weeks=2&end_week_start=${WEEK2}` }));
    expect(res.status).toBe(404);
  });
});

// ── Project matrix ─────────────────────────────────────────────────────────────

describe('GET /api/projects/:id/timesheet-matrix', () => {
  it('T8 — returns correct shape and employee rows', async () => {
    const res  = await handle(authReq(adminToken, { url: `https://t.t/api/projects/${projectId}/timesheet-matrix?weeks=2&end_week_start=${WEEK2}` }));
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.project.project_code).toBe('ZP-ALPHA');
    expect(data.weeks).toHaveLength(2);
    expect(data.rows).toHaveLength(1);
    const row = data.rows[0];
    expect(row.employee_name).toBe('Alice Smith');
    expect(row.weekly_hours[ANCHOR_WEEK]).toBe(15.5);
    expect(row.weekly_hours[WEEK2]).toBe(6);
    expect(row.total_hours).toBe(21.5);
  });

  it('T9 — totals_by_week and grand_total_hours match', async () => {
    const res  = await handle(authReq(adminToken, { url: `https://t.t/api/projects/${projectId}/timesheet-matrix?weeks=2&end_week_start=${WEEK2}` }));
    const { data } = await res.json();
    expect(data.totals_by_week[ANCHOR_WEEK]).toBe(15.5);
    expect(data.totals_by_week[WEEK2]).toBe(6);
    expect(data.grand_total_hours).toBe(21.5);
  });

  it('T10 — period with no hours returns empty rows array', async () => {
    const res  = await handle(authReq(adminToken, { url: `https://t.t/api/projects/${projectId}/timesheet-matrix?weeks=1&end_week_start=${WEEK3}` }));
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.rows).toHaveLength(0);
    expect(data.grand_total_hours).toBe(0);
  });
});
