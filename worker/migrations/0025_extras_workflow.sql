-- Add waiting_for_manager status to Extras + comment timeline table

-- Recreate Extras with updated status CHECK constraint
CREATE TABLE Extras_new (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES Users(id),
  project_id   INTEGER NOT NULL REFERENCES Projects(id),
  type         TEXT    NOT NULL CHECK(type IN ('extra_work', 'own_cost')),
  description  TEXT    NOT NULL,
  status       TEXT    NOT NULL DEFAULT 'open'
                CHECK(status IN ('open', 'waiting_for_manager', 'processed')),
  created_by   INTEGER REFERENCES Users(id),
  updated_by   INTEGER REFERENCES Users(id),
  processed_by INTEGER REFERENCES Users(id),
  processed_at TEXT,
  is_deleted   INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT    NOT NULL,
  updated_at   TEXT    NOT NULL
);

INSERT INTO Extras_new SELECT * FROM Extras;
DROP TABLE Extras;
ALTER TABLE Extras_new RENAME TO Extras;

CREATE INDEX idx_extras_user_id    ON Extras(user_id);
CREATE INDEX idx_extras_project_id ON Extras(project_id);
CREATE INDEX idx_extras_status     ON Extras(status);

-- Timeline comments for the own_cost review workflow
CREATE TABLE ExtraComments (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  extra_id     INTEGER NOT NULL REFERENCES Extras(id),
  user_id      INTEGER NOT NULL REFERENCES Users(id),
  comment_type TEXT    NOT NULL
                CHECK(comment_type IN ('created', 'review_requested', 'manager_reply', 'completed')),
  comment      TEXT,
  created_at   TEXT    NOT NULL
);

CREATE INDEX idx_extra_comments_extra_id ON ExtraComments(extra_id);
