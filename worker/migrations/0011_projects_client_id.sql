-- Migration 0011: Link Projects to Clients via FK.
--
-- Steps:
--   1. Migrate unique client_name values from Projects → Clients.
--   2. Advance ClientCodeSequence past the migrated rows.
--   3. Add Projects.client_id FK column.
--   4. Populate client_id by matching Clients.name = Projects.client_name.
--   5. Drop the now-redundant client_name column (SQLite 3.35+, D1 3.44+).

INSERT INTO Clients (client_code, name, is_active, created_at, updated_at)
SELECT
  'C-' || printf('%03d', row_number() OVER (ORDER BY client_name)),
  client_name,
  1,
  datetime('now'),
  datetime('now')
FROM (SELECT DISTINCT client_name FROM Projects WHERE client_name IS NOT NULL AND client_name != '');

UPDATE ClientCodeSequence SET next_seq = (SELECT COUNT(*) + 1 FROM Clients);

ALTER TABLE Projects ADD COLUMN client_id INTEGER REFERENCES Clients(id) ON DELETE SET NULL;

UPDATE Projects
SET client_id = (SELECT id FROM Clients WHERE Clients.name = Projects.client_name)
WHERE client_name IS NOT NULL AND client_name != '';

ALTER TABLE Projects DROP COLUMN client_name;
