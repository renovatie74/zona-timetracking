import { requireRole, requireAuth } from '../middleware/auth.js';
import { writeAudit }               from '../lib/audit.js';
import { computeRounded }           from '../lib/rounding.js';
import { getManagerScope }          from '../lib/scope.js';

const ADMIN        = requireRole('administrator');
const ADMIN_OR_MGR = requireRole('administrator', 'manager');

// 'imported' reserved for future bulk import feature (Sprint 5+).
// DB CHECK constraint still lists only automatic/manual_worker/manual_admin — no migration
// needed until actual import inserts are built. Filter logic accepts 'imported' queries now
// so frontend/API clients don't need changes when imports land.
const VALID_SOURCES  = ['automatic', 'manual_worker', 'manual_admin', 'imported'];
const VALID_STATUSES = ['draft', 'submitted', 'approved', 'rejected'];

const SELECT_COLS = `
  te.id,
  te.user_id,    te.project_id,
  (u.first_name || ' ' || u.last_name) AS employee_name,
  u.employee_number AS employee_code,
  p.name  AS project_name,
  p.project_code,
  te.start_time,         te.stop_time,
  te.duration_minutes,   te.rounded_duration_minutes,
  te.rounded_start_time, te.rounded_stop_time,
  te.entry_source,       te.status,
  te.is_manual_entry,    te.notes,
  te.created_at,         te.updated_at
`;

// ── List ─────────────────────────────────────────────────────────────────────

export async function list(request, env) {
  const guard = await ADMIN_OR_MGR(request, env);
  if (guard) return guard;

  const url        = new URL(request.url);
  const date_from  = url.searchParams.get('date_from')  ?? '';
  const date_to    = url.searchParams.get('date_to')    ?? '';
  const user_id    = url.searchParams.get('user_id')    ?? '';
  const project_id = url.searchParams.get('project_id') ?? '';
  const source     = url.searchParams.get('source')     ?? '';
  const status     = url.searchParams.get('status')     ?? '';

  const conditions = ['te.is_deleted = 0'];
  const params     = [];

  // Manager visibility: only entries for employees in supervised teams
  if (request.user.role === 'manager') {
    const scope = await getManagerScope(env.DB, request.user.id);
    if (scope.userIds.length === 0) return Response.json({ data: [] });
    const ph = scope.userIds.map(() => '?').join(',');
    conditions.push(`te.user_id IN (${ph})`);
    params.push(...scope.userIds);
  }

  if (date_from) { conditions.push("date(te.start_time) >= ?"); params.push(date_from); }
  if (date_to)   { conditions.push("date(te.start_time) <= ?"); params.push(date_to); }
  if (user_id)   { conditions.push('te.user_id = ?');    params.push(Number(user_id)); }
  if (project_id){ conditions.push('te.project_id = ?'); params.push(Number(project_id)); }
  if (source  && VALID_SOURCES.includes(source))   { conditions.push('te.entry_source = ?'); params.push(source); }
  if (status  && VALID_STATUSES.includes(status)) { conditions.push('te.status = ?');        params.push(status); }

  const where = conditions.join(' AND ');
  const stmt = env.DB.prepare(
    `SELECT ${SELECT_COLS}
     FROM   TimeEntries te
     JOIN   Users    u ON u.id = te.user_id
     JOIN   Projects p ON p.id = te.project_id
     WHERE  ${where}
     ORDER  BY te.start_time DESC
     LIMIT  500`,
  );

  const { results } = await (params.length ? stmt.bind(...params) : stmt).all();
  return Response.json({ data: results });
}

// ── Create (manual entry) ────────────────────────────────────────────────────

