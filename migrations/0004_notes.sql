-- Migration 0004: ProjectNotes
-- Depends on: Users, Projects, NoteCategories (from 0001, 0002).

CREATE TABLE IF NOT EXISTS ProjectNotes (
  id           INTEGER  PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER  NOT NULL REFERENCES Users(id),
  project_id   INTEGER  NOT NULL REFERENCES Projects(id),
  category_id  INTEGER  NOT NULL REFERENCES NoteCategories(id),
  description  TEXT     NOT NULL CHECK(length(description) >= 1),
  kilometers   REAL,                               -- populated only for category_id=5 (Mileage)
  status       TEXT     NOT NULL DEFAULT 'open'
                        CHECK(status IN ('open', 'closed')),
  is_deleted   BOOLEAN  NOT NULL DEFAULT 0,
  created_at   DATETIME NOT NULL,
  updated_at   DATETIME NOT NULL
);

-- Open billable items (most frequent dashboard query: category IN (4,6) AND status='open')
CREATE INDEX IF NOT EXISTS idx_pn_billable
  ON ProjectNotes(category_id, status)
  WHERE is_deleted = 0;

CREATE INDEX IF NOT EXISTS idx_pn_project
  ON ProjectNotes(project_id);

CREATE INDEX IF NOT EXISTS idx_pn_user
  ON ProjectNotes(user_id);
