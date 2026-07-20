/**
 * Sprint 9 tests — Business Data Export
 *
 * EX-01  Admin POST /export returns 200 with metadata
 * EX-02  Manager POST /export returns 403
 * EX-03  Employee POST /export returns 403
 * EX-04  Admin GET /export/xlsx returns valid XLSX (ZIP magic bytes)
 * EX-05  Admin GET /export/csv returns valid ZIP (ZIP magic bytes)
 * EX-06  this_week period resolves to Mon–Sun dates
 * EX-07  Custom dates: date_from after date_to returns 400
 * EX-08  Invalid date format returns 400
 * EX-09  Audit log entry created after generate
 * EX-10  Non-admin cannot download xlsx or csv
 * EX-11  Summary sheet contains Open Extras and Processed Extras rows
 * EX-12  Attendance sheet has Day column header
 * EX-13  Project Hours sheet has Client column header
 * EX-14  Extras sheet uses business-friendly labels (Own Cost, not own_cost)
 * EX-15  Employee Weekly Summary has Attendance Hours and Difference columns
 * EX-16  Project Weekly Summary has Employees column
 * EX-17  Employee Timesheet Matrix (sheet11) contains employee name and "Weekly Total"
 * EX-18  Project Timesheet Matrix (sheet12) contains project name and employee name
 * EX-19  Weekly Reconciliation (sheet13) has correct column headers
 * EX-20  Weekly Reconciliation shows "Mismatch" when attendance ≠ project hours
 * EX-21  Weekly Reconciliation shows "OK" when attendance = project hours
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
  const stmts = sql.replace(/--[^\n]*/g, '').split(';').map(s => s.trim()).filter(Boolean);
  for (const stmt of stmts) await env.DB.prepare(stmt).run();
}

function authReq(token, { url, method = 'GET', body = null } = {}) {
  const init = {
    method,
    headers: { Cookie: `jwt=${token}`, 'Content-Type': 'application/json' },
  };
  if (body !== null) init.body = JSON.stringify(body);
  const req = new Request(url, init);
  if (body !== null) req.json = async () => body;
  return req;
}

