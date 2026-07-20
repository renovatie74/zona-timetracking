-- Migration 0024: DailyAttendance + ProjectHourEntries
-- New time-capture model (Sprint 6).
-- No changes to existing tables — fully additive.

CREATE TABLE DailyAttendance (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id          INTEGER NOT NULL REFERENCES Users(id),
  work_date        TEXT    NOT NULL,          -- YYYY-MM-DD
  start_time       TEXT    NOT NULL,          -- HH:MM (local business time)
  finish_time      TEXT    NOT NULL,          -- HH:MM
  duration_minutes INTEGER NOT NULL DEFAULT 0,
  created_by       INTEGER REFERENCES Users(id),
  updated_by       INTEGER REFERENCES Users(id),
  is_deleted       INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT    NOT NULL,
  updated_at       TEXT    NOT NULL,
  UNIQUE(user_id, work_date)                  -- one attendance record per day per employee
);

CREATE INDEX idx_da_user_date ON DailyAttendance(user_id, work_date)
  WHERE is_deleted = 0;

CREATE TABLE ProjectHourEntries (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL REFERENCES Users(id),
  project_id    INTEGER NOT NULL REFERENCES Projects(id),
  work_date     TEXT    NOT NULL,             -- YYYY-MM-DD
  hours_minutes INTEGER NOT NULL,            -- duration in minutes (e.g. 210 = 3h 30m)
  note          TEXT,
  source        TEXT    NOT NULL DEFAULT 'employee_manual'
                        CHECK(source IN ('employee_manual', 'admin_manual')),
  created_by    INTEGER REFERENCES Users(id),
  updated_by    INTEGER REFERENCES Users(id),
  is_deleted    INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT    NOT NULL,
  updated_at    TEXT    NOT NULL
);

CREATE INDEX idx_phe_user_date    ON ProjectHourEntries(user_id, work_date)    WHERE is_deleted = 0;
CREATE INDEX idx_phe_project_date ON ProjectHourEntries(project_id, work_date) WHERE is_deleted = 0;
