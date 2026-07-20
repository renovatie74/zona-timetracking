-- Sprint 5.1: Organization-level settings table.
-- Stores configurable values such as the business timezone.
-- Seeded with Europe/Amsterdam; update via SQL or a future admin UI.
CREATE TABLE IF NOT EXISTS OrgSettings (
  key   TEXT NOT NULL PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT OR IGNORE INTO OrgSettings (key, value) VALUES ('timezone', 'Europe/Amsterdam');
