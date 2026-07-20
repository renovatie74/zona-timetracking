const DEFAULT_TZ = 'Europe/Amsterdam';

export function getBusinessToday(tz = DEFAULT_TZ) {
  return new Date().toLocaleDateString('en-CA', { timeZone: tz });
}

export function getBusinessWeekStart(dateStr, tz = DEFAULT_TZ) {
  const d   = new Date((dateStr ?? getBusinessToday(tz)) + 'T00:00:00Z');
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

export function getCurrentBusinessWeekStart(tz = DEFAULT_TZ) {
  return getBusinessWeekStart(getBusinessToday(tz), tz);
}

export function isCurrentBusinessWeek(weekStart, tz = DEFAULT_TZ) {
  return weekStart === getCurrentBusinessWeekStart(tz);
}

/**
 * Returns the UTC timestamps that bracket a calendar day in the given timezone.
 * Use for DB queries so entries near local midnight are included/excluded correctly.
 *
 * Example — Dubai (UTC+4):
 *   getDayUTCBounds('2026-06-23', 'Asia/Dubai')
 *   → { start: '2026-06-22T20:00:00.000Z', end: '2026-06-23T20:00:00.000Z' }
 */
export function getDayUTCBounds(dateStr, tz = DEFAULT_TZ) {
  // At noon UTC on dateStr, read the local HH:MM in the target timezone.
  // The difference from 12:00 UTC gives the UTC offset (handles fractional offsets too).
  const noonUTC = new Date(`${dateStr}T12:00:00Z`);
  const localNoon = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour:     '2-digit',
    minute:   '2-digit',
    hourCycle: 'h23',
  }).format(noonUTC); // e.g. "16:00" for Dubai (UTC+4), "14:00" for Amsterdam (UTC+2)

  const [h, m] = localNoon.split(':').map(Number);
  const offsetMins = h * 60 + m - 720; // 720 = noon in minutes

  // Midnight of dateStr in tz = midnight UTC minus the offset
  const startMs = Date.parse(`${dateStr}T00:00:00Z`) - offsetMins * 60_000;

  return {
    start: new Date(startMs).toISOString(),
    end:   new Date(startMs + 86_400_000).toISOString(),
  };
}
