import { requireRole }                from '../middleware/auth.js';
import { getManagerScope }           from '../lib/scope.js';
import { getCurrentBusinessWeekStart } from '../lib/businessTime.js';

const ADMIN_OR_MGR     = requireRole('administrator', 'manager');
const ADMIN_MGR_OR_SUP = requireRole('administrator', 'manager', 'supervisor');

async function getOrgTimezone(db) {
  try {
    const row = await db.prepare(
      "SELECT value FROM OrgSettings WHERE key='timezone'"
    ).first();
    return row?.value ?? 'Europe/Amsterdam';
  } catch {
    return 'Europe/Amsterdam';
  }
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// ── GET /api/dashboard/operations?week_start=YYYY-MM-DD ───────────────────────
export async function operations(request, env) {
  const guard = await ADMIN_MGR_OR_SUP(request, env);
  if (guard) return guard;

  const url = new URL(request.url);
  const orgTz             = await getOrgTimezone(env.DB);
  const currentWeekStart  = getCurrentBusinessWeekStart(orgTz);
  const weekStart         = url.searchParams.get('week_start') || currentWeekStart;
  const weekEnd           = addDays(weekStart, 6);

  let scopeUserIds = null;
  if (request.user.role === 'manager') {
    const scope = await getManagerScope(env.DB, request.user.id);
    scopeUserIds = scope.userIds;
  }

  const uidPH   = scopeUserIds ? `AND user_id IN (${scopeUserIds.map(() => '?').join(',')})` : '';
  const uidPHu  = scopeUserIds ? `AND u.id IN (${scopeUserIds.map(() => '?').join(',')})` : '';
  const uidPHe  = scopeUserIds ? `AND e.user_id IN (${scopeUserIds.map(() => '?').join(',')})` : '';
  const uidPHwm = scopeUserIds ? `AND wm.user_id IN (${scopeUserIds.map(() => '?').join(',')})` : '';
  const SP = scopeUserIds ?? [];

  // Total active employees in scope
  const totalEmpsRow = await env.DB.prepare(
    `SELECT COUNT(*) AS cnt FROM Users u WHERE u.is_active = 1 AND u.role_id = 1 ${uidPHu}`
  ).bind(...SP).first();
  const totalActiveEmployees = totalEmpsRow?.cnt ?? 0;

  // Employees submitted: project hours OR attendance for selected week
  const submittedRow = await env.DB.prepare(`
    SELECT COUNT(DISTINCT u.id) AS cnt FROM Users u
    WHERE u.is_active = 1 AND u.role_id = 1
      AND (
        EXISTS (SELECT 1 FROM ProjectHourEntries phe
                WHERE phe.user_id = u.id
                AND phe.work_date >= ? AND phe.work_date <= ?
                AND phe.is_deleted = 0)
        OR
        EXISTS (SELECT 1 FROM DailyAttendance da
                WHERE da.user_id = u.id
                AND da.work_date >= ? AND da.work_date <= ?
                AND da.is_deleted = 0)
      )
      ${uidPHu}
  `).bind(weekStart, weekEnd, weekStart, weekEnd, ...SP).first();
  const employeesSubmitted = submittedRow?.cnt ?? 0;

  // Open extras count
  const extrasRow = await env.DB.prepare(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN type='own_cost'   THEN 1 ELSE 0 END) AS own_cost,
            SUM(CASE WHEN type='extra_work' THEN 1 ELSE 0 END) AS legacy
     FROM Extras
     WHERE status='open' AND is_deleted=0 ${uidPH}`
  ).bind(...SP).first();
  const openExtras  = extrasRow?.total    ?? 0;
  const openOwnCost = extrasRow?.own_cost ?? 0;
  const openLegacy  = extrasRow?.legacy   ?? 0;

  // Waiting for manager review — global (single reviewer)
  const waitingRow = await env.DB.prepare(
    `SELECT COUNT(*) AS cnt FROM Extras WHERE status='waiting_for_manager' AND is_deleted=0`
  ).first();
  const waitingForManager = waitingRow?.cnt ?? 0;

  // Mileage submitted for selected week (WeeklyMileage has no is_deleted column)
  const mileageRow = await env.DB.prepare(
    `SELECT COUNT(*) AS cnt FROM WeeklyMileage wm WHERE wm.week_start = ? ${uidPHwm}`
  ).bind(weekStart, ...SP).first();
  const mileageSubmitted = mileageRow?.cnt ?? 0;

  // Employees requiring attention for selected week:
  //   no project hours, no mileage, or extras pending review
  const { results: attentionItems } = await env.DB.prepare(`
    SELECT
      u.id AS user_id,
      (u.first_name || ' ' || u.last_name) AS employee_name,
      u.employee_number,
      CASE WHEN phe.user_id IS NULL THEN 1 ELSE 0 END AS no_project_hours,
      CASE WHEN ex.user_id  IS NOT NULL THEN 1 ELSE 0 END AS has_pending_extras
    FROM Users u
    LEFT JOIN (
      SELECT DISTINCT user_id FROM ProjectHourEntries
      WHERE work_date >= ? AND work_date <= ? AND is_deleted = 0
    ) phe ON phe.user_id = u.id
    LEFT JOIN (
      SELECT DISTINCT user_id FROM Extras
      WHERE status = 'waiting_for_manager' AND is_deleted = 0
    ) ex ON ex.user_id = u.id
    WHERE u.is_active = 1 AND u.role_id = 1
      AND (phe.user_id IS NULL OR ex.user_id IS NOT NULL)
      ${uidPHu}
    ORDER BY employee_name
  `).bind(weekStart, weekEnd, ...SP).all();

  // Open extras list — no week filter (inbox, latest 10)
  const { results: openExtrasList } = await env.DB.prepare(`
    SELECT e.id, e.user_id, e.project_id,
           (u.first_name || ' ' || u.last_name) AS employee_name, u.employee_number,
           p.name AS project_name, p.project_code,
           e.type, e.description, e.status, e.created_at,
           (SELECT COUNT(*) FROM ExtraComments
            WHERE extra_id = e.id AND comment_type = 'manager_reply') AS has_manager_reply
    FROM Extras e
    JOIN Users u ON u.id = e.user_id
    LEFT JOIN Projects p ON p.id = e.project_id
    WHERE e.status='open' AND e.is_deleted=0 ${uidPHe}
    ORDER BY e.created_at DESC LIMIT 10
  `).bind(...SP).all();

  // Pending review list — no week filter (oldest first, max 5)
  const { results: pendingReviewList } = await env.DB.prepare(`
    SELECT e.id, e.user_id,
           (u.first_name || ' ' || u.last_name) AS employee_name,
           p.name AS project_name, p.project_code,
           e.description, e.updated_at
    FROM Extras e
    JOIN Users u ON u.id = e.user_id
    LEFT JOIN Projects p ON p.id = e.project_id
    WHERE e.status='waiting_for_manager' AND e.is_deleted=0
    ORDER BY e.updated_at ASC LIMIT 5
  `).all();

  // Weekly alerts
  const alerts = [];

  const notSubmitted = totalActiveEmployees - employeesSubmitted;
  if (notSubmitted > 0) {
    alerts.push({
      type:    'not_submitted_weekly',
      for:     'admin',
      message: `${notSubmitted} employee${notSubmitted !== 1 ? 's have' : ' has'} not submitted this week's hours`,
      link:    `/dashboard/missing-timesheets?week_start=${weekStart}`,
    });
  }

  if (waitingForManager > 0) {
    const msg = `${waitingForManager} own cost${waitingForManager !== 1 ? 's are' : ' is'} waiting for manager review`;
    alerts.push({ type: 'waiting_review', for: 'admin',   message: msg, link: '/admin/extras?status=waiting_for_manager' });
    alerts.push({ type: 'waiting_review', for: 'manager', message: msg, link: '/admin/extras?status=waiting_for_manager' });
  }

  const threeDaysAgo    = new Date();
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
  const threeDaysAgoISO = threeDaysAgo.toISOString();
  const staleExtrasRow  = await env.DB.prepare(
    `SELECT COUNT(*) AS cnt FROM Extras WHERE status='open' AND is_deleted=0 AND created_at < ? ${uidPH}`
  ).bind(threeDaysAgoISO, ...SP).first();
  if ((staleExtrasRow?.cnt ?? 0) > 0) {
    alerts.push({
      type:    'stale_extras',
      for:     'admin',
      message: `${staleExtrasRow.cnt} open extra${staleExtrasRow.cnt !== 1 ? 's' : ''} older than 3 days`,
      link:    '/admin/extras?status=open&older_than_days=3',
    });
  }

  return Response.json({
    data: {
      meta: {
        timezone:             orgTz,
        week_start:           weekStart,
        week_end:             weekEnd,
        current_week_start:   currentWeekStart,
      },
      week: {
        week_start:             weekStart,
        week_end:               weekEnd,
        total_active_employees: totalActiveEmployees,
        employees_submitted:    employeesSubmitted,
        open_extras:            openExtras,
        open_own_cost:          openOwnCost,
        open_legacy:            openLegacy,
        waiting_for_manager:    waitingForManager,
        mileage_submitted:      mileageSubmitted,
      },
      attention_items:  attentionItems,
      open_extras:      openExtrasList,
      pending_review:   pendingReviewList,
      alerts,
    },
  });
}

