-- Migration 0001: Roles, EmployeeCodeSequence, Users, NoteCategories
-- No FK dependencies — all lookup and base tables first.

CREATE TABLE IF NOT EXISTS Roles (
  id    INTEGER PRIMARY KEY,
  name  TEXT    NOT NULL UNIQUE  -- 'employee' | 'manager' | 'administrator'
);
INSERT OR IGNORE INTO Roles (id, name) VALUES
  (1, 'employee'),
  (2, 'manager'),
  (3, 'administrator');

-- Singleton sequence table for auto-generated employee numbers (E-001, E-002, ...).
-- next_seq holds the NEXT value to be claimed.
-- Reads are done via: UPDATE ... SET next_seq = next_seq + 1 RETURNING next_seq - 1 AS seq
-- This ensures the first code issued is E-001 (next_seq starts at 1, post-increment is 2,
-- RETURNING 2-1=1 → E-001).
CREATE TABLE IF NOT EXISTS EmployeeCodeSequence (
  id        INTEGER PRIMARY KEY CHECK(id = 1),  -- enforces singleton
  next_seq  INTEGER NOT NULL DEFAULT 1
);
INSERT OR IGNORE INTO EmployeeCodeSequence (id, next_seq) VALUES (1, 1);

CREATE TABLE IF NOT EXISTS Users (
  id                          INTEGER PRIMARY KEY AUTOINCREMENT,
  role_id                     INTEGER  NOT NULL REFERENCES Roles(id),
  employee_number             TEXT     NOT NULL UNIQUE,  -- auto-generated E-NNN; never editable
  name                        TEXT     NOT NULL,
  email                       TEXT     NOT NULL UNIQUE,
  password_hash               TEXT,                      -- NULL until invitation accepted
  mobile                      TEXT,
  internal_hourly_rate        REAL,                      -- visible to administrator role only
  is_active                   BOOLEAN  NOT NULL DEFAULT 0,
  invitation_token            TEXT,
  invitation_token_expires_at DATETIME,
  invitation_accepted_at      DATETIME,
  password_reset_token        TEXT,
  password_reset_expires_at   DATETIME,
  created_at                  DATETIME NOT NULL,
  updated_at                  DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS NoteCategories (
  id          INTEGER PRIMARY KEY,
  name        TEXT    NOT NULL UNIQUE,
  sort_order  INTEGER NOT NULL
);
INSERT OR IGNORE INTO NoteCategories (id, name, sort_order) VALUES
  (1, 'Material',        1),
  (2, 'Parking',         2),
  (3, 'Equipment',       3),
  (4, 'Additional Work', 4),  -- billable
  (5, 'Mileage',         5),
  (6, 'Invoice Item',    6),  -- billable
  (7, 'Other',           7);
