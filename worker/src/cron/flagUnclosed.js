/**
 * Nightly Cron: 23:30 Dubai (UTC+4) = 19:30 UTC  →  "30 19 * * *"
 *
 * Sprint 3 implementation. This stub allows the Worker to deploy cleanly in Sprint 0.
 *
 * Sprint 3 will:
 *   UPDATE TimeEntries
 *      SET unclosed_flag = 1, updated_at = datetime('now')
 *    WHERE stop_time IS NULL
 *      AND is_deleted = 0
 *      AND unclosed_flag = 0
 *      AND start_time < datetime('now', '-12 hours')
 */
export async function flagUnclosed(env) {
  console.log('[cron] flagUnclosed: stub — implementation in Sprint 3');
}
