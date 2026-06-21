-- Migration 0006: AuditLog
-- Append-only mutation log. Depends on Users (from 0001).
-- actor_id is nullable: NULL means the action was performed by the system (e.g. Cron).

CREATE TABLE IF NOT EXISTS AuditLog (
  id           INTEGER  PRIMARY KEY AUTOINCREMENT,
  actor_id     INTEGER  REFERENCES Users(id),  -- NULL = system/cron
  action       TEXT     NOT NULL,
  -- action values: 'created' | 'updated' | 'deleted' | 'status_changed' |
  --                'login' | 'logout' | 'password_changed' | 'password_reset' |
  --                'invited' | 'activated' | 'cron_flag'
  entity_type  TEXT     NOT NULL,
  -- entity_type values: 'time_entry' | 'project' | 'user' | 'project_note'
  entity_id    INTEGER,
  old_values   TEXT,    -- JSON snapshot before change; NULL for 'created' actions
  new_values   TEXT,    -- JSON snapshot after change; NULL for 'deleted' actions
  ip_address   TEXT,
  created_at   DATETIME NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_entity
  ON AuditLog(entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_audit_actor
  ON AuditLog(actor_id);

CREATE INDEX IF NOT EXISTS idx_audit_date
  ON AuditLog(created_at);
