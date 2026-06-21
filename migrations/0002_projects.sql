-- Migration 0002: ProjectCodeSequence, Projects
-- Depends on nothing — no FK to Users or other tables.

-- Singleton sequence table for auto-generated project codes (P-001, P-002, ...).
-- Same atomic pattern as EmployeeCodeSequence:
--   UPDATE ... SET next_seq = next_seq + 1 RETURNING next_seq - 1 AS seq
-- next_seq=1 → issued code is P-001, next_seq becomes 2.
CREATE TABLE IF NOT EXISTS ProjectCodeSequence (
  id        INTEGER PRIMARY KEY CHECK(id = 1),
  next_seq  INTEGER NOT NULL DEFAULT 1
);
INSERT OR IGNORE INTO ProjectCodeSequence (id, next_seq) VALUES (1, 1);

CREATE TABLE IF NOT EXISTS Projects (
  id               INTEGER  PRIMARY KEY AUTOINCREMENT,
  project_code     TEXT     NOT NULL UNIQUE,   -- system-generated P-NNN; immutable after creation
  project_code_seq INTEGER  NOT NULL,          -- numeric part stored for sorting
  name             TEXT     NOT NULL,
  customer_name    TEXT,
  location         TEXT,
  status           TEXT     NOT NULL DEFAULT 'active'
                            CHECK(status IN ('active', 'completed', 'archived')),
  start_date       DATE     NOT NULL,
  end_date         DATE,
  notes            TEXT,
  completed_at     DATETIME,                   -- set on transition to 'completed'
  archived_at      DATETIME,                   -- set on transition to 'archived'
  created_at       DATETIME NOT NULL,
  updated_at       DATETIME NOT NULL
);
