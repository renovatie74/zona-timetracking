/**
 * Sprint 10.1 — Billing Horizon endpoint tests
 *
 * BH-01  Returns exactly 4 weeks ending at end_week_start
 * BH-02  Invoiced week shows invoice_status = 'invoiced'
 * BH-03  Week with hours but no invoice shows total_minutes > 0, invoice_status = null
 * BH-04  Week without hours shows total_minutes = 0, invoice_status = null
 * BH-05  Manager scope restricts to their visible projects
 * BH-06  Employee role gets 403
 * BH-07  Admin can see all projects regardless of scope
 */

import { env as cfEnv }        from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';

import * as projectRoutes from '../src/routes/projects.js';
import { hashPassword }   from '../src/lib/password.js';
import { signJwt }        from '../src/lib/jwt.js';

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
import m26 from '../migrations/0026_project_invoice_status.sql?raw';

const ALL_MIGRATIONS = [
  m01,m02,m03,m04,m05,m06,m07,m08,m09,m10,
  m11,m12,m13,m14,m15,m16,m17,m18,m19,m20,
  m21,m22,m23,m24,m25,m26,
];

const env = {
  ...cfEnv,
  JWT_SECRET: 'test-jwt-secret-sprint10-1-000000000000',
  APP_URL:    'https://test.example.com',
};
const ctx = { waitUntil: () => {} };

async function applyMigration(sql) {
  const stmts = sql.replace(/--[^\n]*/g, '').split(';').map(s => s.trim()).filter(Boolean);
  for (const stmt of stmts) await env.DB.prepare(stmt).run();
}

