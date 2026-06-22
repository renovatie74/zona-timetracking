import { requireAuth, requireRole }       from '../middleware/auth.js';
import { getManagerScope }                from '../lib/scope.js';
import { getCurrentBusinessWeekStart }    from '../lib/businessTime.js';

const ADMIN_OR_MGR = requireRole('administrator', 'manager');

function isValidWeekStart(str) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
  const d = new Date(str + 'T00:00:00Z');
  return !isNaN(d.getTime()) && d.getUTCDay() === 1; // must be a Monday
}

function validateKm(mileage_km) {
  if (mileage_km == null) return 'mileage_km is required';
  const km = Number(mileage_km);
  if (!isFinite(km) || km < 0) return 'mileage_km must be a non-negative number';
  return null;
}

const SELECT_EMPLOYEE = `
  wm.id, wm.user_id, wm.week_start, wm.mileage_km, wm.updated_at
`;

const SELECT_ADMIN = `
  wm.id, wm.user_id, wm.week_start, wm.mileage_km,
  (u.first_name || ' ' || u.last_name) AS employee_name,
  u.employee_number AS employee_code,
  wm.updated_at
`;

// ── GET /api/my-mileage — employee: list all own mileage (or single week) ──────
export async function listMyMileage(request, env) {
  const guard = await requireAuth(request, env);
  if (guard) return guard;

  const url        = new URL(request.url);
  const week_start = url.searchParams.get('week_start') ?? '';

  if (week_start) {
    const row = await env.DB.prepare(
      `SELECT ${SELECT_EMPLOYEE} FROM WeeklyMileage wm WHERE wm.user_id = ? AND wm.week_start = ?`,
    ).bind(request.user.id, week_start).first();
    return Response.json({ data: row ?? null });
  }

  const { results } = await env.DB.prepare(
    `SELECT ${SELECT_EMPLOYEE} FROM WeeklyMileage wm
     WHERE  wm.user_id = ?
     ORDER  BY wm.week_start DESC`,
  ).bind(request.user.id).all();

  return Response.json({ data: results });
}

// ── PUT /api/my-mileage — employee: upsert current week only ─────────────────
export async function upsertMyMileage(request, env) {
  const guard = await requireAuth(request, env);
  if (guard) return guard;

  const { week_start, mileage_km } = await request.json();

  if (!week_start)            return Response.json({ error: 'week_start is required' }, { status: 400 });
  if (!isValidWeekStart(week_start)) {
    return Response.json({ error: 'week_start must be a Monday (YYYY-MM-DD)' }, { status: 400 });
  }

  const current = getCurrentBusinessWeekStart();
  if (week_start !== current) {
    return Response.json({ error: 'Mileage can only be updated for the current week' }, { status: 403 });
  }

  const kmErr = validateKm(mileage_km);
  if (kmErr) return Response.json({ error: kmErr }, { status: 400 });

  const km  = Number(mileage_km);
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO WeeklyMileage (user_id, week_start, mileage_km, created_by, updated_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, week_start) DO UPDATE
       SET mileage_km = excluded.mileage_km,
           updated_by = excluded.updated_by,
           updated_at = excluded.updated_at`,
  ).bind(request.user.id, week_start, km, request.user.id, request.user.id, now, now).run();

  const row = await env.DB.prepare(
    `SELECT ${SELECT_EMPLOYEE} FROM WeeklyMileage wm WHERE wm.user_id = ? AND wm.week_start = ?`,
  ).bind(request.user.id, week_start).first();

  return Response.json({ data: row });
}

// ── GET /api/mileage — admin/manager list ─────────────────────────────────────
export async function listMileage(request, env) {
  const guard = await ADMIN_OR_MGR(request, env);
  if (guard) return guard;

  const url        = new URL(request.url);
  const week_start = url.searchParams.get('week_start') ?? '';
  const user_id    = url.searchParams.get('user_id')    ?? '';

  const conditions = [];
  const params     = [];

  if (request.user.role === 'manager') {
    const scope = await getManagerScope(env.DB, request.user.id);
    if (scope.userIds.length === 0) return Response.json({ data: [] });
    const ph = scope.userIds.map(() => '?').join(',');
    conditions.push(`wm.user_id IN (${ph})`);
    params.push(...scope.userIds);
  }

  if (week_start) { conditions.push('wm.week_start = ?'); params.push(week_start); }
  if (user_id)    { conditions.push('wm.user_id = ?');    params.push(Number(user_id)); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const { results } = await env.DB.prepare(
    `SELECT ${SELECT_ADMIN}
     FROM   WeeklyMileage wm
     JOIN   Users u ON u.id = wm.user_id
     ${where}
     ORDER  BY wm.week_start DESC, u.last_name, u.first_name
     LIMIT  500`,
  ).bind(...params).all();

  return Response.json({ data: results });
}

// ── PUT /api/mileage/:user_id/:week_start — admin upsert ──────────────────────
export async function upsertMileageAdmin(request, env) {
  const guard = await ADMIN_OR_MGR(request, env);
  if (guard) return guard;

  const { user_id, week_start } = request.params;

  if (!isValidWeekStart(week_start)) {
    return Response.json({ error: 'week_start must be a Monday (YYYY-MM-DD)' }, { status: 400 });
  }

  if (request.user.role === 'manager') {
    const scope = await getManagerScope(env.DB, request.user.id);
    if (!scope.userIds.includes(Number(user_id))) {
      return Response.json({ error: 'Not authorized to edit this employee\'s mileage' }, { status: 403 });
    }
  }

  const { mileage_km } = await request.json();
  const kmErr = validateKm(mileage_km);
  if (kmErr) return Response.json({ error: kmErr }, { status: 400 });

  const km  = Number(mileage_km);
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO WeeklyMileage (user_id, week_start, mileage_km, created_by, updated_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, week_start) DO UPDATE
       SET mileage_km = excluded.mileage_km,
           updated_by = excluded.updated_by,
           updated_at = excluded.updated_at`,
  ).bind(Number(user_id), week_start, km, request.user.id, request.user.id, now, now).run();

  const row = await env.DB.prepare(
    `SELECT ${SELECT_ADMIN}
     FROM   WeeklyMileage wm
     JOIN   Users u ON u.id = wm.user_id
     WHERE  wm.user_id = ? AND wm.week_start = ?`,
  ).bind(Number(user_id), week_start).first();

  return Response.json({ data: row });
}
