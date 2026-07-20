import { requireRole, requireAuth }        from '../middleware/auth.js';
import { getManagerScope }                 from '../lib/scope.js';

const ADMIN_OR_MGR = requireRole('administrator', 'manager');

const VALID_TYPES         = ['extra_work', 'own_cost'];
const CREATABLE_TYPES     = ['own_cost']; // extra_work is legacy — display only
const VALID_STATUSES      = ['open', 'waiting_for_manager', 'processed'];

const SELECT_COLS = `
  e.id, e.user_id, e.project_id,
  (u.first_name || ' ' || u.last_name) AS employee_name,
  u.employee_number AS employee_code,
  p.name AS project_name, p.project_code,
  e.type, e.description, e.status,
  e.processed_at,
  (pb.first_name || ' ' || pb.last_name) AS processed_by_name,
  e.created_at, e.updated_at,
  (SELECT COUNT(*) FROM ExtraComments WHERE extra_id = e.id) AS comment_count,
  (SELECT COUNT(*) FROM ExtraComments WHERE extra_id = e.id AND comment_type = 'manager_reply') AS has_manager_reply
`;

function validatePayload(type, description) {
  if (!VALID_TYPES.includes(type)) return 'Invalid type';
  if (!description?.trim()) return 'description is required';
  return null;
}

