import { requireRole } from '../middleware/auth.js';

const ADMIN = requireRole('administrator');

// GET /api/admin-console/users?include_inactive=0|1
export async function users(request, env) {
  const guard = await ADMIN(request, env);
  if (guard) return guard;

  const url             = new URL(request.url);
  const includeInactive = url.searchParams.get('include_inactive') === '1';

  const conditions = [];
  const params     = [];

  if (!includeInactive) {
    conditions.push('u.is_active = 1');
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const { results } = await env.DB.prepare(
    `SELECT u.id,
            u.employee_number AS employee_code,
            u.first_name, u.last_name, u.email,
            r.name AS role,
            CASE WHEN u.is_active = 1 THEN 'active'
                 WHEN u.password_hash IS NULL THEN 'pending'
                 ELSE 'inactive' END AS status
     FROM Users u
     JOIN Roles r ON r.id = u.role_id
     ${where}
     ORDER BY u.first_name, u.last_name
     LIMIT 200`,
  ).bind(...params).all();

  return Response.json({ data: results });
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
function todayStr() { return new Date().toISOString().slice(0, 10); }

// GET /api/admin-console/login-audit
export async function loginAudit(request, env) {
  const guard = await ADMIN(request, env);
  if (guard) return guard;

  const url         = new URL(request.url);
  const dateFrom    = url.searchParams.get('date_from')    || daysAgo(6);
  const dateTo      = url.searchParams.get('date_to')      || todayStr();
  const email       = url.searchParams.get('email')?.trim()     || '';
  const userId      = url.searchParams.get('user_id');
  const result      = url.searchParams.get('result')?.trim()    || '';
  const countryCode = url.searchParams.get('country_code')?.trim() || '';
  const limit       = Math.min(parseInt(url.searchParams.get('limit')  || '100', 10), 500);
  const offset      = Math.max(parseInt(url.searchParams.get('offset') || '0',   10), 0);

  const conditions = [`date(lae.created_at) >= ?`, `date(lae.created_at) <= ?`];
  const params     = [dateFrom, dateTo];

  if (email)       { conditions.push(`lae.attempted_email LIKE ?`);  params.push(`%${email}%`); }
  if (userId)      { conditions.push(`lae.user_id = ?`);             params.push(Number(userId)); }
  if (result)      { conditions.push(`lae.result = ?`);              params.push(result); }
  if (countryCode) { conditions.push(`lae.country_code = ?`);        params.push(countryCode); }

  const where = `WHERE ${conditions.join(' AND ')}`;

  const countRow = await env.DB.prepare(
    `SELECT COUNT(*) AS total FROM LoginAuditEvents lae ${where}`,
  ).bind(...params).first();

  const { results } = await env.DB.prepare(
    `SELECT lae.*,
            (u.first_name || ' ' || u.last_name) AS user_name,
            r.name AS role
     FROM LoginAuditEvents lae
     LEFT JOIN Users u ON u.id = lae.user_id
     LEFT JOIN Roles r ON r.id = u.role_id
     ${where}
     ORDER BY lae.created_at DESC
     LIMIT ? OFFSET ?`,
  ).bind(...params, limit, offset).all();

  return Response.json({ data: results, total: countRow?.total ?? 0, limit, offset });
}

// Admin-visible action types (not login/logout noise)
const ADMIN_ACTIONS = [
  'account_activated', 'password_generated', 'employee_deactivated',
  'reactivated', 'role_changed', 'project_assignment_changed',
  'data_export_generated',
];

// GET /api/admin-console/admin-audit
export async function adminAudit(request, env) {
  const guard = await ADMIN(request, env);
  if (guard) return guard;

  const url          = new URL(request.url);
  const dateFrom     = url.searchParams.get('date_from')     || daysAgo(6);
  const dateTo       = url.searchParams.get('date_to')       || todayStr();
  const actorUserId  = url.searchParams.get('actor_user_id');
  const targetUserId = url.searchParams.get('target_user_id');
  const actionType   = url.searchParams.get('action_type')?.trim() || '';
  const limit        = Math.min(parseInt(url.searchParams.get('limit')  || '100', 10), 500);
  const offset       = Math.max(parseInt(url.searchParams.get('offset') || '0',   10), 0);

  const ph = ADMIN_ACTIONS.map(() => '?').join(',');
  const conditions = [
    `date(al.created_at) >= ?`,
    `date(al.created_at) <= ?`,
    `al.action IN (${ph})`,
  ];
  const params = [dateFrom, dateTo, ...ADMIN_ACTIONS];

  if (actorUserId)  { conditions.push(`al.actor_id = ?`);  params.push(Number(actorUserId)); }
  if (targetUserId) { conditions.push(`al.entity_id = ?`); params.push(Number(targetUserId)); }
  if (actionType)   { conditions.push(`al.action = ?`);    params.push(actionType); }

  const where = `WHERE ${conditions.join(' AND ')}`;

  const countRow = await env.DB.prepare(
    `SELECT COUNT(*) AS total FROM AuditLog al ${where}`,
  ).bind(...params).first();

  const { results } = await env.DB.prepare(
    `SELECT al.*,
            (actor.first_name  || ' ' || actor.last_name)  AS actor_name,
            (target.first_name || ' ' || target.last_name) AS target_name
     FROM AuditLog al
     LEFT JOIN Users actor  ON actor.id  = al.actor_id
     LEFT JOIN Users target ON target.id = al.entity_id
     ${where}
     ORDER BY al.created_at DESC
     LIMIT ? OFFSET ?`,
  ).bind(...params, limit, offset).all();

  return Response.json({ data: results, total: countRow?.total ?? 0, limit, offset });
}
