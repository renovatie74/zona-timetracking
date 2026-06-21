-- Migration 0005: RecentProjects
-- Stores last 1-2 projects per worker for the project selection screen.
-- Depends on: Users, Projects (from 0001, 0002).

CREATE TABLE IF NOT EXISTS RecentProjects (
  id          INTEGER  PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER  NOT NULL REFERENCES Users(id),
  project_id  INTEGER  NOT NULL REFERENCES Projects(id),
  rank        INTEGER  NOT NULL CHECK(rank IN (1, 2)),  -- 1 = most recent, 2 = second most recent
  updated_at  DATETIME NOT NULL,
  UNIQUE(user_id, rank)  -- one slot per rank per worker; upsert replaces the slot
);
-- Upsert pattern on check-in:
--   1. UPDATE RecentProjects SET project_id=new, updated_at=now WHERE user_id=X AND rank=1 → becomes rank 2
--   2. INSERT OR REPLACE INTO RecentProjects (user_id, project_id, rank, updated_at) VALUES (X, new, 1, now)
-- Both steps in a single transaction.
