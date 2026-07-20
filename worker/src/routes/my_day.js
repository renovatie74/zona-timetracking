import { requireAuth }                                   from '../middleware/auth.js';
import { weekStartFor, weekEndFor, currentWeekStart,
         isoWeekNumber }                                  from '../lib/week.js';

function isAdminOrManager(role) {
  return role === 'administrator' || role === 'manager';
}

function isCurrentWeek(workDate) {
  const ws = currentWeekStart();
  return workDate >= ws && workDate <= weekEndFor(ws);
}

// ── GET /api/my-day?date=YYYY-MM-DD ──────────────────────────────────────────
export async function getDay(request, env) {
  const guard = await requireAuth(request, env);
  if (guard) return guard;

  const url  = new URL(request.url);
  const date = url.searchParams.get('date') ?? new Date().toISOString().slice(0, 10);

  const attendance = await env.DB.prepare(
    `SELECT id, work_date, start_time, finish_time, duration_minutes
     FROM DailyAttendance
     WHERE user_id = ? AND work_date = ? AND is_deleted = 0`,
  ).bind(request.user.id, date).first();

  const { results: projectHours } = await env.DB.prepare(
    `SELECT phe.id, phe.project_id, p.name AS project_name, p.project_code,
            phe.work_date, phe.hours_minutes, phe.note, phe.source
     FROM ProjectHourEntries phe
     JOIN Projects p ON p.id = phe.project_id
     WHERE phe.user_id = ? AND phe.work_date = ? AND phe.is_deleted = 0
     ORDER BY phe.created_at ASC`,
  ).bind(request.user.id, date).all();

  const attendanceMinutes = attendance?.duration_minutes ?? 0;
  const allocatedMinutes  = projectHours.reduce((s, r) => s + r.hours_minutes, 0);

  return Response.json({
    data: {
      date,
      attendance: attendance ?? null,
      project_hours: projectHours,
      totals: {
        attendance_minutes:        attendanceMinutes,
        allocated_project_minutes: allocatedMinutes,
        variance_minutes:          allocatedMinutes - attendanceMinutes,
      },
    },
  });
}

// ── GET /api/my-day/week?week=YYYY-MM-DD ─────────────────────────────────────
export async function getWeek(request, env) {
  const guard = await requireAuth(request, env);
  if (guard) return guard;

  const url       = new URL(request.url);
  const weekParam = url.searchParams.get('week') ?? new Date().toISOString().slice(0, 10);
  const weekStart = weekStartFor(weekParam);
  const weekEnd   = weekEndFor(weekParam);
  const { week: weekNum, year } = isoWeekNumber(weekStart);

  const { results: attendance } = await env.DB.prepare(
    `SELECT id, work_date, start_time, finish_time, duration_minutes
     FROM DailyAttendance
     WHERE user_id = ? AND work_date >= ? AND work_date <= ? AND is_deleted = 0`,
  ).bind(request.user.id, weekStart, weekEnd).all();

  const { results: projectHours } = await env.DB.prepare(
    `SELECT phe.id, phe.project_id, p.name AS project_name, p.project_code,
            phe.work_date, phe.hours_minutes, phe.note, phe.source
     FROM ProjectHourEntries phe
     JOIN Projects p ON p.id = phe.project_id
     WHERE phe.user_id = ? AND phe.work_date >= ? AND phe.work_date <= ? AND phe.is_deleted = 0
     ORDER BY phe.work_date ASC, phe.created_at ASC`,
  ).bind(request.user.id, weekStart, weekEnd).all();

  const attendanceByDate    = {};
  const projectHoursByDate  = {};
  for (const a of attendance)    attendanceByDate[a.work_date]        = a;
  for (const h of projectHours)  (projectHoursByDate[h.work_date] ??= []).push(h);

  return Response.json({
    data: {
      week_start:               weekStart,
      week_end:                 weekEnd,
      week_number:              weekNum,
      year,
      attendance_by_date:       attendanceByDate,
      project_hours_by_date:    projectHoursByDate,
      total_allocated_minutes:  projectHours.reduce((s, r) => s + r.hours_minutes, 0),
    },
  });
}

