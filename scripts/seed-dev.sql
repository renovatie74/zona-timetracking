-- DEV seed data — NEVER run against PROD.
-- Provides Corina (admin), Pawel (manager), and 4 workers with 4 active projects.
--
-- Users are created with is_active=0 and NULL password_hash.
-- Sprint 1 will implement the activation/login flow. To test login in Sprint 1
-- before invitation emails are working, generate a hash with:
--
--   node -e "
--     const salt = crypto.getRandomValues(new Uint8Array(16));
--     const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('Test1234!'), 'PBKDF2', false, ['deriveBits']);
--     const bits = await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt,iterations:600000}, key, 256);
--     const saltB64 = btoa(String.fromCharCode(...salt));
--     const hashB64 = btoa(String.fromCharCode(...new Uint8Array(bits)));
--     console.log(\`pbkdf2:sha256:600000:\${saltB64}:\${hashB64}\`);
--   "
-- Then: UPDATE Users SET password_hash='<output>', is_active=1 WHERE email='corina@zonaproperties.ae';

-- ── Sequences: ensure fresh state ────────────────────────────────────────────
-- (Already seeded to next_seq=1 in 0001/0002 migrations via INSERT OR IGNORE)

-- ── Users ─────────────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO Users
  (id, role_id, employee_number, name, email, mobile, is_active, created_at, updated_at)
VALUES
  (1, 3, 'E-001', 'Corina Admin',   'corina@zonaproperties.ae', '+971501234567', 0, datetime('now'), datetime('now')),
  (2, 2, 'E-002', 'Pawel Manager',  'pawel@zonaproperties.ae',  '+971507654321', 0, datetime('now'), datetime('now')),
  (3, 1, 'E-003', 'Kacper W.',      'kacper@example.ae',        '+971509876543', 0, datetime('now'), datetime('now')),
  (4, 1, 'E-004', 'Marcin T.',      'marcin@example.ae',        '+971502345678', 0, datetime('now'), datetime('now')),
  (5, 1, 'E-005', 'Ahmed R.',       'ahmed@example.ae',         '+971503456789', 0, datetime('now'), datetime('now')),
  (6, 1, 'E-006', 'James O.',       'james@example.ae',         '+971504567890', 0, datetime('now'), datetime('now'));

-- Advance EmployeeCodeSequence past the seeded users so the next generated code is E-007
UPDATE EmployeeCodeSequence SET next_seq = 7 WHERE id = 1;

-- ── Projects ──────────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO Projects
  (id, project_code, project_code_seq, name, customer_name, location, status, start_date, created_at, updated_at)
VALUES
  (1, 'P-001', 1, 'Frederika van Pruizenweg 54', 'Van Pruizen BV',    'Amsterdam',  'active',    '2026-01-15', datetime('now'), datetime('now')),
  (2, 'P-002', 2, 'Helmond Fit-Out',             'Helmond Invest',    'Helmond',    'active',    '2026-02-01', datetime('now'), datetime('now')),
  (3, 'P-003', 3, 'Al Quoz Unit 3',              'Al Quoz Holdings',  'Dubai',      'active',    '2026-03-10', datetime('now'), datetime('now')),
  (4, 'P-004', 4, 'Bosrand Phase 2',             'Bosrand Dev',       'Eindhoven',  'completed', '2025-11-01', datetime('now'), datetime('now'));

-- Advance ProjectCodeSequence past seeded projects so next is P-005
UPDATE ProjectCodeSequence SET next_seq = 5 WHERE id = 1;

-- ── Sample time entries (workers 3–6 on projects 1–3) ─────────────────────────
-- All timestamps in UTC. Dubai is UTC+4.
-- rounded_* values computed per spec §6 rounding rules.
INSERT OR IGNORE INTO TimeEntries
  (user_id, project_id, entry_source, start_time, stop_time,
   duration_minutes,
   rounded_start_time, rounded_stop_time, rounded_duration_minutes,
   gps_status, checkout_gps_status,
   is_deleted, created_at, updated_at)
VALUES
  -- Kacper: P-001, 07:10→15:22 UTC  →  rounded 07:15→15:30 = 255 min
  (3, 1, 'automatic', '2026-06-21 03:10:00', '2026-06-21 11:22:00',
   492, '2026-06-21 03:15:00', '2026-06-21 11:30:00', 255,
   'captured', 'captured', 0, datetime('now'), datetime('now')),
  -- Marcin: P-002, 07:15→14:00 UTC  →  rounded 07:15→14:00 = 405 min
  (4, 2, 'automatic', '2026-06-21 03:15:00', '2026-06-21 10:00:00',
   405, '2026-06-21 03:15:00', '2026-06-21 10:00:00', 405,
   'denied', 'denied', 0, datetime('now'), datetime('now')),
  -- Ahmed: P-001, 08:30→16:00 UTC  →  rounded 08:30→16:00 = 450 min
  (5, 1, 'automatic', '2026-06-21 04:30:00', '2026-06-21 12:00:00',
   450, '2026-06-21 04:30:00', '2026-06-21 12:00:00', 450,
   'captured', 'unavailable', 0, datetime('now'), datetime('now')),
  -- James: P-003, open session (no stop_time — simulates active check-in)
  (6, 3, 'automatic', '2026-06-21 05:05:00', NULL,
   NULL, '2026-06-21 05:15:00', NULL, NULL,
   'unavailable', 'unavailable', 0, datetime('now'), datetime('now'));

-- ── Sample project notes ──────────────────────────────────────────────────────
INSERT OR IGNORE INTO ProjectNotes
  (user_id, project_id, category_id, description, status, created_at, updated_at)
VALUES
  (3, 1, 6, '4 extra power sockets requested by client',   'open',   datetime('now'), datetime('now')),
  (5, 1, 4, 'Repainted ceiling per client request',        'open',   datetime('now'), datetime('now')),
  (4, 2, 6, 'New door frame — client specification change','open',   datetime('now'), datetime('now')),
  (3, 1, 1, 'Ordered 20 bags cement from supplier',        'closed', datetime('now'), datetime('now'));

-- ── RecentProjects ────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO RecentProjects (user_id, project_id, rank, updated_at) VALUES
  (3, 1, 1, datetime('now')),  -- Kacper: most recent = P-001
  (4, 2, 1, datetime('now')),  -- Marcin: most recent = P-002
  (5, 1, 1, datetime('now')),  -- Ahmed: most recent = P-001
  (6, 3, 1, datetime('now')); -- James: most recent = P-003
