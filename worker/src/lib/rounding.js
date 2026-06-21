/**
 * Time rounding — authoritative implementation (spec §6).
 *
 * Check-in:  round to NEAREST 15-minute boundary (boundary at 7m 30s past each quarter).
 * Check-out: round UP to NEXT 15-minute boundary (if exactly on boundary: no change).
 *
 * All inputs and outputs are UTC Date objects or ISO strings.
 * All computations happen on UTC milliseconds — no timezone arithmetic needed here.
 * Dubai (UTC+4) offset is applied only in SQL queries for week-boundary calculations.
 */

const INTERVAL_MS = 15 * 60 * 1000;  // 900 000 ms

/**
 * Round check-in to nearest 15-minute boundary.
 * Math.round gives "round half up" at the 7m 30s midpoint, matching spec §6.1.
 *
 * Examples from spec:
 *   07:07 → 07:00  (7 min past: round down)
 *   07:08 → 07:15  (8 min past: round up)
 *   07:53 → 08:00  (8 min past 07:45: round up)
 */
export function roundCheckin(utcDate) {
  const ms = utcDate instanceof Date ? utcDate.getTime() : new Date(utcDate).getTime();
  return new Date(Math.round(ms / INTERVAL_MS) * INTERVAL_MS);
}

/**
 * Round check-out UP to the next 15-minute boundary.
 * If already exactly on a boundary: no change.
 * Math.ceil handles this correctly.
 *
 * Examples from spec:
 *   15:00 → 15:00  (exactly on boundary: no change)
 *   15:01 → 15:15  (after boundary: ceil up)
 *   15:59 → 16:00  (after boundary: ceil up)
 */
export function roundCheckout(utcDate) {
  const ms = utcDate instanceof Date ? utcDate.getTime() : new Date(utcDate).getTime();
  if (ms % INTERVAL_MS === 0) return new Date(ms);
  return new Date(Math.ceil(ms / INTERVAL_MS) * INTERVAL_MS);
}

/**
 * Compute rounded duration in whole minutes.
 * Both inputs must be rounded Date objects (output of roundCheckin/roundCheckout).
 */
export function roundedDurationMinutes(roundedStart, roundedStop) {
  const startMs = roundedStart instanceof Date ? roundedStart.getTime() : new Date(roundedStart).getTime();
  const stopMs  = roundedStop  instanceof Date ? roundedStop.getTime()  : new Date(roundedStop).getTime();
  return Math.round((stopMs - startMs) / 60_000);
}

/**
 * Apply all rounding to a completed time entry and return the derived fields.
 * Called at check-out and whenever an entry is edited.
 */
export function computeRounded(startTime, stopTime) {
  const start = new Date(startTime);
  const stop  = new Date(stopTime);

  const roundedStart    = roundCheckin(start);
  const roundedStop     = roundCheckout(stop);
  const durationMinutes = Math.round((stop.getTime() - start.getTime()) / 60_000);
  const roundedDuration = roundedDurationMinutes(roundedStart, roundedStop);

  return {
    duration_minutes:         durationMinutes,
    rounded_start_time:       roundedStart.toISOString(),
    rounded_stop_time:        roundedStop.toISOString(),
    rounded_duration_minutes: roundedDuration,
  };
}
