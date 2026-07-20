-- Sprint 5.2.1: Normalize legacy SQLite-space timestamps to ISO 8601 UTC.
-- Older records were stored as "YYYY-MM-DD HH:MM:SS" (SQLite datetime() format,
-- UTC, no timezone indicator). JavaScript engines in non-UTC environments treat
-- the no-Z form as local time, causing display offsets in browsers.
-- This migration appends "Z" (no semantic change — value was always UTC) so
-- all environments interpret the timestamp consistently.
-- Safe to run multiple times (WHERE clause excludes already-normalized rows).

UPDATE TimeEntries
SET    start_time = replace(start_time, ' ', 'T') || 'Z'
WHERE  start_time LIKE '____-__-__ __%'
  AND  start_time NOT LIKE '%Z';

UPDATE TimeEntries
SET    stop_time = replace(stop_time, ' ', 'T') || 'Z'
WHERE  stop_time LIKE '____-__-__ __%'
  AND  stop_time NOT LIKE '%Z';

UPDATE TimeEntries
SET    rounded_start_time = replace(rounded_start_time, ' ', 'T') || 'Z'
WHERE  rounded_start_time LIKE '____-__-__ __%'
  AND  rounded_start_time NOT LIKE '%Z';

UPDATE TimeEntries
SET    rounded_stop_time = replace(rounded_stop_time, ' ', 'T') || 'Z'
WHERE  rounded_stop_time LIKE '____-__-__ __%'
  AND  rounded_stop_time NOT LIKE '%Z';

UPDATE TimeEntries
SET    created_at = replace(created_at, ' ', 'T') || 'Z'
WHERE  created_at LIKE '____-__-__ __%'
  AND  created_at NOT LIKE '%Z';

UPDATE TimeEntries
SET    updated_at = replace(updated_at, ' ', 'T') || 'Z'
WHERE  updated_at LIKE '____-__-__ __%'
  AND  updated_at NOT LIKE '%Z';