async function handle(req) {
  const ctx = createExecutionContext();
  const res = await worker.fetch(req, env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

// Extract an uncompressed file from a STORE-method ZIP (as used by the XLSX builder)
function extractFileFromZip(zipBytes, targetFilename) {
  const view = new Uint8Array(zipBytes);
  const dec  = new TextDecoder('utf-8');
  let i = 0;
  while (i < view.length - 30) {
    if (view[i] === 0x50 && view[i+1] === 0x4B && view[i+2] === 0x03 && view[i+3] === 0x04) {
      const method    = view[i+8]  | (view[i+9]  << 8);
      const compSize  = view[i+18] | (view[i+19] << 8) | (view[i+20] << 16) | (view[i+21] << 24);
      const fnLen     = view[i+26] | (view[i+27] << 8);
      const extraLen  = view[i+28] | (view[i+29] << 8);
      const fn        = dec.decode(view.slice(i + 30, i + 30 + fnLen));
      const dataStart = i + 30 + fnLen + extraLen;
      if (fn === targetFilename && method === 0) {
        return dec.decode(view.slice(dataStart, dataStart + compSize));
      }
      i = dataStart + compSize;
    } else {
      i++;
    }
  }
  return null;
}

const BASE      = 'https://test.example.com';
const DATE_FROM = '2026-07-01';
const DATE_TO   = '2026-07-31';

let adminToken, mgrToken, empToken;
let adminId, mgrId, empId;

beforeAll(async () => {
  for (const sql of ALL_MIGRATIONS) await runMigration(sql);

  await env.DB.prepare(
    "INSERT OR IGNORE INTO OrgSettings (key, value) VALUES ('timezone', 'UTC')"
  ).run();

  const a = await env.DB.prepare(
    `INSERT INTO Users (first_name,last_name,email,password_hash,role_id,is_active,employee_number,created_at,updated_at)
     VALUES ('Admin','S9','admins9@test.com','x',2,1,'AS09',datetime('now'),datetime('now'))`
  ).run();
  adminId    = a.meta.last_row_id;
  adminToken = await signJwt({ sub: adminId, role: 'administrator' }, env.JWT_SECRET);

  const m = await env.DB.prepare(
    `INSERT INTO Users (first_name,last_name,email,password_hash,role_id,is_active,employee_number,created_at,updated_at)
     VALUES ('Mgr','S9','mgrs9@test.com','x',3,1,'MS09',datetime('now'),datetime('now'))`
  ).run();
  mgrId    = m.meta.last_row_id;
  mgrToken = await signJwt({ sub: mgrId, role: 'manager' }, env.JWT_SECRET);

  const e = await env.DB.prepare(
    `INSERT INTO Users (first_name,last_name,email,password_hash,role_id,is_active,employee_number,created_at,updated_at)
     VALUES ('Emp','S9','emps9@test.com','x',1,1,'ES09',datetime('now'),datetime('now'))`
  ).run();
  empId    = e.meta.last_row_id;
  empToken = await signJwt({ sub: empId, role: 'employee' }, env.JWT_SECRET);

  // Test data for content-verification tests (EX-11 through EX-16)
  const proj = await env.DB.prepare(
    `INSERT INTO Projects (name,project_code,project_code_seq,status,start_date,is_active,created_at,updated_at)
     VALUES ('Acme Build','AB9',1,'active','2024-01-01',1,datetime('now'),datetime('now'))`
  ).run();
  const projectId = proj.meta.last_row_id;

  // Project hours within the export period (2026-07-07 = Tuesday)
  await env.DB.prepare(
    `INSERT INTO ProjectHourEntries (user_id,project_id,work_date,hours_minutes,is_deleted,created_by,created_at,updated_at)
     VALUES (?,?,?,480,0,?,datetime('now'),datetime('now'))`
  ).bind(empId, projectId, '2026-07-07', adminId).run();

  // Attendance for the same day (510 min = 8h 30m)
  await env.DB.prepare(
    `INSERT INTO DailyAttendance (user_id,work_date,start_time,finish_time,duration_minutes,is_deleted,created_at,updated_at)
     VALUES (?,?,'08:00','16:30',510,0,datetime('now'),datetime('now'))`
  ).bind(empId, '2026-07-07').run();

  // own_cost extra within the period — tests friendly-label conversion
  await env.DB.prepare(
    `INSERT INTO Extras (user_id,project_id,type,description,status,is_deleted,created_by,created_at,updated_at)
     VALUES (?,?,'own_cost','Test fuel reimbursement','open',0,?,?,datetime('now'))`
  ).bind(empId, projectId, adminId, '2026-07-07T12:00:00.000Z').run();

  // Second employee with matching attendance and project hours → "OK" row for EX-21
  const e2 = await env.DB.prepare(
    `INSERT INTO Users (first_name,last_name,email,password_hash,role_id,is_active,employee_number,created_at,updated_at)
     VALUES ('Emp2','S9','emps92@test.com','x',1,1,'ES092',datetime('now'),datetime('now'))`
  ).run();
  const emp2Id = e2.meta.last_row_id;
  // Project hours: 480 min
  await env.DB.prepare(
    `INSERT INTO ProjectHourEntries (user_id,project_id,work_date,hours_minutes,is_deleted,created_by,created_at,updated_at)
     VALUES (?,?,?,480,0,?,datetime('now'),datetime('now'))`
  ).bind(emp2Id, projectId, '2026-07-07', adminId).run();
  // Attendance: 480 min (matches exactly → OK)
  await env.DB.prepare(
    `INSERT INTO DailyAttendance (user_id,work_date,start_time,finish_time,duration_minutes,is_deleted,created_at,updated_at)
     VALUES (?,?,'08:00','16:00',480,0,datetime('now'),datetime('now'))`
  ).bind(emp2Id, '2026-07-07').run();
});

describe('Sprint 9 — Business Data Export', () => {

  it('EX-01: admin POST /export returns 200 with metadata', async () => {
    const res = await handle(authReq(adminToken, {
      url:    `${BASE}/api/admin-console/export`,
      method: 'POST',
      body:   { period: 'custom', date_from: DATE_FROM, date_to: DATE_TO },
    }));
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.date_from).toBe(DATE_FROM);
    expect(data.date_to).toBe(DATE_TO);
    expect(data.generated_at).toBeTruthy();
    expect(data.status).toBe('ready');
  });

  it('EX-02: manager POST /export returns 403', async () => {
    const res = await handle(authReq(mgrToken, {
      url:    `${BASE}/api/admin-console/export`,
      method: 'POST',
      body:   { period: 'custom', date_from: DATE_FROM, date_to: DATE_TO },
    }));
    expect(res.status).toBe(403);
  });

  it('EX-03: employee POST /export returns 403', async () => {
    const res = await handle(authReq(empToken, {
      url:    `${BASE}/api/admin-console/export`,
      method: 'POST',
      body:   { period: 'custom', date_from: DATE_FROM, date_to: DATE_TO },
    }));
    expect(res.status).toBe(403);
  });

  it('EX-04: admin GET /export/xlsx returns valid XLSX (ZIP magic bytes)', async () => {
    const res = await handle(authReq(adminToken, {
      url: `${BASE}/api/admin-console/export/xlsx?date_from=${DATE_FROM}&date_to=${DATE_TO}`,
    }));
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('spreadsheetml');
    const buf  = await res.arrayBuffer();
    const view = new Uint8Array(buf);
    expect(view[0]).toBe(0x50); // P
    expect(view[1]).toBe(0x4B); // K
    expect(view[2]).toBe(0x03);
    expect(view[3]).toBe(0x04);
    expect(buf.byteLength).toBeGreaterThan(2000);
  });

  it('EX-05: admin GET /export/csv returns valid ZIP (ZIP magic bytes)', async () => {
    const res = await handle(authReq(adminToken, {
      url: `${BASE}/api/admin-console/export/csv?date_from=${DATE_FROM}&date_to=${DATE_TO}`,
    }));
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('zip');
    const buf  = await res.arrayBuffer();
    const view = new Uint8Array(buf);
    expect(view[0]).toBe(0x50);
    expect(view[1]).toBe(0x4B);
    expect(view[2]).toBe(0x03);
    expect(view[3]).toBe(0x04);
    expect(buf.byteLength).toBeGreaterThan(500);
  });

  it('EX-06: this_week period resolves to Mon–Sun (7-day span)', async () => {
    const res = await handle(authReq(adminToken, {
      url:    `${BASE}/api/admin-console/export`,
      method: 'POST',
      body:   { period: 'this_week' },
    }));
    expect(res.status).toBe(200);
    const { data } = await res.json();
    const from = new Date(data.date_from + 'T00:00:00Z');
    expect(from.getUTCDay()).toBe(1); // Monday
    const span = (new Date(data.date_to + 'T00:00:00Z') - from) / 86400000;
    expect(span).toBe(6);
  });

  it('EX-07: custom dates with date_from after date_to returns 400', async () => {
    const res = await handle(authReq(adminToken, {
      url:    `${BASE}/api/admin-console/export`,
      method: 'POST',
      body:   { period: 'custom', date_from: '2026-07-31', date_to: '2026-07-01' },
    }));
    expect(res.status).toBe(400);
    const { error } = await res.json();
    expect(error).toMatch(/date_from/i);
  });

  it('EX-08: invalid date format returns 400 on POST', async () => {
    const res = await handle(authReq(adminToken, {
      url:    `${BASE}/api/admin-console/export`,
      method: 'POST',
      body:   { period: 'custom', date_from: 'not-a-date', date_to: DATE_TO },
    }));
    expect(res.status).toBe(400);
  });

  it('EX-09: audit log entry created after generate export', async () => {
    await handle(authReq(adminToken, {
      url:    `${BASE}/api/admin-console/export`,
      method: 'POST',
      body:   { period: 'custom', date_from: DATE_FROM, date_to: DATE_TO },
    }));
    const row = await env.DB.prepare(
      `SELECT * FROM AuditLog WHERE action='data_export_generated' AND actor_id=? ORDER BY created_at DESC LIMIT 1`
    ).bind(adminId).first();
    expect(row).toBeTruthy();
    expect(row.entity_type).toBe('export');
    const nv = JSON.parse(row.new_values);
    expect(nv.date_from).toBe(DATE_FROM);
    expect(nv.date_to).toBe(DATE_TO);
    expect(nv.formats).toContain('xlsx');
    expect(nv.formats).toContain('csv');
  });

  it('EX-10: non-admin cannot download xlsx or csv', async () => {
    const [xlsxRes, csvRes] = await Promise.all([
      handle(authReq(empToken, {
        url: `${BASE}/api/admin-console/export/xlsx?date_from=${DATE_FROM}&date_to=${DATE_TO}`,
      })),
      handle(authReq(empToken, {
        url: `${BASE}/api/admin-console/export/csv?date_from=${DATE_FROM}&date_to=${DATE_TO}`,
      })),
    ]);
    expect(xlsxRes.status).toBe(403);
    expect(csvRes.status).toBe(403);
  });

  it('EX-11: Summary sheet contains Open Extras and Processed Extras rows', async () => {
    const res = await handle(authReq(adminToken, {
      url: `${BASE}/api/admin-console/export/xlsx?date_from=${DATE_FROM}&date_to=${DATE_TO}`,
    }));
    const buf = await res.arrayBuffer();
    const xml = extractFileFromZip(new Uint8Array(buf), 'xl/worksheets/sheet1.xml');
    expect(xml).not.toBeNull();
    expect(xml).toContain('Open Extras');
    expect(xml).toContain('Processed Extras');
    expect(xml).toContain('Export Version');
  });

  it('EX-12: Attendance sheet has Day column header and day abbreviation in data', async () => {
    const res = await handle(authReq(adminToken, {
      url: `${BASE}/api/admin-console/export/xlsx?date_from=${DATE_FROM}&date_to=${DATE_TO}`,
    }));
    const buf = await res.arrayBuffer();
    // sheet5.xml = Attendance (5th sheet: Summary, Employees, Projects, Clients, Attendance)
    const xml = extractFileFromZip(new Uint8Array(buf), 'xl/worksheets/sheet5.xml');
    expect(xml).not.toBeNull();
    expect(xml).toContain('<t>Day</t>');
    // 2026-07-07 is a Tuesday
    expect(xml).toContain('<t>Tue</t>');
  });

  it('EX-13: Project Hours sheet has Client column header', async () => {
    const res = await handle(authReq(adminToken, {
      url: `${BASE}/api/admin-console/export/xlsx?date_from=${DATE_FROM}&date_to=${DATE_TO}`,
    }));
    const buf = await res.arrayBuffer();
    // sheet6.xml = Project Hours
    const xml = extractFileFromZip(new Uint8Array(buf), 'xl/worksheets/sheet6.xml');
    expect(xml).not.toBeNull();
    expect(xml).toContain('<t>Client</t>');
  });

  it('EX-14: Extras sheet uses business-friendly type and status labels', async () => {
    const res = await handle(authReq(adminToken, {
      url: `${BASE}/api/admin-console/export/xlsx?date_from=${DATE_FROM}&date_to=${DATE_TO}`,
    }));
    const buf = await res.arrayBuffer();
    // sheet7.xml = Extras
    const xml = extractFileFromZip(new Uint8Array(buf), 'xl/worksheets/sheet7.xml');
    expect(xml).not.toBeNull();
    expect(xml).toContain('Own Cost');           // friendly label for own_cost
    expect(xml).not.toContain('<t>own_cost</t>'); // raw DB value must not appear
    expect(xml).toContain('<t>Open</t>');         // friendly label for open status
  });

  it('EX-15: Employee Weekly Summary has new operational columns', async () => {
    const res = await handle(authReq(adminToken, {
      url: `${BASE}/api/admin-console/export/xlsx?date_from=${DATE_FROM}&date_to=${DATE_TO}`,
    }));
    const buf = await res.arrayBuffer();
    // sheet9.xml = Employee Weekly Summary
    const xml = extractFileFromZip(new Uint8Array(buf), 'xl/worksheets/sheet9.xml');
    expect(xml).not.toBeNull();
    expect(xml).toContain('Attendance Hours');
    expect(xml).toContain('Allocated Project Hours');
    expect(xml).toContain('Difference');
    expect(xml).toContain('Projects Worked On');
    expect(xml).toContain('Mileage Submitted');
  });

  it('EX-16: Project Weekly Summary has Employees and Avg Hours/Employee columns', async () => {
    const res = await handle(authReq(adminToken, {
      url: `${BASE}/api/admin-console/export/xlsx?date_from=${DATE_FROM}&date_to=${DATE_TO}`,
    }));
    const buf = await res.arrayBuffer();
    // sheet10.xml = Project Weekly Summary
    const xml = extractFileFromZip(new Uint8Array(buf), 'xl/worksheets/sheet10.xml');
    expect(xml).not.toBeNull();
    expect(xml).toContain('Employees');
    expect(xml).toContain('Avg Hours/Employee');
    expect(xml).toContain('Acme Build'); // test project appears in data
  });

  it('EX-17: Employee Timesheet Matrix has employee name and Weekly Total', async () => {
    const res = await handle(authReq(adminToken, {
      url: `${BASE}/api/admin-console/export/xlsx?date_from=${DATE_FROM}&date_to=${DATE_TO}`,
    }));
    const buf = await res.arrayBuffer();
    // sheet11.xml = Employee Timesheet Matrix
    const xml = extractFileFromZip(new Uint8Array(buf), 'xl/worksheets/sheet11.xml');
    expect(xml).not.toBeNull();
    expect(xml).toContain('Emp S9');          // test employee name
    expect(xml).toContain('Weekly Total');     // totals row label
    expect(xml).toContain('Acme Build');       // project in employee's matrix
  });

  it('EX-18: Project Timesheet Matrix has project name and employee name', async () => {
    const res = await handle(authReq(adminToken, {
      url: `${BASE}/api/admin-console/export/xlsx?date_from=${DATE_FROM}&date_to=${DATE_TO}`,
    }));
    const buf = await res.arrayBuffer();
    // sheet12.xml = Project Timesheet Matrix
    const xml = extractFileFromZip(new Uint8Array(buf), 'xl/worksheets/sheet12.xml');
    expect(xml).not.toBeNull();
    expect(xml).toContain('Acme Build');  // test project name as section header
    expect(xml).toContain('Emp S9');      // test employee in project's matrix
    expect(xml).toContain('Weekly Total');
  });

  it('EX-19: Weekly Reconciliation has correct column headers', async () => {
    const res = await handle(authReq(adminToken, {
      url: `${BASE}/api/admin-console/export/xlsx?date_from=${DATE_FROM}&date_to=${DATE_TO}`,
    }));
    const buf = await res.arrayBuffer();
    // sheet13.xml = Weekly Reconciliation
    const xml = extractFileFromZip(new Uint8Array(buf), 'xl/worksheets/sheet13.xml');
    expect(xml).not.toBeNull();
    expect(xml).toContain('Attendance Hours');
    expect(xml).toContain('Allocated Hours');
    expect(xml).toContain('Difference');
    expect(xml).toContain('<t>Status</t>');
  });

  it('EX-20: Weekly Reconciliation shows Mismatch when attendance ≠ project hours', async () => {
    const res = await handle(authReq(adminToken, {
      url: `${BASE}/api/admin-console/export/xlsx?date_from=${DATE_FROM}&date_to=${DATE_TO}`,
    }));
    const buf = await res.arrayBuffer();
    const xml = extractFileFromZip(new Uint8Array(buf), 'xl/worksheets/sheet13.xml');
    expect(xml).not.toBeNull();
    // empId: attendance=510, project=480 → Mismatch
    expect(xml).toContain('Mismatch');
    expect(xml).toContain('Emp S9');
  });

  it('EX-21: Weekly Reconciliation shows OK when attendance = project hours', async () => {
    const res = await handle(authReq(adminToken, {
      url: `${BASE}/api/admin-console/export/xlsx?date_from=${DATE_FROM}&date_to=${DATE_TO}`,
    }));
    const buf = await res.arrayBuffer();
    const xml = extractFileFromZip(new Uint8Array(buf), 'xl/worksheets/sheet13.xml');
    expect(xml).not.toBeNull();
    // emp2Id: attendance=480, project=480 → OK
    expect(xml).toContain('<t>OK</t>');
    expect(xml).toContain('Emp2 S9');
  });

});
