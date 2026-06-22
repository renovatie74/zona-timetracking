/**
 * Sprint 4.3b tests — Business timezone (Europe/Amsterdam) + Mileage via My Time.
 *
 * TC-4.3B-TZ: Verifies Europe/Amsterdam date calculations are correct.
 * TC-4.3B-M:  Mileage upsert accepts Amsterdam Monday; rejects UTC-only week start
 *             when the two differ (tested with a fixed past week).
 * TC-4.3B-E:  Extras listMine status is 'open' for current Amsterdam week,
 *             'recorded' for past weeks.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { env as cfEnv }                    from 'cloudflare:test';
import { signJwt }                         from '../src/lib/jwt.js';
import * as mileageRoutes                  from '../src/routes/mileage.js';
import * as extrasRoutes                   from '../src/routes/extras.js';
import { getBusinessWeekStart,
         getCurrentBusinessWeekStart }     from '../src/lib/businessTime.js';

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

let userSeq = 1200;
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
  ).bind(role_id, `E-${String(seq).padStart(4,'0')}`,
         'Test', `${role}${seq}`, `test${seq}@example.com`, now, now).run();
  const id = result.meta.last_row_id;
  return { id, cookie: await cookieFor(id, role) };
}

let worker;

beforeAll(async () => {
  const migrations = [
    m01, m02, m03, m04, m05, m06, m07, m08, m09,
    m10, m11, m12, m13, m14, m15, m16, m17, m18, m19,
  ];
  for (const sql of migrations) await applyMigration(sql);
  worker = await seedUser('employee');
});

// ── Amsterdam timezone arithmetic ─────────────────────────────────────────────
describe('TC-4.3B-TZ: Business timezone calculations', () => {

  it('TC-4.3B-TZ-01: Amsterdam date at UTC midnight matches expected', () => {
    // 2026-06-23T00:00:00Z = June 23 UTC = June 23 in Amsterdam (CEST +2, so 02:00 local)
    const d = new Date('2026-06-23T00:00:00Z');
    const amsDate = d.toLocaleDateString('en-CA', { timeZone: 'Europe/Amsterdam' });
    expect(amsDate).toBe('2026-06-23');
  });

  it('TC-4.3B-TZ-02: After Amsterdam midnight (22:30 UTC CEST), business date advances', () => {
    // 2026-06-23T22:30:00Z = 2026-06-24T00:30 Amsterdam (CEST = UTC+2)
    const d = new Date('2026-06-23T22:30:00Z');
    const amsDate = d.toLocaleDateString('en-CA', { timeZone: 'Europe/Amsterdam' });
    expect(amsDate).toBe('2026-06-24');
    // UTC is still June 23
    expect(d.toISOString().slice(0, 10)).toBe('2026-06-23');
  });

  it('TC-4.3B-TZ-03: getBusinessWeekStart returns Monday for a Wednesday', () => {
    // 2026-06-24 is Wednesday → Monday of that week is 2026-06-22
    expect(getBusinessWeekStart('2026-06-24')).toBe('2026-06-22');
  });

  it('TC-4.3B-TZ-04: getBusinessWeekStart returns Monday for a Sunday', () => {
    // 2026-06-28 is Sunday → Monday of that week is 2026-06-22
    expect(getBusinessWeekStart('2026-06-28')).toBe('2026-06-22');
  });

  it('TC-4.3B-TZ-05: getBusinessWeekStart returns same date for a Monday', () => {
    // 2026-06-29 is Monday
    expect(getBusinessWeekStart('2026-06-29')).toBe('2026-06-29');
  });

  it('TC-4.3B-TZ-06: getCurrentBusinessWeekStart returns a valid Monday', () => {
    const ws = getCurrentBusinessWeekStart();
    expect(ws).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const d = new Date(ws + 'T00:00:00Z');
    expect(d.getUTCDay()).toBe(1); // 1 = Monday
  });

  it('TC-4.3B-TZ-07: week start never drifts beyond 6 days from today', () => {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Amsterdam' });
    const ws    = getCurrentBusinessWeekStart();
    const diff  = (new Date(today + 'T00:00:00Z') - new Date(ws + 'T00:00:00Z')) / 86400000;
    expect(diff).toBeGreaterThanOrEqual(0);
    expect(diff).toBeLessThanOrEqual(6);
  });

});

// ── Mileage uses Amsterdam week ───────────────────────────────────────────────
describe('TC-4.3B-M: Mileage uses Amsterdam business week', () => {

  it('TC-4.3B-M-01: upsert accepts Amsterdam Monday as current week', async () => {
    const curWeek = getCurrentBusinessWeekStart();
    const req = makeRequest('PUT', '/api/my-mileage',
      { week_start: curWeek, mileage_km: 75 },
      worker.cookie);
    const res = await mileageRoutes.upsertMyMileage(req, env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.week_start).toBe(curWeek);
    expect(body.data.mileage_km).toBe(75);
  });

  it('TC-4.3B-M-02: upsert rejects a known past Monday', async () => {
    // 2026-01-05 is a Monday in the past
    const req = makeRequest('PUT', '/api/my-mileage',
      { week_start: '2026-01-05', mileage_km: 50 },
      worker.cookie);
    const res = await mileageRoutes.upsertMyMileage(req, env);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/current week/i);
  });

  it('TC-4.3B-M-03: GET returns the mileage saved in M-01', async () => {
    const curWeek = getCurrentBusinessWeekStart();
    const req = makeRequest('GET', `/api/my-mileage?week_start=${curWeek}`, null, worker.cookie);
    const res = await mileageRoutes.listMyMileage(req, env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).not.toBeNull();
    expect(body.data.mileage_km).toBe(75);
  });

});

// ── Extras mileage card status reflects Amsterdam week ────────────────────────
describe('TC-4.3B-E: Extras mileage card status (Amsterdam week)', () => {

  it('TC-4.3B-E-01: current week mileage card has status=open', async () => {
    // Seed a mileage record for current Amsterdam week
    const curWeek = getCurrentBusinessWeekStart();
    const now = new Date().toISOString();
    await env.DB.prepare(
      `INSERT INTO WeeklyMileage (user_id, week_start, mileage_km, created_by, updated_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, week_start) DO UPDATE
         SET mileage_km = excluded.mileage_km, updated_at = excluded.updated_at`,
    ).bind(worker.id, curWeek, 42, worker.id, worker.id, now, now).run();

    const req = makeRequest('GET', '/api/extras/mine', null, worker.cookie);
    const res = await extrasRoutes.listMine(req, env);
    expect(res.status).toBe(200);
    const body = await res.json();
    const card = body.data.find(e => e.type === 'mileage' && e.week_start === curWeek);
    expect(card).toBeDefined();
    expect(card.status).toBe('open');
  });

  it('TC-4.3B-E-02: past week mileage card has status=recorded', async () => {
    // Seed a mileage record for a known past week
    const pastWeek = '2026-01-05'; // Monday Jan 5 2026 — definitely past
    const now = new Date().toISOString();
    await env.DB.prepare(
      `INSERT INTO WeeklyMileage (user_id, week_start, mileage_km, created_by, updated_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, week_start) DO UPDATE
         SET mileage_km = excluded.mileage_km, updated_at = excluded.updated_at`,
    ).bind(worker.id, pastWeek, 30, worker.id, worker.id, now, now).run();

    const req = makeRequest('GET', '/api/extras/mine', null, worker.cookie);
    const res = await extrasRoutes.listMine(req, env);
    const body = await res.json();
    const card = body.data.find(e => e.type === 'mileage' && e.week_start === pastWeek);
    expect(card).toBeDefined();
    expect(card.status).toBe('recorded');
  });

});
