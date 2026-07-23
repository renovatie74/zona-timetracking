-- Add extra_date column to Extras for user-selected date (defaults to creation date)
ALTER TABLE Extras ADD COLUMN extra_date TEXT;
UPDATE Extras SET extra_date = SUBSTR(created_at, 1, 10) WHERE extra_date IS NULL;
