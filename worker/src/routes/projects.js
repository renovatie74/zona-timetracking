import { requireRole, requireAuth } from '../middleware/auth.js';
import { writeAudit }               from '../lib/audit.js';
import { nextProjectCode }          from '../lib/sequence.js';
import { getManagerScope }          from '../lib/scope.js';

const ADMIN        = requireRole('administrator');
const ADMIN_OR_MGR = requireRole('administrator', 'manager');

const VALID_STATUSES = ['planning', 'active', 'completed', 'cancelled'];

const SELECT_COLS = `
  p.id, p.project_code, p.name, p.client_id,
  c.name AS client_name, c.client_code,
  p.location, p.status, p.start_date, p.end_date, p.is_active, p.created_at, p.updated_at,
  (SELECT COUNT(*) FROM Extras ex WHERE ex.project_id = p.id AND ex.status = 'open' AND ex.is_deleted = 0) AS open_extras_count,
  (SELECT COUNT(*) FROM ProjectAssignments pa WHERE pa.project_id = p.id) AS assignment_count
`;

export async function list(request, env) {
  const guard = await ADMIN_OR_MGR(request, env);
  if (guard) return guard;

  const url       = new URL(request.url);
  const search    = url.searchParams.get('search')?.trim()    ?? '';
  const status    = url.searchParams.get('status')?.trim()    ?? '';
  const client_id = url.searchParams.get('client_id')?.trim() ?? '';

  const conditions = ['p.is_active = 1'];
  const params     = [];

  // Manager visibility: restrict to projects reachable via their team assignments
  if (request.user.role === 'manager') {
    const scope = await getManagerScope(env.DB, request.user.id);
    if (scope.projectIds.length === 0) return Response.json({ data: [] });
    const ph = scope.projectIds.map(() => '?').join(',');
    conditions.push(`p.id IN (${ph})`);
    params.push(...scope.projectIds);
  }

  // Status filter — default (no param) = planning + active
  if (status === 'all') {
    // no status condition, show all active projects regardless of workflow status
  } else if (status && VALID_STATUSES.includes(status)) {
    conditions.push('p.status = ?');
    params.push(status);
  } else {
    // default: planning + active only
    conditions.push("p.status IN ('planning', 'active')");
  }

  if (client_id) {
    conditions.push('p.client_id = ?');
    params.push(Number(client_id));
  }

  if (search) {
    conditions.push('(p.name LIKE ? OR p.project_code LIKE ? OR c.name LIKE ? OR p.location LIKE ?)');
    const like = `%${search}%`;
    params.push(like, like, like, like);
  }

  const where = conditions.join(' AND ');
  const stmt  = env.DB.prepare(
    `SELECT ${SELECT_COLS}
     FROM Projects p
     LEFT JOIN Clients c ON c.id = p.client_id
     WHERE ${where}
     ORDER BY p.project_code_seq`,
  );

  const { results } = await (params.length ? stmt.bind(...params) : stmt).all();
  return Response.json({ data: results });
}

export async function get(request, env) {
  const guard = await ADMIN_OR_MGR(request, env);
  if (guard) return guard;

  const project = await env.DB.prepare(
    `SELECT ${SELECT_COLS}
     FROM Projects p
     LEFT JOIN Clients c ON c.id = p.client_id
     WHERE p.id = ?`,
  ).bind(request.params.id).first();

  if (!project) return Response.json({ error: 'Project not found' }, { status: 404 });
  return Response.json({ data: project });
}

