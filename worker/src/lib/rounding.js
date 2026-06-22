/**
 * Time rounding — authoritative implementation (spec §6, revised Sprint 3B.2).
 *
 * Rule: store actual start/stop times; round ONLY the total duration.
 * Threshold: 0–7 min past a 15-min boundary → round DOWN; 8–14 → round UP.
 * This is equivalent to Math.round(minutes / 15) * 15.
 *
 * Examples:
 *   1h 00m → 1h 00m (60 min → 60)
 *   1h 05m → 1h 00m (65 min → 60)
 *   1h 07m → 1h 00m (67 min → 60)
 *   1h 08m → 1h 15m (68 min → 75)
 *   1h 14m → 1h 15m (74 min → 75)
 *   1h 22m → 1h 15m (82 min → 75)
 *   1h 23m → 1h 30m (83 min → 90)
 *
 * Minimum duration: 10 minutes. Shorter sessions are rejected at checkout.
 */

export const MIN_DURATION_MINUTES = 10;

/**
 * Round a duration (in whole minutes) to the nearest 15-minute increment.
 * Threshold is 7.5 minutes, so 7 → rounds down, 8 → rounds up.
 */
export function roundDuration(durationMinutes) {
  return Math.round(durationMinutes / 15) * 15;
}

/**
 * Apply duration-based rounding to a completed time entry.
 * Called at check-out and whenever an entry is edited.
 *
 * rounded_start_time / rounded_stop_time are kept equal to the actual
 * times (for audit trail compatibility); payroll uses rounded_duration_minutes.
 */
export function computeRounded(startTime, stopTime) {
  const start = new Date(startTime);
  const stop  = new Date(stopTime);

  const durationMinutes = Math.round((stop.getTime() - start.getTime()) / 60_000);
  const roundedDuration = roundDuration(durationMinutes);

  return {
    duration_minutes:         durationMinutes,
    rounded_start_time:       start.toISOString(),
    rounded_stop_time:        stop.toISOString(),
    rounded_duration_minutes: roundedDuration,
  };
}
