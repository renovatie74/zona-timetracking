-- Migration 0007: Teams
-- supervisor_id is a nullable FK to Users (the team lead / supervisor)

CREATE TABLE IF NOT EXISTS Teams (
  id            INTEGER  PRIMARY KEY AUTOINCREMENT,
  name          TEXT     NOT NULL UNIQUE,
  supervisor_id INTEGER  REFERENCES Users(id) ON DELETE SET NULL,
  is_active     INTEGER  NOT NULL DEFAULT 1,
  created_at    DATETIME NOT NULL,
  updated_at    DATETIME NOT NULL
);
