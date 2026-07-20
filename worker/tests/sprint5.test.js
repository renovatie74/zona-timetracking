/**
 * Sprint 5 / 5.1 tests — Operations Dashboard.
 *
 * Covers: GET /api/dashboard/operations — auth, scoping, all data sections,
 * alert generation, org timezone config.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { env as cfEnv }                    from 'cloudflare:test';
import { signJwt }                         from '../src/lib/jwt.js';
import * as dashboardRoutes                from '../src/routes/dashboard.js';

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

async function applyMigration(sql) {
  const stmts = sql
    .replace(/--[^\n]*/g, '')
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0);
  for (const stmt of stmts) await env.DB.prepare(stmt).run();
}

function makeRequest(method, url, body = null, cookie = '') {
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

let userSeq = 500;
async function seedUser(role = 'employee') {
  const seq = userSeq++;
  const now = new Date().toISOString();
  const ROLE_MAP = { employee: 1, manager: 2, administrator: 3 };
  const role_id  = ROLE_MAP[role] ?? 1;
  const result = await env.DB.prepare(
    `INSERT INTO Users
       (role_id, employee_number, first_name, last_name, email, password_hash, mobile, is_active,
        invitation_token, invitation_token_expires_at,
        password_reset_token, password_reset_expires_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, NULL, NULL, 1, NULL, NULL, NULL, NULL, ?, ?)`,
  ).bind(role_id, `E-${String(seq).padStart(3, '0')}`,
         'Test', `${role}${seq}`, `test${seq}@example.com`, now, now).run();
  const id = result.meta.last_row_id;
  return { id, cookie: await cookieFor(id, role) };
}

let projectSeq = 800;
async function seedProject() {
  const seq = projectSeq++;
  const now = new Date().toISOString();
  const result = await env.DB.prepare(
    `INSERT INTO Projects (project_code, project_code_seq, name, status, start_date, is_active, created_at, updated_at)
     VALUES (?, ?, ?, 'active', '2026-01-01', 1, ?, ?)`,
  ).bind(`P-${String(seq).padStart(3, '0')}`, seq, `Project ${seq}`, now, now).run();
  return result.meta.last_row_id;
}

async function seedTimeEntry({ userId, projectId, startTime, stopTime = null, isManual = false, durationMins = null, roundedMins = null }) {
  const now = new Date().toISOString();
  const dur = stopTime && durationMins == null
    ? Math.round((new Date(stopTime) - new Date(startTime)) / 60000)
    : durationMins;
  const rdur = roundedMins ?? dur;
  const r = await env.DB.prepare(
    `INSERT INTO TimeEntries (user_id, project_id, start_time, stop_time, duration_minutes, rounded_duration_minutes, entry_source, is_manual_entry, is_deleted, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 'approved', ?, ?)`
  ).bind(userId, projectId, startTime, stopTime, dur, rdur, isManual ? 'manual_worker' : 'automatic', isManual ? 1 : 0, now, now).run();
  return r.meta.last_row_id;
}

async function seedExtra({ userId, projectId, type = 'extra_work', status = 'open', createdAt = null }) {
  const now = createdAt ?? new Date().toISOString();
  const r = await env.DB.prepare(
    `INSERT INTO Extras (user_id, project_id, type, description, status, is_deleted, created_at, updated_at)
     VALUES (?, ?, ?, 'Test extra', ?, 0, ?, ?)`
  ).bind(userId, projectId, type, status, now, now).run();
  return r.meta.last_row_id;
}

function weekStart() {
  const t = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Amsterdam' });
  const d = new Date(t + 'T00:00:00Z');
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

let admin, mgr, employee1, employee2, employee3;
let projectA, projectB;

beforeAll(async () => {
  const migrations = [
    m01, m02, m03, m04, m05, m06, m07, m08, m09,
    m10, m11, m12, m13, m14, m15, m16, m17, m18, m19, m20, m21, m22, m23, m24,
  ];
  for (const sql of migrations) await applyMigration(sql);

  admin     = await seedUser('administrator');
  mgr       = await seedUser('manager');
  employee1 = await seedUser('employee');
  employee2 = await seedUser('employee');
  employee3 = await seedUser('employee');

  projectA = await seedProject();
  projectB = await seedProject();

  // Create manager's team; assign employee1 + employee2
  const now = new Date().toISOString();
  const teamResult = await env.DB.prepare(
    `INSERT INTO Teams (name, supervisor_id, is_active, created_at, updated_at) VALUES (?, ?, 1, ?, ?)`
  ).bind('Manager Team', mgr.id, now, now).run();
  const managerTeamId = teamResult.meta.last_row_id;

  await env.DB.prepare(`UPDATE Users SET team_id=? WHERE id=?`).bind(managerTeamId, employee1.id).run();
  await env.DB.prepare(`UPDATE Users SET team_id=? WHERE id=?`).bind(managerTeamId, employee2.id).run();
  // employee3: no team → outside manager scope

  // employee1: open session (currently checked in)
  await seedTimeEntry({ userId: employee1.id, projectId: projectA, startTime: new Date().toISOString() });

  // employee2: closed session today (60 minutes)
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const oneHourAgo  = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
  await seedTimeEntry({
    userId: employee2.id, projectId: projectA,
    startTime: twoHoursAgo, stopTime: oneHourAgo,
    durationMins: 60, roundedMins: 60,
  });

  // employee3: no entries → no_activity

  // 2 open extras
  await seedExtra({ userId: employee1.id, projectId: projectA, type: 'extra_work' });
  await seedExtra({ userId: employee2.id, projectId: projectA, type: 'own_cost' });
});

describe('GET /api/dashboard/operations', () => {
  it('returns 403 for employee role', async () => {
    const req = makeRequest('GET', '/api/dashboard/operations', null, employee1.cookie);
    const res = await dashboardRoutes.operations(req, env);
    expect(res.status).toBe(403);
  });

  it('returns 200 for administrator', async () => {
    const req = makeRequest('GET', '/api/dashboard/operations', null, admin.cookie);
    const res = await dashboardRoutes.operations(req, env);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toBeDefined();
    expect(json.data.today).toBeDefined();
  });

  it('returns 200 for manager', async () => {
    const req = makeRequest('GET', '/api/dashboard/operations', null, mgr.cookie);
    const res = await dashboardRoutes.operations(req, env);
    expect(res.status).toBe(200);
  });

  it('response includes meta.timezone from OrgSettings', async () => {
    const req = makeRequest('GET', '/api/dashboard/operations', null, admin.cookie);
    const res = await dashboardRoutes.operations(req, env);
    const { data } = await res.json();
    expect(data.meta).toBeDefined();
    expect(data.meta.timezone).toBe('Europe/Amsterdam');
    expect(data.meta.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('org timezone can be changed and affects dashboard date', async () => {
    // Change timezone to Asia/Dubai (UTC+4)
    await env.DB.prepare(
      "UPDATE OrgSettings SET value='Asia/Dubai' WHERE key='timezone'"
    ).run();
    const req = makeRequest('GET', '/api/dashboard/operations', null, admin.cookie);
    const res = await dashboardRoutes.operations(req, env);
    const { data } = await res.json();
    expect(data.meta.timezone).toBe('Asia/Dubai');
    // Restore to Amsterdam
    await env.DB.prepare(
      "UPDATE OrgSettings SET value='Europe/Amsterdam' WHERE key='timezone'"
    ).run();
  });

  it.skip('active_now count is correct (removed in 6.1)', async () => {
    const req = makeRequest('GET', '/api/dashboard/operations', null, admin.cookie);
    const res = await dashboardRoutes.operations(req, env);
    const { data } = await res.json();
    expect(data.today.active_now).toBeGreaterThanOrEqual(1);
  });

  it.skip('checked_out_today count is correct (removed in 6.1)', async () => {
    const req = makeRequest('GET', '/api/dashboard/operations', null, admin.cookie);
    const res = await dashboardRoutes.operations(req, env);
    const { data } = await res.json();
    expect(data.today.checked_out_today).toBeGreaterThanOrEqual(1);
  });

  it('no_activity_today count is correct', async () => {
    const req = makeRequest('GET', '/api/dashboard/operations', null, admin.cookie);
    const res = await dashboardRoutes.operations(req, env);
    const { data } = await res.json();
    expect(data.today.no_activity_today).toBeGreaterThanOrEqual(1);
  });

  it.skip('actual and rounded hours today are correct (TimeEntries-based, removed in 6.1)', async () => {
    const req = makeRequest('GET', '/api/dashboard/operations', null, admin.cookie);
    const res = await dashboardRoutes.operations(req, env);
    const { data } = await res.json();
    expect(data.today.actual_minutes_today).toBeGreaterThanOrEqual(60);
    expect(data.today.rounded_minutes_today).toBeGreaterThanOrEqual(60);
  });

  it('open extras count is correct', async () => {
    const req = makeRequest('GET', '/api/dashboard/operations', null, admin.cookie);
    const res = await dashboardRoutes.operations(req, env);
    const { data } = await res.json();
    expect(data.today.open_extras).toBeGreaterThanOrEqual(2);
  });

  it('response does not include weekly_mileage_km (removed in 5.1)', async () => {
    const req = makeRequest('GET', '/api/dashboard/operations', null, admin.cookie);
    const res = await dashboardRoutes.operations(req, env);
    const { data } = await res.json();
    expect(data.today.weekly_mileage_km).toBeUndefined();
  });

  it.skip('live_checkins contains active sessions with warnings array (removed in 6.1)', async () => {
    const req = makeRequest('GET', '/api/dashboard/operations', null, admin.cookie);
    const res = await dashboardRoutes.operations(req, env);
    const { data } = await res.json();
    expect(data.live_checkins.length).toBeGreaterThanOrEqual(1);
    expect(data.live_checkins[0]).toHaveProperty('employee_name');
    expect(data.live_checkins[0]).toHaveProperty('start_time');
    expect(data.live_checkins[0]).toHaveProperty('warnings');
    expect(Array.isArray(data.live_checkins[0].warnings)).toBe(true);
  });

  it.skip('today_by_project aggregates correctly (removed in 6.1)', async () => {
    const req = makeRequest('GET', '/api/dashboard/operations', null, admin.cookie);
    const res = await dashboardRoutes.operations(req, env);
    const { data } = await res.json();
    expect(data.today_by_project.length).toBeGreaterThanOrEqual(1);
    expect(data.today_by_project[0]).toHaveProperty('project_name');
    expect(data.today_by_project[0]).toHaveProperty('active_now');
  });

  it.skip('employee_status_today shows all active employees for admin (removed in 6.1)', async () => {
    const req = makeRequest('GET', '/api/dashboard/operations', null, admin.cookie);
    const res = await dashboardRoutes.operations(req, env);
    const { data } = await res.json();
    expect(data.employee_status_today.length).toBeGreaterThanOrEqual(3);
    const statuses = data.employee_status_today.map(e => e.status);
    expect(statuses).toContain('checked_in');
    expect(statuses).toContain('checked_out');
    expect(statuses).toContain('no_activity');
  });

  it.skip('manager scope filters employee_status_today (removed in 6.1)', async () => {
    const req = makeRequest('GET', '/api/dashboard/operations', null, mgr.cookie);
    const res = await dashboardRoutes.operations(req, env);
    const { data } = await res.json();
    const ids = data.employee_status_today.map(e => e.user_id);
    expect(ids).not.toContain(employee3.id);
    expect(ids).toContain(employee1.id);
  });

  it.skip('alerts generated for active session over 10h (long_session removed in 6.1)', async () => {
    await seedTimeEntry({ userId: employee1.id, projectId: projectA, startTime: '2020-01-01T00:00:00.000Z' });
    const req = makeRequest('GET', '/api/dashboard/operations', null, admin.cookie);
    const res = await dashboardRoutes.operations(req, env);
    const { data } = await res.json();
    const longSession = data.alerts.find(a => a.type === 'long_session');
    expect(longSession).toBeDefined();
    expect(longSession.link).toContain(`user_id=${employee1.id}`);
  });

  it.skip('alerts generated for previous-day open session (removed in 6.1)', async () => {
    const req = makeRequest('GET', '/api/dashboard/operations', null, admin.cookie);
    const res = await dashboardRoutes.operations(req, env);
    const { data } = await res.json();
    const prevDay = data.alerts.find(a => a.type === 'previous_day_session');
    expect(prevDay).toBeDefined();
    expect(prevDay.link).toContain('user_id=');
  });

  it('alerts generated for open extras older than 3 days', async () => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 5);
    await seedExtra({ userId: employee2.id, projectId: projectA, createdAt: oldDate.toISOString() });
    const req = makeRequest('GET', '/api/dashboard/operations', null, admin.cookie);
    const res = await dashboardRoutes.operations(req, env);
    const { data } = await res.json();
    const stale = data.alerts.find(a => a.type === 'stale_extras');
    expect(stale).toBeDefined();
    expect(stale.link).toBe('/admin/extras?status=open');
  });

  it('does not generate missing_mileage alert (removed in 5.1)', async () => {
    const req = makeRequest('GET', '/api/dashboard/operations', null, admin.cookie);
    const res = await dashboardRoutes.operations(req, env);
    const { data } = await res.json();
    const mileageAlert = data.alerts.find(a => a.type === 'missing_mileage');
    expect(mileageAlert).toBeUndefined();
  });

  it('does not include recent_activity in response (removed in 5.1)', async () => {
    const req = makeRequest('GET', '/api/dashboard/operations', null, admin.cookie);
    const res = await dashboardRoutes.operations(req, env);
    const { data } = await res.json();
    expect(data.recent_activity).toBeUndefined();
  });

  // ── Sprint 5.2: duration + date-param link tests ───────────────────────────

  it.skip('live_checkins start_time is normalized to ISO+Z (removed in 6.1)', async () => {
    const req = makeRequest('GET', '/api/dashboard/operations', null, admin.cookie);
    const res = await dashboardRoutes.operations(req, env);
    const { data } = await res.json();
    for (const row of data.live_checkins) {
      expect(row.start_time).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      expect(row.start_time.endsWith('Z')).toBe(true);
    }
  });

  it.skip('live_checkins duration_minutes uses JS elapsed time (removed in 6.1)', async () => {
    const before = Date.now();
    const req = makeRequest('GET', '/api/dashboard/operations', null, admin.cookie);
    const res = await dashboardRoutes.operations(req, env);
    const after = Date.now();
    const { data } = await res.json();
    // Find the recently-started session (seeded in beforeAll with new Date())
    const recent = data.live_checkins.find(r => r.duration_minutes < 5);
    expect(recent).toBeDefined();
    // duration must match JS wall-clock elapsed, not SQL julianday output
    const expectedMin = Math.floor((before - new Date(recent.start_time).getTime()) / 60_000);
    const expectedMax = Math.floor((after  - new Date(recent.start_time).getTime()) / 60_000);
    expect(recent.duration_minutes).toBeGreaterThanOrEqual(expectedMin);
    expect(recent.duration_minutes).toBeLessThanOrEqual(expectedMax + 1);
  });

  it.skip('SQLite-space-format start_time gets same duration as ISO+Z equivalent (removed in 6.1)', async () => {
    // Seed an entry with no-Z SQLite-space format to simulate old mobile records
    const noZStart = new Date(Date.now() - 30 * 60_000) // 30 minutes ago
      .toISOString()
      .replace('T', ' ')
      .replace('Z', '')
      .slice(0, 19); // "2026-06-23 17:43:00"
    const now2 = new Date().toISOString();
    const user6 = await seedUser('employee');
    const proj6 = await seedProject();
    await env.DB.prepare(
      `INSERT INTO TimeEntries (user_id, project_id, start_time, stop_time, duration_minutes, rounded_duration_minutes, entry_source, is_manual_entry, is_deleted, status, created_at, updated_at)
       VALUES (?, ?, ?, NULL, NULL, NULL, 'automatic', 0, 0, 'draft', ?, ?)`
    ).bind(user6.id, proj6, noZStart, now2, now2).run();

    const req = makeRequest('GET', '/api/dashboard/operations', null, admin.cookie);
    const res = await dashboardRoutes.operations(req, env);
    const { data } = await res.json();

    // Find the newly seeded row
    const row = data.live_checkins.find(r => r.user_id === user6.id);
    expect(row).toBeDefined();
    // After normalization, start_time must end with Z
    expect(row.start_time.endsWith('Z')).toBe(true);
    // Duration must be ~30 minutes (±2), NOT ~30 + timezone-offset minutes
    expect(row.duration_minutes).toBeGreaterThanOrEqual(28);
    expect(row.duration_minutes).toBeLessThanOrEqual(32);
  });

  it.skip('long_session alert link includes date_from, date_to (removed in 6.1)', async () => {
    const req = makeRequest('GET', '/api/dashboard/operations', null, admin.cookie);
    const res = await dashboardRoutes.operations(req, env);
    const { data } = await res.json();
    const alert = data.alerts.find(a => a.type === 'long_session');
    expect(alert).toBeDefined();
    expect(alert.link).toContain('date_from=');
    expect(alert.link).toContain('date_to=');
    expect(alert.link).toContain('preset=custom');
    // date_from should be the session's start date (2020-01-01)
    expect(alert.link).toContain('date_from=2020-01-01');
  });

  it.skip('previous_day_session alert link includes date_from, date_to (removed in 6.1)', async () => {
    const req = makeRequest('GET', '/api/dashboard/operations', null, admin.cookie);
    const res = await dashboardRoutes.operations(req, env);
    const { data } = await res.json();
    const alert = data.alerts.find(a => a.type === 'previous_day_session');
    expect(alert).toBeDefined();
    expect(alert.link).toContain('date_from=2020-01-01');
    expect(alert.link).toContain('date_to=');
    expect(alert.link).toContain('preset=custom');
    // link must include user_id so Time Entries can filter correctly
    expect(alert.link).toContain('user_id=');
  });
});
