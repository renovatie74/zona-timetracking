-- Migration 0015 — audit trail: who created/last updated each time entry
ALTER TABLE TimeEntries ADD COLUMN created_by INTEGER REFERENCES Users(id);
ALTER TABLE TimeEntries ADD COLUMN updated_by INTEGER REFERENCES Users(id);
