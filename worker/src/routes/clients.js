import { requireRole }    from '../middleware/auth.js';
import { writeAudit }     from '../lib/audit.js';
import { nextClientCode } from '../lib/sequence.js';

const ADMIN        = requireRole('administrator');
const ADMIN_OR_MGR = requireRole('administrator', 'manager');

export async function list(request, env) {
  const guard = await ADMIN_OR_MGR(request, env);
  if (guard) return guard;

  const url    = new URL(request.url);
  const search = url.searchParams.get('search')?.trim() ?? '';
  const status = url.searchParams.get('status')?.trim() ?? '';

  const conditions = [];
  const params     = [];

  // Status filter — default (no param) = active only
  if (status === 'inactive') {
    conditions.push('is_active = 0');
  } else if (status === 'all') {
    // no condition
  } else {
    conditions.push('is_active = 1');
  }

  if (search) {
    const like = `%${search}%`;
    conditions.push('(name LIKE ? OR client_code LIKE ? OR contact_person LIKE ?)');
    params.push(like, like, like);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const stmt  = env.DB.prepare(
    `SELECT id, client_code, name, contact_person, phone, email, notes, is_active, created_at, updated_at
     FROM Clients ${where} ORDER BY client_code`,
  );

  const { results } = await (params.length ? stmt.bind(...params) : stmt).all();
  return Response.json({ data: results });
}

export async function get(request, env) {
  const guard = await ADMIN_OR_MGR(request, env);
  if (guard) return guard;

  const client = await env.DB.prepare(
    `SELECT id, client_code, name, contact_person, phone, email, notes, is_active, created_at, updated_at
     FROM Clients WHERE id = ?`,
  ).bind(request.params.id).first();

  if (!client) return Response.json({ error: 'Client not found' }, { status: 404 });
  return Response.json({ data: client });
}

export async function create(request, env) {
  const guard = await ADMIN(request, env);
  if (guard) return guard;

  const { name, contact_person = null, phone = null, email = null, notes = null } = await request.json();

  if (!name?.trim()) return Response.json({ error: 'Name is required' }, { status: 400 });

  const { client_code } = await nextClientCode(env.DB);
  const now = new Date().toISOString();

  let clientId;
  try {
    const result = await env.DB.prepare(
      `INSERT INTO Clients (client_code, name, contact_person, phone, email, notes, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    ).bind(client_code, name.trim(), contact_person, phone, email, notes, now, now).run();
    clientId = result.meta.last_row_id;
  } catch (e) {
    if (e.message?.includes('UNIQUE')) {
      return Response.json({ error: 'A client with that name already exists' }, { status: 409 });
    }
    throw e;
  }

  await writeAudit(env.DB, {
    actorId: request.user.id, action: 'created', entityType: 'client', entityId: clientId,
    oldValues: null, newValues: { client_code, name },
  });

  const client = await env.DB.prepare(
    `SELECT id, client_code, name, contact_person, phone, email, notes, is_active, created_at, updated_at
     FROM Clients WHERE id = ?`,
  ).bind(clientId).first();

  return Response.json({ data: client }, { status: 201 });
}

export async function update(request, env) {
  const guard = await ADMIN(request, env);
  if (guard) return guard;

  const id  = request.params.id;
  const old = await env.DB.prepare('SELECT * FROM Clients WHERE id = ?').bind(id).first();
  if (!old) return Response.json({ error: 'Client not found' }, { status: 404 });

  const body = await request.json();

  const name           = body.name           !== undefined ? body.name.trim()    : old.name;
  const contact_person = body.contact_person !== undefined ? body.contact_person : old.contact_person;
  const phone          = body.phone          !== undefined ? body.phone          : old.phone;
  const email          = body.email          !== undefined ? body.email          : old.email;
  const notes          = body.notes          !== undefined ? body.notes          : old.notes;
  const is_active      = body.is_active      !== undefined ? (body.is_active ? 1 : 0) : old.is_active;
  const now = new Date().toISOString();

  await env.DB.prepare(
    `UPDATE Clients
     SET name = ?, contact_person = ?, phone = ?, email = ?, notes = ?, is_active = ?, updated_at = ?
     WHERE id = ?`,
  ).bind(name, contact_person, phone, email, notes, is_active, now, id).run();

  await writeAudit(env.DB, {
    actorId: request.user.id, action: 'updated', entityType: 'client', entityId: Number(id),
    oldValues: { name: old.name }, newValues: body,
  });

  const client = await env.DB.prepare(
    `SELECT id, client_code, name, contact_person, phone, email, notes, is_active, created_at, updated_at
     FROM Clients WHERE id = ?`,
  ).bind(id).first();

  return Response.json({ data: client });
}

export async function remove(request, env) {
  const guard = await ADMIN(request, env);
  if (guard) return guard;

  const id  = request.params.id;
  const old = await env.DB.prepare('SELECT id, name FROM Clients WHERE id = ?').bind(id).first();
  if (!old) return Response.json({ error: 'Client not found' }, { status: 404 });

  const now = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE Clients SET is_active = 0, updated_at = ? WHERE id = ?`,
  ).bind(now, id).run();

  await writeAudit(env.DB, {
    actorId: request.user.id, action: 'deactivated', entityType: 'client', entityId: Number(id),
    oldValues: old, newValues: null,
  });

  return Response.json({ ok: true });
}