export async function create(request, env) {
  const guard = await ADMIN(request, env);
  if (guard) return guard;

  const { name, client_id = null, location = null, status = 'planning',
          start_date, end_date = null } = await request.json();

  if (!name?.trim())   return Response.json({ error: 'Name is required' }, { status: 400 });
  if (!start_date)     return Response.json({ error: 'Start date is required' }, { status: 400 });
  if (!VALID_STATUSES.includes(status)) {
    return Response.json({ error: `Status must be one of: ${VALID_STATUSES.join(', ')}` }, { status: 400 });
  }

  if (client_id) {
    const client = await env.DB.prepare('SELECT id FROM Clients WHERE id = ? AND is_active = 1').bind(client_id).first();
    if (!client) return Response.json({ error: 'Client not found' }, { status: 400 });
  }

  const { project_code, seq } = await nextProjectCode(env.DB);
  const now = new Date().toISOString();

  const result = await env.DB.prepare(
    `INSERT INTO Projects
       (project_code, project_code_seq, name, client_id, location, status,
        start_date, end_date, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
  ).bind(project_code, seq, name.trim(), client_id, location, status,
         start_date, end_date, now, now).run();

  const projectId = result.meta.last_row_id;

  await writeAudit(env.DB, {
    actorId: request.user.id, action: 'created', entityType: 'project', entityId: projectId,
    oldValues: null, newValues: { project_code, name, status },
  });

  const project = await env.DB.prepare(
    `SELECT ${SELECT_COLS} FROM Projects p LEFT JOIN Clients c ON c.id = p.client_id WHERE p.id = ?`,
  ).bind(projectId).first();
  return Response.json({ data: project }, { status: 201 });
}

export async function update(request, env) {
  const guard = await ADMIN(request, env);
  if (guard) return guard;

  const id  = request.params.id;
  const old = await env.DB.prepare('SELECT * FROM Projects WHERE id = ?').bind(id).first();
  if (!old) return Response.json({ error: 'Project not found' }, { status: 404 });

  const body = await request.json();

  if (body.status && !VALID_STATUSES.includes(body.status)) {
    return Response.json({ error: `Status must be one of: ${VALID_STATUSES.join(', ')}` }, { status: 400 });
  }

  if (body.client_id) {
    const client = await env.DB.prepare('SELECT id FROM Clients WHERE id = ? AND is_active = 1').bind(body.client_id).first();
    if (!client) return Response.json({ error: 'Client not found' }, { status: 400 });
  }

  const name      = body.name      !== undefined ? body.name.trim() : old.name;
  const client_id = body.client_id !== undefined ? body.client_id   : old.client_id;
  const location  = body.location  !== undefined ? body.location    : old.location;
  const status    = body.status    !== undefined ? body.status      : old.status;
  const start_date = body.start_date !== undefined ? body.start_date : old.start_date;
  const end_date   = body.end_date   !== undefined ? body.end_date   : old.end_date;
  const is_active  = body.is_active  !== undefined ? (body.is_active ? 1 : 0) : old.is_active;
  const now = new Date().toISOString();

  await env.DB.prepare(
    `UPDATE Projects
     SET name = ?, client_id = ?, location = ?, status = ?,
         start_date = ?, end_date = ?, is_active = ?, updated_at = ?
     WHERE id = ?`,
  ).bind(name, client_id, location, status, start_date, end_date, is_active, now, id).run();

  await writeAudit(env.DB, {
    actorId: request.user.id, action: 'updated', entityType: 'project', entityId: Number(id),
    oldValues: { name: old.name, status: old.status }, newValues: body,
  });

  const project = await env.DB.prepare(
    `SELECT ${SELECT_COLS} FROM Projects p LEFT JOIN Clients c ON c.id = p.client_id WHERE p.id = ?`,
  ).bind(id).first();
  return Response.json({ data: project });
}

export async function remove(request, env) {
  const guard = await ADMIN(request, env);
  if (guard) return guard;

  const id  = request.params.id;
  const old = await env.DB.prepare('SELECT id, name FROM Projects WHERE id = ?').bind(id).first();
  if (!old) return Response.json({ error: 'Project not found' }, { status: 404 });

  const now = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE Projects SET is_active = 0, updated_at = ? WHERE id = ?`,
  ).bind(now, id).run();

  await writeAudit(env.DB, {
    actorId: request.user.id, action: 'deactivated', entityType: 'project', entityId: Number(id),
    oldValues: old, newValues: null,
  });

  return Response.json({ ok: true });
}

// ── Assignment endpoints (Sprint 3A) ──────────────────────────────────────────

export async function listAssignments(request, env) {
  const guard = await ADMIN_OR_MGR(request, env);
  if (guard) return guard;

  const id = request.params.id;
  const project = await env.DB.prepare('SELECT id FROM Projects WHERE id = ?').bind(id).first();
  if (!project) return Response.json({ error: 'Project not found' }, { status: 404 });

  const { results } = await env.DB.prepare(
    `SELECT u.id, u.employee_number AS employee_code,
            (u.first_name || ' ' || u.last_name) AS name, r.name AS role
     FROM   ProjectAssignments pa
     JOIN   Users u ON u.id = pa.user_id
     JOIN   Roles r ON r.id = u.role_id
     WHERE  pa.project_id = ?
     ORDER  BY u.first_name, u.last_name`,
  ).bind(id).all();

  return Response.json({ data: results });
}

