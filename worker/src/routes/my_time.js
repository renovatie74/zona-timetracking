import { requireAuth }                           from '../middleware/auth.js';
import { computeRounded, MIN_DURATION_MINUTES }  from '../lib/rounding.js';
import { weekStartFor, weekEndFor, currentWeekStart } from '../lib/week.js';

// ── GET /api/my-time?week=YYYY-MM-DD ─────────────────────────────────────────
// Returns all non-deleted entries for the requesting user in the given ISO week.
export async function myTime(request, env) {
  const guard = await requireAuth(request, env);
  if (guard) return guard;

  const url       = new URL(request.url);
  const weekParam = url.searchParams.get('week') ?? new Date().toISOString().slice(0, 10);
  const weekStart = weekStartFor(weekParam);
  const weekEnd   = weekEndFor(weekParam);

  const { results } = await env.DB.prepare(
    `SELECT te.id, te.project_id, p.name AS project_name, p.project_code,
            te.start_time, te.stop_time,
            te.duration_minutes, te.rounded_duration_minutes,
            te.rounded_start_time, te.rounded_stop_time,
            te.entry_source, te.status, te.notes,
            te.created_at, te.updated_at
     FROM   TimeEntries te
     JOIN   Projects p ON p.id = te.project_id
     WHERE  te.user_id = ? AND te.is_deleted = 0
       AND  date(te.start_time) >= ? AND date(te.start_time) <= ?
     ORDER  BY te.start_time ASC`,
  ).bind(request.user.id, weekStart, weekEnd).all();

  return Response.json({ data: results, week_start: weekStart, week_end: weekEnd });
}

// ── POST /api/my-time — employee manual entry ─────────────────────────────────
export async function createMyEntry(request, env) {
  const guard = await requireAuth(request, env);
  if (guard) return guard;

  const { project_id, start_time, stop_time, notes = null } = await request.json();

  if (!project_id) return Response.json({ error: 'project_id is required' }, { status: 400 });
  if (!start_time) return Response.json({ error: 'start_time is required' }, { status: 400 });
  if (!stop_time)  return Response.json({ error: 'stop_time is required' },  { status: 400 });

  const start = new Date(start_time);
  const stop  = new Date(stop_time);
  if (isNaN(start.getTime())) return Response.json({ error: 'Invalid start_time' }, { status: 400 });
  if (isNaN(stop.getTime()))  return Response.json({ error: 'Invalid stop_time' },  { status: 400 });
  if (stop <= start) return Response.json({ error: 'stop_time must be after start_time' }, { status: 400 });

  const durationMins = Math.round((stop.getTime() - start.getTime()) / 60_000);
  if (durationMins < MIN_DURATION_MINUTES) {
    return Response.json(
      { error: `Entry duration is too short. Minimum is ${MIN_DURATION_MINUTES} minutes.` },
      { status: 422 },
    );
  }

  // Entry date must fall in the current ISO week and must not be in the future
  const entryDate    = start.toISOString().slice(0, 10);
  const todayUTC     = new Date().toISOString().slice(0, 10);
  const curWeekStart = currentWeekStart();
  const curWeekEnd   = weekEndFor(curWeekStart);
  if (entryDate < curWeekStart || entryDate > curWeekEnd) {
    return Response.json(
      { error: 'Manual entries can only be added for the current week' },
      { status: 422 },
    );
  }
  if (entryDate > todayUTC) {
    return Response.json({ error: 'Future time entries are not allowed.' }, { status: 422 });
  }

  // Verify project is accessible: explicitly assigned, or open to all (no assignments on project)
  const proj = await env.DB.prepare(
    `SELECT p.id FROM Projects p
     WHERE p.id = ? AND p.is_active = 1
       AND (
         EXISTS (SELECT 1 FROM ProjectAssignments pa WHERE pa.project_id = p.id AND pa.user_id = ?)
         OR NOT EXISTS (SELECT 1 FROM ProjectAssignments x WHERE x.project_id = p.id)
       )`,
  ).bind(Number(project_id), request.user.id).first();
  if (!proj) return Response.json({ error: 'Project not found or not assigned to you' }, { status: 400 });

  const rounded = computeRounded(start, stop);
  const now     = new Date().toISOString();

  const result = await env.DB.prepare(
    `INSERT INTO TimeEntries
       (user_id, project_id, entry_source,
        start_time, stop_time,
        duration_minutes, rounded_start_time, rounded_stop_time, rounded_duration_minutes,
        is_manual_entry, status, notes, created_by, created_at, updated_at)
     VALUES (?, ?, 'manual_worker', ?, ?, ?, ?, ?, ?, 1, 'approved', ?, ?, ?, ?)`,
  ).bind(
    request.user.id, Number(project_id),
    start.toISOString(), stop.toISOString(),
    rounded.duration_minutes,
    rounded.rounded_start_time, rounded.rounded_stop_time, rounded.rounded_duration_minutes,
    notes, request.user.id, now, now,
  ).run();

  const entry = await env.DB.prepare(
    `SELECT te.id, te.project_id, p.name AS project_name, p.project_code,
            te.start_time, te.stop_time, te.duration_minutes, te.rounded_duration_minutes,
            te.rounded_start_time, te.rounded_stop_time,
            te.entry_source, te.status, te.notes
     FROM   TimeEntries te
     JOIN   Projects p ON p.id = te.project_id
     WHERE  te.id = ?`,
  ).bind(result.meta.last_row_id).first();

  return Response.json({ data: entry }, { status: 201 });
}

