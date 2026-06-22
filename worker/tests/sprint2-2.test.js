/**
 * Sprint 2.2 tests — Employee lifecycle, status filters, list filters.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { env as cfEnv }                    from 'cloudflare:test';
import { signJwt }                         from '../src/lib/jwt.js';
import * as employeeRoutes from '../src/routes/employees.js';
import * as projectRoutes  from '../src/routes/projects.js';
import * as clientRoutes   from '../src/routes/clients.js';
import * as teamRoutes     from '../src/routes/teams.js';

import migration01 from '../migrations/0001_initial.sql?raw';
import migration02 from '../migrations/0002_projects.sql?raw';
import migration03 from '../migrations/0003_time_entries.sql?raw';
import migration04 from '../migrations/0004_notes.sql?raw';
import migration05 from '../migrations/0005_recent.sql?raw';
import migration06 from '../migrations/0006_audit.sql?raw';
import migration07 from '../migrations/0007_teams.sql?raw';
import migration08 from '../migrations/0008_users_team_id.sql?raw';
import migration09 from '../migrations/0009_projects_v2.sql?raw';
import migration10 from '../migrations/0010_clients.sql?raw';
import migration11 from '../migrations/0011_projects_client_id.sql?raw';
import migration12 from '../migrations/0012_employee_name_split.sql?raw';
import migration13 from '../migrations/0013_project_assignments.sql?raw';
import migration14 from '../migrations/0014_time_entry_status.sql?raw';
import migration15 from '../migrations/0015_audit_trail.sql?raw';
import migration16 from '../migrations/0016_extras.sql?raw';
import migration17 from '../migrations/0017_extras_mileage.sql?raw';

const env = {
  ...cfEnv,
  JWT_SECRET:    'test-jwt-secret-00000000000000000000000000000000',
  EMAIL_API_KEY: 'test-api-key',
  APP_URL:       'https://test.example.com',
  EMAIL_FROM:    'noreply@test.example.com',
};

async function applyMigration(sql) {
  const statements = sql
    .replace(/--[^\n]*/g, '')
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0);
  for (const stmt of statements) {
    await env.DB.prepare(stmt).run();
  }
}

