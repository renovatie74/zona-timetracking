/**
 * Sprint 2 tests — Teams, Employees, Projects CRUD + authorization.
 * Runs in the Cloudflare Workers runtime via miniflare (vitest-pool-workers).
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { env as cfEnv }                    from 'cloudflare:test';
import { signJwt }                         from '../src/lib/jwt.js';
import * as teamRoutes     from '../src/routes/teams.js';
import * as employeeRoutes from '../src/routes/employees.js';
import * as projectRoutes  from '../src/routes/projects.js';

// ── Env overlay (same pattern as auth tests) ─────────────────────────────────
const env = {
  ...cfEnv,
  JWT_SECRET:    'test-jwt-secret-00000000000000000000000000000000',
  EMAIL_API_KEY: 'test-api-key',
  APP_URL:       'https://test.example.com',
  EMAIL_FROM:    'noreply@test.example.com',
};

// ── Migration imports ─────────────────────────────────────────────────────────
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

// ── Helpers ───────────────────────────────────────────────────────────────────

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

// Seed a user with a given role — returns { id, cookie }
let userSeq = 100;
async function seedUser(role = 'administrator', overrides = {}) {
  const seq = userSeq++;
  const now = new Date().toISOString();
  const ROLE_MAP = { employee: 1, manager: 2, administrator: 3 };
  const role_id  = ROLE_MAP[role] ?? 1;

  const result = await env.DB.prepare(
    `INSERT INTO Users
       (role_id, employee_number, first_name, last_name, email, password_hash, is_active,
        invitation_token, invitation_token_expires_at,
        password_reset_token, password_reset_expires_at,
        created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, NULL, 1, NULL, NULL, NULL, NULL, ?, ?)`,
  ).bind(role_id, `E-${String(seq).padStart(3, '0')}`,
         `Test`, `${role} ${seq}`, `test${seq}@example.com`,
         now, now).run();

  const id = result.meta.last_row_id;
  return { id, cookie: await cookieFor(id, role) };
}

// ── Setup ─────────────────────────────────────────────────────────────────────

let admin, manager, worker, testClientId;

beforeAll(async () => {
  const migrations = [
    migration01, migration02, migration03, migration04,
    migration05, migration06, migration07, migration08, migration09,
    migration10, migration11, migration12, migration13, migration14,
  ];
  for (const sql of migrations) await applyMigration(sql);

  admin   = await seedUser('administrator');
  manager = await seedUser('manager');
  worker  = await seedUser('employee');

  // Seed a client for project tests
  const r = await env.DB.prepare(
    `INSERT INTO Clients (client_code, name, is_active, created_at, updated_at)
     VALUES ('C-001', 'Al Maktoum Estates', 1, datetime('now'), datetime('now'))`,
  ).run();
  testClientId = r.meta.last_row_id;
  await env.DB.prepare(`UPDATE ClientCodeSequence SET next_seq = 2`).run();
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEAMS
// ═══════════════════════════════════════════════════════════════════════════════

describe('Teams — Sprint 2', () => {

  let createdTeamId;

  it('TC-T01: admin can create a team', async () => {
    const req = makeRequest('POST', '/api/teams', { name: 'Alpha Team' }, admin.cookie);
    const res = await teamRoutes.create(req, env);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.name).toBe('Alpha Team');
    expect(body.data.id).toBeTypeOf('number');
    createdTeamId = body.data.id;
  });

  it('TC-T02: admin can list teams', async () => {
    const req = makeRequest('GET', '/api/teams', null, admin.cookie);
    const res = await teamRoutes.list(req, env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThanOrEqual(1);
  });

  it('TC-T03: manager can list teams (read-only access)', async () => {
    const req = makeRequest('GET', '/api/teams', null, manager.cookie);
    const res = await teamRoutes.list(req, env);
    expect(res.status).toBe(200);
  });

  it('TC-T04: worker cannot list teams (403)', async () => {
    const req = makeRequest('GET', '/api/teams', null, worker.cookie);
    const res = await teamRoutes.list(req, env);
    expect(res.status).toBe(403);
  });

  it('TC-T05: worker cannot create a team (403)', async () => {
    const req = makeRequest('POST', '/api/teams', { name: 'Forbidden Team' }, worker.cookie);
    const res = await teamRoutes.create(req, env);
    expect(res.status).toBe(403);
  });

  it('TC-T06: admin can get a team by id', async () => {
    const req = makeRequest('GET', `/api/teams/${createdTeamId}`, null, admin.cookie);
    req.params = { id: String(createdTeamId) };
    const res = await teamRoutes.get(req, env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.id).toBe(createdTeamId);
  });

  it('TC-T07: admin can update a team', async () => {
    const req = makeRequest('PUT', `/api/teams/${createdTeamId}`,
      { name: 'Alpha Team Updated' }, admin.cookie);
    req.params = { id: String(createdTeamId) };
    const res = await teamRoutes.update(req, env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.name).toBe('Alpha Team Updated');
  });

  it('TC-T08: manager cannot create a team (403)', async () => {
    const req = makeRequest('POST', '/api/teams', { name: 'Mgr Team' }, manager.cookie);
    const res = await teamRoutes.create(req, env);
    expect(res.status).toBe(403);
  });

  it('TC-T09: admin can soft-delete a team', async () => {
    const req = makeRequest('DELETE', `/api/teams/${createdTeamId}`, null, admin.cookie);
    req.params = { id: String(createdTeamId) };
    const res = await teamRoutes.remove(req, env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it('TC-T10: get non-existent team returns 404', async () => {
    const req = makeRequest('GET', '/api/teams/99999', null, admin.cookie);
    req.params = { id: '99999' };
    const res = await teamRoutes.get(req, env);
    expect(res.status).toBe(404);
  });

});

// ═══════════════════════════════════════════════════════════════════════════════
// EMPLOYEES
// ═══════════════════════════════════════════════════════════════════════════════

describe('Employees — Sprint 2', () => {

  let createdEmployeeId;

  it('TC-E01: admin can create an employee (generates employee_code)', async () => {
    const req = makeRequest('POST', '/api/employees', {
      first_name: 'Jane', last_name: 'Worker', email: 'jane@example.com', role: 'employee',
    }, admin.cookie);
    const res = await employeeRoutes.create(req, env, { waitUntil: () => {} });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.employee_code).toMatch(/^E-\d{3}$/);
    expect(body.data.first_name).toBe('Jane');
    expect(body.data.last_name).toBe('Worker');
    expect(body.data.name).toBe('Jane Worker');
    createdEmployeeId = body.data.id;
  });

  it('TC-E02: admin can list employees', async () => {
    const req = makeRequest('GET', '/api/employees', null, admin.cookie);
    const res = await employeeRoutes.list(req, env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.data)).toBe(true);
  });

  it('TC-E03: manager can list employees (read-only)', async () => {
    const req = makeRequest('GET', '/api/employees', null, manager.cookie);
    const res = await employeeRoutes.list(req, env);
    expect(res.status).toBe(200);
  });

  it('TC-E04: worker cannot list employees (403)', async () => {
    const req = makeRequest('GET', '/api/employees', null, worker.cookie);
    const res = await employeeRoutes.list(req, env);
    expect(res.status).toBe(403);
  });

  it('TC-E05: admin can get employee by id', async () => {
    const req = makeRequest('GET', `/api/employees/${createdEmployeeId}`, null, admin.cookie);
    req.params = { id: String(createdEmployeeId) };
    const res = await employeeRoutes.get(req, env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.id).toBe(createdEmployeeId);
  });

  it('TC-E06: admin can update an employee', async () => {
    const req = makeRequest('PUT', `/api/employees/${createdEmployeeId}`,
      { first_name: 'Jane', last_name: 'Worker Updated' }, admin.cookie);
    req.params = { id: String(createdEmployeeId) };
    const res = await employeeRoutes.update(req, env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.last_name).toBe('Worker Updated');
    expect(body.data.name).toBe('Jane Worker Updated');
  });

  it('TC-E07: duplicate email returns 409', async () => {
    const req = makeRequest('POST', '/api/employees', {
      first_name: 'Duplicate', last_name: 'User', email: 'jane@example.com',
    }, admin.cookie);
    const res = await employeeRoutes.create(req, env, { waitUntil: () => {} });
    expect(res.status).toBe(409);
  });

  it('TC-E08: search employees by name', async () => {
    const req = makeRequest('GET', '/api/employees?search=Jane', null, admin.cookie);
    const res = await employeeRoutes.list(req, env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.some(e => e.name.includes('Jane'))).toBe(true);
  });

  it('TC-E09: admin can soft-delete an employee', async () => {
    const req = makeRequest('DELETE', `/api/employees/${createdEmployeeId}`, null, admin.cookie);
    req.params = { id: String(createdEmployeeId) };
    const res = await employeeRoutes.remove(req, env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

});

// ═══════════════════════════════════════════════════════════════════════════════
// PROJECTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('Projects — Sprint 2', () => {

  let createdProjectId;

  it('TC-P01: admin can create a project (generates project_code)', async () => {
    const req = makeRequest('POST', '/api/projects', {
      name: 'Villa Renovation', client_id: testClientId,
      location: 'Dubai Marina', status: 'active', start_date: '2026-06-01',
    }, admin.cookie);
    const res = await projectRoutes.create(req, env);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.project_code).toMatch(/^P-\d{3}$/);
    expect(body.data.name).toBe('Villa Renovation');
    createdProjectId = body.data.id;
  });

  it('TC-P02: admin can list projects', async () => {
    const req = makeRequest('GET', '/api/projects', null, admin.cookie);
    const res = await projectRoutes.list(req, env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThanOrEqual(1);
  });

  it('TC-P03: manager can list projects', async () => {
    const req = makeRequest('GET', '/api/projects', null, manager.cookie);
    const res = await projectRoutes.list(req, env);
    expect(res.status).toBe(200);
  });

  it('TC-P04: worker cannot list projects (403)', async () => {
    const req = makeRequest('GET', '/api/projects', null, worker.cookie);
    const res = await projectRoutes.list(req, env);
    expect(res.status).toBe(403);
  });

  it('TC-P05: admin can get project by id', async () => {
    const req = makeRequest('GET', `/api/projects/${createdProjectId}`, null, admin.cookie);
    req.params = { id: String(createdProjectId) };
    const res = await projectRoutes.get(req, env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.id).toBe(createdProjectId);
    expect(body.data.client_id).toBe(testClientId);
    expect(body.data.client_name).toBe('Al Maktoum Estates');
  });

  it('TC-P06: admin can update a project', async () => {
    const req = makeRequest('PUT', `/api/projects/${createdProjectId}`,
      { status: 'completed' }, admin.cookie);
    req.params = { id: String(createdProjectId) };
    const res = await projectRoutes.update(req, env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.status).toBe('completed');
  });

  it('TC-P07: invalid status returns 400', async () => {
    const req = makeRequest('POST', '/api/projects', {
      name: 'Bad Status Project', status: 'invalid', start_date: '2026-01-01',
    }, admin.cookie);
    const res = await projectRoutes.create(req, env);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/status/i);
  });

  it('TC-P08: search projects by name', async () => {
    const req = makeRequest('GET', '/api/projects?search=Villa&status=all', null, admin.cookie);
    const res = await projectRoutes.list(req, env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.some(p => p.name.includes('Villa'))).toBe(true);
  });

  it('TC-P09: filter projects by status', async () => {
    const req = makeRequest('GET', '/api/projects?status=planning', null, admin.cookie);
    const res = await projectRoutes.list(req, env);
    expect(res.status).toBe(200);
    const body = await res.json();
    body.data.forEach(p => expect(p.status).toBe('planning'));
  });

  it('TC-P10: admin can soft-delete a project', async () => {
    const req = makeRequest('DELETE', `/api/projects/${createdProjectId}`, null, admin.cookie);
    req.params = { id: String(createdProjectId) };
    const res = await projectRoutes.remove(req, env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it('TC-P11: get non-existent project returns 404', async () => {
    const req = makeRequest('GET', '/api/projects/99999', null, admin.cookie);
    req.params = { id: '99999' };
    const res = await projectRoutes.get(req, env);
    expect(res.status).toBe(404);
  });

  it('TC-P12: unauthenticated request returns 401', async () => {
    const req = makeRequest('GET', '/api/projects', null, '');
    const res = await projectRoutes.list(req, env);
    expect(res.status).toBe(401);
  });

});
