-- Sprint 4.1: Add Mileage as third Extra type.
-- Recreates Extras table to:
--   1. Extend type CHECK to include 'mileage'
--   2. Make description nullable (mileage entries carry no description)
--   3. Add mileage_km REAL NULL column

PRAGMA foreign_keys = OFF;

CREATE TABLE Extras_v2 (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES Users(id),
  project_id   INTEGER NOT NULL REFERENCES Projects(id),
  type         TEXT    NOT NULL CHECK(type IN ('extra_work', 'own_cost', 'mileage')),
  description  TEXT    NULL,
  mileage_km   REAL    NULL,
  status       TEXT    NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'processed')),
  created_by   INTEGER REFERENCES Users(id),
  updated_by   INTEGER REFERENCES Users(id),
  processed_by INTEGER REFERENCES Users(id),
  processed_at TEXT,
  is_deleted   INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT    NOT NULL,
  updated_at   TEXT    NOT NULL
);

INSERT INTO Extras_v2
  SELECT id, user_id, project_id, type, description, NULL,
         status, created_by, updated_by, processed_by, processed_at,
         is_deleted, created_at, updated_at
  FROM   Extras;

DROP TABLE Extras;
ALTER TABLE Extras_v2 RENAME TO Extras;

CREATE INDEX idx_extras_user_id    ON Extras(user_id);
CREATE INDEX idx_extras_project_id ON Extras(project_id);
CREATE INDEX idx_extras_status     ON Extras(status);

PRAGMA foreign_keys = ON;
