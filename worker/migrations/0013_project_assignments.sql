-- Migration 0013: Project Assignments (Sprint 3A)
--
-- Phase 1: User-based project assignments.
--
-- Extension path to Phase 2 (team-based assignments):
--   Add a ProjectTeamAssignments (project_id, team_id) table alongside this one.
--   No changes to this table or existing data are needed.
--   Update the eligibility query in the check-in project picker to UNION both:
--
--     SELECT project_id FROM ProjectAssignments WHERE user_id = :uid
--     UNION
--     SELECT pta.project_id
--     FROM   ProjectTeamAssignments pta
--     JOIN   Users u ON u.team_id = pta.team_id
--     WHERE  u.id = :uid
--
--   The "open project" rule (no assignments = visible to all) can be extended to
--   cover both tables: a project is open if it has no rows in EITHER table.
--
-- Assignment rules enforced by application layer:
--   - 0 assignments → all active employees may access (open project)
--   - ≥1 assignment → only assigned employees may access
--   - Administrators and managers always see all projects regardless

CREATE TABLE ProjectAssignments (
  project_id INTEGER NOT NULL REFERENCES Projects(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES Users(id)    ON DELETE CASCADE,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (project_id, user_id)
);

CREATE INDEX idx_pa_user    ON ProjectAssignments(user_id);
CREATE INDEX idx_pa_project ON ProjectAssignments(project_id);
