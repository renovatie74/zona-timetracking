-- Sprint 5 dev seed data — Operations Dashboard
-- Run with: wrangler d1 execute zona-time --local --file=worker/dev-seed.sql
-- All inserts use INSERT OR IGNORE for idempotency.
-- Requires existing users (E-001 etc.) and active projects already seeded.

-- ── Test employees E-501 through E-505 ────────────────────────────────────────
INSERT OR IGNORE INTO Users
  (role_id, employee_number, first_name, last_name, email, password_hash, mobile, is_active,
   invitation_token, invitation_token_expires_at, password_reset_token, password_reset_expires_at,
   created_at, updated_at)
VALUES
  (1, 'E-501', 'Anna',    'Bakker',    'anna.bakker@zona.nl',    NULL, NULL, 1, NULL, NULL, NULL, NULL, datetime('now'), datetime('now')),
  (1, 'E-502', 'Bas',     'de Vries',  'bas.devries@zona.nl',    NULL, NULL, 1, NULL, NULL, NULL, NULL, datetime('now'), datetime('now')),
  (1, 'E-503', 'Carla',   'Jansen',    'carla.jansen@zona.nl',   NULL, NULL, 1, NULL, NULL, NULL, NULL, datetime('now'), datetime('now')),
  (1, 'E-504', 'Daan',    'Visser',    'daan.visser@zona.nl',    NULL, NULL, 1, NULL, NULL, NULL, NULL, datetime('now'), datetime('now')),
  (1, 'E-505', 'Eva',     'Smit',      'eva.smit@zona.nl',       NULL, NULL, 1, NULL, NULL, NULL, NULL, datetime('now'), datetime('now'));

-- ── 1 active check-in (E-501, open session) ───────────────────────────────────
INSERT OR IGNORE INTO TimeEntries
  (user_id, project_id, start_time, stop_time, duration_minutes, rounded_duration_minutes,
   entry_source, is_manual_entry, is_deleted, status, created_at, updated_at)
SELECT u.id, p.id,
  datetime('now', '-3 hours'), NULL, NULL, NULL,
  'automatic', 0, 0, 'approved', datetime('now'), datetime('now')
FROM Users u, Projects p
WHERE u.employee_number = 'E-501' AND p.is_active = 1
LIMIT 1;

-- ── 2 closed time entries today (E-502 and E-503) ────────────────────────────
INSERT OR IGNORE INTO TimeEntries
  (user_id, project_id, start_time, stop_time, duration_minutes, rounded_duration_minutes,
   entry_source, is_manual_entry, is_deleted, status, created_at, updated_at)
SELECT u.id, p.id,
  datetime('now', '-5 hours'), datetime('now', '-3 hours'), 120, 120,
  'automatic', 0, 0, 'approved', datetime('now'), datetime('now')
FROM Users u, Projects p
WHERE u.employee_number = 'E-502' AND p.is_active = 1
LIMIT 1;

INSERT OR IGNORE INTO TimeEntries
  (user_id, project_id, start_time, stop_time, duration_minutes, rounded_duration_minutes,
   entry_source, is_manual_entry, is_deleted, status, created_at, updated_at)
SELECT u.id, p.id,
  datetime('now', '-6 hours'), datetime('now', '-4 hours'), 120, 120,
  'automatic', 0, 0, 'approved', datetime('now'), datetime('now')
FROM Users u, Projects p
WHERE u.employee_number = 'E-503' AND p.is_active = 1
LIMIT 1;

-- ── E-504 has no entries today (no_activity) ─────────────────────────────────
-- (No INSERT needed — E-504 simply has no entries for today)

-- ── 2 open extras (own_cost for E-502, extra_work for E-503) ─────────────────
INSERT OR IGNORE INTO Extras
  (user_id, project_id, type, description, status, is_deleted, created_at, updated_at)
SELECT u.id, p.id, 'own_cost', 'Veiligheidsschoenen (safety boots)', 'open', 0, datetime('now'), datetime('now')
FROM Users u, Projects p
WHERE u.employee_number = 'E-502' AND p.is_active = 1
LIMIT 1;

INSERT OR IGNORE INTO Extras
  (user_id, project_id, type, description, status, is_deleted, created_at, updated_at)
SELECT u.id, p.id, 'extra_work', 'Overwerk vrijdag avond', 'open', 0, datetime('now'), datetime('now')
FROM Users u, Projects p
WHERE u.employee_number = 'E-503' AND p.is_active = 1
LIMIT 1;

-- ── 1 processed extra (E-501) ─────────────────────────────────────────────────
INSERT OR IGNORE INTO Extras
  (user_id, project_id, type, description, status, processed_by, processed_at, is_deleted, created_at, updated_at)
SELECT u.id, p.id, 'extra_work', 'Extra uren vorige week', 'processed',
  (SELECT id FROM Users WHERE role_id = 3 LIMIT 1),
  datetime('now', '-1 day'),
  0, datetime('now', '-2 days'), datetime('now', '-1 day')
FROM Users u, Projects p
WHERE u.employee_number = 'E-501' AND p.is_active = 1
LIMIT 1;

-- ── 1 mileage record for E-501 for current week ───────────────────────────────
INSERT OR REPLACE INTO WeeklyMileage
  (user_id, week_start, mileage_km, created_at, updated_at)
SELECT u.id,
  -- Compute current Monday (works in SQLite)
  date('now', 'weekday 1', '-7 days'),
  142.5,
  datetime('now'), datetime('now')
FROM Users u
WHERE u.employee_number = 'E-501';

-- ── E-505 worked this week but has NO mileage record (triggers missing_mileage alert) ──
INSERT OR IGNORE INTO TimeEntries
  (user_id, project_id, start_time, stop_time, duration_minutes, rounded_duration_minutes,
   entry_source, is_manual_entry, is_deleted, status, created_at, updated_at)
SELECT u.id, p.id,
  date('now', 'weekday 1', '-7 days') || 'T08:00:00Z',
  date('now', 'weekday 1', '-7 days') || 'T16:00:00Z',
  480, 480,
  'automatic', 0, 0, 'approved', datetime('now'), datetime('now')
FROM Users u, Projects p
WHERE u.employee_number = 'E-505' AND p.is_active = 1
LIMIT 1;
