-- Migration 0008: Add team_id to Users
-- Nullable — existing users (admin, managers) may not belong to a team

ALTER TABLE Users ADD COLUMN team_id INTEGER REFERENCES Teams(id) ON DELETE SET NULL;
