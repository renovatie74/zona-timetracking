-- Sprint 4.2: Correct mileage model — weekly per-employee, not project-based.

-- 1. Remove existing incorrect mileage extras from DEV (project-based)
DELETE FROM Extras WHERE type = 'mileage';

-- 2. Recreate Extras without mileage type and without mileage_km column
PRAGMA foreign_keys = OFF;
CREATE TABLE Extras_v4 (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES Users(id),
  project_id   INTEGER NOT NULL REFERENCES Projects(id),
  type         TEXT    NOT NULL CHECK(type IN ('extra_work', 'own_cost')),
  description  TEXT    NOT NULL,
  status       TEXT    NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'processed')),
  created_by   INTEGER REFERENCES Users(id),
  updated_by   INTEGER REFERENCES Users(id),
  processed_by INTEGER REFERENCES Users(id),
  processed_at TEXT,
  is_deleted   INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT    NOT NULL,
  updated_at   TEXT    NOT NULL
);
INSERT INTO Extras_v4
  SELECT id, user_id, project_id, type, description,
         status, created_by, updated_by, processed_by, processed_at,
         is_deleted, created_at, updated_at
  FROM   Extras;
DROP TABLE Extras;
ALTER TABLE Extras_v4 RENAME TO Extras;
CREATE INDEX idx_extras_user_id    ON Extras(user_id);
CREATE INDEX idx_extras_project_id ON Extras(project_id);
CREATE INDEX idx_extras_status     ON Extras(status);
PRAGMA foreign_keys = ON;

-- 3. Create WeeklyMileage table
CREATE TABLE WeeklyMileage (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES Users(id),
  week_start TEXT    NOT NULL,
  mileage_km REAL    NOT NULL CHECK(mileage_km > 0),
  created_by INTEGER REFERENCES Users(id),
  updated_by INTEGER REFERENCES Users(id),
  created_at TEXT    NOT NULL,
  updated_at TEXT    NOT NULL,
  UNIQUE(user_id, week_start)
);
CREATE INDEX idx_weekly_mileage_user_id    ON WeeklyMileage(user_id);
CREATE INDEX idx_weekly_mileage_week_start ON WeeklyMileage(week_start);
