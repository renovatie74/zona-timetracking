/**
 * Sprint 7 tests — employee-side project assignment management
 *
 * EA-01  GET /api/employees/:id/assignments returns assigned projects
 * EA-02  GET /api/employees/:id/assignments returns empty array when no assignments
 * EA-03  PUT /api/employees/:id/assignments sets assignments from employee side
 * EA-04  PUT /api/employees/:id/assignments with empty array clears assignments
 * EA-05  Sync: employee-side change is reflected in GET /api/projects/:id/assignments
 * EA-06  Sync: project-side change is reflected in GET /api/employees/:id/assignments
 * EA-07  Non-admin cannot GET /api/employees/:id/assignments
 * EA-08  Non-admin cannot PUT /api/employees/:id/assignments
 * EA-09  PUT /api/employees/:id/assignments rejects non-array project_ids
 * EA-10  GET /api/employees/:id/assignments returns 404 for unknown employee
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
let adminId, empId, projectIdA, projectIdB;

beforeAll(async () => {
  for (const sql of ALL_MIGRATIONS) await runMigration(sql);

  await env.DB.prepare(
    "INSERT OR IGNORE INTO OrgSettings (key, value) VALUES ('timezone', 'UTC')"
  ).run();

  const aIns = await env.DB.prepare(
    `INSERT INTO Users (first_name, last_name, email, password_hash, role_id, is_active, employee_number, created_at, updated_at)
     VALUES ('Admin','S7','admins7@test.com','x',2,1,'AS07',datetime('now'),datetime('now'))`
  ).run();
  adminId    = aIns.meta.last_row_id;
  adminToken = await signJwt({ sub: adminId, role: 'administrator' }, env.JWT_SECRET);

  const eIns = await env.DB.prepare(
    `INSERT INTO Users (first_name, last_name, email, password_hash, role_id, is_active, employee_number, created_at, updated_at)
     VALUES ('Emp','S7','emps7@test.com','x',1,1,'ES07',datetime('now'),datetime('now'))`
  ).run();
  empId    = eIns.meta.last_row_id;
  empToken = await signJwt({ sub: empId, role: 'employee' }, env.JWT_SECRET);

  const pAIns = await env.DB.prepare(
    `INSERT INTO Projects (name, project_code, project_code_seq, status, start_date, is_active, created_at, updated_at)
     VALUES ('Alpha Project','ALPHA',1,'active','2024-01-01',1,datetime('now'),datetime('now'))`
  ).run();
  projectIdA = pAIns.meta.last_row_id;

  const pBIns = await env.DB.prepare(
    `INSERT INTO Projects (name, project_code, project_code_seq, status, start_date, is_active, created_at, updated_at)
     VALUES ('Beta Project','BETA',2,'active','2024-01-01',1,datetime('now'),datetime('now'))`
  ).run();
  projectIdB = pBIns.meta.last_row_id;
});

describe('Sprint 7 — Employee project assignments', () => {

  it('EA-01: GET assignments returns assigned projects', async () => {
    await env.DB.prepare(
      'INSERT OR IGNORE INTO ProjectAssignments (project_id, user_id, created_at) VALUES (?, ?, datetime("now"))'
    ).bind(projectIdA, empId).run();

    const res = await handle(authReq(adminToken, {
      url: `https://test.example.com/api/employees/${empId}/assignments`,
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    const rows = body.data ?? body;
    const ids = rows.map(r => r.id);
    expect(ids).toContain(projectIdA);
  });

  it('EA-02: GET assignments returns empty array when no assignments', async () => {
    const aIns = await env.DB.prepare(
      `INSERT INTO Users (first_name, last_name, email, password_hash, role_id, is_active, employee_number, created_at, updated_at)
       VALUES ('No','Assign','noassign@test.com','x',1,1,'NA07',datetime('now'),datetime('now'))`
    ).run();
    const noAssignId = aIns.meta.last_row_id;

    const res = await handle(authReq(adminToken, {
      url: `https://test.example.com/api/employees/${noAssignId}/assignments`,
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    const rows = body.data ?? body;
    expect(rows).toEqual([]);
  });

  it('EA-03: PUT assignments sets projects for an employee', async () => {
    // Clear any existing assignments first
    await env.DB.prepare('DELETE FROM ProjectAssignments WHERE user_id = ?').bind(empId).run();

    const res = await handle(authReq(adminToken, {
      url:    `https://test.example.com/api/employees/${empId}/assignments`,
      method: 'PUT',
      body:   { project_ids: [projectIdA, projectIdB] },
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    const rows = body.data ?? body;
    const ids  = rows.map(r => r.id);
    expect(ids).toContain(projectIdA);
    expect(ids).toContain(projectIdB);
    expect(rows).toHaveLength(2);
  });

  it('EA-04: PUT assignments with empty array clears all assignments', async () => {
    // Ensure at least one assignment exists
    await env.DB.prepare(
      'INSERT OR IGNORE INTO ProjectAssignments (project_id, user_id, created_at) VALUES (?, ?, datetime("now"))'
    ).bind(projectIdA, empId).run();

    const res = await handle(authReq(adminToken, {
      url:    `https://test.example.com/api/employees/${empId}/assignments`,
      method: 'PUT',
      body:   { project_ids: [] },
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    const rows = body.data ?? body;
    expect(rows).toEqual([]);
  });

  it('EA-05: Sync — employee-side assignment visible via GET /api/projects/:id/assignments', async () => {
    await env.DB.prepare('DELETE FROM ProjectAssignments WHERE user_id = ?').bind(empId).run();

    // Assign via employee endpoint
    await handle(authReq(adminToken, {
      url:    `https://test.example.com/api/employees/${empId}/assignments`,
      method: 'PUT',
      body:   { project_ids: [projectIdA] },
    }));

    // Verify via project endpoint
    const res = await handle(authReq(adminToken, {
      url: `https://test.example.com/api/projects/${projectIdA}/assignments`,
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    const rows = body.data ?? body;
    const userIds = rows.map(r => r.id);
    expect(userIds).toContain(empId);
  });

  it('EA-06: Sync — project-side assignment visible via GET /api/employees/:id/assignments', async () => {
    await env.DB.prepare('DELETE FROM ProjectAssignments WHERE project_id = ?').bind(projectIdB).run();

    // Assign via project endpoint
    await handle(authReq(adminToken, {
      url:    `https://test.example.com/api/projects/${projectIdB}/assignments`,
      method: 'PUT',
      body:   { user_ids: [empId] },
    }));

    // Verify via employee endpoint
    const res = await handle(authReq(adminToken, {
      url: `https://test.example.com/api/employees/${empId}/assignments`,
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    const rows = body.data ?? body;
    const projectIds = rows.map(r => r.id);
    expect(projectIds).toContain(projectIdB);
  });

  it('EA-07: Non-admin cannot GET employee assignments', async () => {
    const res = await handle(authReq(empToken, {
      url: `https://test.example.com/api/employees/${empId}/assignments`,
    }));
    expect(res.status).toBe(403);
  });

  it('EA-08: Non-admin cannot PUT employee assignments', async () => {
    const res = await handle(authReq(empToken, {
      url:    `https://test.example.com/api/employees/${empId}/assignments`,
      method: 'PUT',
      body:   { project_ids: [projectIdA] },
    }));
    expect(res.status).toBe(403);
  });

  it('EA-09: PUT assignments rejects non-array project_ids', async () => {
    const res = await handle(authReq(adminToken, {
      url:    `https://test.example.com/api/employees/${empId}/assignments`,
      method: 'PUT',
      body:   { project_ids: 'not-an-array' },
    }));
    expect(res.status).toBe(400);
  });

  it('EA-10: GET assignments returns 404 for unknown employee', async () => {
    const res = await handle(authReq(adminToken, {
      url: `https://test.example.com/api/employees/999999/assignments`,
    }));
    expect(res.status).toBe(404);
  });

});
