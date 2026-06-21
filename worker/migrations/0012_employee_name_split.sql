-- Sprint 2.2: Split Users.name into first_name + last_name
ALTER TABLE Users ADD COLUMN first_name TEXT NOT NULL DEFAULT '';
ALTER TABLE Users ADD COLUMN last_name  TEXT NOT NULL DEFAULT '';

UPDATE Users SET
  first_name = CASE
                 WHEN INSTR(name, ' ') > 0 THEN TRIM(SUBSTR(name, 1, INSTR(name, ' ') - 1))
                 ELSE name
               END,
  last_name  = CASE
                 WHEN INSTR(name, ' ') > 0 THEN TRIM(SUBSTR(name, INSTR(name, ' ') + 1))
                 ELSE ''
               END;

ALTER TABLE Users DROP COLUMN name;
