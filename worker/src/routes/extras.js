import { requireRole, requireAuth } from '../middleware/auth.js';
import { getManagerScope }          from '../lib/scope.js';

const ADMIN_OR_MGR = requireRole('administrator', 'manager');

const VALID_TYPES    = ['extra_work', 'own_cost'];
const VALID_STATUSES = ['open', 'processed'];

function currentWeekStart() {
  const d      = new Date();
  const utcDay = d.getUTCDay();
  const diff   = utcDay === 0 ? -6 : 1 - utcDay;
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + diff));
  return monday.toISOString().slice(0, 10);
}

function validateKm(mileage_km) {
  if (mileage_km == null) return 'mileage_km is required';
  const km = Number(mileage_km);
  if (!isFinite(km) || km < 0) return 'mileage_km must be a non-negative number';
  return null;
}

const SELECT_COLS = `
  e.id, e.user_id, e.project_id,
  (u.first_name || ' ' || u.last_name) AS employee_name,
  u.employee_number AS employee_code,
  p.name AS project_name, p.project_code,
  e.type, e.description, e.status,
  e.processed_at,
  (pb.first_name || ' ' || pb.last_name) AS processed_by_name,
  e.created_at, e.updated_at
`;

function validatePayload(type, description) {
  if (!VALID_TYPES.includes(type)) return 'Invalid type';
  if (!description?.trim()) return 'description is required';
  return null;
}

// ── GET /api/extras/mine ──────────────────────────────────────────────────────
export async function listMine(request, env) {
  const guard = await requireAuth(request, env);
  if (guard) return guard;

  const url    = new URL(request.url);
  const status = url.searchParams.get('status') ?? '';

  const conditions = ['e.user_id = ?', 'e.is_deleted = 0'];
  const params     = [request.user.id];

  if (status && VALID_STATUSES.includes(status)) {
    conditions.push('e.status = ?');
    params.push(status);
  }

  const where = conditions.join(' AND ');
  const { results } = await env.DB.prepare(
    `SELECT e.id, e.project_id, p.name AS project_name, p.project_code,
            e.type, e.description, e.status, e.created_at, e.updated_at
     FROM   Extras e
     JOIN   Projects p ON p.id = e.project_id
     WHERE  ${where}
     ORDER  BY e.created_at DESC`,
  ).bind(...params).all();

  // Fetch WeeklyMileage and append as mileage cards
  const { results: wmRows } = await env.DB.prepare(
    `SELECT id AS wm_id, week_start, mileage_km, updated_at
     FROM   WeeklyMileage
     WHERE  user_id = ?
     ORDER  BY week_start DESC`,
  ).bind(request.user.id).all();

  const curWeek = currentWeekStart();
  const mileageCards = wmRows.map(wm => ({
    id:           null,
    wm_id:        wm.wm_id,
    type:         'mileage',
    mileage_km:   wm.mileage_km,
    week_start:   wm.week_start,
    status:       wm.week_start === curWeek ? 'open' : 'recorded',
    created_at:   wm.updated_at,
    project_id:   null,
    project_name: null,
    project_code: null,
    description:  null,
  }));

  const combined = [...results, ...mileageCards]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  return Response.json({ data: combined });
}

