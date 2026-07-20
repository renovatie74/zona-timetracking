import { requireAuth, requireRole } from '../middleware/auth.js';
import { getManagerScope }          from '../lib/scope.js';

const ADMIN_OR_MGR = requireRole('administrator', 'manager');

function isValidDate(str) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
  const d = new Date(str + 'T00:00:00Z');
  return !isNaN(d.getTime());
}

function isValidWeekStart(str) {
  if (!isValidDate(str)) return false;
  return new Date(str + 'T00:00:00Z').getUTCDay() === 1; // must be Monday
}

function validateKm(km) {
  if (km == null || km === '') return 'km is required';
  const n = Number(km);
  if (!isFinite(n) || n <= 0) return 'km must be a positive number';
  return null;
}

function weekBounds(weekStart) {
  const start = weekStart + 'T00:00:00Z';
  const d = new Date(weekStart + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 6);
  const end = d.toISOString().slice(0, 10) + 'T23:59:59Z';
  return { start, end };
}

const SELECT_MINE = `
  m.id, m.project_id, p.name AS project_name, p.project_code,
  m.work_date, m.km, m.note, m.status, m.created_at, m.updated_at
`;

const SELECT_ADMIN = `
  m.id, m.user_id, m.project_id,
  (u.first_name || ' ' || u.last_name) AS employee_name,
  u.employee_number AS employee_code,
  p.name AS project_name, p.project_code,
  m.work_date, m.km, m.note, m.status, m.created_at, m.updated_at
`;

// ── GET /api/my-mileage — employee list ───────────────────────────────────────
// ?week=YYYY-MM-DD  filter by week (Monday); default current business week
// ?status=open|completed|all  (default all)
export async function listMyMileage(request, env) {
  const guard = await requireAuth(request, env);
  if (guard) return guard;

  const url    = new URL(request.url);
  const week   = url.searchParams.get('week')   ?? '';
  const status = url.searchParams.get('status') ?? 'all';

  const conditions = ['m.user_id = ?'];
  const params     = [request.user.id];

  if (week && isValidWeekStart(week)) {
    const d = new Date(week + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + 6);
    const weekEnd = d.toISOString().slice(0, 10);
    conditions.push("m.work_date >= ? AND m.work_date <= ?");
    params.push(week, weekEnd);
  }

  if (status === 'open' || status === 'completed') {
    conditions.push('m.status = ?');
    params.push(status);
  }

  const where = conditions.join(' AND ');
  const { results } = await env.DB.prepare(
    `SELECT ${SELECT_MINE}
     FROM   MileageEntries m
     JOIN   Projects p ON p.id = m.project_id
     WHERE  ${where}
     ORDER  BY m.work_date DESC, m.created_at DESC`,
  ).bind(...params).all();

  return Response.json({ data: results });
}

// ── POST /api/my-mileage — employee create ─────────────────────────────────────
export async function createMyMileage(request, env) {
  const guard = await requireAuth(request, env);
  if (guard) return guard;

  const { work_date, project_id, km, note } = await request.json();

  if (!work_date)     return Response.json({ error: 'work_date is required' }, { status: 400 });
  if (!isValidDate(work_date)) return Response.json({ error: 'work_date must be YYYY-MM-DD' }, { status: 400 });
  if (!project_id)    return Response.json({ error: 'project_id is required' }, { status: 400 });

  const kmErr = validateKm(km);
  if (kmErr) return Response.json({ error: kmErr }, { status: 400 });

  // Verify project is accessible (assigned or open to all)
  const proj = await env.DB.prepare(
    `SELECT p.id FROM Projects p
     WHERE p.id = ? AND p.is_active = 1
       AND (
         EXISTS (SELECT 1 FROM ProjectAssignments pa WHERE pa.project_id = p.id AND pa.user_id = ?)
         OR NOT EXISTS (SELECT 1 FROM ProjectAssignments x WHERE x.project_id = p.id)
       )`,
  ).bind(Number(project_id), request.user.id).first();
  if (!proj) return Response.json({ error: 'Project not found or not assigned to you' }, { status: 400 });

  const now = new Date().toISOString();
  const { meta } = await env.DB.prepare(
    `INSERT INTO MileageEntries (user_id, project_id, work_date, km, note, status, created_by, updated_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'open', ?, ?, ?, ?)`,
  ).bind(request.user.id, Number(project_id), work_date, Number(km), note || null,
         request.user.id, request.user.id, now, now).run();

  const row = await env.DB.prepare(
    `SELECT ${SELECT_MINE} FROM MileageEntries m JOIN Projects p ON p.id = m.project_id WHERE m.id = ?`,
  ).bind(meta.last_row_id).first();

  return Response.json({ data: row }, { status: 201 });
}

