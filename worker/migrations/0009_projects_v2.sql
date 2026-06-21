-- Migration 0009: Rebuild Projects to match Sprint 2 spec.
-- D1 enforces FK constraints on DROP TABLE, so we drop dependents first (all empty at this point).
-- Changes: client_name (was customer_name), is_active column,
-- status values: planning/active/completed/cancelled (was active/completed/archived).

-- Drop FK dependents (reverse dependency order, all empty in Sprint 2)
DROP TABLE IF EXISTS RecentProjects;
DROP TABLE IF EXISTS ProjectNotes;
DROP INDEX IF EXISTS idx_te_active;
DROP INDEX IF EXISTS idx_te_dates;
DROP INDEX IF EXISTS idx_te_user;
DROP INDEX IF EXISTS idx_te_project;
DROP TABLE IF EXISTS TimeEntries;

-- Drop and rebuild the sequence and Projects
DROP TABLE IF EXISTS ProjectCodeSequence;
DROP TABLE IF EXISTS Projects;

CREATE TABLE ProjectCodeSequence (
  id        INTEGER PRIMARY KEY CHECK(id = 1),
  next_seq  INTEGER NOT NULL DEFAULT 1
);
INSERT INTO ProjectCodeSequence (id, next_seq) VALUES (1, 1);

CREATE TABLE Projects (
  id               INTEGER  PRIMARY KEY AUTOINCREMENT,
  project_code     TEXT     NOT NULL UNIQUE,
  project_code_seq INTEGER  NOT NULL,
  name             TEXT     NOT NULL,
  client_name      TEXT,
  location         TEXT,
  status           TEXT     NOT NULL DEFAULT 'planning'
                            CHECK(status IN ('planning', 'active', 'completed', 'cancelled')),
  start_date       DATE     NOT NULL,
  end_date         DATE,
  is_active        INTEGER  NOT NULL DEFAULT 1,
  created_at       DATETIME NOT NULL,
  updated_at       DATETIME NOT NULL
);

-- Recreate TimeEntries (was 0003)
CREATE TABLE TimeEntries (
  id                       INTEGER  PRIMARY KEY AUTOINCREMENT,
  user_id                  INTEGER  NOT NULL REFERENCES Users(id),
  project_id               INTEGER  NOT NULL REFERENCES Projects(id),
  entry_source             TEXT     NOT NULL DEFAULT 'automatic'
                                    CHECK(entry_source IN ('automatic', 'manual_worker', 'manual_admin')),
  start_time               DATETIME NOT NULL,
  stop_time                DATETIME,
  duration_minutes         INTEGER,
  rounded_start_time       DATETIME,
  rounded_stop_time        DATETIME,
  rounded_duration_minutes INTEGER,
  checkin_lat              REAL,
  checkin_lng              REAL,
  checkin_accuracy_m       REAL,
  checkin_maps_url         TEXT,
  gps_status               TEXT     NOT NULL DEFAULT 'unavailable'
                                    CHECK(gps_status IN ('captured', 'denied', 'unavailable')),
  checkout_lat             REAL,
  checkout_lng             REAL,
  checkout_accuracy_m      REAL,
  checkout_maps_url        TEXT,
  checkout_gps_status      TEXT     NOT NULL DEFAULT 'unavailable'
                                    CHECK(checkout_gps_status IN ('captured', 'denied', 'unavailable')),
  unclosed_flag            BOOLEAN  NOT NULL DEFAULT 0,
  is_manual_entry          BOOLEAN  NOT NULL DEFAULT 0,
  is_deleted               BOOLEAN  NOT NULL DEFAULT 0,
  notes                    TEXT,
  created_at               DATETIME NOT NULL,
  updated_at               DATETIME NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_te_active
  ON TimeEntries(user_id, stop_time)
  WHERE stop_time IS NULL AND is_deleted = 0;

CREATE INDEX IF NOT EXISTS idx_te_dates
  ON TimeEntries(start_time)
  WHERE is_deleted = 0;

CREATE INDEX IF NOT EXISTS idx_te_user
  ON TimeEntries(user_id);

CREATE INDEX IF NOT EXISTS idx_te_project
  ON TimeEntries(project_id);

-- Recreate ProjectNotes (was 0004)
CREATE TABLE ProjectNotes (
  id           INTEGER  PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER  NOT NULL REFERENCES Users(id),
  project_id   INTEGER  NOT NULL REFERENCES Projects(id),
  category_id  INTEGER  NOT NULL REFERENCES NoteCategories(id),
  description  TEXT     NOT NULL CHECK(length(description) >= 1),
  kilometers   REAL,
  status       TEXT     NOT NULL DEFAULT 'open'
                        CHECK(status IN ('open', 'closed')),
  is_deleted   BOOLEAN  NOT NULL DEFAULT 0,
  created_at   DATETIME NOT NULL,
  updated_at   DATETIME NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pn_billable
  ON ProjectNotes(category_id, status)
  WHERE is_deleted = 0;

CREATE INDEX IF NOT EXISTS idx_pn_project
  ON ProjectNotes(project_id);

CREATE INDEX IF NOT EXISTS idx_pn_user
  ON ProjectNotes(user_id);

-- Recreate RecentProjects (was 0005)
CREATE TABLE RecentProjects (
  id          INTEGER  PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER  NOT NULL REFERENCES Users(id),
  project_id  INTEGER  NOT NULL REFERENCES Projects(id),
  rank        INTEGER  NOT NULL CHECK(rank IN (1, 2)),
  updated_at  DATETIME NOT NULL,
  UNIQUE(user_id, rank)
);