// ── POST /api/extras/mine ─────────────────────────────────────────────────────
export async function createMine(request, env) {
  const guard = await requireAuth(request, env);
  if (guard) return guard;

  const { project_id, type, description, mileage_km } = await request.json();

  if (!type) return Response.json({ error: 'type is required' }, { status: 400 });

  // Mileage → write to WeeklyMileage for current week (upsert)
  if (type === 'mileage') {
    const kmErr = validateKm(mileage_km);
    if (kmErr) return Response.json({ error: kmErr }, { status: 400 });

    const km       = Number(mileage_km);
    const weekStart = currentWeekStart();
    const now       = new Date().toISOString();

    await env.DB.prepare(
      `INSERT INTO WeeklyMileage (user_id, week_start, mileage_km, created_by, updated_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, week_start) DO UPDATE
         SET mileage_km = excluded.mileage_km,
             updated_by = excluded.updated_by,
             updated_at = excluded.updated_at`,
    ).bind(request.user.id, weekStart, km, request.user.id, request.user.id, now, now).run();

    const wm = await env.DB.prepare(
      `SELECT id AS wm_id, week_start, mileage_km, updated_at
       FROM   WeeklyMileage WHERE user_id = ? AND week_start = ?`,
    ).bind(request.user.id, weekStart).first();

    return Response.json({
      data: {
        id:           null,
        wm_id:        wm.wm_id,
        type:         'mileage',
        mileage_km:   wm.mileage_km,
        week_start:   wm.week_start,
        status:       'open',
        created_at:   wm.updated_at,
        project_id:   null,
        project_name: null,
        project_code: null,
        description:  null,
      },
    }, { status: 201 });
  }

  // Regular extra (own_cost or extra_work)
  if (!project_id) return Response.json({ error: 'project_id is required' }, { status: 400 });

  const validErr = validatePayload(type, description);
  if (validErr) return Response.json({ error: validErr }, { status: 400 });

  const proj = await env.DB.prepare(
    `SELECT pa.project_id
     FROM   ProjectAssignments pa
     JOIN   Projects p ON p.id = pa.project_id
     WHERE  pa.project_id = ? AND pa.user_id = ? AND p.is_active = 1`,
  ).bind(Number(project_id), request.user.id).first();
  if (!proj) return Response.json({ error: 'Project not found or not assigned to you' }, { status: 400 });

  const now = new Date().toISOString();
  const result = await env.DB.prepare(
    `INSERT INTO Extras (user_id, project_id, type, description, status, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'open', ?, ?, ?)`,
  ).bind(request.user.id, Number(project_id), type, description.trim(), request.user.id, now, now).run();

  const entry = await env.DB.prepare(
    `SELECT e.id, e.project_id, p.name AS project_name, p.project_code,
            e.type, e.description, e.status, e.created_at, e.updated_at
     FROM   Extras e
     JOIN   Projects p ON p.id = e.project_id
     WHERE  e.id = ?`,
  ).bind(result.meta.last_row_id).first();

  return Response.json({ data: entry }, { status: 201 });
}

// ── PUT /api/extras/mine/:id ──────────────────────────────────────────────────
export async function updateMine(request, env) {
  const guard = await requireAuth(request, env);
  if (guard) return guard;

  const id  = request.params.id;
  const old = await env.DB.prepare(
    `SELECT * FROM Extras WHERE id = ? AND user_id = ? AND is_deleted = 0`,
  ).bind(id, request.user.id).first();
  if (!old) return Response.json({ error: 'Extra not found' }, { status: 404 });
  if (old.status === 'processed') {
    return Response.json({ error: 'Processed extras cannot be edited' }, { status: 403 });
  }

  const body        = await request.json();
  const type        = body.type        !== undefined ? body.type        : old.type;
  const description = body.description !== undefined ? body.description : old.description;
  const project_id  = body.project_id  !== undefined ? body.project_id  : old.project_id;

  const validErr = validatePayload(type, description);
  if (validErr) return Response.json({ error: validErr }, { status: 400 });

  const now = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE Extras SET type = ?, description = ?, project_id = ?, updated_by = ?, updated_at = ?
     WHERE id = ?`,
  ).bind(type, description.trim(), Number(project_id), request.user.id, now, id).run();

  const entry = await env.DB.prepare(
    `SELECT e.id, e.project_id, p.name AS project_name, p.project_code,
            e.type, e.description, e.status, e.created_at, e.updated_at
     FROM   Extras e
     JOIN   Projects p ON p.id = e.project_id
     WHERE  e.id = ?`,
  ).bind(id).first();

  return Response.json({ data: entry });
}

// ── DELETE /api/extras/mine/:id ───────────────────────────────────────────────
export async function deleteMine(request, env) {
  const guard = await requireAuth(request, env);
  if (guard) return guard;

  const id  = request.params.id;
  const old = await env.DB.prepare(
    `SELECT * FROM Extras WHERE id = ? AND user_id = ? AND is_deleted = 0`,
  ).bind(id, request.user.id).first();
  if (!old) return Response.json({ error: 'Extra not found' }, { status: 404 });
  if (old.status === 'processed') {
    return Response.json({ error: 'Processed extras cannot be deleted' }, { status: 403 });
  }

  const now = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE Extras SET is_deleted = 1, updated_by = ?, updated_at = ? WHERE id = ?`,
  ).bind(request.user.id, now, id).run();

  return Response.json({ ok: true });
}

