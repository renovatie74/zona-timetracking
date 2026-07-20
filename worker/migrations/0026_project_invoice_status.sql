-- Sprint 10: project-level weekly invoice status
-- Pending = no row. A row marks that week as invoiced (or future statuses).
CREATE TABLE IF NOT EXISTS ProjectWeekInvoiceStatus (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id   INTEGER NOT NULL REFERENCES Projects(id),
  iso_week     INTEGER NOT NULL,       -- ISO week number (1-53)
  year         INTEGER NOT NULL,       -- ISO year
  week_start   TEXT    NOT NULL,       -- 'YYYY-MM-DD' Monday of the week
  status       TEXT    NOT NULL DEFAULT 'invoiced',  -- future: 'paid', 'disputed', …
  invoiced_at  TEXT    NOT NULL,
  invoiced_by  INTEGER NOT NULL REFERENCES Users(id),
  UNIQUE(project_id, week_start)
);

CREATE INDEX IF NOT EXISTS idx_pwis_project_week
  ON ProjectWeekInvoiceStatus(project_id, week_start);