// ── PUT /api/my-mileage/:id — employee update (open only) ────────────────────
export async function updateMyMileage(request, env) {
  const guard = await requireAuth(request, env);
  if (guard) return guard;

  const { id } = request.params;
  const existing = await env.DB.prepare(
    `SELECT id, status FROM MileageEntries WHERE id = ? AND user_id = ?`,
  ).bind(Number(id), request.user.id).first();

  if (!existing)               return Response.json({ error: 'Entry not found' }, { status: 404 });
  if (existing.status !== 'open') return Response.json({ error: 'Only open entries can be edited' }, { status: 409 });

  const { work_date, project_id, km, note } = await request.json();

  if (work_date && !isValidDate(work_date)) {
    return Response.json({ error: 'work_date must be YYYY-MM-DD' }, { status: 400 });
  }
  if (km !== undefined) {
    const kmErr = validateKm(km);
    if (kmErr) return Response.json({ error: kmErr }, { status: 400 });
  }

  const updates = [];
  const params  = [];

  if (work_date   !== undefined) { updates.push('work_date = ?');  params.push(work_date); }
  if (project_id  !== undefined) { updates.push('project_id = ?'); params.push(Number(project_id)); }
  if (km          !== undefined) { updates.push('km = ?');         params.push(Number(km)); }
  if (note        !== undefined) { updates.push('note = ?');       params.push(note || null); }

  if (updates.length === 0) return Response.json({ error: 'No fields to update' }, { status: 400 });

  const now = new Date().toISOString();
  updates.push('updated_by = ?', 'updated_at = ?');
  params.push(request.user.id, now, Number(id));

  await env.DB.prepare(
    `UPDATE MileageEntries SET ${updates.join(', ')} WHERE id = ?`,
  ).bind(...params).run();

  const row = await env.DB.prepare(
    `SELECT ${SELECT_MINE} FROM MileageEntries m JOIN Projects p ON p.id = m.project_id WHERE m.id = ?`,
  ).bind(Number(id)).first();

  return Response.json({ data: row });
}

// ── DELETE /api/my-mileage/:id — employee delete (open only) ─────────────────
export async function deleteMyMileage(request, env) {
  const guard = await requireAuth(request, env);
  if (guard) return guard;

  const { id } = request.params;
  const existing = await env.DB.prepare(
    `SELECT id, status FROM MileageEntries WHERE id = ? AND user_id = ?`,
  ).bind(Number(id), request.user.id).first();

  if (!existing)               return Response.json({ error: 'Entry not found' }, { status: 404 });
  if (existing.status !== 'open') return Response.json({ error: 'Only open entries can be deleted' }, { status: 409 });

  await env.DB.prepare(`DELETE FROM MileageEntries WHERE id = ?`).bind(Number(id)).run();
  return Response.json({ ok: true });
}

// ── GET /api/mileage — admin/manager list ────────────────────────────────────
// ?week=YYYY-MM-DD, ?user_id=, ?project_id=, ?status=open|completed|all
export async function listMileage(request, env) {
  const guard = await ADMIN_OR_MGR(request, env);
  if (guard) return guard;

  const url        = new URL(request.url);
  const week       = url.searchParams.get('week')       ?? '';
  const user_id    = url.searchParams.get('user_id')    ?? '';
  const project_id = url.searchParams.get('project_id') ?? '';
  const status     = url.searchParams.get('status')     ?? 'all';

  const conditions = [];
  const params     = [];

  if (request.user.role === 'manager') {
    const scope = await getManagerScope(env.DB, request.user.id);
    if (scope.userIds.length === 0) return Response.json({ data: [] });
    const ph = scope.userIds.map(() => '?').join(',');
    conditions.push(`m.user_id IN (${ph})`);
    params.push(...scope.userIds);
  }

  if (week && isValidWeekStart(week)) {
    const d = new Date(week + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + 6);
    const weekEnd = d.toISOString().slice(0, 10);
    conditions.push("m.work_date >= ? AND m.work_date <= ?");
    params.push(week, weekEnd);
  }

  if (user_id)    { conditions.push('m.user_id = ?');    params.push(Number(user_id)); }
  if (project_id) { conditions.push('m.project_id = ?'); params.push(Number(project_id)); }
  if (status === 'open' || status === 'completed') {
    conditions.push('m.status = ?');
    params.push(status);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const { results } = await env.DB.prepare(
    `SELECT ${SELECT_ADMIN}
     FROM   MileageEntries m
     JOIN   Users u ON u.id = m.user_id
     JOIN   Projects p ON p.id = m.project_id
     ${where}
     ORDER  BY m.work_date DESC, u.last_name, u.first_name
     LIMIT  500`,
  ).bind(...params).all();

  return Response.json({ data: results });
}

// ── POST /api/mileage/:id/reopen — admin reopen completed entry ───────────────
export async function reopenMileage(request, env) {
  const guard = await ADMIN_OR_MGR(request, env);
  if (guard) return guard;

  const { id } = request.params;
  const existing = await env.DB.prepare(
    `SELECT id, status FROM MileageEntries WHERE id = ?`,
  ).bind(Number(id)).first();

  if (!existing)                     return Response.json({ error: 'Entry not found' }, { status: 404 });
  if (existing.status !== 'completed') return Response.json({ error: 'Entry is not completed' }, { status: 409 });

  const now = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE MileageEntries SET status = 'open', updated_by = ?, updated_at = ? WHERE id = ?`,
  ).bind(request.user.id, now, Number(id)).run();

  return Response.json({ ok: true });
}

// ── POST /api/mileage/:id/complete — admin mark complete ──────────────────────
export async function completeMileage(request, env) {
  const guard = await ADMIN_OR_MGR(request, env);
  if (guard) return guard;

  const { id } = request.params;
  const existing = await env.DB.prepare(
    `SELECT id, status FROM MileageEntries WHERE id = ?`,
  ).bind(Number(id)).first();

  if (!existing)               return Response.json({ error: 'Entry not found' }, { status: 404 });
  if (existing.status !== 'open') return Response.json({ error: 'Entry is already completed' }, { status: 409 });

  const now = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE MileageEntries SET status = 'completed', updated_by = ?, updated_at = ? WHERE id = ?`,
  ).bind(request.user.id, now, Number(id)).run();

  return Response.json({ ok: true });
}
