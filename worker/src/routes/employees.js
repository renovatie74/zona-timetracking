import { requireRole }     from '../middleware/auth.js';
import { writeAudit }      from '../lib/audit.js';
import { nextEmployeeCode } from '../lib/sequence.js';
import { generateInvitationToken, invitationExpiry } from '../lib/tokens.js';
import { sendInvitation } from '../lib/email.js';

function validatePhone(phone) {
  if (!phone) return null;
  if (!/^\+\d{7,15}$/.test(phone)) return 'Phone must be in E.164 format (e.g. +48600100200)';
  return null;
}

const ADMIN        = requireRole('administrator');
const ADMIN_OR_MGR = requireRole('administrator', 'manager');

const SELECT_COLS = `
  u.id, u.employee_number AS employee_code, u.name, u.email, u.mobile AS phone,
  u.team_id, u.is_active, u.created_at, u.updated_at,
  r.name AS role, t.name AS team_name,
  CASE WHEN u.is_active = 1 THEN 'active'
       WHEN u.password_hash IS NULL THEN 'pending'
       ELSE 'inactive' END AS status
`;

export async function list(request, env) {
  const guard = await ADMIN_OR_MGR(request, env);
  if (guard) return guard;

  const url    = new URL(request.url);
  const search = url.searchParams.get('search')?.trim() ?? '';
  const status = url.searchParams.get('status')?.trim() ?? '';
  const role   = url.searchParams.get('role')?.trim()   ?? '';
  const team   = url.searchParams.get('team')?.trim()   ?? '';

  const conditions = [];
  const params     = [];

  // Status filter — default (no param) = active + pending (exclude inactive)
  if (status === 'active') {
    conditions.push('u.is_active = 1');
  } else if (status === 'pending') {
    conditions.push('u.is_active = 0 AND u.password_hash IS NULL');
  } else if (status === 'inactive') {
    conditions.push('u.is_active = 0 AND u.password_hash IS NOT NULL');
  } else if (status === 'all') {
    // no condition — show everyone
  } else {
    // default: active + pending
    conditions.push('(u.is_active = 1 OR u.password_hash IS NULL)');
  }

  if (role) {
    conditions.push('r.name = ?');
    params.push(role);
  }

  if (team === 'none') {
    conditions.push('u.team_id IS NULL');
  } else if (team) {
    conditions.push('u.team_id = ?');
    params.push(Number(team));
  }

  if (search) {
    const like = `%${search}%`;
    conditions.push('(u.name LIKE ? OR u.email LIKE ? OR u.employee_number LIKE ?)');
    params.push(like, like, like);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const query = `SELECT ${SELECT_COLS}
                 FROM Users u
                 JOIN Roles r ON r.id = u.role_id
                 LEFT JOIN Teams t ON t.id = u.team_id
                 ${where}
                 ORDER BY u.employee_number`;

  const stmt         = env.DB.prepare(query);
  const { results }  = await (params.length ? stmt.bind(...params) : stmt).all();
  return Response.json({ data: results });
}

export async function get(request, env) {
  const guard = await ADMIN_OR_MGR(request, env);
  if (guard) return guard;

  const user = await env.DB.prepare(
    `SELECT ${SELECT_COLS}
     FROM Users u
     JOIN Roles r ON r.id = u.role_id
     LEFT JOIN Teams t ON t.id = u.team_id
     WHERE u.id = ?`,
  ).bind(request.params.id).first();

  if (!user) return Response.json({ error: 'Employee not found' }, { status: 404 });
  return Response.json({ data: user });
}

export async function create(request, env, ctx) {
  const guard = await ADMIN(request, env);
  if (guard) return guard;

  const { name, email, phone = null, role = 'employee', team_id = null } = await request.json();

  if (!name?.trim()) return Response.json({ error: 'Name is required' }, { status: 400 });
  if (!email?.trim()) return Response.json({ error: 'Email is required' }, { status: 400 });

  const phoneErr = validatePhone(phone);
  if (phoneErr) return Response.json({ error: phoneErr }, { status: 400 });

  const ROLE_MAP = { administrator: 3, manager: 2, supervisor: 2, employee: 1, worker: 1 };
  const role_id  = ROLE_MAP[role] ?? 1;

  const { employee_number } = await nextEmployeeCode(env.DB);
  const inviteToken   = generateInvitationToken();
  const inviteExpires = invitationExpiry();
  const now = new Date().toISOString();

  let userId;
  try {
    const result = await env.DB.prepare(
      `INSERT INTO Users
         (role_id, employee_number, name, email, mobile, team_id, is_active,
          invitation_token, invitation_token_expires_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`,
    ).bind(role_id, employee_number, name.trim(), email.trim().toLowerCase(), phone, team_id,
           inviteToken, inviteExpires, now, now).run();
    userId = result.meta.last_row_id;
  } catch (e) {
    if (e.message?.includes('UNIQUE')) {
      return Response.json({ error: 'An employee with that email already exists' }, { status: 409 });
    }
    throw e;
  }

  ctx?.waitUntil(sendInvitation(env, { name: name.trim(), email: email.trim().toLowerCase(), token: inviteToken }));

  await writeAudit(env.DB, {
    actorId: request.user.id, action: 'created', entityType: 'employee', entityId: userId,
    oldValues: null, newValues: { name, email, role, team_id },
  });

  const created = await env.DB.prepare(
    `SELECT ${SELECT_COLS}
     FROM Users u
     JOIN Roles r ON r.id = u.role_id
     LEFT JOIN Teams t ON t.id = u.team_id
     WHERE u.id = ?`,
  ).bind(userId).first();

  return Response.json({ data: created }, { status: 201 });
}

export async function update(request, env) {
  const guard = await ADMIN(request, env);
  if (guard) return guard;

  const id  = request.params.id;
  const old = await env.DB.prepare('SELECT * FROM Users WHERE id = ?').bind(id).first();
  if (!old) return Response.json({ error: 'Employee not found' }, { status: 404 });

  const body = await request.json();
  const ROLE_MAP = { administrator: 3, manager: 2, supervisor: 2, employee: 1, worker: 1 };

  const name      = body.name      !== undefined ? body.name.trim()                : old.name;
  const email     = body.email     !== undefined ? body.email.trim().toLowerCase() : old.email;
  const rawPhone  = body.phone     !== undefined ? body.phone                      : old.mobile;
  const phoneErr  = validatePhone(rawPhone);
  if (phoneErr) return Response.json({ error: phoneErr }, { status: 400 });
  const phone     = rawPhone;
  const team_id   = body.team_id   !== undefined ? body.team_id                    : old.team_id;
  const is_active = body.is_active !== undefined ? (body.is_active ? 1 : 0)       : old.is_active;
  const role_id   = body.role      !== undefined ? (ROLE_MAP[body.role] ?? old.role_id) : old.role_id;
  const now = new Date().toISOString();

  try {
    await env.DB.prepare(
      `UPDATE Users
       SET name = ?, email = ?, mobile = ?, team_id = ?, is_active = ?, role_id = ?, updated_at = ?
       WHERE id = ?`,
    ).bind(name, email, phone, team_id, is_active, role_id, now, id).run();
  } catch (e) {
    if (e.message?.includes('UNIQUE')) {
      return Response.json({ error: 'An employee with that email already exists' }, { status: 409 });
    }
    throw e;
  }

  await writeAudit(env.DB, {
    actorId: request.user.id, action: 'updated', entityType: 'employee', entityId: Number(id),
    oldValues: { name: old.name, email: old.email }, newValues: body,
  });

  const updated = await env.DB.prepare(
    `SELECT ${SELECT_COLS}
     FROM Users u
     JOIN Roles r ON r.id = u.role_id
     LEFT JOIN Teams t ON t.id = u.team_id
     WHERE u.id = ?`,
  ).bind(id).first();

  return Response.json({ data: updated });
}

export async function remove(request, env) {
  const guard = await ADMIN(request, env);
  if (guard) return guard;

  const id  = request.params.id;
  const old = await env.DB.prepare('SELECT id, name FROM Users WHERE id = ?').bind(id).first();
  if (!old) return Response.json({ error: 'Employee not found' }, { status: 404 });

  const now = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE Users SET is_active = 0, updated_at = ? WHERE id = ?`,
  ).bind(now, id).run();

  await writeAudit(env.DB, {
    actorId: request.user.id, action: 'deactivated', entityType: 'employee', entityId: Number(id),
    oldValues: old, newValues: null,
  });

  return Response.json({ ok: true });
}

export async function reactivate(request, env) {
  const guard = await ADMIN(request, env);
  if (guard) return guard;

  const id  = request.params.id;
  const emp = await env.DB.prepare(
    'SELECT id, name, is_active, password_hash FROM Users WHERE id = ?',
  ).bind(id).first();
  if (!emp) return Response.json({ error: 'Employee not found' }, { status: 404 });

  if (emp.is_active === 1) {
    return Response.json({ error: 'Employee is already active' }, { status: 400 });
  }

  // Restore to active if password exists, else back to pending (is_active stays 0)
  const newActive = emp.password_hash !== null ? 1 : 0;
  const newStatus = newActive === 1 ? 'active' : 'pending';
  const now = new Date().toISOString();

  await env.DB.prepare(
    `UPDATE Users SET is_active = ?, updated_at = ? WHERE id = ?`,
  ).bind(newActive, now, id).run();

  await writeAudit(env.DB, {
    actorId: request.user.id, action: 'reactivated', entityType: 'employee', entityId: Number(id),
    oldValues: { is_active: emp.is_active }, newValues: { is_active: newActive, status: newStatus },
  });

  const updated = await env.DB.prepare(
    `SELECT ${SELECT_COLS}
     FROM Users u
     JOIN Roles r ON r.id = u.role_id
     LEFT JOIN Teams t ON t.id = u.team_id
     WHERE u.id = ?`,
  ).bind(id).first();

  return Response.json({ data: updated });
}