export async function create(request, env) {
  const guard = await ADMIN_OR_MGR(request, env);
  if (guard) return guard;

  const { user_id, project_id, start_time, stop_time, notes = null } = await request.json();

  if (!user_id)    return Response.json({ error: 'user_id is required' },    { status: 400 });
  if (!project_id) return Response.json({ error: 'project_id is required' }, { status: 400 });
  if (!start_time) return Response.json({ error: 'start_time is required' }, { status: 400 });
  if (!stop_time)  return Response.json({ error: 'stop_time is required' },  { status: 400 });

  const start = new Date(start_time);
  const stop  = new Date(stop_time);
  if (isNaN(start.getTime())) return Response.json({ error: 'Invalid start_time' }, { status: 400 });
  if (isNaN(stop.getTime()))  return Response.json({ error: 'Invalid stop_time' },  { status: 400 });
  if (stop <= start) return Response.json({ error: 'stop_time must be after start_time' }, { status: 400 });

  // Manager: can only create entries for employees in supervised teams
  if (request.user.role === 'manager') {
    const scope = await getManagerScope(env.DB, request.user.id);
    if (!scope.userIds.includes(Number(user_id))) {
      return Response.json({ error: 'Forbidden: employee is not in your supervised teams' }, { status: 403 });
    }
  }

  // Verify employee + project exist
  const emp  = await env.DB.prepare('SELECT id FROM Users WHERE id = ?').bind(Number(user_id)).first();
  const proj = await env.DB.prepare('SELECT id FROM Projects WHERE id = ? AND is_active = 1').bind(Number(project_id)).first();
  if (!emp)  return Response.json({ error: 'Employee not found' }, { status: 400 });
  if (!proj) return Response.json({ error: 'Project not found' },  { status: 400 });

  const rounded = computeRounded(start, stop);
  const now = new Date().toISOString();

  const result = await env.DB.prepare(
    `INSERT INTO TimeEntries
       (user_id, project_id, entry_source,
        start_time, stop_time,
        duration_minutes, rounded_start_time, rounded_stop_time, rounded_duration_minutes,
        is_manual_entry, status, notes, created_at, updated_at)
     VALUES (?, ?, 'manual_admin', ?, ?, ?, ?, ?, ?, 1, 'approved', ?, ?, ?)`,
  ).bind(
    Number(user_id), Number(project_id),
    start.toISOString(), stop.toISOString(),
    rounded.duration_minutes,
    rounded.rounded_start_time, rounded.rounded_stop_time, rounded.rounded_duration_minutes,
    notes, now, now,
  ).run();

  const entry = await env.DB.prepare(
    `SELECT ${SELECT_COLS}
     FROM   TimeEntries te
     JOIN   Users    u ON u.id = te.user_id
     JOIN   Projects p ON p.id = te.project_id
     WHERE  te.id = ?`,
  ).bind(result.meta.last_row_id).first();

  await writeAudit(env.DB, {
    actorId: request.user.id, action: 'created', entityType: 'time_entry',
    entityId: result.meta.last_row_id,
    oldValues: null, newValues: { user_id, project_id, start_time, stop_time },
  });

  return Response.json({ data: entry }, { status: 201 });
}

// ── Update ───────────────────────────────────────────────────────────────────

