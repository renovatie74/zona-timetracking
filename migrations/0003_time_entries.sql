-- Migration 0003: TimeEntries
-- Depends on: Users, Projects (from 0001, 0002).

CREATE TABLE IF NOT EXISTS TimeEntries (
  id                       INTEGER  PRIMARY KEY AUTOINCREMENT,
  user_id                  INTEGER  NOT NULL REFERENCES Users(id),
  project_id               INTEGER  NOT NULL REFERENCES Projects(id),

  -- How this entry was created or last modified
  entry_source             TEXT     NOT NULL DEFAULT 'automatic'
                                    CHECK(entry_source IN ('automatic', 'manual_worker', 'manual_admin')),

  -- Original timestamps (UTC, set by server clock)
  start_time               DATETIME NOT NULL,
  stop_time                DATETIME,           -- NULL while session is active

  -- Exact duration; NULL while active
  duration_minutes         INTEGER,

  -- Rounded timestamps (spec §6 rounding rules)
  rounded_start_time       DATETIME,           -- nearest 15-min boundary
  rounded_stop_time        DATETIME,           -- next 15-min boundary UP
  rounded_duration_minutes INTEGER,            -- used in all reports and exports

  -- Check-in GPS (spec §3.3)
  checkin_lat              REAL,
  checkin_lng              REAL,
  checkin_accuracy_m       REAL,
  checkin_maps_url         TEXT,
  gps_status               TEXT     NOT NULL DEFAULT 'unavailable'
                                    CHECK(gps_status IN ('captured', 'denied', 'unavailable')),

  -- Check-out GPS
  checkout_lat             REAL,
  checkout_lng             REAL,
  checkout_accuracy_m      REAL,
  checkout_maps_url        TEXT,
  checkout_gps_status      TEXT     NOT NULL DEFAULT 'unavailable'
                                    CHECK(checkout_gps_status IN ('captured', 'denied', 'unavailable')),

  -- Flags
  unclosed_flag            BOOLEAN  NOT NULL DEFAULT 0,  -- set by nightly Cron if open > 12h
  is_manual_entry          BOOLEAN  NOT NULL DEFAULT 0,  -- true when created via manual entry form
  is_deleted               BOOLEAN  NOT NULL DEFAULT 0,  -- soft delete

  notes                    TEXT,                         -- admin correction notes
  created_at               DATETIME NOT NULL,
  updated_at               DATETIME NOT NULL
);

-- Active session lookup (most frequent query: "is this worker checked in?")
CREATE INDEX IF NOT EXISTS idx_te_active
  ON TimeEntries(user_id, stop_time)
  WHERE stop_time IS NULL AND is_deleted = 0;

-- Date-range report queries
CREATE INDEX IF NOT EXISTS idx_te_dates
  ON TimeEntries(start_time)
  WHERE is_deleted = 0;

-- Admin view: all entries for a worker
CREATE INDEX IF NOT EXISTS idx_te_user
  ON TimeEntries(user_id);

-- Project hours report
CREATE INDEX IF NOT EXISTS idx_te_project
  ON TimeEntries(project_id);
