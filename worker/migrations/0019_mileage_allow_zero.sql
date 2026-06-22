-- Sprint 4.3: Allow mileage_km = 0 (employee can report zero km for the week).
-- SQLite does not support DROP CONSTRAINT; must recreate the table.
PRAGMA foreign_keys = OFF;
CREATE TABLE WeeklyMileage_v3 (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES Users(id),
  week_start TEXT    NOT NULL,
  mileage_km REAL    NOT NULL CHECK(mileage_km >= 0),
  created_by INTEGER REFERENCES Users(id),
  updated_by INTEGER REFERENCES Users(id),
  created_at TEXT    NOT NULL,
  updated_at TEXT    NOT NULL,
  UNIQUE(user_id, week_start)
);
INSERT INTO WeeklyMileage_v3 SELECT * FROM WeeklyMileage;
DROP TABLE WeeklyMileage;
ALTER TABLE WeeklyMileage_v3 RENAME TO WeeklyMileage;
CREATE INDEX idx_weekly_mileage_user_id    ON WeeklyMileage(user_id);
CREATE INDEX idx_weekly_mileage_week_start ON WeeklyMileage(week_start);
PRAGMA foreign_keys = ON;