export async function update(request, env) {
  const guard = await ADMIN_OR_MGR(request, env);
  if (guard) return guard;

  const id  = request.params.id;
  const old = await env.DB.prepare(
    'SELECT * FROM TimeEntries WHERE id = ? AND is_deleted = 0',
  ).bind(id).first();
  if (!old) return Response.json({ error: 'Time entry not found' }, { status: 404 });

  if (request.user.role === 'manager') {
    const scope = await getManagerScope(env.DB, request.user.id);
    if (!scope.userIds.includes(old.user_id)) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  const body       = await request.json();
  const start_time = body.start_time !== undefined ? body.start_time : old.start_time;
  const stop_time  = body.stop_time  !== undefined ? body.stop_time  : old.stop_time;
  const notes      = body.notes      !== undefined ? body.notes      : old.notes;

  const start = new Date(start_time);
  const stop  = new Date(stop_time);
  if (isNaN(start.getTime())) return Response.json({ error: 'Invalid start_time' }, { status: 400 });
  if (isNaN(stop.getTime()))  return Response.json({ error: 'Invalid stop_time' },  { status: 400 });
  if (stop <= start) return Response.json({ error: 'stop_time must be after start_time' }, { status: 400 });

  const rounded = computeRounded(start, stop);
  const now = new Date().toISOString();

  await env.DB.prepare(
    `UPDATE TimeEntries
     SET  start_time = ?, stop_time = ?,
          duration_minutes = ?, rounded_start_time = ?, rounded_stop_time = ?,
          rounded_duration_minutes = ?, notes = ?, updated_at = ?
     WHERE id = ?`,
  ).bind(
    start.toISOString(), stop.toISOString(),
    rounded.duration_minutes,
    rounded.rounded_start_time, rounded.rounded_stop_time, rounded.rounded_duration_minutes,
    notes, now, id,
  ).run();

  await writeAudit(env.DB, {
    actorId: request.user.id, action: 'updated', entityType: 'time_entry', entityId: Number(id),
    oldValues: { start_time: old.start_time, stop_time: old.stop_time },
    newValues: body,
  });

  const entry = await env.DB.prepare(
    `SELECT ${SELECT_COLS}
     FROM   TimeEntries te
     JOIN   Users    u ON u.id = te.user_id
     JOIN   Projects p ON p.id = te.project_id
     WHERE  te.id = ?`,
  ).bind(id).first();

  return Response.json({ data: entry });
}

// ── Sprint 3B — Employee check-in / check-out ─────────────────────────────────

export async function active(request, env) {
  const guard = await requireAuth(request, env);
  if (guard) return guard;

  const entry = await env.DB.prepare(
    `SELECT te.id, te.project_id, p.name AS project_name, te.start_time,
            te.gps_status, te.checkin_lat, te.checkin_lng
     FROM   TimeEntries te
     JOIN   Projects p ON p.id = te.project_id
     WHERE  te.user_id = ? AND te.stop_time IS NULL AND te.is_deleted = 0
     ORDER  BY te.start_time DESC
     LIMIT  1`,
  ).bind(request.user.id).first();

  if (!entry) return Response.json({ data: null });

  const startMs    = new Date(entry.start_time).getTime();
  const hoursOpen  = (Date.now() - startMs) / 3_600_000;

  return Response.json({ data: { ...entry, unclosed_warning: hoursOpen > 12 } });
}

export async function checkin(request, env) {
  const guard = await requireAuth(request, env);
  if (guard) return guard;

  const { project_id, gps } = await request.json();
  if (!project_id) return Response.json({ error: 'project_id is required' }, { status: 400 });

  // Collision check — BLOCK if session already open
  const existing = await env.DB.prepare(
    `SELECT te.id, te.start_time, p.name AS project_name
     FROM   TimeEntries te
     JOIN   Projects p ON p.id = te.project_id
     WHERE  te.user_id = ? AND te.stop_time IS NULL AND te.is_deleted = 0
     LIMIT  1`,
  ).bind(request.user.id).first();

  if (existing) {
    const t   = new Date(existing.start_time);
    const hh  = String(t.getUTCHours()).padStart(2, '0');
    const mm  = String(t.getUTCMinutes()).padStart(2, '0');
    return Response.json({
      error: `You already have an active session started at ${hh}:${mm} on ${existing.project_name}. Please check out before starting a new session.`,
    }, { status: 409 });
  }

  // Validate project
  const proj = await env.DB.prepare(
    'SELECT id FROM Projects WHERE id = ? AND is_active = 1',
  ).bind(Number(project_id)).first();
  if (!proj) return Response.json({ error: 'Project not found or inactive' }, { status: 400 });

  const now              = new Date().toISOString();
  const gps_status       = gps?.status       ?? 'unavailable';
  const checkin_lat      = gps?.lat          ?? null;
  const checkin_lng      = gps?.lng          ?? null;
  const checkin_accuracy = gps?.accuracy     ?? null;
  const checkin_maps_url = checkin_lat && checkin_lng
    ? `https://maps.google.com/?q=${checkin_lat},${checkin_lng}`
    : null;

  const result = await env.DB.prepare(
    `INSERT INTO TimeEntries
       (user_id, project_id, entry_source, start_time,
        gps_status, checkin_lat, checkin_lng, checkin_accuracy_m, checkin_maps_url,
        is_manual_entry, status, created_at, updated_at)
     VALUES (?, ?, 'automatic', ?, ?, ?, ?, ?, ?, 0, 'draft', ?, ?)`,
  ).bind(
    request.user.id, Number(project_id), now,
    gps_status, checkin_lat, checkin_lng, checkin_accuracy, checkin_maps_url,
    now, now,
  ).run();

  await updateRecentProjects(env.DB, request.user.id, Number(project_id), now);

  const entry = await env.DB.prepare(
    `SELECT te.id, te.project_id, p.name AS project_name, te.start_time,
            te.gps_status, te.checkin_lat, te.checkin_lng, te.checkin_accuracy_m, te.checkin_maps_url
     FROM   TimeEntries te
     JOIN   Projects p ON p.id = te.project_id
     WHERE  te.id = ?`,
  ).bind(result.meta.last_row_id).first();

  return Response.json({ data: entry }, { status: 201 });
}

export async function checkout(request, env) {
  const guard = await requireAuth(request, env);
  if (guard) return guard;

  const body = await request.json().catch(() => ({}));
  const gps  = body?.gps;

  const entry = await env.DB.prepare(
    `SELECT id, start_time, project_id
     FROM   TimeEntries
     WHERE  user_id = ? AND stop_time IS NULL AND is_deleted = 0
     ORDER  BY start_time DESC
     LIMIT  1`,
  ).bind(request.user.id).first();

  if (!entry) return Response.json({ error: 'No active session found' }, { status: 404 });

  const start  = new Date(entry.start_time);
  const stop   = new Date();
  const rounded = computeRounded(start, stop);
  const now    = stop.toISOString();

  const checkout_gps_status  = gps?.status   ?? 'unavailable';
  const checkout_lat         = gps?.lat       ?? null;
  const checkout_lng         = gps?.lng       ?? null;
  const checkout_accuracy    = gps?.accuracy  ?? null;
  const checkout_maps_url    = checkout_lat && checkout_lng
    ? `https://maps.google.com/?q=${checkout_lat},${checkout_lng}`
    : null;

  await env.DB.prepare(
    `UPDATE TimeEntries SET
       stop_time = ?,
       duration_minutes = ?, rounded_start_time = ?, rounded_stop_time = ?, rounded_duration_minutes = ?,
       checkout_gps_status = ?, checkout_lat = ?, checkout_lng = ?, checkout_accuracy_m = ?, checkout_maps_url = ?,
       status = 'submitted', updated_at = ?
     WHERE id = ?`,
  ).bind(
    now,
    rounded.duration_minutes, rounded.rounded_start_time, rounded.rounded_stop_time, rounded.rounded_duration_minutes,
    checkout_gps_status, checkout_lat, checkout_lng, checkout_accuracy, checkout_maps_url,
    now, entry.id,
  ).run();

  const closed = await env.DB.prepare(
    `SELECT te.id, te.project_id, p.name AS project_name,
            te.start_time, te.stop_time,
            te.duration_minutes, te.rounded_duration_minutes,
            te.rounded_start_time, te.rounded_stop_time,
            te.gps_status, te.checkin_lat, te.checkin_lng,
            te.checkout_gps_status, te.checkout_lat, te.checkout_lng, te.checkout_maps_url
     FROM   TimeEntries te
     JOIN   Projects p ON p.id = te.project_id
     WHERE  te.id = ?`,
  ).bind(entry.id).first();

  return Response.json({ data: closed });
}

// Upsert helper — keeps the 2 most-recent projects per user, no duplicates.
async function updateRecentProjects(db, userId, projectId, now) {
  await db.batch([
    db.prepare('DELETE FROM RecentProjects WHERE user_id = ? AND project_id = ?').bind(userId, projectId),
    db.prepare('DELETE FROM RecentProjects WHERE user_id = ? AND rank = 2').bind(userId),
    db.prepare('UPDATE RecentProjects SET rank = 2 WHERE user_id = ? AND rank = 1').bind(userId),
    db.prepare('INSERT INTO RecentProjects (user_id, project_id, rank, updated_at) VALUES (?, ?, 1, ?)').bind(userId, projectId, now),
  ]);
}

// ── Delete (soft) ─────────────────────────────────────────────────────────────

export async function remove(request, env) {
  const guard = await ADMIN_OR_MGR(request, env);
  if (guard) return guard;

  const id  = request.params.id;
  const old = await env.DB.prepare(
    'SELECT * FROM TimeEntries WHERE id = ? AND is_deleted = 0',
  ).bind(id).first();
  if (!old) return Response.json({ error: 'Time entry not found' }, { status: 404 });

  if (request.user.role === 'manager') {
    const scope = await getManagerScope(env.DB, request.user.id);
    if (!scope.userIds.includes(old.user_id)) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  const now = new Date().toISOString();
  await env.DB.prepare(
    'UPDATE TimeEntries SET is_deleted = 1, updated_at = ? WHERE id = ?',
  ).bind(now, id).run();

  await writeAudit(env.DB, {
    actorId: request.user.id, action: 'deleted', entityType: 'time_entry', entityId: Number(id),
    oldValues: { user_id: old.user_id, project_id: old.project_id, start_time: old.start_time },
    newValues: null,
  });

  return Response.json({ ok: true });
}