function makeRequest(method, url, body, cookie = '') {
  const headers = {};
  if (body)   headers['Content-Type'] = 'application/json';
  if (cookie) headers['Cookie']       = cookie;
  return new Request(`http://localhost${url}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function cookieFor(userId, role) {
  const token = await signJwt(
    { sub: userId, role, exp: Math.floor(Date.now() / 1000) + 3600 },
    env.JWT_SECRET,
  );
  return `jwt=${token}`;
}

let userSeq = 300;
async function seedUser(role = 'administrator', overrides = {}) {
  const seq = userSeq++;
  const now = new Date().toISOString();
  const ROLE_MAP = { employee: 1, manager: 2, administrator: 3 };
  const role_id  = ROLE_MAP[role] ?? 1;

  // is_active = 1, password_hash = 'hash' → status: active
  const passwordHash = 'password_hash' in overrides ? overrides.password_hash : 'hash';
  const result = await env.DB.prepare(
    `INSERT INTO Users
       (role_id, employee_number, first_name, last_name, email, password_hash, mobile, is_active,
        invitation_token, invitation_token_expires_at,
        password_reset_token, password_reset_expires_at,
        created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, ?, ?)`,
  ).bind(role_id, `E-${String(seq).padStart(3, '0')}`,
         overrides.first_name ?? 'Test',
         overrides.last_name ?? `${role} ${seq}`,
         overrides.email ?? `test${seq}@example.com`,
         passwordHash,
         overrides.phone ?? null,
         overrides.is_active ?? 1,
         now, now).run();

  const id = result.meta.last_row_id;
  return { id, cookie: await cookieFor(id, role) };
}

async function seedInactiveUser() {
  // is_active=0, password_hash set → status: inactive
  return seedUser('employee', { is_active: 0, password_hash: 'hash' });
}

async function seedPendingUser() {
  // is_active=0, password_hash=null → status: pending
  return seedUser('employee', { is_active: 0, password_hash: null });
}

let admin, manager, activeEmp, inactiveEmp, pendingEmp;
let testTeamId, testClientId, testProjectId;

beforeAll(async () => {
  const migrations = [
    migration01, migration02, migration03, migration04,
    migration05, migration06, migration07, migration08, migration09,
    migration10, migration11, migration12,
    migration13, migration14, migration15, migration16, migration17,
  ];
  for (const sql of migrations) await applyMigration(sql);

  admin       = await seedUser('administrator');
  manager     = await seedUser('manager');
  activeEmp   = await seedUser('employee');
  inactiveEmp = await seedInactiveUser();
  pendingEmp  = await seedPendingUser();

  // Seed a team
  const now = new Date().toISOString();
  const teamRes = await env.DB.prepare(
    `INSERT INTO Teams (name, supervisor_id, is_active, created_at, updated_at)
     VALUES ('Test Team', ?, 1, ?, ?)`,
  ).bind(manager.id, now, now).run();
  testTeamId = teamRes.meta.last_row_id;

  // Assign activeEmp to team
  await env.DB.prepare('UPDATE Users SET team_id = ? WHERE id = ?').bind(testTeamId, activeEmp.id).run();

  // Seed a client
  const clientRes = await env.DB.prepare(
    `INSERT INTO Clients (client_code, name, is_active, created_at, updated_at)
     VALUES ('C-001', 'Test Client', 1, ?, ?)`,
  ).bind(now, now).run();
  testClientId = clientRes.meta.last_row_id;
  await env.DB.prepare('UPDATE ClientCodeSequence SET next_seq = 2 WHERE id = 1').run();

  // Seed projects
  const p1 = await env.DB.prepare(
    `INSERT INTO Projects (project_code, project_code_seq, name, client_id, status, start_date, is_active, created_at, updated_at)
     VALUES ('P-001', 1, 'Active Project', ?, 'active', '2026-01-01', 1, ?, ?)`,
  ).bind(testClientId, now, now).run();
  testProjectId = p1.meta.last_row_id;

  await env.DB.prepare(
    `INSERT INTO Projects (project_code, project_code_seq, name, client_id, status, start_date, is_active, created_at, updated_at)
     VALUES ('P-002', 2, 'Completed Project', ?, 'completed', '2025-01-01', 1, ?, ?)`,
  ).bind(testClientId, now, now).run();

  await env.DB.prepare(
    `INSERT INTO Projects (project_code, project_code_seq, name, client_id, status, start_date, is_active, created_at, updated_at)
     VALUES ('P-003', 3, 'Planning Project', NULL, 'planning', '2026-06-01', 1, ?, ?)`,
  ).bind(now, now).run();

  await env.DB.prepare('UPDATE ProjectCodeSequence SET next_seq = 4 WHERE id = 1').run();
});

// ═══════════════════════════════════════════════════════════════════════════════
// EMPLOYEE STATUS MODEL
// ═══════════════════════════════════════════════════════════════════════════════

describe('Employee status model — Sprint 2.2', () => {

  it('TC-ES01: active employee has status=active', async () => {
    const req = makeRequest('GET', `/api/employees/${activeEmp.id}`, null, admin.cookie);
    req.params = { id: String(activeEmp.id) };
    const res = await employeeRoutes.get(req, env);
    const body = await res.json();
    expect(body.data.status).toBe('active');
    expect(body.data.is_active).toBe(1);
  });

  it('TC-ES02: inactive employee has status=inactive', async () => {
    const req = makeRequest('GET', `/api/employees/${inactiveEmp.id}`, null, admin.cookie);
    req.params = { id: String(inactiveEmp.id) };
    const res = await employeeRoutes.get(req, env);
    const body = await res.json();
    expect(body.data.status).toBe('inactive');
    expect(body.data.is_active).toBe(0);
  });

  it('TC-ES03: pending employee (no password) has status=pending', async () => {
    const req = makeRequest('GET', `/api/employees/${pendingEmp.id}`, null, admin.cookie);
    req.params = { id: String(pendingEmp.id) };
    const res = await employeeRoutes.get(req, env);
    const body = await res.json();
    expect(body.data.status).toBe('pending');
    expect(body.data.is_active).toBe(0);
  });

});

// ═══════════════════════════════════════════════════════════════════════════════
// EMPLOYEE LIST FILTERS
// ═══════════════════════════════════════════════════════════════════════════════

describe('Employee list filters — Sprint 2.2', () => {

  it('TC-EL01: default list excludes inactive employees', async () => {
    const req = makeRequest('GET', '/api/employees', null, admin.cookie);
    const res = await employeeRoutes.list(req, env);
    const body = await res.json();
    const statuses = body.data.map(e => e.status);
    expect(statuses).not.toContain('inactive');
  });

  it('TC-EL02: default list includes active employees', async () => {
    const req = makeRequest('GET', '/api/employees', null, admin.cookie);
    const res = await employeeRoutes.list(req, env);
    const body = await res.json();
    expect(body.data.some(e => e.status === 'active')).toBe(true);
  });

  it('TC-EL03: default list includes pending employees', async () => {
    const req = makeRequest('GET', '/api/employees', null, admin.cookie);
    const res = await employeeRoutes.list(req, env);
    const body = await res.json();
    expect(body.data.some(e => e.status === 'pending')).toBe(true);
  });

  it('TC-EL04: status=inactive shows only inactive', async () => {
    const req = makeRequest('GET', '/api/employees?status=inactive', null, admin.cookie);
    const res = await employeeRoutes.list(req, env);
    const body = await res.json();
    expect(body.data.length).toBeGreaterThanOrEqual(1);
    expect(body.data.every(e => e.status === 'inactive')).toBe(true);
  });

  it('TC-EL05: status=all shows all including inactive', async () => {
    const req = makeRequest('GET', '/api/employees?status=all', null, admin.cookie);
    const res = await employeeRoutes.list(req, env);
    const body = await res.json();
    const statuses = new Set(body.data.map(e => e.status));
    expect(statuses.has('active')).toBe(true);
    expect(statuses.has('inactive')).toBe(true);
    expect(statuses.has('pending')).toBe(true);
  });

  it('TC-EL06: status=active shows only active employees', async () => {
    const req = makeRequest('GET', '/api/employees?status=active', null, admin.cookie);
    const res = await employeeRoutes.list(req, env);
    const body = await res.json();
    expect(body.data.every(e => e.status === 'active')).toBe(true);
  });

  it('TC-EL07: status=pending shows only pending employees', async () => {
    const req = makeRequest('GET', '/api/employees?status=pending', null, admin.cookie);
    const res = await employeeRoutes.list(req, env);
    const body = await res.json();
    expect(body.data.length).toBeGreaterThanOrEqual(1);
    expect(body.data.every(e => e.status === 'pending')).toBe(true);
  });

  it('TC-EL08: role filter returns only employees of that role', async () => {
    const req = makeRequest('GET', '/api/employees?role=manager&status=all', null, admin.cookie);
    const res = await employeeRoutes.list(req, env);
    const body = await res.json();
    expect(body.data.length).toBeGreaterThanOrEqual(1);
    expect(body.data.every(e => e.role === 'manager')).toBe(true);
  });

  it('TC-EL09: team filter returns only employees in that team', async () => {
    const req = makeRequest('GET', `/api/employees?team=${testTeamId}&status=all`, null, admin.cookie);
    const res = await employeeRoutes.list(req, env);
    const body = await res.json();
    expect(body.data.some(e => e.id === activeEmp.id)).toBe(true);
    expect(body.data.every(e => e.team_id === testTeamId)).toBe(true);
  });

  it('TC-EL10: team=none returns employees with no team', async () => {
    const req = makeRequest('GET', '/api/employees?team=none&status=all', null, admin.cookie);
    const res = await employeeRoutes.list(req, env);
    const body = await res.json();
    // Should not include the employee assigned to testTeam
    expect(body.data.every(e => e.team_id === null)).toBe(true);
  });

});

// ═══════════════════════════════════════════════════════════════════════════════
// EMPLOYEE LIFECYCLE — DEACTIVATE + REACTIVATE
// ═══════════════════════════════════════════════════════════════════════════════

describe('Employee lifecycle — Sprint 2.2', () => {

  let targetId;

  beforeAll(async () => {
    // Create a fresh active employee to test lifecycle on
    const result = await seedUser('employee');
    targetId = result.id;
  });

  it('TC-LC01: deactivate an active employee sets status=inactive', async () => {
    const req = makeRequest('DELETE', `/api/employees/${targetId}`, null, admin.cookie);
    req.params = { id: String(targetId) };
    const res = await employeeRoutes.remove(req, env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);

    // verify via GET
    const getReq = makeRequest('GET', `/api/employees/${targetId}`, null, admin.cookie);
    getReq.params = { id: String(targetId) };
    const getRes = await employeeRoutes.get(getReq, env);
    const getData = await getRes.json();
    expect(getData.data.status).toBe('inactive');
    expect(getData.data.is_active).toBe(0);
  });

  it('TC-LC02: deactivating an already inactive employee is idempotent (200)', async () => {
    const req = makeRequest('DELETE', `/api/employees/${targetId}`, null, admin.cookie);
    req.params = { id: String(targetId) };
    const res = await employeeRoutes.remove(req, env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it('TC-LC03: reactivate inactive employee with password → status=active', async () => {
    const req = makeRequest('POST', `/api/employees/${targetId}/reactivate`, {}, admin.cookie);
    req.params = { id: String(targetId) };
    const res = await employeeRoutes.reactivate(req, env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.status).toBe('active');
    expect(body.data.is_active).toBe(1);
  });

  it('TC-LC04: cannot reactivate an already active employee', async () => {
    const req = makeRequest('POST', `/api/employees/${targetId}/reactivate`, {}, admin.cookie);
    req.params = { id: String(targetId) };
    const res = await employeeRoutes.reactivate(req, env);
    expect(res.status).toBe(400);
  });

  it('TC-LC05: reactivate pending employee (no password) → status stays pending', async () => {
    // Create a fresh pending user (is_active=0, no password)
    const pendingUser = await seedPendingUser();
    // Now "deactivate" doesn't apply (already is_active=0). Directly call reactivate.
    const req = makeRequest('POST', `/api/employees/${pendingUser.id}/reactivate`, {}, admin.cookie);
    req.params = { id: String(pendingUser.id) };
    const res = await employeeRoutes.reactivate(req, env);
    // pending user is already inactive (is_active=0), so this is a no-op on is_active
    // but the endpoint returns 400 because is_active=0 could be pending or inactive
    // Actually our implementation: if is_active=1 → 400; else proceed.
    // pending has is_active=0 → allowed. password_hash IS NULL → newActive stays 0
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.status).toBe('pending');
    expect(body.data.is_active).toBe(0);
  });

  it('TC-LC06: manager cannot deactivate (403)', async () => {
    const req = makeRequest('DELETE', `/api/employees/${activeEmp.id}`, null, manager.cookie);
    req.params = { id: String(activeEmp.id) };
    const res = await employeeRoutes.remove(req, env);
    expect(res.status).toBe(403);
  });

  it('TC-LC07: deactivate non-existent employee returns 404', async () => {
    const req = makeRequest('DELETE', '/api/employees/99999', null, admin.cookie);
    req.params = { id: '99999' };
    const res = await employeeRoutes.remove(req, env);
    expect(res.status).toBe(404);
  });

});

// ═══════════════════════════════════════════════════════════════════════════════
// PROJECT LIST FILTERS
// ═══════════════════════════════════════════════════════════════════════════════

describe('Project list filters — Sprint 2.2', () => {

  it('TC-PJ01: default list shows only planning + active projects', async () => {
    const req = makeRequest('GET', '/api/projects', null, admin.cookie);
    const res = await projectRoutes.list(req, env);
    const body = await res.json();
    expect(body.data.every(p => ['planning', 'active'].includes(p.status))).toBe(true);
    expect(body.data.some(p => p.name === 'Completed Project')).toBe(false);
  });

  it('TC-PJ02: status=all shows all active projects regardless of workflow status', async () => {
    const req = makeRequest('GET', '/api/projects?status=all', null, admin.cookie);
    const res = await projectRoutes.list(req, env);
    const body = await res.json();
    const statuses = new Set(body.data.map(p => p.status));
    expect(statuses.has('active')).toBe(true);
    expect(statuses.has('completed')).toBe(true);
  });

  it('TC-PJ03: status=completed shows only completed projects', async () => {
    const req = makeRequest('GET', '/api/projects?status=completed', null, admin.cookie);
    const res = await projectRoutes.list(req, env);
    const body = await res.json();
    expect(body.data.length).toBeGreaterThanOrEqual(1);
    expect(body.data.every(p => p.status === 'completed')).toBe(true);
  });

  it('TC-PJ04: client_id filter returns only projects for that client', async () => {
    const req = makeRequest('GET', `/api/projects?status=all&client_id=${testClientId}`, null, admin.cookie);
    const res = await projectRoutes.list(req, env);
    const body = await res.json();
    expect(body.data.length).toBeGreaterThanOrEqual(1);
    expect(body.data.every(p => p.client_id === testClientId)).toBe(true);
    // Planning Project has no client_id, so should not appear
    expect(body.data.some(p => p.name === 'Planning Project')).toBe(false);
  });

});

// ═══════════════════════════════════════════════════════════════════════════════
// CLIENT LIST FILTERS
// ═══════════════════════════════════════════════════════════════════════════════

describe('Client list filters — Sprint 2.2', () => {

  let inactiveClientId;

  beforeAll(async () => {
    const now = new Date().toISOString();
    const res = await env.DB.prepare(
      `INSERT INTO Clients (client_code, name, is_active, created_at, updated_at)
       VALUES ('C-099', 'Inactive Client', 0, ?, ?)`,
    ).bind(now, now).run();
    inactiveClientId = res.meta.last_row_id;
  });

  it('TC-CL-F01: default list shows only active clients', async () => {
    const req = makeRequest('GET', '/api/clients', null, admin.cookie);
    const res = await clientRoutes.list(req, env);
    const body = await res.json();
    expect(body.data.every(c => c.is_active === 1)).toBe(true);
    expect(body.data.some(c => c.name === 'Inactive Client')).toBe(false);
  });

  it('TC-CL-F02: status=inactive shows only inactive clients', async () => {
    const req = makeRequest('GET', '/api/clients?status=inactive', null, admin.cookie);
    const res = await clientRoutes.list(req, env);
    const body = await res.json();
    expect(body.data.some(c => c.name === 'Inactive Client')).toBe(true);
    expect(body.data.every(c => c.is_active === 0)).toBe(true);
  });

  it('TC-CL-F03: status=all shows active and inactive clients', async () => {
    const req = makeRequest('GET', '/api/clients?status=all', null, admin.cookie);
    const res = await clientRoutes.list(req, env);
    const body = await res.json();
    const activeValues = new Set(body.data.map(c => c.is_active));
    expect(activeValues.has(0)).toBe(true);
    expect(activeValues.has(1)).toBe(true);
  });

});

// ═══════════════════════════════════════════════════════════════════════════════
// TEAM LIST FILTERS
// ═══════════════════════════════════════════════════════════════════════════════

describe('Team list filters — Sprint 2.2', () => {

  let inactiveTeamId;

  beforeAll(async () => {
    const now = new Date().toISOString();
    const res = await env.DB.prepare(
      `INSERT INTO Teams (name, supervisor_id, is_active, created_at, updated_at)
       VALUES ('Inactive Team', NULL, 0, ?, ?)`,
    ).bind(now, now).run();
    inactiveTeamId = res.meta.last_row_id;
  });

  it('TC-TM01: default list shows only active teams', async () => {
    const req = makeRequest('GET', '/api/teams', null, admin.cookie);
    const res = await teamRoutes.list(req, env);
    const body = await res.json();
    expect(body.data.every(t => t.is_active === 1)).toBe(true);
    expect(body.data.some(t => t.name === 'Inactive Team')).toBe(false);
  });

  it('TC-TM02: status=inactive shows only inactive teams', async () => {
    const req = makeRequest('GET', '/api/teams?status=inactive', null, admin.cookie);
    const res = await teamRoutes.list(req, env);
    const body = await res.json();
    expect(body.data.some(t => t.name === 'Inactive Team')).toBe(true);
    expect(body.data.every(t => t.is_active === 0)).toBe(true);
  });

  it('TC-TM03: status=all shows both active and inactive teams', async () => {
    const req = makeRequest('GET', '/api/teams?status=all', null, admin.cookie);
    const res = await teamRoutes.list(req, env);
    const body = await res.json();
    const activeValues = new Set(body.data.map(t => t.is_active));
    expect(activeValues.has(0)).toBe(true);
    expect(activeValues.has(1)).toBe(true);
  });

});
