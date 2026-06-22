-- Migration 0014: Time Entry Approval Status (Sprint 3A)
--
-- Adds the status column needed for future approval workflow.
-- No workflow UI is required yet — all entries default to 'approved'.
--
-- Future sprint (approval workflow):
--   - Workers submit entries: status → 'submitted'
--   - Managers approve/reject: status → 'approved' or 'rejected'
--   - 'draft' supports multi-step entry sessions before submission
--
-- Existing rows: SQLite returns the DEFAULT value for any row that predates
-- this migration, so all historical entries read as 'approved'.

ALTER TABLE TimeEntries ADD COLUMN status TEXT NOT NULL DEFAULT 'approved'
  CHECK(status IN ('draft', 'submitted', 'approved', 'rejected'));