export async function setAssignments(request, env) {
  const guard = await ADMIN(request, env);
  if (guard) return guard;

  const id = request.params.id;
  const project = await env.DB.prepare('SELECT id FROM Projects WHERE id = ?').bind(id).first();
  if (!project) return Response.json({ error: 'Project not found' }, { status: 404 });

  const { user_ids = [] } = await request.json();
  if (!Array.isArray(user_ids)) {
    return Response.json({ error: 'user_ids must be an array' }, { status: 400 });
  }

  const now = new Date().toISOString();

  // Replace full assignment list atomically via D1 batch
  const deleteStmt  = env.DB.prepare('DELETE FROM ProjectAssignments WHERE project_id = ?').bind(id);
  const insertStmts = user_ids.map(uid =>
    env.DB.prepare(
      'INSERT OR IGNORE INTO ProjectAssignments (project_id, user_id, created_at) VALUES (?, ?, ?)',
    ).bind(Number(id), Number(uid), now),
  );

  await env.DB.batch([deleteStmt, ...insertStmts]);

  await writeAudit(env.DB, {
    actorId: request.user.id, action: 'assignments_updated', entityType: 'project', entityId: Number(id),
    oldValues: null, newValues: { user_ids },
  });

  const { results } = await env.DB.prepare(
    `SELECT u.id, u.employee_number AS employee_code,
            (u.first_name || ' ' || u.last_name) AS name, r.name AS role
     FROM   ProjectAssignments pa
     JOIN   Users u ON u.id = pa.user_id
     JOIN   Roles r ON r.id = u.role_id
     WHERE  pa.project_id = ?
     ORDER  BY u.first_name, u.last_name`,
  ).bind(id).all();

  return Response.json({ data: results });
}

