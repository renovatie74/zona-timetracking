-- Migration 0010: Clients master data table.
-- Replaces free-text client_name on Projects with a proper FK reference.

CREATE TABLE ClientCodeSequence (
  id       INTEGER PRIMARY KEY CHECK(id = 1),
  next_seq INTEGER NOT NULL DEFAULT 1
);
INSERT INTO ClientCodeSequence (id, next_seq) VALUES (1, 1);

CREATE TABLE Clients (
  id             INTEGER  PRIMARY KEY AUTOINCREMENT,
  client_code    TEXT     NOT NULL UNIQUE,
  name           TEXT     NOT NULL,
  contact_person TEXT,
  phone          TEXT,
  email          TEXT,
  notes          TEXT,
  is_active      INTEGER  NOT NULL DEFAULT 1,
  created_at     DATETIME NOT NULL,
  updated_at     DATETIME NOT NULL
);
