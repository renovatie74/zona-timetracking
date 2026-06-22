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
  (SELECT COUNT(*) FROM Extras ex WHERE ex.project_id = p.id AND ex.status = 'open' AND ex.is_deleted = 0) AS open_extras_count
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

// ── Employee: projects assigned to the current user (Sprint 3B) ───────────────
// Returns assigned projects with recent ones (from RecentProjects) listed first.
export async function mine(request, env) {
  const guard = await requireAuth(request, env);
  if (guard) return guard;

  const url = new URL(request.url);
  const q   = (url.searchParams.get('q') ?? '').trim();

  const { results } = await env.DB.prepare(
    `SELECT p.id, p.project_code, p.name, p.is_active,
            rp.rank AS recent_rank
     FROM   ProjectAssignments pa
     JOIN   Projects p ON p.id = pa.project_id
     LEFT   JOIN RecentProjects rp ON rp.project_id = p.id AND rp.user_id = pa.user_id
     WHERE  pa.user_id = ? AND p.is_active = 1
       ${q ? "AND (p.name LIKE '%' || ? || '%' OR p.project_code LIKE '%' || ? || '%')" : ''}
     ORDER  BY rp.rank ASC NULLS LAST, p.name ASC
     LIMIT  50`,
  ).bind(...(q ? [request.user.id, q, q] : [request.user.id])).all();

  return Response.json({ data: results });
}