async function addComment(db, extraId, userId, commentType, comment) {
  const now = new Date().toISOString();
  await db.prepare(
    `INSERT INTO ExtraComments (extra_id, user_id, comment_type, comment, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).bind(extraId, userId, commentType, comment || null, now).run();
}

async function fetchComments(db, extraId) {
  const { results } = await db.prepare(
    `SELECT ec.id, ec.extra_id, ec.user_id, ec.comment_type, ec.comment, ec.created_at,
            (u.first_name || ' ' || u.last_name) AS author_name
     FROM   ExtraComments ec
     JOIN   Users u ON u.id = ec.user_id
     WHERE  ec.extra_id = ?
     ORDER  BY ec.created_at ASC`,
  ).bind(extraId).all();
  return results;
}

// ── GET /api/extras/summary — lightweight counts for sidebar badge ────────────
export async function summary(request, env) {
  const guard = await ADMIN_OR_MGR(request, env);
  if (guard) return guard;

  const { results } = await env.DB.prepare(
    `SELECT status, COUNT(*) AS cnt
     FROM Extras
     WHERE is_deleted = 0 AND status IN ('open', 'waiting_for_manager')
     GROUP BY status`,
  ).all();

  const open    = results.find(r => r.status === 'open')?.cnt                ?? 0;
  const waiting = results.find(r => r.status === 'waiting_for_manager')?.cnt ?? 0;

  return Response.json({ data: { open, waiting_for_manager: waiting } });
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

  return Response.json({ data: results });
}

// ── POST /api/extras/mine ─────────────────────────────────────────────────────
export async function createMine(request, env) {
  const guard = await requireAuth(request, env);
  if (guard) return guard;

  const { project_id, type, description } = await request.json();

  if (!type) return Response.json({ error: 'type is required' }, { status: 400 });

  // extra_work is legacy — display only; new entries are own_cost only
  if (!CREATABLE_TYPES.includes(type)) {
    return Response.json({ error: `Cannot create new entries of type '${type}'` }, { status: 400 });
  }

  if (!project_id) return Response.json({ error: 'project_id is required' }, { status: 400 });

  const validErr = validatePayload(type, description);
  if (validErr) return Response.json({ error: validErr }, { status: 400 });

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

  const now = new Date().toISOString();
  const result = await env.DB.prepare(
    `INSERT INTO Extras (user_id, project_id, type, description, status, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'open', ?, ?, ?)`,
  ).bind(request.user.id, Number(project_id), type, description.trim(), request.user.id, now, now).run();

  const id = result.meta.last_row_id;
  await addComment(env.DB, id, request.user.id, 'created', null);

  const entry = await env.DB.prepare(
    `SELECT e.id, e.project_id, p.name AS project_name, p.project_code,
            e.type, e.description, e.status, e.created_at, e.updated_at
     FROM   Extras e
     JOIN   Projects p ON p.id = e.project_id
     WHERE  e.id = ?`,
  ).bind(id).first();

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

  const url            = new URL(request.url);
  const status         = url.searchParams.get('status')          ?? 'open';
  const project_id     = url.searchParams.get('project_id')      ?? '';
  const user_id        = url.searchParams.get('user_id')         ?? '';
  const type           = url.searchParams.get('type')            ?? '';
  const olderThanDays  = url.searchParams.get('older_than_days') ?? '';

  const conditions = ['e.is_deleted = 0'];
  const params     = [];

  // Scope filter applies to managers, BUT not when browsing the review queue —
  // "Manager is ALWAYS Pawel": waiting_for_manager items are sent to a single
  // global reviewer, not scoped by team assignment.
  const isReviewQueue = status === 'waiting_for_manager';
  if (request.user.role === 'manager' && !isReviewQueue) {
    const scope = await getManagerScope(env.DB, request.user.id);
    if (scope.userIds.length === 0) return Response.json({ data: [] });
    const ph = scope.userIds.map(() => '?').join(',');
    conditions.push(`e.user_id IN (${ph})`);
    params.push(...scope.userIds);
  }

  if (status === 'open_all') {
    // Show both open and waiting_for_manager
    conditions.push("e.status IN ('open', 'waiting_for_manager')");
  } else if (status && status !== 'all' && VALID_STATUSES.includes(status)) {
    conditions.push('e.status = ?');
    params.push(status);
  }
  if (project_id) { conditions.push('e.project_id = ?'); params.push(Number(project_id)); }
  if (user_id)    { conditions.push('e.user_id = ?');    params.push(Number(user_id)); }
  if (type && VALID_TYPES.includes(type)) { conditions.push('e.type = ?'); params.push(type); }
  if (olderThanDays && Number.isFinite(Number(olderThanDays))) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - Math.abs(Number(olderThanDays)));
    conditions.push('e.created_at < ?');
    params.push(cutoff.toISOString());
  }

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

// ── GET /api/extras/:id — single extra with comments ─────────────────────────
export async function getOne(request, env) {
  const guard = await ADMIN_OR_MGR(request, env);
  if (guard) return guard;

  const id = request.params.id;
  const extra = await env.DB.prepare(
    `SELECT ${SELECT_COLS}
     FROM   Extras e
     JOIN   Users    u  ON u.id = e.user_id
     JOIN   Projects p  ON p.id = e.project_id
     LEFT JOIN Users pb ON pb.id = e.processed_by
     WHERE  e.id = ? AND e.is_deleted = 0`,
  ).bind(id).first();
  if (!extra) return Response.json({ error: 'Extra not found' }, { status: 404 });

  const comments = await fetchComments(env.DB, id);

  return Response.json({ data: { ...extra, comments } });
}

// ── POST /api/extras — admin create ──────────────────────────────────────────
export async function create(request, env) {
  const guard = await ADMIN_OR_MGR(request, env);
  if (guard) return guard;

  const { user_id, project_id, type, description } = await request.json();

  if (!user_id)    return Response.json({ error: 'user_id is required' },    { status: 400 });
  if (!project_id) return Response.json({ error: 'project_id is required' }, { status: 400 });
  if (!type)       return Response.json({ error: 'type is required' },        { status: 400 });

  if (!CREATABLE_TYPES.includes(type)) {
    return Response.json({ error: `Cannot create new entries of type '${type}'` }, { status: 400 });
  }

  const validErr = validatePayload(type, description);
  if (validErr) return Response.json({ error: validErr }, { status: 400 });

  const now = new Date().toISOString();
  const result = await env.DB.prepare(
    `INSERT INTO Extras (user_id, project_id, type, description, status, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'open', ?, ?, ?)`,
  ).bind(Number(user_id), Number(project_id), type, description.trim(), request.user.id, now, now).run();

  const newId = result.meta.last_row_id;
  await addComment(env.DB, newId, request.user.id, 'created', null);

  const entry = await env.DB.prepare(
    `SELECT ${SELECT_COLS}
     FROM   Extras e
     JOIN   Users    u  ON u.id = e.user_id
     JOIN   Projects p  ON p.id = e.project_id
     LEFT JOIN Users pb ON pb.id = e.processed_by
     WHERE  e.id = ?`,
  ).bind(newId).first();

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

// ── POST /api/extras/:id/complete ─────────────────────────────────────────────
export async function complete(request, env) {
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

  await addComment(env.DB, id, request.user.id, 'completed', null);

  return Response.json({ ok: true });
}

// ── POST /api/extras/:id/request-review ──────────────────────────────────────
export async function requestReview(request, env) {
  const guard = await ADMIN_OR_MGR(request, env);
  if (guard) return guard;

  const id  = request.params.id;
  const old = await env.DB.prepare(
    `SELECT id, status FROM Extras WHERE id = ? AND is_deleted = 0`,
  ).bind(id).first();
  if (!old) return Response.json({ error: 'Extra not found' }, { status: 404 });
  if (old.status !== 'open') {
    return Response.json({ error: 'Only open extras can be sent for review' }, { status: 409 });
  }

  const body    = await request.json().catch(() => ({}));
  const comment = body.comment?.trim() || null;

  const now = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE Extras SET status = 'waiting_for_manager', updated_by = ?, updated_at = ? WHERE id = ?`,
  ).bind(request.user.id, now, id).run();

  await addComment(env.DB, id, request.user.id, 'review_requested', comment);

  return Response.json({ ok: true });
}

// ── POST /api/extras/:id/manager-reply ───────────────────────────────────────
export async function managerReply(request, env) {
  const guard = await ADMIN_OR_MGR(request, env);
  if (guard) return guard;

  const id  = request.params.id;
  const old = await env.DB.prepare(
    `SELECT id, status FROM Extras WHERE id = ? AND is_deleted = 0`,
  ).bind(id).first();
  if (!old) return Response.json({ error: 'Extra not found' }, { status: 404 });
  if (old.status !== 'waiting_for_manager') {
    return Response.json({ error: 'Extra is not waiting for manager review' }, { status: 409 });
  }

  const body    = await request.json().catch(() => ({}));
  const comment = body.comment?.trim() || null;

  const now = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE Extras SET status = 'open', updated_by = ?, updated_at = ? WHERE id = ?`,
  ).bind(request.user.id, now, id).run();

  await addComment(env.DB, id, request.user.id, 'manager_reply', comment);

  return Response.json({ ok: true });
}

// ── POST /api/extras/:id/process — kept for backward compat ──────────────────
export async function process(request, env) {
  return complete(request, env);
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