// ── Project weekly hours breakdown (Sprint 6) ─────────────────────────────────
export async function weeklyHours(request, env) {
  const guard = await ADMIN_OR_MGR(request, env);
  if (guard) return guard;

  const id      = request.params.id;
  const project = await env.DB.prepare('SELECT id FROM Projects WHERE id = ?').bind(id).first();
  if (!project) return Response.json({ error: 'Project not found' }, { status: 404 });

  const url       = new URL(request.url);
  const weekParam = url.searchParams.get('week') ?? new Date().toISOString().slice(0, 10);

  // Inline week helpers (avoid importing week.js circular concern)
  function weekStartFor(dateStr) {
    const d   = new Date(dateStr + 'T00:00:00Z');
    const day = d.getUTCDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setUTCDate(d.getUTCDate() + diff);
    return d.toISOString().slice(0, 10);
  }
  const weekStart = weekStartFor(weekParam);
  const weekEndD  = new Date(weekStart + 'T00:00:00Z');
  weekEndD.setUTCDate(weekEndD.getUTCDate() + 6);
  const weekEnd   = weekEndD.toISOString().slice(0, 10);

  function isoWeekNumber(dateStr) {
    const d = new Date(dateStr + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  }

  const { results } = await env.DB.prepare(
    `SELECT phe.user_id,
            (u.first_name || ' ' || u.last_name) AS employee_name,
            u.employee_number AS employee_code,
            SUM(phe.hours_minutes) AS total_minutes
     FROM ProjectHourEntries phe
     JOIN Users u ON u.id = phe.user_id
     WHERE phe.project_id = ? AND phe.work_date >= ? AND phe.work_date <= ? AND phe.is_deleted = 0
     GROUP BY phe.user_id
     ORDER BY employee_name`,
  ).bind(Number(id), weekStart, weekEnd).all();

  return Response.json({ data: { week_start: weekStart, week_end: weekEnd, week_number: isoWeekNumber(weekStart), employees: results } });
}

// ── Project timesheet matrix (Sprint 6.4) ────────────────────────────────────
export async function timesheetMatrix(request, env) {
  const guard = await ADMIN_OR_MGR(request, env);
  if (guard) return guard;

  const id      = request.params.id;
  const project = await env.DB.prepare(
    `SELECT p.id, p.name, p.project_code, p.status, c.name AS client_name
     FROM Projects p
     LEFT JOIN Clients c ON c.id = p.client_id
     WHERE p.id = ?`
  ).bind(Number(id)).first();
  if (!project) return Response.json({ error: 'Project not found' }, { status: 404 });

  const url        = new URL(request.url);
  const numWeeks   = Math.min(Math.max(parseInt(url.searchParams.get('weeks') ?? '8', 10), 1), 26);
  const endWeekRaw = url.searchParams.get('end_week_start') ?? new Date().toISOString().slice(0, 10);

  function _ws(dateStr) {
    const d = new Date(dateStr + 'T00:00:00Z');
    const day = d.getUTCDay();
    d.setUTCDate(d.getUTCDate() + (day === 0 ? -6 : 1 - day));
    return d.toISOString().slice(0, 10);
  }
  function _meta(ws) {
    const d = new Date(ws + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
    const year = d.getUTCFullYear();
    const endD = new Date(ws + 'T00:00:00Z');
    endD.setUTCDate(endD.getUTCDate() + 6);
    return { week_start: ws, week_end: endD.toISOString().slice(0, 10), week_number: week, year, label: `W${week}` };
  }

  const endWS = _ws(endWeekRaw);
  const weeks = [];
  for (let i = numWeeks - 1; i >= 0; i--) {
    const d = new Date(endWS + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() - i * 7);
    weeks.push(d.toISOString().slice(0, 10));
  }
  const lastEndD = new Date(weeks.at(-1) + 'T00:00:00Z');
  lastEndD.setUTCDate(lastEndD.getUTCDate() + 6);

  const { results } = await env.DB.prepare(
    `SELECT phe.user_id,
            (u.first_name || ' ' || u.last_name) AS employee_name,
            u.employee_number AS employee_code,
            phe.work_date, SUM(phe.hours_minutes) AS minutes
     FROM ProjectHourEntries phe
     JOIN Users u ON u.id = phe.user_id
     WHERE phe.project_id = ? AND phe.work_date >= ? AND phe.work_date <= ? AND phe.is_deleted = 0
     GROUP BY phe.user_id, phe.work_date
     ORDER BY employee_name, phe.work_date`
  ).bind(Number(id), weeks[0], lastEndD.toISOString().slice(0, 10)).all();

  const weekSet = new Set(weeks);
  const rowMap  = new Map();
  for (const r of results) {
    const ws = _ws(r.work_date);
    if (!weekSet.has(ws)) continue;
    if (!rowMap.has(r.user_id)) {
      rowMap.set(r.user_id, { user_id: r.user_id, employee_code: r.employee_code, employee_name: r.employee_name, wm: {} });
    }
    const row = rowMap.get(r.user_id);
    row.wm[ws] = (row.wm[ws] ?? 0) + r.minutes;
  }

  const rows = Array.from(rowMap.values()).map(row => {
    const weekly_hours = {};
    let totalMins = 0;
    for (const ws of weeks) {
      const m = row.wm[ws] ?? 0;
      if (m > 0) weekly_hours[ws] = Math.round(m / 60 * 100) / 100;
      totalMins += m;
    }
    return { user_id: row.user_id, employee_code: row.employee_code, employee_name: row.employee_name, weekly_hours, total_hours: Math.round(totalMins / 60 * 100) / 100 };
  });

  const totals_by_week = {};
  let grandMins = 0;
  for (const ws of weeks) {
    let wm = 0;
    for (const row of rowMap.values()) wm += (row.wm[ws] ?? 0);
    totals_by_week[ws] = Math.round(wm / 60 * 100) / 100;
    grandMins += wm;
  }

  // Invoice statuses for the queried weeks
  const ph = weeks.map(() => '?').join(',');
  const { results: invRows } = await env.DB.prepare(
    `SELECT pwis.week_start, pwis.status, pwis.invoiced_at,
            (u.first_name || ' ' || u.last_name) AS invoiced_by_name
     FROM ProjectWeekInvoiceStatus pwis
     JOIN Users u ON u.id = pwis.invoiced_by
     WHERE pwis.project_id = ? AND pwis.week_start IN (${ph})`,
  ).bind(Number(id), ...weeks).all();

  const invoice_statuses = {};
  for (const r of invRows) {
    invoice_statuses[r.week_start] = { status: r.status, invoiced_at: r.invoiced_at, invoiced_by_name: r.invoiced_by_name };
  }

  return Response.json({
    data: {
      project:           { id: project.id, name: project.name, project_code: project.project_code, status: project.status, client_name: project.client_name },
      weeks:             weeks.map(_meta),
      rows,
      totals_by_week,
      grand_total_hours: Math.round(grandMins / 60 * 100) / 100,
      invoice_statuses,
    },
  });
}

// ── Employee: projects assigned to the current user (Sprint 3B) ───────────────
// Returns assigned projects with recent ones (from RecentProjects) listed first.
export async function mine(request, env) {
  const guard = await requireAuth(request, env);
  if (guard) return guard;

  const url = new URL(request.url);
  const q   = (url.searchParams.get('q') ?? '').trim();

  // Permission rule: no assignments on a project → visible to all active employees.
  // One or more assignments → only those assigned employees see it.
  const { results } = await env.DB.prepare(
    `SELECT p.id, p.project_code, p.name, p.is_active,
            rp.rank AS recent_rank
     FROM   Projects p
     LEFT   JOIN ProjectAssignments pa ON pa.project_id = p.id AND pa.user_id = ?
     LEFT   JOIN RecentProjects rp     ON rp.project_id = p.id AND rp.user_id = ?
     WHERE  p.is_active = 1
       AND  (
              pa.user_id IS NOT NULL
              OR NOT EXISTS (
                SELECT 1 FROM ProjectAssignments x WHERE x.project_id = p.id
              )
            )
       ${q ? "AND (p.name LIKE '%' || ? || '%' OR p.project_code LIKE '%' || ? || '%')" : ''}
     ORDER  BY rp.rank ASC NULLS LAST, p.name ASC
     LIMIT  50`,
  ).bind(...(q ? [request.user.id, request.user.id, q, q] : [request.user.id, request.user.id])).all();

  return Response.json({ data: results });
}

// ── Billing Horizon (Sprint 10.1) ────────────────────────────────────────────
// Returns per-project hours + invoice status for the last 4 weeks ending at
// end_week_start. Used by the Projects list to render the billing horizon strip.
export async function billingHorizon(request, env) {
  const guard = await ADMIN_OR_MGR(request, env);
  if (guard) return guard;

  const url        = new URL(request.url);
  const endWeekRaw = url.searchParams.get('end_week_start') ?? new Date().toISOString().slice(0, 10);

  function _ws(dateStr) {
    const d = new Date(dateStr + 'T00:00:00Z');
    const day = d.getUTCDay();
    d.setUTCDate(d.getUTCDate() + (day === 0 ? -6 : 1 - day));
    return d.toISOString().slice(0, 10);
  }
  function _meta(ws) {
    const d = new Date(ws + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
    const year = d.getUTCFullYear();
    const endD = new Date(ws + 'T00:00:00Z');
    endD.setUTCDate(endD.getUTCDate() + 6);
    return { week_start: ws, week_end: endD.toISOString().slice(0, 10), week_number: week, year };
  }

  const NUM_WEEKS = 4;
  const endWS     = _ws(endWeekRaw);
  const weeks     = [];
  for (let i = NUM_WEEKS - 1; i >= 0; i--) {
    const d = new Date(endWS + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() - i * 7);
    weeks.push(d.toISOString().slice(0, 10));
  }
  const weekMetas  = weeks.map(_meta);
  const weekSet    = new Set(weeks);
  const rangeStart = weeks[0];
  const lastD      = new Date(endWS + 'T00:00:00Z');
  lastD.setUTCDate(lastD.getUTCDate() + 6);
  const rangeEnd   = lastD.toISOString().slice(0, 10);

  // Manager scope
  let projectIds = null;
  if (request.user.role === 'manager') {
    const scope = await getManagerScope(env.DB, request.user.id);
    projectIds = scope.projectIds;
    if (projectIds.length === 0) {
      return Response.json({ data: { weeks: weekMetas, by_project: {} } });
    }
  }

  const pidParams  = projectIds ?? [];
  const pidCond    = pidParams.length ? `AND phe.project_id IN (${pidParams.map(() => '?').join(',')})` : '';
  const invPidCond = pidParams.length ? `AND pwis.project_id IN (${pidParams.map(() => '?').join(',')})` : '';

  const [{ results: hourRows }, { results: invRows }] = await Promise.all([
    env.DB.prepare(
      `SELECT phe.project_id, phe.work_date, SUM(phe.hours_minutes) AS total_minutes
       FROM ProjectHourEntries phe
       JOIN Projects p ON p.id = phe.project_id AND p.is_active = 1
       WHERE phe.work_date >= ? AND phe.work_date <= ? AND phe.is_deleted = 0
       ${pidCond}
       GROUP BY phe.project_id, phe.work_date`,
    ).bind(rangeStart, rangeEnd, ...pidParams).all(),
    env.DB.prepare(
      `SELECT pwis.project_id, pwis.week_start, pwis.status
       FROM ProjectWeekInvoiceStatus pwis
       WHERE pwis.week_start IN (${weeks.map(() => '?').join(',')})
       ${invPidCond}`,
    ).bind(...weeks, ...pidParams).all(),
  ]);

  // Aggregate hours: { projectId -> { weekStart -> totalMinutes } }
  const hoursMap = {};
  for (const row of hourRows) {
    const ws = _ws(row.work_date);
    if (!weekSet.has(ws)) continue;
    if (!hoursMap[row.project_id]) hoursMap[row.project_id] = {};
    hoursMap[row.project_id][ws] = (hoursMap[row.project_id][ws] ?? 0) + row.total_minutes;
  }

  // Invoice statuses: { projectId -> { weekStart -> status } }
  const invMap = {};
  for (const row of invRows) {
    if (!invMap[row.project_id]) invMap[row.project_id] = {};
    invMap[row.project_id][row.week_start] = row.status;
  }

  // Merge into by_project — only projects that have hours or invoice records
  const allPids = new Set([...Object.keys(hoursMap).map(Number), ...Object.keys(invMap).map(Number)]);
  const by_project = {};
  for (const pid of allPids) {
    by_project[pid] = weekMetas.map(wm => ({
      week_start:     wm.week_start,
      week_number:    wm.week_number,
      year:           wm.year,
      total_minutes:  hoursMap[pid]?.[wm.week_start] ?? 0,
      invoice_status: invMap[pid]?.[wm.week_start]   ?? null,
    }));
  }

  return Response.json({ data: { weeks: weekMetas, by_project } });
}

// ── Project week invoice status (Sprint 10) ───────────────────────────────────
export async function setInvoiceStatus(request, env) {
  const guard = await ADMIN_OR_MGR(request, env);
  if (guard) return guard;

  const id = request.params.id;
  const project = await env.DB.prepare(
    'SELECT id, project_code, name FROM Projects WHERE id = ?',
  ).bind(Number(id)).first();
  if (!project) return Response.json({ error: 'Project not found' }, { status: 404 });

  const { week_start, action } = await request.json();

  if (!week_start || !/^\d{4}-\d{2}-\d{2}$/.test(week_start)) {
    return Response.json({ error: 'week_start is required (YYYY-MM-DD)' }, { status: 400 });
  }
  if (!['invoice', 'uninvoice'].includes(action)) {
    return Response.json({ error: 'action must be "invoice" or "uninvoice"' }, { status: 400 });
  }

  // Derive iso_week + year from week_start (Monday of the week)
  const d = new Date(week_start + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const iso_week  = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  const year      = d.getUTCFullYear();
  const now       = new Date().toISOString();

  if (action === 'invoice') {
    await env.DB.prepare(
      `INSERT INTO ProjectWeekInvoiceStatus
         (project_id, iso_week, year, week_start, status, invoiced_at, invoiced_by)
       VALUES (?, ?, ?, ?, 'invoiced', ?, ?)
       ON CONFLICT(project_id, week_start) DO UPDATE SET
         status = 'invoiced', invoiced_at = excluded.invoiced_at, invoiced_by = excluded.invoiced_by`,
    ).bind(Number(id), iso_week, year, week_start, now, request.user.id).run();

    await writeAudit(env.DB, {
      actorId: request.user.id, action: 'week_invoiced', entityType: 'project', entityId: Number(id),
      oldValues: null, newValues: { week_start, iso_week, year },
    });

    const row = await env.DB.prepare(
      `SELECT pwis.week_start, pwis.status, pwis.invoiced_at,
              (u.first_name || ' ' || u.last_name) AS invoiced_by_name
       FROM ProjectWeekInvoiceStatus pwis
       JOIN Users u ON u.id = pwis.invoiced_by
       WHERE pwis.project_id = ? AND pwis.week_start = ?`,
    ).bind(Number(id), week_start).first();

    return Response.json({ ok: true, week_start, invoice_status: row });
  } else {
    await env.DB.prepare(
      'DELETE FROM ProjectWeekInvoiceStatus WHERE project_id = ? AND week_start = ?',
    ).bind(Number(id), week_start).run();

    await writeAudit(env.DB, {
      actorId: request.user.id, action: 'week_uninvoiced', entityType: 'project', entityId: Number(id),
      oldValues: { week_start, iso_week, year }, newValues: null,
    });

    return Response.json({ ok: true, week_start, invoice_status: null });
  }
}