// ── GET /api/dashboard/missing-timesheets?week_start=YYYY-MM-DD ───────────────
// Returns active employees who have neither project hours nor attendance for
// the selected week. Counts must match the dashboard's notSubmitted metric.
export async function missingTimesheets(request, env) {
  const guard = await ADMIN_MGR_OR_SUP(request, env);
  if (guard) return guard;

  const url              = new URL(request.url);
  const orgTz            = await getOrgTimezone(env.DB);
  const currentWeekStart = getCurrentBusinessWeekStart(orgTz);
  const weekStart        = url.searchParams.get('week_start') || currentWeekStart;
  const weekEnd          = addDays(weekStart, 6);

  let scopeUserIds = null;
  if (request.user.role === 'manager') {
    const scope = await getManagerScope(env.DB, request.user.id);
    scopeUserIds = scope.userIds;
  }

  const uidPH = scopeUserIds
    ? `AND u.id IN (${scopeUserIds.map(() => '?').join(',')})`
    : '';
  const SP = scopeUserIds ?? [];

  const { results } = await env.DB.prepare(`
    SELECT u.id,
           (u.first_name || ' ' || u.last_name) AS employee_name,
           u.first_name, u.last_name,
           u.employee_number,
           t.name AS team_name,
           r.name AS role
    FROM   Users u
    LEFT JOIN Teams t ON t.id = u.team_id
    JOIN   Roles r    ON r.id = u.role_id
    WHERE  u.is_active = 1 AND u.role_id = 1
      AND NOT EXISTS (
        SELECT 1 FROM ProjectHourEntries phe
        WHERE  phe.user_id = u.id
          AND  phe.work_date >= ? AND phe.work_date <= ?
          AND  phe.is_deleted = 0
      )
      AND NOT EXISTS (
        SELECT 1 FROM DailyAttendance da
        WHERE  da.user_id = u.id
          AND  da.work_date >= ? AND da.work_date <= ?
          AND  da.is_deleted = 0
      )
      ${uidPH}
    ORDER BY u.first_name, u.last_name
  `).bind(weekStart, weekEnd, weekStart, weekEnd, ...SP).all();

  return Response.json({
    data: {
      week_start: weekStart,
      week_end:   weekEnd,
      employees:  results,
    },
  });
}
