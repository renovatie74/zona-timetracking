/**
 * Manager visibility scope helper (Sprint 3A).
 *
 * Managers may only see data belonging to the teams they supervise.
 * Call getManagerScope() once per request and pass the result into query filters.
 *
 * Returned shape:
 *   teamIds      — IDs of teams where supervisor_id = managerId
 *   userIds      — IDs of employees in those teams, plus the manager themselves
 *   projectIds   — IDs of projects reachable via assignments from those users,
 *                  plus all open projects (projects with no assignments)
 *
 * If a manager supervises no teams, teamIds is empty and userIds = [managerId].
 *
 * Extension note (Phase 2 — team-based assignments):
 *   When ProjectTeamAssignments is added, extend the projectIds query to also
 *   UNION projects assigned to the manager's teams via that table.
 *   No other changes to this function are needed.
 */

export async function getManagerScope(db, managerId) {
  // Teams supervised by this manager
  const { results: teams } = await db.prepare(
    'SELECT id FROM Teams WHERE supervisor_id = ? AND is_active = 1'
  ).bind(managerId).all();
  const teamIds = teams.map(t => t.id);

  // Employees in those teams (always include the manager themselves)
  let userIds = [managerId];
  if (teamIds.length > 0) {
    const ph = teamIds.map(() => '?').join(',');
    const { results: emps } = await db.prepare(
      `SELECT id FROM Users WHERE team_id IN (${ph})`
    ).bind(...teamIds).all();
    userIds = [...new Set([managerId, ...emps.map(e => e.id)])];
  }

  // Projects explicitly assigned to any of those users
  const uph = userIds.map(() => '?').join(',');
  const { results: asgn } = await db.prepare(
    `SELECT DISTINCT project_id FROM ProjectAssignments WHERE user_id IN (${uph})`
  ).bind(...userIds).all();
  const assignedProjectIds = asgn.map(a => a.project_id);

  // Open projects — no assignments at all → visible to everyone including managers
  const { results: openProjs } = await db.prepare(
    `SELECT p.id FROM Projects p
     WHERE  p.is_active = 1
     AND    NOT EXISTS (
       SELECT 1 FROM ProjectAssignments pa WHERE pa.project_id = p.id
     )`
  ).all();
  const openProjectIds = openProjs.map(p => p.id);

  const projectIds = [...new Set([...assignedProjectIds, ...openProjectIds])];

  return { teamIds, userIds, projectIds };
}
