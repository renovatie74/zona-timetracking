import { requireRole }    from '../middleware/auth.js';
import { writeAudit }     from '../lib/audit.js';
import { nextProjectCode } from '../lib/sequence.js';

const ADMIN        = requireRole('administrator');
const ADMIN_OR_MGR = requireRole('administrator', 'manager');

const VALID_STATUSES = ['planning', 'active', 'completed', 'cancelled'];

export async function list(request, env) {
  const guard = await ADMIN_OR_MGR(request, env);
  if (guard) return guard;

  const url    = new URL(request.url);
  const search = url.searchParams.get('search')?.trim() ?? '';
  const status = url.searchParams.get('status')?.trim() ?? '';

  const conditions = ['p.is_active = 1'];
  const params     = [];

  if (search) {
    conditions.push('(p.name LIKE ? OR p.project_code LIKE ? OR p.client_name LIKE ? OR p.location LIKE ?)');
    const like = `%${search}%`;
    params.push(like, like, like, like);
  }
  if (status && VALID_STATUSES.includes(status)) {
    conditions.push('p.status = ?');
    params.push(status);
  }

  const where = conditions.join(' AND ');
  const stmt  = env.DB.prepare(
    `SELECT p.id, p.project_code, p.name, p.client_name, p.location,
            p.status, p.start_date, p.end_date, p.is_active, p.created_at, p.updated_at
     FROM Projects p
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
    `SELECT id, project_code, name, client_name, location,
            status, start_date, end_date, is_active, created_at, updated_at
     FROM Projects WHERE id = ?`,
  ).bind(request.params.id).first();

  if (!project) return Response.json({ error: 'Project not found' }, { status: 404 });
  return Response.json({ data: project });
}

export async function create(request, env) {
  const guard = await ADMIN(request, env);
  if (guard) return guard;

  const { name, client_name = null, location = null, status = 'planning',
          start_date, end_date = null } = await request.json();

  if (!name?.trim())   return Response.json({ error: 'Name is required' }, { status: 400 });
  if (!start_date)     return Response.json({ error: 'Start date is required' }, { status: 400 });
  if (!VALID_STATUSES.includes(status)) {
    return Response.json({ error: `Status must be one of: ${VALID_STATUSES.join(', ')}` }, { status: 400 });
  }

  const { project_code, seq } = await nextProjectCode(env.DB);
  const now = new Date().toISOString();

  const result = await env.DB.prepare(
    `INSERT INTO Projects
       (project_code, project_code_seq, name, client_name, location, status,
        start_date, end_date, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
  ).bind(project_code, seq, name.trim(), client_name, location, status,
         start_date, end_date, now, now).run();

  const projectId = result.meta.last_row_id;

  await writeAudit(env.DB, {
    actorId: request.user.id, action: 'created', entityType: 'project', entityId: projectId,
    oldValues: null, newValues: { project_code, name, status },
  });

  const project = await env.DB.prepare('SELECT * FROM Projects WHERE id = ?').bind(projectId).first();
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

  const name        = body.name        !== undefined ? body.name.trim()  : old.name;
  const client_name = body.client_name !== undefined ? body.client_name  : old.client_name;
  const location    = body.location    !== undefined ? body.location      : old.location;
  const status      = body.status      !== undefined ? body.status        : old.status;
  const start_date  = body.start_date  !== undefined ? body.start_date    : old.start_date;
  const end_date    = body.end_date    !== undefined ? body.end_date      : old.end_date;
  const is_active   = body.is_active   !== undefined ? (body.is_active ? 1 : 0) : old.is_active;
  const now = new Date().toISOString();

  await env.DB.prepare(
    `UPDATE Projects
     SET name = ?, client_name = ?, location = ?, status = ?,
         start_date = ?, end_date = ?, is_active = ?, updated_at = ?
     WHERE id = ?`,
  ).bind(name, client_name, location, status, start_date, end_date, is_active, now, id).run();

  await writeAudit(env.DB, {
    actorId: request.user.id, action: 'updated', entityType: 'project', entityId: Number(id),
    oldValues: { name: old.name, status: old.status }, newValues: body,
  });

  const project = await env.DB.prepare('SELECT * FROM Projects WHERE id = ?').bind(id).first();
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
    actorId: request.user.id, action: 'deleted', entityType: 'project', entityId: Number(id),
    oldValues: old, newValues: null,
  });

  return Response.json({ ok: true });
}
