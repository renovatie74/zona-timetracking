import { requireRole }      from '../middleware/auth.js';
import { getManagerScope }  from '../lib/scope.js';

const ADMIN_OR_MGR     = requireRole('administrator', 'manager');
const ADMIN_MGR_OR_SUP = requireRole('administrator', 'manager', 'supervisor');

function calcDuration(start, finish) {
  const [sh, sm] = start.split(':').map(Number);
  const [fh, fm] = finish.split(':').map(Number);
  return (fh * 60 + fm) - (sh * 60 + sm);
}

export async function list(request, env) {
  const guard = await ADMIN_MGR_OR_SUP(request, env);
  if (guard) return guard;

  const url       = new URL(request.url);
  const date_from = url.searchParams.get('date_from');
  const date_to   = url.searchParams.get('date_to');
  const user_id   = url.searchParams.get('user_id');

  const conditions = ['da.is_deleted = 0'];
  const params     = [];

  if (date_from) { conditions.push('da.work_date >= ?'); params.push(date_from); }
  if (date_to)   { conditions.push('da.work_date <= ?'); params.push(date_to); }
  if (user_id)   { conditions.push('da.user_id = ?');   params.push(Number(user_id)); }

  if (request.user.role === 'manager') {
    const scope = await getManagerScope(env.DB, request.user.id);
    if (scope.userIds.length === 0) return Response.json({ data: [] });
    conditions.push(`da.user_id IN (${scope.userIds.map(() => '?').join(',')})`);
    params.push(...scope.userIds);
  }

  const where = conditions.join(' AND ');
  const { results } = await env.DB.prepare(`
    SELECT da.id, da.user_id, da.work_date, da.start_time, da.finish_time,
           da.duration_minutes, da.created_by,
           (u.first_name || ' ' || u.last_name) AS employee_name,
           u.employee_number AS employee_code
    FROM DailyAttendance da
    JOIN Users u ON u.id = da.user_id
    WHERE ${where}
    ORDER BY da.work_date DESC, employee_name ASC
  `).bind(...params).all();

  return Response.json({ data: results });
}

export async function create(request, env) {
  const guard = await ADMIN_OR_MGR(request, env);
  if (guard) return guard;

  const body = await request.json().catch(() => null);
  if (!body?.user_id || !body?.work_date || !body?.start_time || !body?.finish_time) {
    return Response.json({ error: 'user_id, work_date, start_time, finish_time required' }, { status: 400 });
  }

  const duration = calcDuration(body.start_time, body.finish_time);
  if (duration <= 0) return Response.json({ error: 'Finish time must be after start time' }, { status: 400 });

  const now = new Date().toISOString();
  try {
    await env.DB.prepare(`
      INSERT INTO DailyAttendance
        (user_id, work_date, start_time, finish_time, duration_minutes,
         created_by, updated_by, is_deleted, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
      ON CONFLICT(user_id, work_date) DO UPDATE SET
        start_time       = excluded.start_time,
        finish_time      = excluded.finish_time,
        duration_minutes = excluded.duration_minutes,
        updated_by       = excluded.updated_by,
        updated_at       = excluded.updated_at,
        is_deleted       = 0
    `).bind(
      Number(body.user_id), body.work_date, body.start_time, body.finish_time,
      duration, request.user.id, request.user.id, now, now
    ).run();
  } catch (e) {
    return Response.json({ error: e.message }, { status: 409 });
  }

  return Response.json({ ok: true }, { status: 201 });
}

export async function update(request, env) {
  const guard = await ADMIN_OR_MGR(request, env);
  if (guard) return guard;

  const id   = Number(request.params.id);
  const body = await request.json().catch(() => null);
  if (!body?.start_time || !body?.finish_time) {
    return Response.json({ error: 'start_time and finish_time required' }, { status: 400 });
  }

  const duration = calcDuration(body.start_time, body.finish_time);
  if (duration <= 0) return Response.json({ error: 'Finish time must be after start time' }, { status: 400 });

  const now    = new Date().toISOString();
  const result = await env.DB.prepare(`
    UPDATE DailyAttendance
    SET start_time = ?, finish_time = ?, duration_minutes = ?, updated_by = ?, updated_at = ?
    WHERE id = ? AND is_deleted = 0
  `).bind(body.start_time, body.finish_time, duration, request.user.id, now, id).run();

  if (result.changes === 0) return Response.json({ error: 'Not found' }, { status: 404 });
  return Response.json({ ok: true });
}

export async function remove(request, env) {
  const guard = await ADMIN_OR_MGR(request, env);
  if (guard) return guard;

  const id     = Number(request.params.id);
  const now    = new Date().toISOString();
  const result = await env.DB.prepare(`
    UPDATE DailyAttendance SET is_deleted = 1, updated_at = ? WHERE id = ? AND is_deleted = 0
  `).bind(now, id).run();

  if (result.changes === 0) return Response.json({ error: 'Not found' }, { status: 404 });
  return Response.json({ ok: true });
}
