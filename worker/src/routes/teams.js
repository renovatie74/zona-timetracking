import { requireAuth, requireRole } from '../middleware/auth.js';
import { writeAudit }               from '../lib/audit.js';

const ADMIN       = requireRole('administrator');
const ADMIN_OR_MGR = requireRole('administrator', 'manager');

export async function list(request, env) {
  const guard = await ADMIN_OR_MGR(request, env);
  if (guard) return guard;

  const url    = new URL(request.url);
  const status = url.searchParams.get('status')?.trim() ?? '';

  let whereClause = 'WHERE t.is_active = 1';
  if (status === 'inactive') whereClause = 'WHERE t.is_active = 0';
  else if (status === 'all') whereClause = '';

  const { results } = await env.DB.prepare(
    `SELECT t.id, t.name, t.supervisor_id, t.is_active, t.created_at, t.updated_at,
            u.name AS supervisor_name
     FROM Teams t
     LEFT JOIN Users u ON u.id = t.supervisor_id
     ${whereClause}
     ORDER BY t.name`,
  ).all();

  return Response.json({ data: results });
}

export async function get(request, env) {
  const guard = await ADMIN_OR_MGR(request, env);
  if (guard) return guard;

  const team = await env.DB.prepare(
    `SELECT t.id, t.name, t.supervisor_id, t.is_active, t.created_at, t.updated_at,
            u.name AS supervisor_name
     FROM Teams t
     LEFT JOIN Users u ON u.id = t.supervisor_id
     WHERE t.id = ?`,
  ).bind(request.params.id).first();

  if (!team) return Response.json({ error: 'Team not found' }, { status: 404 });
  return Response.json({ data: team });
}

export async function create(request, env) {
  const guard = await ADMIN(request, env);
  if (guard) return guard;

  const { name, supervisor_id = null } = await request.json();

  if (!name?.trim()) {
    return Response.json({ error: 'Name is required' }, { status: 400 });
  }

  const now = new Date().toISOString();

  let teamId;
  try {
    const result = await env.DB.prepare(
      `INSERT INTO Teams (name, supervisor_id, is_active, created_at, updated_at)
       VALUES (?, ?, 1, ?, ?)`,
    ).bind(name.trim(), supervisor_id, now, now).run();
    teamId = result.meta.last_row_id;
  } catch (e) {
    if (e.message?.includes('UNIQUE')) {
      return Response.json({ error: 'A team with that name already exists' }, { status: 409 });
    }
    throw e;
  }

  await writeAudit(env.DB, {
    actorId: request.user.id, action: 'created', entityType: 'team', entityId: teamId,
    oldValues: null, newValues: { name, supervisor_id },
  });

  const team = await env.DB.prepare('SELECT * FROM Teams WHERE id = ?').bind(teamId).first();
  return Response.json({ data: team }, { status: 201 });
}

export async function update(request, env) {
  const guard = await ADMIN(request, env);
  if (guard) return guard;

  const id  = request.params.id;
  const old = await env.DB.prepare('SELECT * FROM Teams WHERE id = ?').bind(id).first();
  if (!old) return Response.json({ error: 'Team not found' }, { status: 404 });

  const body = await request.json();
  const name          = body.name          !== undefined ? body.name.trim()    : old.name;
  const supervisor_id = body.supervisor_id !== undefined ? body.supervisor_id  : old.supervisor_id;
  const is_active     = body.is_active     !== undefined ? (body.is_active ? 1 : 0) : old.is_active;
  const now = new Date().toISOString();

  try {
    await env.DB.prepare(
      `UPDATE Teams SET name = ?, supervisor_id = ?, is_active = ?, updated_at = ? WHERE id = ?`,
    ).bind(name, supervisor_id, is_active, now, id).run();
  } catch (e) {
    if (e.message?.includes('UNIQUE')) {
      return Response.json({ error: 'A team with that name already exists' }, { status: 409 });
    }
    throw e;
  }

  await writeAudit(env.DB, {
    actorId: request.user.id, action: 'updated', entityType: 'team', entityId: Number(id),
    oldValues: old, newValues: body,
  });

  const team = await env.DB.prepare('SELECT * FROM Teams WHERE id = ?').bind(id).first();
  return Response.json({ data: team });
}

export async function remove(request, env) {
  const guard = await ADMIN(request, env);
  if (guard) return guard;

  const id  = request.params.id;
  const old = await env.DB.prepare('SELECT * FROM Teams WHERE id = ?').bind(id).first();
  if (!old) return Response.json({ error: 'Team not found' }, { status: 404 });

  const now = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE Teams SET is_active = 0, updated_at = ? WHERE id = ?`,
  ).bind(now, id).run();

  await writeAudit(env.DB, {
    actorId: request.user.id, action: 'deleted', entityType: 'team', entityId: Number(id),
    oldValues: old, newValues: null,
  });

  return Response.json({ ok: true });
}
