-- Sprint 10.1: Add status column to WeeklyMileage for completion tracking.
ALTER TABLE WeeklyMileage ADD COLUMN status TEXT NOT NULL DEFAULT 'open';
