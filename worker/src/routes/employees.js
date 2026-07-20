import { requireRole }     from '../middleware/auth.js';
import { writeAudit }      from '../lib/audit.js';
import { hashPassword }    from '../lib/password.js';
import { nextEmployeeCode } from '../lib/sequence.js';
import { generateInvitationToken, invitationExpiry, hashToken } from '../lib/tokens.js';
import { sendActivationEmail } from '../lib/email.js';
import { getManagerScope } from '../lib/scope.js';

// Generates a strong, human-readable password. Clear charset: no 0/O, 1/l/I.
// Pattern: 3 upper + 4 lower + 2 digits + 1 special = 10 chars, shuffled.
function generatePassword() {
  const UPPER   = 'ABCDEFGHJKMNPQRSTUVWXYZ';
  const LOWER   = 'abcdefghjkmnpqrstuvwxyz';
  const DIGITS  = '23456789';
  const SPECIAL = '!@#$';
  const rand = () => { const b = new Uint32Array(1); crypto.getRandomValues(b); return b[0]; };
  const pick = (s) => s[rand() % s.length];
  const chars = [
    pick(UPPER), pick(UPPER), pick(UPPER),
    pick(LOWER), pick(LOWER), pick(LOWER), pick(LOWER),
    pick(DIGITS), pick(DIGITS),
    pick(SPECIAL),
  ];
  for (let i = chars.length - 1; i > 0; i--) {
    const j = rand() % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

function validatePhone(phone) {
  if (!phone) return null;
  if (!/^\+\d{7,15}$/.test(phone)) return 'Phone must be in E.164 format (e.g. +48600100200)';
  return null;
}

const ADMIN        = requireRole('administrator');
const ADMIN_OR_MGR = requireRole('administrator', 'manager');

const SELECT_COLS = `
  u.id, u.employee_number AS employee_code, u.first_name, u.last_name,
  (u.first_name || ' ' || u.last_name) AS name,
  u.email, u.mobile AS phone,
  u.team_id, u.is_active, u.created_at, u.updated_at,
  r.name AS role, t.name AS team_name,
  CASE WHEN u.is_active = 1 THEN 'active'
       WHEN u.password_hash IS NULL THEN 'pending'
       ELSE 'inactive' END AS status,
  (SELECT COUNT(*) FROM Extras ex WHERE ex.user_id = u.id AND ex.status = 'open' AND ex.is_deleted = 0) AS open_extras_count
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

  // Manager visibility: restrict to employees in supervised teams
  if (request.user.role === 'manager') {
    const scope = await getManagerScope(env.DB, request.user.id);
    if (scope.userIds.length === 0) return Response.json({ data: [] });
    const ph = scope.userIds.map(() => '?').join(',');
    conditions.push(`u.id IN (${ph})`);
    params.push(...scope.userIds);
  }

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
    conditions.push('(u.first_name LIKE ? OR u.last_name LIKE ? OR (u.first_name || \' \' || u.last_name) LIKE ? OR u.email LIKE ? OR u.employee_number LIKE ?)');
    params.push(like, like, like, like, like);
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

  const { first_name, last_name, email, phone = null, role = 'employee', team_id = null } = await request.json();

  if (!first_name?.trim()) return Response.json({ error: 'First name is required' }, { status: 400 });
  if (!last_name?.trim())  return Response.json({ error: 'Last name is required' }, { status: 400 });
  if (!email?.trim())      return Response.json({ error: 'Email is required' }, { status: 400 });

  const phoneErr = validatePhone(phone);
  if (phoneErr) return Response.json({ error: phoneErr }, { status: 400 });

  const ROLE_MAP = { administrator: 3, manager: 2, supervisor: 2, employee: 1, worker: 1 };
  const role_id  = ROLE_MAP[role] ?? 1;

  const { employee_number } = await nextEmployeeCode(env.DB);
  const rawToken      = generateInvitationToken();
  const tokenHash     = await hashToken(rawToken);
  const inviteExpires = invitationExpiry();
  const now           = new Date().toISOString();
  const normalEmail   = email.trim().toLowerCase();
  const fullName      = `${first_name.trim()} ${last_name.trim()}`;

  let userId;
  try {
    const result = await env.DB.prepare(
      `INSERT INTO Users
         (role_id, employee_number, first_name, last_name, email, mobile, team_id, is_active,
          invitation_token, invitation_token_expires_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`,
    ).bind(role_id, employee_number, first_name.trim(), last_name.trim(),
           normalEmail, phone, team_id,
           tokenHash, inviteExpires, now, now).run();
    userId = result.meta.last_row_id;
  } catch (e) {
    if (e.message?.includes('UNIQUE')) {
      return Response.json({ error: 'An employee with that email already exists' }, { status: 409 });
    }
    throw e;
  }

  try {
    await sendActivationEmail(env, { name: fullName, email: normalEmail, token: rawToken });
  } catch (emailErr) {
    console.error('[employees.create] activation email failed:', emailErr?.message);
    // Employee was created — don't roll back, just log the email failure
  }

  await writeAudit(env.DB, {
    actorId: request.user.id, action: 'activation_email_sent', entityType: 'user', entityId: userId,
    oldValues: null, newValues: { email: normalEmail },
  });
  await writeAudit(env.DB, {
    actorId: request.user.id, action: 'created', entityType: 'employee', entityId: userId,
    oldValues: null, newValues: { first_name, last_name, email, role, team_id },
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

  const first_name = body.first_name !== undefined ? body.first_name.trim() : old.first_name;
  const last_name  = body.last_name  !== undefined ? body.last_name.trim()  : old.last_name;
  const email      = body.email      !== undefined ? body.email.trim().toLowerCase() : old.email;
  const rawPhone   = body.phone      !== undefined ? body.phone              : old.mobile;
  const phoneErr   = validatePhone(rawPhone);
  if (phoneErr) return Response.json({ error: phoneErr }, { status: 400 });
  const phone     = rawPhone;
  const team_id   = body.team_id   !== undefined ? body.team_id                    : old.team_id;
  const is_active = body.is_active !== undefined ? (body.is_active ? 1 : 0)       : old.is_active;
  const role_id   = body.role      !== undefined ? (ROLE_MAP[body.role] ?? old.role_id) : old.role_id;
  const now = new Date().toISOString();

  try {
    await env.DB.prepare(
      `UPDATE Users
       SET first_name = ?, last_name = ?, email = ?, mobile = ?, team_id = ?, is_active = ?, role_id = ?, updated_at = ?
       WHERE id = ?`,
    ).bind(first_name, last_name, email, phone, team_id, is_active, role_id, now, id).run();
  } catch (e) {
    if (e.message?.includes('UNIQUE')) {
      return Response.json({ error: 'An employee with that email already exists' }, { status: 409 });
    }
    throw e;
  }

  await writeAudit(env.DB, {
    actorId: request.user.id, action: 'updated', entityType: 'employee', entityId: Number(id),
    oldValues: { first_name: old.first_name, last_name: old.last_name, email: old.email }, newValues: body,
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
  const old = await env.DB.prepare('SELECT id, first_name, last_name FROM Users WHERE id = ?').bind(id).first();
  if (!old) return Response.json({ error: 'Employee not found' }, { status: 404 });

  const now = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE Users SET is_active = 0, updated_at = ? WHERE id = ?`,
  ).bind(now, id).run();

  await writeAudit(env.DB, {
    actorId: request.user.id, action: 'employee_deactivated', entityType: 'user', entityId: Number(id),
    oldValues: { first_name: old.first_name, last_name: old.last_name }, newValues: null,
  });

  return Response.json({ ok: true });
}

export async function reactivate(request, env) {
  const guard = await ADMIN(request, env);
  if (guard) return guard;

  const id  = request.params.id;
  const emp = await env.DB.prepare(
    'SELECT id, first_name, last_name, is_active, password_hash FROM Users WHERE id = ?',
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

// POST /api/employees/:id/activate
// Admin only. Sets a pending user (no password yet) to is_active=1.
// Intentionally does NOT set a password — follow with generate-password to
// give the user something to log in with.
export async function activate(request, env) {
  const guard = await ADMIN(request, env);
  if (guard) return guard;

  const id  = request.params.id;
  const emp = await env.DB.prepare(
    'SELECT id, first_name, last_name, email, is_active, password_hash FROM Users WHERE id = ?',
  ).bind(id).first();
  if (!emp) return Response.json({ error: 'Employee not found' }, { status: 404 });

  if (emp.is_active === 1) {
    return Response.json({ error: 'Employee is already active' }, { status: 400 });
  }
  if (emp.password_hash !== null) {
    return Response.json({ error: 'Employee is deactivated, not pending — use Reactivate instead' }, { status: 400 });
  }

  const now = new Date().toISOString();
  await env.DB.prepare('UPDATE Users SET is_active = 1, updated_at = ? WHERE id = ?').bind(now, id).run();

  await writeAudit(env.DB, {
    actorId: request.user.id, action: 'account_activated', entityType: 'user', entityId: Number(id),
    oldValues: { is_active: 0 }, newValues: { is_active: 1 },
  });

  return Response.json({ ok: true });
}

// POST /api/employees/:id/generate-password
// Admin only. Generates a strong password server-side, stores its hash,
// and returns the plaintext ONCE in the response — never logged or stored.
// Also sets is_active=1 so pending users become active in the same step.
export async function generatePasswordForUser(request, env) {
  const guard = await ADMIN(request, env);
  if (guard) return guard;

  const id  = request.params.id;
  const emp = await env.DB.prepare(
    'SELECT id, first_name, last_name, email, is_active FROM Users WHERE id = ?',
  ).bind(id).first();
  if (!emp) return Response.json({ error: 'Employee not found' }, { status: 404 });

  const plain = generatePassword();
  const hash  = await hashPassword(plain);
  const now   = new Date().toISOString();

  await env.DB.prepare(
    'UPDATE Users SET password_hash = ?, is_active = 1, updated_at = ? WHERE id = ?',
  ).bind(hash, now, id).run();

  await writeAudit(env.DB, {
    actorId: request.user.id, action: 'password_generated', entityType: 'user', entityId: Number(id),
    oldValues: { was_active: emp.is_active },
    newValues: { is_active: 1, email: emp.email },
  });

  return Response.json({
    ok: true,
    password: plain,
    employee: { name: `${emp.first_name} ${emp.last_name}`, email: emp.email },
  });
}

// POST /api/employees/:id/resend-activation
// Admin only. Generates a new activation token and resends the activation email.
// Only valid for pending users (is_active=0, no password set).
export async function resendActivation(request, env, ctx) {
  const guard = await ADMIN(request, env);
  if (guard) return guard;

  const id  = request.params.id;
  const emp = await env.DB.prepare(
    'SELECT id, first_name, last_name, email, is_active, password_hash FROM Users WHERE id = ?',
  ).bind(id).first();
  if (!emp) return Response.json({ error: 'Employee not found' }, { status: 404 });

  if (emp.is_active === 1) {
    return Response.json({ error: 'Account is already active' }, { status: 400 });
  }
  if (emp.password_hash !== null) {
    return Response.json({ error: 'Account is deactivated, not pending activation' }, { status: 400 });
  }

  const rawToken  = generateInvitationToken();
  const tokenHash = await hashToken(rawToken);
  const expires   = invitationExpiry();
  const now       = new Date().toISOString();

  await env.DB.prepare(
    'UPDATE Users SET invitation_token = ?, invitation_token_expires_at = ?, updated_at = ? WHERE id = ?',
  ).bind(tokenHash, expires, now, id).run();

  const fullName = `${emp.first_name} ${emp.last_name}`;
  try {
    await sendActivationEmail(env, { name: fullName, email: emp.email, token: rawToken });
  } catch (emailErr) {
    return Response.json({ error: `Email delivery failed: ${emailErr.message}` }, { status: 422 });
  }

  await writeAudit(env.DB, {
    actorId: request.user.id, action: 'activation_email_resent', entityType: 'user', entityId: Number(id),
    oldValues: null, newValues: { email: emp.email },
  });

  return Response.json({ ok: true, message: `Activation email sent to ${emp.email}` });
}

// ── Employee weekly hours breakdown (Sprint 6) ────────────────────────────────
export async function weeklyHours(request, env) {
  const guard = await ADMIN_OR_MGR(request, env);
  if (guard) return guard;

  const id  = request.params.id;
  const emp = await env.DB.prepare('SELECT id FROM Users WHERE id = ?').bind(id).first();
  if (!emp) return Response.json({ error: 'Employee not found' }, { status: 404 });

  const url       = new URL(request.url);
  const weekParam = url.searchParams.get('week') ?? new Date().toISOString().slice(0, 10);

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

  const { results: projectHours } = await env.DB.prepare(
    `SELECT phe.project_id, p.name AS project_name, p.project_code,
            SUM(phe.hours_minutes) AS total_minutes
     FROM ProjectHourEntries phe
     JOIN Projects p ON p.id = phe.project_id
     WHERE phe.user_id = ? AND phe.work_date >= ? AND phe.work_date <= ? AND phe.is_deleted = 0
     GROUP BY phe.project_id
     ORDER BY project_name`,
  ).bind(Number(id), weekStart, weekEnd).all();

  const attendance = await env.DB.prepare(
    `SELECT SUM(duration_minutes) AS total_attendance_minutes,
            COUNT(*) AS days_present
     FROM DailyAttendance
     WHERE user_id = ? AND work_date >= ? AND work_date <= ? AND is_deleted = 0`,
  ).bind(Number(id), weekStart, weekEnd).first();

  return Response.json({
    data: {
      week_start:                 weekStart,
      week_end:                   weekEnd,
      week_number:                isoWeekNumber(weekStart),
      projects:                   projectHours,
      total_attendance_minutes:   attendance?.total_attendance_minutes ?? 0,
      days_present:               attendance?.days_present ?? 0,
      total_allocated_minutes:    projectHours.reduce((s, r) => s + r.total_minutes, 0),
    },
  });
}

// ── Employee timesheet matrix (Sprint 6.4) ───────────────────────────────────
export async function timesheetMatrix(request, env) {
  const guard = await ADMIN_OR_MGR(request, env);
  if (guard) return guard;

  const id  = request.params.id;
  const emp = await env.DB.prepare(
    `SELECT u.id, u.first_name, u.last_name, u.employee_number AS employee_code,
            r.name AS role, t.name AS team_name
     FROM Users u
     JOIN Roles r ON r.id = u.role_id
     LEFT JOIN Teams t ON t.id = u.team_id
     WHERE u.id = ?`
  ).bind(Number(id)).first();
  if (!emp) return Response.json({ error: 'Employee not found' }, { status: 404 });

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
    `SELECT phe.project_id, p.name AS project_name, p.project_code,
            phe.work_date, SUM(phe.hours_minutes) AS minutes
     FROM ProjectHourEntries phe
     JOIN Projects p ON p.id = phe.project_id
     WHERE phe.user_id = ? AND phe.work_date >= ? AND phe.work_date <= ? AND phe.is_deleted = 0
     GROUP BY phe.project_id, phe.work_date
     ORDER BY p.project_code, phe.work_date`
  ).bind(Number(id), weeks[0], lastEndD.toISOString().slice(0, 10)).all();

  const weekSet = new Set(weeks);
  const rowMap  = new Map();
  for (const r of results) {
    const ws = _ws(r.work_date);
    if (!weekSet.has(ws)) continue;
    if (!rowMap.has(r.project_id)) {
      rowMap.set(r.project_id, { project_id: r.project_id, project_code: r.project_code, project_name: r.project_name, wm: {} });
    }
    const row = rowMap.get(r.project_id);
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
    return { project_id: row.project_id, project_code: row.project_code, project_name: row.project_name, weekly_hours, total_hours: Math.round(totalMins / 60 * 100) / 100 };
  });

  const totals_by_week = {};
  let grandMins = 0;
  for (const ws of weeks) {
    let wm = 0;
    for (const row of rowMap.values()) wm += (row.wm[ws] ?? 0);
    totals_by_week[ws] = Math.round(wm / 60 * 100) / 100;
    grandMins += wm;
  }

  return Response.json({
    data: {
      employee:         { id: emp.id, name: `${emp.first_name} ${emp.last_name}`, employee_code: emp.employee_code, role: emp.role, team_name: emp.team_name },
      weeks:            weeks.map(_meta),
      rows,
      totals_by_week,
      grand_total_hours: Math.round(grandMins / 60 * 100) / 100,
    },
  });
}

// ── Employee daily hours drilldown (Sprint 6.4) ──────────────────────────────
export async function hoursByDay(request, env) {
  const guard = await ADMIN_OR_MGR(request, env);
  if (guard) return guard;

  const id  = request.params.id;
  const url = new URL(request.url);
  const projectId = url.searchParams.get('project_id');
  const weekStart = url.searchParams.get('week_start');
  if (!projectId || !weekStart) {
    return Response.json({ error: 'project_id and week_start required' }, { status: 400 });
  }

  const weekEndD = new Date(weekStart + 'T00:00:00Z');
  weekEndD.setUTCDate(weekEndD.getUTCDate() + 6);
  const weekEnd = weekEndD.toISOString().slice(0, 10);

  const { results } = await env.DB.prepare(
    `SELECT phe.work_date, SUM(phe.hours_minutes) AS minutes,
            GROUP_CONCAT(phe.note, '; ') AS notes
     FROM ProjectHourEntries phe
     WHERE phe.user_id = ? AND phe.project_id = ?
           AND phe.work_date >= ? AND phe.work_date <= ? AND phe.is_deleted = 0
     GROUP BY phe.work_date
     ORDER BY phe.work_date`
  ).bind(Number(id), Number(projectId), weekStart, weekEnd).all();

  return Response.json({ data: results });
}

// ── Employee project assignments (employee-side view of ProjectAssignments) ────
// GET /api/employees/:id/assignments  — list projects this employee is assigned to
export async function listProjectAssignments(request, env) {
  const guard = await ADMIN(request, env);
  if (guard) return guard;

  const id  = request.params.id;
  const emp = await env.DB.prepare('SELECT id FROM Users WHERE id = ?').bind(Number(id)).first();
  if (!emp) return Response.json({ error: 'Employee not found' }, { status: 404 });

  const { results } = await env.DB.prepare(
    `SELECT p.id, p.project_code, p.name,
            c.name AS client_name
     FROM   ProjectAssignments pa
     JOIN   Projects p ON p.id = pa.project_id
     LEFT   JOIN Clients c ON c.id = p.client_id
     WHERE  pa.user_id = ?
     ORDER  BY p.name`,
  ).bind(Number(id)).all();

  return Response.json({ data: results });
}

// PUT /api/employees/:id/assignments  — replace all project assignments for this employee
export async function setProjectAssignments(request, env) {
  const guard = await ADMIN(request, env);
  if (guard) return guard;

  const id  = request.params.id;
  const emp = await env.DB.prepare('SELECT id FROM Users WHERE id = ?').bind(Number(id)).first();
  if (!emp) return Response.json({ error: 'Employee not found' }, { status: 404 });

  const { project_ids = [] } = await request.json();
  if (!Array.isArray(project_ids)) {
    return Response.json({ error: 'project_ids must be an array' }, { status: 400 });
  }

  const now = new Date().toISOString();

  // Replace atomically: delete all assignments for this user, then re-insert
  const deleteStmt  = env.DB.prepare('DELETE FROM ProjectAssignments WHERE user_id = ?').bind(Number(id));
  const insertStmts = project_ids.map(pid =>
    env.DB.prepare(
      'INSERT OR IGNORE INTO ProjectAssignments (project_id, user_id, created_at) VALUES (?, ?, ?)',
    ).bind(Number(pid), Number(id), now),
  );

  await env.DB.batch([deleteStmt, ...insertStmts]);

  await writeAudit(env.DB, {
    actorId: request.user.id, action: 'employee_assignments_updated', entityType: 'employee', entityId: Number(id),
    oldValues: null, newValues: { project_ids },
  });

  const { results } = await env.DB.prepare(
    `SELECT p.id, p.project_code, p.name,
            c.name AS client_name
     FROM   ProjectAssignments pa
     JOIN   Projects p ON p.id = pa.project_id
     LEFT   JOIN Clients c ON c.id = p.client_id
     WHERE  pa.user_id = ?
     ORDER  BY p.name`,
  ).bind(Number(id)).all();

  return Response.json({ data: results });
}
