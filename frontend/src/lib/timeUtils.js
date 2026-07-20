// Time arithmetic helpers for attendance chip picker (HH:MM strings, 15-min steps)

export function minsToLabel(mins) {
  if (!mins) return '0h';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function minsFromTime(t) {
  if (!t || !/^\d{2}:\d{2}$/.test(t)) return null;
  const [h, m] = t.split(':').map(Number);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}

export function timeFromMins(mins) {
  const clamped = Math.max(0, Math.min(1425, mins));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// Step a time string by ±delta minutes, clamping to [00:00, 23:45].
// Returns the new time string, or the original if invalid.
export function stepTime(timeStr, deltaMins) {
  const mins = minsFromTime(timeStr);
  if (mins === null) return timeStr;
  return timeFromMins(mins + deltaMins);
}