// ── PUT /api/my-time/:id — update manual entry ────────────────────────────────
export async function updateMyEntry(request, env) {
  const guard = await requireAuth(request, env);
  if (guard) return guard;

  const id  = request.params.id;
  const old = await env.DB.prepare(
    `SELECT * FROM TimeEntries WHERE id = ? AND user_id = ? AND is_deleted = 0`,
  ).bind(id, request.user.id).first();
  if (!old) return Response.json({ error: 'Time entry not found' }, { status: 404 });

  if (old.entry_source !== 'manual_worker') {
    return Response.json({ error: 'Only manually entered sessions can be edited' }, { status: 403 });
  }

  // Must be in the current ISO week and must not be a future date
  const entryDate    = old.start_time.slice(0, 10);
  const todayUTC     = new Date().toISOString().slice(0, 10);
  const curWeekStart = currentWeekStart();
  const curWeekEnd   = weekEndFor(curWeekStart);
  if (entryDate < curWeekStart || entryDate > curWeekEnd) {
    return Response.json({ error: 'Only entries in the current week can be edited' }, { status: 422 });
  }
  if (entryDate > todayUTC) {
    return Response.json({ error: 'Future time entries are not allowed.' }, { status: 422 });
  }

  const body       = await request.json();
  const start_time = body.start_time ?? old.start_time;
  const stop_time  = body.stop_time  ?? old.stop_time;
  const notes      = body.notes !== undefined ? body.notes : old.notes;

  const start = new Date(start_time);
  const stop  = new Date(stop_time);
  if (isNaN(start.getTime())) return Response.json({ error: 'Invalid start_time' }, { status: 400 });
  if (isNaN(stop.getTime()))  return Response.json({ error: 'Invalid stop_time' },  { status: 400 });
  if (stop <= start) return Response.json({ error: 'stop_time must be after start_time' }, { status: 400 });

  const durationMins = Math.round((stop.getTime() - start.getTime()) / 60_000);
  if (durationMins < MIN_DURATION_MINUTES) {
    return Response.json(
      { error: `Entry duration is too short. Minimum is ${MIN_DURATION_MINUTES} minutes.` },
      { status: 422 },
    );
  }

  // New date must also be in the current week and not in the future
  const newDate = start.toISOString().slice(0, 10);
  if (newDate < curWeekStart || newDate > curWeekEnd) {
    return Response.json({ error: 'Entry date must remain in the current week' }, { status: 422 });
  }
  if (newDate > todayUTC) {
    return Response.json({ error: 'Future time entries are not allowed.' }, { status: 422 });
  }

  const rounded = computeRounded(start, stop);
  const now     = new Date().toISOString();

  await env.DB.prepare(
    `UPDATE TimeEntries
     SET  start_time = ?, stop_time = ?,
          duration_minutes = ?, rounded_start_time = ?, rounded_stop_time = ?,
          rounded_duration_minutes = ?, notes = ?, updated_by = ?, updated_at = ?
     WHERE id = ?`,
  ).bind(
    start.toISOString(), stop.toISOString(),
    rounded.duration_minutes,
    rounded.rounded_start_time, rounded.rounded_stop_time, rounded.rounded_duration_minutes,
    notes, request.user.id, now, id,
  ).run();

  const entry = await env.DB.prepare(
    `SELECT te.id, te.project_id, p.name AS project_name, p.project_code,
            te.start_time, te.stop_time, te.duration_minutes, te.rounded_duration_minutes,
            te.rounded_start_time, te.rounded_stop_time,
            te.entry_source, te.status, te.notes
     FROM   TimeEntries te
     JOIN   Projects p ON p.id = te.project_id
     WHERE  te.id = ?`,
  ).bind(id).first();

  return Response.json({ data: entry });
}

// ── DELETE /api/my-time/:id — soft-delete manual entry ────────────────────────
export async function deleteMyEntry(request, env) {
  const guard = await requireAuth(request, env);
  if (guard) return guard;

  const id  = request.params.id;
  const old = await env.DB.prepare(
    `SELECT * FROM TimeEntries WHERE id = ? AND user_id = ? AND is_deleted = 0`,
  ).bind(id, request.user.id).first();
  if (!old) return Response.json({ error: 'Time entry not found' }, { status: 404 });

  if (old.entry_source !== 'manual_worker') {
    return Response.json({ error: 'Only manually entered sessions can be deleted' }, { status: 403 });
  }

  // Must be in the current ISO week and must not be a future date
  const entryDate    = old.start_time.slice(0, 10);
  const todayUTC     = new Date().toISOString().slice(0, 10);
  const curWeekStart = currentWeekStart();
  const curWeekEnd   = weekEndFor(curWeekStart);
  if (entryDate < curWeekStart || entryDate > curWeekEnd) {
    return Response.json({ error: 'Only entries in the current week can be deleted' }, { status: 422 });
  }
  if (entryDate > todayUTC) {
    return Response.json({ error: 'Future time entries are not allowed.' }, { status: 422 });
  }

  const now = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE TimeEntries SET is_deleted = 1, updated_by = ?, updated_at = ? WHERE id = ?`,
  ).bind(request.user.id, now, id).run();

  return Response.json({ ok: true });
}