function makeReq(method, url, body, cookie = '') {
  const headers = {};
  if (body)   headers['Content-Type'] = 'application/json';
  if (cookie) headers['Cookie']       = cookie;
  return new Request(`http://localhost${url}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function jwtFor(userId, role) {
  return signJwt(
    { sub: userId, role, exp: Math.floor(Date.now() / 1000) + 3600 },
    env.JWT_SECRET,
  );
}

// Week-start helper: returns Monday YYYY-MM-DD for any date string
function weekStart(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  const day = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + (day === 0 ? -6 : 1 - day));
  return d.toISOString().slice(0, 10);
}

function addDays(ws, n) {
  const d = new Date(ws + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Fixed reference: ISO week 2025-W01 starts 2024-12-30 (Mon)
// We'll use 4 consecutive Mondays ending at W04 (2025-01-20)
//   W01: 2024-12-30
//   W02: 2025-01-06
//   W03: 2025-01-13
//   W04: 2025-01-20  ← end week

const END_WEEK = '2025-01-20';   // Mon W04-2025
const W1 = '2024-12-30';
const W2 = '2025-01-06';
const W3 = '2025-01-13';
const W4 = END_WEEK;

let adminId, managerId, empId;
let projectA, projectB; // admin sees both; manager only sees A

beforeAll(async () => {
  for (const sql of ALL_MIGRATIONS) await applyMigration(sql);

  const now = new Date().toISOString();
  const pw  = await hashPassword('Password1!');

  // Admin user
  const a = await env.DB.prepare(
    `INSERT INTO Users (role_id, employee_number, first_name, last_name, email, password_hash, is_active, created_at, updated_at)
     VALUES (1,'ADM-BH','Admin','BH','admin@bh.test',?,1,?,?)`,
  ).bind(pw, now, now).run();
  adminId = a.meta.last_row_id;

  // Manager user
  const m = await env.DB.prepare(
    `INSERT INTO Users (role_id, employee_number, first_name, last_name, email, password_hash, is_active, created_at, updated_at)
     VALUES (2,'MGR-BH','Manager','BH','mgr@bh.test',?,1,?,?)`,
  ).bind(pw, now, now).run();
  managerId = m.meta.last_row_id;

  // Employee user
  const e = await env.DB.prepare(
    `INSERT INTO Users (role_id, employee_number, first_name, last_name, email, password_hash, is_active, created_at, updated_at)
     VALUES (3,'EMP-BH','Emp','BH','emp@bh.test',?,1,?,?)`,
  ).bind(pw, now, now).run();
  empId = e.meta.last_row_id;

  // Two projects
  const pA = await env.DB.prepare(
    `INSERT INTO Projects (project_code, project_code_seq, name, status, is_active, start_date, created_at, updated_at)
     VALUES ('BH-A',1,'Project Alpha','active',1,'2024-01-01',?,?)`,
  ).bind(now, now).run();
  projectA = pA.meta.last_row_id;

  const pB = await env.DB.prepare(
    `INSERT INTO Projects (project_code, project_code_seq, name, status, is_active, start_date, created_at, updated_at)
     VALUES ('BH-B',2,'Project Beta','active',1,'2024-01-01',?,?)`,
  ).bind(now, now).run();
  projectB = pB.meta.last_row_id;

  // Assign manager only to project A
  await env.DB.prepare(
    `INSERT INTO ProjectAssignments (project_id, user_id, created_at) VALUES (?,?,?)`,
  ).bind(projectA, managerId, now).run();

  // Hours for project A:
  //   W2: 90 min (pending billing)
  //   W3: 60 min (will be invoiced)
  //   W4: 120 min (pending billing)
  const pheBase = `INSERT INTO ProjectHourEntries
    (project_id, user_id, work_date, hours_minutes, source, is_deleted, created_by, updated_by, created_at, updated_at)
    VALUES (?,?,?,?,'employee_manual',0,?,?,?,?)`;

  await env.DB.prepare(pheBase).bind(projectA, empId, addDays(W2, 2), 90,  empId, empId, now, now).run(); // Wed in W2
  await env.DB.prepare(pheBase).bind(projectA, empId, addDays(W3, 1), 60,  empId, empId, now, now).run(); // Tue in W3
  await env.DB.prepare(pheBase).bind(projectA, empId, addDays(W4, 0), 120, empId, empId, now, now).run(); // Mon in W4

  // Hours for project B: only in W1
  await env.DB.prepare(pheBase).bind(projectB, empId, addDays(W1, 3), 30, empId, empId, now, now).run(); // Thu in W1

  // Invoice project A W3 as invoiced
  await env.DB.prepare(
    `INSERT INTO ProjectWeekInvoiceStatus (project_id, iso_week, year, week_start, status, invoiced_at, invoiced_by)
     VALUES (?,3,2025,?,'invoiced',?,?)`,
  ).bind(projectA, W3, now, adminId).run();
});

describe('BH-01 — returns exactly 4 weeks ending at end_week_start', () => {
  it('returns 4 week objects with correct week_start values', async () => {
    const jwt  = await jwtFor(adminId, 'administrator');
    const req  = makeReq('GET', `/api/projects/billing-horizon?end_week_start=${END_WEEK}`, null, `jwt=${jwt}`);
    const res  = await projectRoutes.billingHorizon(req, env, ctx);
    const body = await res.json();

    expect(res.status).toBe(200);
    const weeks = body.data.weeks;
    expect(weeks).toHaveLength(4);
    expect(weeks[0].week_start).toBe(W1);
    expect(weeks[1].week_start).toBe(W2);
    expect(weeks[2].week_start).toBe(W3);
    expect(weeks[3].week_start).toBe(W4);
  });

  it('each week has week_number and year', async () => {
    const jwt  = await jwtFor(adminId, 'administrator');
    const req  = makeReq('GET', `/api/projects/billing-horizon?end_week_start=${END_WEEK}`, null, `jwt=${jwt}`);
    const res  = await projectRoutes.billingHorizon(req, env, ctx);
    const body = await res.json();

    const weeks = body.data.weeks;
    expect(weeks[0].week_number).toBe(1);  // W1 = ISO week 1 2025 (2024-12-30)
    expect(weeks[1].week_number).toBe(2);  // W2 = ISO week 2 2025
    expect(weeks[3].week_number).toBe(4);  // W4 = ISO week 4 2025
    expect(weeks[3].year).toBe(2025);
  });
});

describe('BH-02 — invoiced week shows invoice_status = invoiced', () => {
  it('project A, W3 shows invoiced status', async () => {
    const jwt  = await jwtFor(adminId, 'administrator');
    const req  = makeReq('GET', `/api/projects/billing-horizon?end_week_start=${END_WEEK}`, null, `jwt=${jwt}`);
    const res  = await projectRoutes.billingHorizon(req, env, ctx);
    const body = await res.json();

    const projA = body.data.by_project[projectA];
    expect(projA).toBeDefined();
    const w3Row = projA.find(r => r.week_start === W3);
    expect(w3Row).toBeDefined();
    expect(w3Row.invoice_status).toBe('invoiced');
    expect(w3Row.total_minutes).toBe(60);
  });
});

describe('BH-03 — week with hours but no invoice shows pending (null status)', () => {
  it('project A, W2 has hours but no invoice', async () => {
    const jwt  = await jwtFor(adminId, 'administrator');
    const req  = makeReq('GET', `/api/projects/billing-horizon?end_week_start=${END_WEEK}`, null, `jwt=${jwt}`);
    const res  = await projectRoutes.billingHorizon(req, env, ctx);
    const body = await res.json();

    const projA = body.data.by_project[projectA];
    const w2Row = projA.find(r => r.week_start === W2);
    expect(w2Row.total_minutes).toBe(90);
    expect(w2Row.invoice_status).toBeNull();
  });

  it('project A, W4 has hours but no invoice', async () => {
    const jwt  = await jwtFor(adminId, 'administrator');
    const req  = makeReq('GET', `/api/projects/billing-horizon?end_week_start=${END_WEEK}`, null, `jwt=${jwt}`);
    const res  = await projectRoutes.billingHorizon(req, env, ctx);
    const body = await res.json();

    const projA = body.data.by_project[projectA];
    const w4Row = projA.find(r => r.week_start === W4);
    expect(w4Row.total_minutes).toBe(120);
    expect(w4Row.invoice_status).toBeNull();
  });
});

describe('BH-04 — week without hours shows 0 minutes and null status', () => {
  it('project A, W1 has no hours', async () => {
    const jwt  = await jwtFor(adminId, 'administrator');
    const req  = makeReq('GET', `/api/projects/billing-horizon?end_week_start=${END_WEEK}`, null, `jwt=${jwt}`);
    const res  = await projectRoutes.billingHorizon(req, env, ctx);
    const body = await res.json();

    const projA = body.data.by_project[projectA];
    const w1Row = projA.find(r => r.week_start === W1);
    expect(w1Row.total_minutes).toBe(0);
    expect(w1Row.invoice_status).toBeNull();
  });

  it('project with no hours at all does not appear in by_project', async () => {
    // Insert a project with zero hours
    const now = new Date().toISOString();
    const pC = await env.DB.prepare(
      `INSERT INTO Projects (project_code, project_code_seq, name, status, is_active, start_date, created_at, updated_at)
       VALUES ('BH-C',3,'Project Gamma','active',1,'2024-01-01',?,?)`,
    ).bind(now, now).run();
    const projectC = pC.meta.last_row_id;

    const jwt  = await jwtFor(adminId, 'administrator');
    const req  = makeReq('GET', `/api/projects/billing-horizon?end_week_start=${END_WEEK}`, null, `jwt=${jwt}`);
    const res  = await projectRoutes.billingHorizon(req, env, ctx);
    const body = await res.json();

    // Project C has no hours and no invoice rows → absent from by_project
    expect(body.data.by_project[projectC]).toBeUndefined();
  });
});

describe('BH-05 — manager scope restricts to their visible projects', () => {
  // Project B has no assignments → it is an "open project" visible to all managers.
  // To test restriction: create a project restricted to another user only.
  it('manager sees project A (assigned) and open projects, but not restricted-to-other projects', async () => {
    // Create a project assigned exclusively to empId (not the manager)
    const now = new Date().toISOString();
    const pR = await env.DB.prepare(
      `INSERT INTO Projects (project_code, project_code_seq, name, status, is_active, start_date, created_at, updated_at)
       VALUES ('BH-R',4,'Restricted Project','active',1,'2024-01-01',?,?)`,
    ).bind(now, now).run();
    const restrictedProject = pR.meta.last_row_id;

    // Assign only the employee (not the manager) to this project
    await env.DB.prepare(
      `INSERT INTO ProjectAssignments (project_id, user_id, created_at) VALUES (?,?,?)`,
    ).bind(restrictedProject, empId, now).run();

    // Add hours to restricted project so it appears in by_project for admins
    await env.DB.prepare(
      `INSERT INTO ProjectHourEntries
         (project_id, user_id, work_date, hours_minutes, source, is_deleted, created_by, updated_by, created_at, updated_at)
       VALUES (?,?,?,?,'employee_manual',0,?,?,?,?)`,
    ).bind(restrictedProject, empId, addDays(W2, 1), 60, empId, empId, now, now).run();

    const jwt  = await jwtFor(managerId, 'manager');
    const req  = makeReq('GET', `/api/projects/billing-horizon?end_week_start=${END_WEEK}`, null, `jwt=${jwt}`);
    const res  = await projectRoutes.billingHorizon(req, env, ctx);
    const body = await res.json();

    expect(res.status).toBe(200);
    const pids = Object.keys(body.data.by_project).map(Number);
    expect(pids).toContain(projectA);          // manager is assigned
    expect(pids).not.toContain(restrictedProject); // only empId assigned, not manager
  });
});

describe('BH-06 — employee gets 403', () => {
  it('regular employee cannot access billing-horizon', async () => {
    const jwt = await jwtFor(empId, 'employee');
    const req = makeReq('GET', `/api/projects/billing-horizon?end_week_start=${END_WEEK}`, null, `jwt=${jwt}`);
    const res = await projectRoutes.billingHorizon(req, env, ctx);
    expect(res.status).toBe(403);
  });
});

describe('BH-07 — admin can see all projects', () => {
  it('admin sees both project A and project B in by_project', async () => {
    const jwt  = await jwtFor(adminId, 'administrator');
    const req  = makeReq('GET', `/api/projects/billing-horizon?end_week_start=${END_WEEK}`, null, `jwt=${jwt}`);
    const res  = await projectRoutes.billingHorizon(req, env, ctx);
    const body = await res.json();

    const pids = Object.keys(body.data.by_project).map(Number);
    expect(pids).toContain(projectA);
    expect(pids).toContain(projectB);
  });

  it('project B appears with hours in W1 only', async () => {
    const jwt  = await jwtFor(adminId, 'administrator');
    const req  = makeReq('GET', `/api/projects/billing-horizon?end_week_start=${END_WEEK}`, null, `jwt=${jwt}`);
    const res  = await projectRoutes.billingHorizon(req, env, ctx);
    const body = await res.json();

    const projB = body.data.by_project[projectB];
    expect(projB).toBeDefined();
    const w1Row = projB.find(r => r.week_start === W1);
    expect(w1Row.total_minutes).toBe(30);
    const w2Row = projB.find(r => r.week_start === W2);
    expect(w2Row.total_minutes).toBe(0);
  });
});
