CREATE TABLE Extras (
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

CREATE INDEX idx_extras_user_id    ON Extras(user_id);
CREATE INDEX idx_extras_project_id ON Extras(project_id);
CREATE INDEX idx_extras_status     ON Extras(status);