// ── GET /api/extras — admin/manager list ──────────────────────────────────────
export async function list(request, env) {
  const guard = await ADMIN_OR_MGR(request, env);
  if (guard) return guard;

  const url        = new URL(request.url);
  const status     = url.searchParams.get('status')     ?? 'open';
  const project_id = url.searchParams.get('project_id') ?? '';
  const user_id    = url.searchParams.get('user_id')    ?? '';
  const type       = url.searchParams.get('type')       ?? '';
  const date_from  = url.searchParams.get('date_from')  ?? '';
  const date_to    = url.searchParams.get('date_to')    ?? '';

  const conditions = ['e.is_deleted = 0'];
  const params     = [];

  if (request.user.role === 'manager') {
    const scope = await getManagerScope(env.DB, request.user.id);
    if (scope.userIds.length === 0) return Response.json({ data: [] });
    const ph = scope.userIds.map(() => '?').join(',');
    conditions.push(`e.user_id IN (${ph})`);
    params.push(...scope.userIds);
  }

  if (status && status !== 'all' && VALID_STATUSES.includes(status)) {
    conditions.push('e.status = ?');
    params.push(status);
  }
  if (project_id) { conditions.push('e.project_id = ?'); params.push(Number(project_id)); }
  if (user_id)    { conditions.push('e.user_id = ?');    params.push(Number(user_id)); }
  if (type && VALID_TYPES.includes(type)) { conditions.push('e.type = ?'); params.push(type); }
  if (date_from)  { conditions.push("date(e.created_at) >= ?"); params.push(date_from); }
  if (date_to)    { conditions.push("date(e.created_at) <= ?"); params.push(date_to); }

  const where = conditions.join(' AND ');
  const { results } = await env.DB.prepare(
    `SELECT ${SELECT_COLS}
     FROM   Extras e
     JOIN   Users    u  ON u.id = e.user_id
     JOIN   Projects p  ON p.id = e.project_id
     LEFT JOIN Users pb ON pb.id = e.processed_by
     WHERE  ${where}
     ORDER  BY e.created_at DESC
     LIMIT  500`,
  ).bind(...params).all();

  return Response.json({ data: results });
}

// ── POST /api/extras — admin create ──────────────────────────────────────────
export async function create(request, env) {
  const guard = await ADMIN_OR_MGR(request, env);
  if (guard) return guard;

  const { user_id, project_id, type, description } = await request.json();

  if (!user_id)    return Response.json({ error: 'user_id is required' },    { status: 400 });
  if (!project_id) return Response.json({ error: 'project_id is required' }, { status: 400 });
  if (!type)       return Response.json({ error: 'type is required' },        { status: 400 });

  const validErr = validatePayload(type, description);
  if (validErr) return Response.json({ error: validErr }, { status: 400 });

  const now = new Date().toISOString();
  const result = await env.DB.prepare(
    `INSERT INTO Extras (user_id, project_id, type, description, status, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'open', ?, ?, ?)`,
  ).bind(Number(user_id), Number(project_id), type, description.trim(), request.user.id, now, now).run();

  const entry = await env.DB.prepare(
    `SELECT ${SELECT_COLS}
     FROM   Extras e
     JOIN   Users    u  ON u.id = e.user_id
     JOIN   Projects p  ON p.id = e.project_id
     LEFT JOIN Users pb ON pb.id = e.processed_by
     WHERE  e.id = ?`,
  ).bind(result.meta.last_row_id).first();

  return Response.json({ data: entry }, { status: 201 });
}

