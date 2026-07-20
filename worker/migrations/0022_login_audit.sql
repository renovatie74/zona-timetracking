-- Migration 0022: LoginAuditEvents — per-attempt login log
-- Separate from AuditLog (different schema: email, country, UA, device_summary).
-- Records every login attempt — success and failure — before a session is created.

CREATE TABLE LoginAuditEvents (
  id               INTEGER  PRIMARY KEY AUTOINCREMENT,
  attempted_email  TEXT     NOT NULL,
  user_id          INTEGER  REFERENCES Users(id),
  result           TEXT     NOT NULL,   -- 'success' | 'failed'
  failure_reason   TEXT,                -- 'invalid_password' | 'unknown_user' | 'pending_activation' | 'deactivated' | 'other'
  ip_address       TEXT,
  country_code     TEXT,
  user_agent       TEXT,
  device_summary   TEXT,
  path             TEXT,
  created_at       DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX idx_login_audit_created_at  ON LoginAuditEvents(created_at);
CREATE INDEX idx_login_audit_user_id     ON LoginAuditEvents(user_id);
CREATE INDEX idx_login_audit_email       ON LoginAuditEvents(attempted_email);
CREATE INDEX idx_login_audit_result      ON LoginAuditEvents(result);