// ── PUT /api/my-day/attendance — upsert ──────────────────────────────────────
export async function putAttendance(request, env) {
  const guard = await requireAuth(request, env);
  if (guard) return guard;

  const { work_date, start_time, finish_time } = await request.json();
  if (!work_date)   return Response.json({ error: 'work_date is required' },   { status: 400 });
  if (!start_time)  return Response.json({ error: 'start_time is required' },  { status: 400 });
  if (!finish_time) return Response.json({ error: 'finish_time is required' }, { status: 400 });

  const timeRe = /^([01]\d|2[0-3]):([0-5]\d)$/;
  if (!timeRe.test(start_time))  return Response.json({ error: 'start_time must be HH:MM' },  { status: 400 });
  if (!timeRe.test(finish_time)) return Response.json({ error: 'finish_time must be HH:MM' }, { status: 400 });

  const [sh, sm] = start_time.split(':').map(Number);
  const [fh, fm] = finish_time.split(':').map(Number);
  const startMins  = sh * 60 + sm;
  const finishMins = fh * 60 + fm;
  if (finishMins <= startMins) {
    return Response.json({ error: 'finish_time must be after start_time' }, { status: 400 });
  }
  if (sm % 15 !== 0) {
    return Response.json({ error: 'start_time must be on a 15-minute boundary (HH:00, HH:15, HH:30, or HH:45)' }, { status: 400 });
  }
  if (fm % 15 !== 0) {
    return Response.json({ error: 'finish_time must be on a 15-minute boundary (HH:00, HH:15, HH:30, or HH:45)' }, { status: 400 });
  }

  if (!isAdminOrManager(request.user.role)) {
    if (!isCurrentWeek(work_date)) {
      return Response.json({ error: 'Attendance can only be entered for the current week' }, { status: 422 });
    }
    const today = new Date().toISOString().slice(0, 10);
    if (work_date > today) {
      return Response.json({ error: 'Future dates are not allowed' }, { status: 422 });
    }
  }

  const durationMinutes = finishMins - startMins;
  const now             = new Date().toISOString();

  await env.DB.prepare(
    `INSERT INTO DailyAttendance
       (user_id, work_date, start_time, finish_time, duration_minutes,
        created_by, updated_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, work_date) DO UPDATE
       SET start_time = excluded.start_time,
           finish_time = excluded.finish_time,
           duration_minutes = excluded.duration_minutes,
           updated_by = excluded.updated_by,
           updated_at = excluded.updated_at,
           is_deleted = 0`,
  ).bind(
    request.user.id, work_date, start_time, finish_time, durationMinutes,
    request.user.id, request.user.id, now, now,
  ).run();

  const row = await env.DB.prepare(
    `SELECT id, work_date, start_time, finish_time, duration_minutes
     FROM DailyAttendance WHERE user_id = ? AND work_date = ? AND is_deleted = 0`,
  ).bind(request.user.id, work_date).first();

  return Response.json({ data: row });
}