// ── PUT /api/extras/:id — admin update ───────────────────────────────────────
export async function update(request, env) {
  const guard = await ADMIN_OR_MGR(request, env);
  if (guard) return guard;

  const id  = request.params.id;
  const old = await env.DB.prepare(
    `SELECT * FROM Extras WHERE id = ? AND is_deleted = 0`,
  ).bind(id).first();
  if (!old) return Response.json({ error: 'Extra not found' }, { status: 404 });

  const body        = await request.json();
  const type        = body.type        !== undefined ? body.type        : old.type;
  const description = body.description !== undefined ? body.description : old.description;
  const project_id  = body.project_id  !== undefined ? body.project_id  : old.project_id;
  const user_id     = body.user_id     !== undefined ? body.user_id     : old.user_id;

  const validErr = validatePayload(type, description);
  if (validErr) return Response.json({ error: validErr }, { status: 400 });

  const now = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE Extras
     SET  type = ?, description = ?, project_id = ?, user_id = ?, updated_by = ?, updated_at = ?
     WHERE id = ?`,
  ).bind(type, description.trim(), Number(project_id), Number(user_id), request.user.id, now, id).run();

  const entry = await env.DB.prepare(
    `SELECT ${SELECT_COLS}
     FROM   Extras e
     JOIN   Users    u  ON u.id = e.user_id
     JOIN   Projects p  ON p.id = e.project_id
     LEFT JOIN Users pb ON pb.id = e.processed_by
     WHERE  e.id = ?`,
  ).bind(id).first();

  return Response.json({ data: entry });
}

// ── DELETE /api/extras/:id — admin soft-delete ────────────────────────────────
export async function remove(request, env) {
  const guard = await ADMIN_OR_MGR(request, env);
  if (guard) return guard;

  const id = request.params.id;
  const old = await env.DB.prepare(
    `SELECT id FROM Extras WHERE id = ? AND is_deleted = 0`,
  ).bind(id).first();
  if (!old) return Response.json({ error: 'Extra not found' }, { status: 404 });

  const now = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE Extras SET is_deleted = 1, updated_by = ?, updated_at = ? WHERE id = ?`,
  ).bind(request.user.id, now, id).run();

  return Response.json({ ok: true });
}

// ── POST /api/extras/:id/process ─────────────────────────────────────────────
export async function process(request, env) {
  const guard = await ADMIN_OR_MGR(request, env);
  if (guard) return guard;

  const id  = request.params.id;
  const old = await env.DB.prepare(
    `SELECT id, status FROM Extras WHERE id = ? AND is_deleted = 0`,
  ).bind(id).first();
  if (!old) return Response.json({ error: 'Extra not found' }, { status: 404 });
  if (old.status === 'processed') {
    return Response.json({ error: 'Extra is already processed' }, { status: 409 });
  }

  const now = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE Extras
     SET  status = 'processed', processed_by = ?, processed_at = ?, updated_by = ?, updated_at = ?
     WHERE id = ?`,
  ).bind(request.user.id, now, request.user.id, now, id).run();

  return Response.json({ ok: true });
}

// ── POST /api/extras/:id/reopen ───────────────────────────────────────────────
export async function reopen(request, env) {
  const guard = await ADMIN_OR_MGR(request, env);
  if (guard) return guard;

  const id  = request.params.id;
  const old = await env.DB.prepare(
    `SELECT id, status FROM Extras WHERE id = ? AND is_deleted = 0`,
  ).bind(id).first();
  if (!old) return Response.json({ error: 'Extra not found' }, { status: 404 });
  if (old.status === 'open') {
    return Response.json({ error: 'Extra is already open' }, { status: 409 });
  }

  const now = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE Extras
     SET  status = 'open', processed_by = NULL, processed_at = NULL, updated_by = ?, updated_at = ?
     WHERE id = ?`,
  ).bind(request.user.id, now, id).run();

  return Response.json({ ok: true });
}
