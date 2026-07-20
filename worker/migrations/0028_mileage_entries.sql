-- Sprint 12: Replace weekly mileage model with per-entry MileageEntries table.
-- Instruction: delete all existing data; no legacy migration needed.

DELETE FROM WeeklyMileage;

CREATE TABLE MileageEntries (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES Users(id),
  project_id INTEGER NOT NULL REFERENCES Projects(id),
  work_date  TEXT    NOT NULL,               -- ISO date YYYY-MM-DD
  km         REAL    NOT NULL CHECK(km > 0),
  note       TEXT,
  status     TEXT    NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'completed')),
  created_by INTEGER REFERENCES Users(id),
  updated_by INTEGER REFERENCES Users(id),
  created_at TEXT    NOT NULL,
  updated_at TEXT    NOT NULL
);

CREATE INDEX idx_mileage_entries_user_id   ON MileageEntries(user_id);
CREATE INDEX idx_mileage_entries_work_date ON MileageEntries(work_date);
CREATE INDEX idx_mileage_entries_status    ON MileageEntries(status);
CREATE INDEX idx_mileage_entries_project   ON MileageEntries(project_id);