// ── POST /api/my-day/project-hours ───────────────────────────────────────────
export async function createProjectHours(request, env) {
  const guard = await requireAuth(request, env);
  if (guard) return guard;

  const { work_date, project_id, hours_minutes, note = null } = await request.json();
  if (!work_date)  return Response.json({ error: 'work_date is required' },  { status: 400 });
  if (!project_id) return Response.json({ error: 'project_id is required' }, { status: 400 });

  const mins = Math.round(Number(hours_minutes));
  if (!isFinite(mins) || mins <= 0) {
    return Response.json({ error: 'hours_minutes must be a positive number (minutes)' }, { status: 400 });
  }
  if (mins % 30 !== 0) {
    return Response.json({ error: 'hours_minutes must be a multiple of 30 (30-minute increments)' }, { status: 400 });
  }
  if (mins > 720) {
    return Response.json({ error: 'hours_minutes cannot exceed 720 (12 hours)' }, { status: 400 });
  }

  if (!isAdminOrManager(request.user.role)) {
    if (!isCurrentWeek(work_date)) {
      return Response.json({ error: 'Project hours can only be entered for the current week' }, { status: 422 });
    }
    const today = new Date().toISOString().slice(0, 10);
    if (work_date > today) {
      return Response.json({ error: 'Future dates are not allowed' }, { status: 422 });
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
  }

  const source = isAdminOrManager(request.user.role) ? 'admin_manual' : 'employee_manual';
  const now    = new Date().toISOString();

  const result = await env.DB.prepare(
    `INSERT INTO ProjectHourEntries
       (user_id, project_id, work_date, hours_minutes, note, source,
        created_by, updated_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    request.user.id, Number(project_id), work_date, mins, note ?? null, source,
    request.user.id, request.user.id, now, now,
  ).run();

  const entry = await env.DB.prepare(
    `SELECT phe.id, phe.project_id, p.name AS project_name, p.project_code,
            phe.work_date, phe.hours_minutes, phe.note, phe.source
     FROM ProjectHourEntries phe
     JOIN Projects p ON p.id = phe.project_id
     WHERE phe.id = ?`,
  ).bind(result.meta.last_row_id).first();

  return Response.json({ data: entry }, { status: 201 });
}

// ── PUT /api/my-day/project-hours/:id ────────────────────────────────────────
export async function updateProjectHours(request, env) {
  const guard = await requireAuth(request, env);
  if (guard) return guard;

  const id  = request.params.id;
  const old = await env.DB.prepare(
    `SELECT * FROM ProjectHourEntries WHERE id = ? AND user_id = ? AND is_deleted = 0`,
  ).bind(id, request.user.id).first();
  if (!old) return Response.json({ error: 'Entry not found' }, { status: 404 });

  if (!isAdminOrManager(request.user.role) && !isCurrentWeek(old.work_date)) {
    return Response.json({ error: 'Only entries in the current week can be edited' }, { status: 422 });
  }

  const body       = await request.json();
  const mins       = body.hours_minutes != null ? Math.round(Number(body.hours_minutes)) : old.hours_minutes;
  const note       = body.note !== undefined ? body.note : old.note;
  const project_id = body.project_id != null ? Number(body.project_id) : old.project_id;

  if (!isFinite(mins) || mins <= 0) {
    return Response.json({ error: 'hours_minutes must be > 0' }, { status: 400 });
  }
  if (mins % 30 !== 0) {
    return Response.json({ error: 'hours_minutes must be a multiple of 30 (30-minute increments)' }, { status: 400 });
  }
  if (mins > 720) {
    return Response.json({ error: 'hours_minutes cannot exceed 720 (12 hours)' }, { status: 400 });
  }

  const now = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE ProjectHourEntries
     SET hours_minutes = ?, note = ?, project_id = ?, updated_by = ?, updated_at = ?
     WHERE id = ?`,
  ).bind(mins, note ?? null, project_id, request.user.id, now, id).run();

  const entry = await env.DB.prepare(
    `SELECT phe.id, phe.project_id, p.name AS project_name, p.project_code,
            phe.work_date, phe.hours_minutes, phe.note, phe.source
     FROM ProjectHourEntries phe
     JOIN Projects p ON p.id = phe.project_id
     WHERE phe.id = ?`,
  ).bind(id).first();

  return Response.json({ data: entry });
}

// ── DELETE /api/my-day/project-hours/:id ─────────────────────────────────────
export async function deleteProjectHours(request, env) {
  const guard = await requireAuth(request, env);
  if (guard) return guard;

  const id  = request.params.id;
  const old = await env.DB.prepare(
    `SELECT * FROM ProjectHourEntries WHERE id = ? AND user_id = ? AND is_deleted = 0`,
  ).bind(id, request.user.id).first();
  if (!old) return Response.json({ error: 'Entry not found' }, { status: 404 });

  if (!isAdminOrManager(request.user.role) && !isCurrentWeek(old.work_date)) {
    return Response.json({ error: 'Only entries in the current week can be deleted' }, { status: 422 });
  }

  const now = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE ProjectHourEntries SET is_deleted = 1, updated_by = ?, updated_at = ? WHERE id = ?`,
  ).bind(request.user.id, now, id).run();

  return Response.json({ ok: true });
}
