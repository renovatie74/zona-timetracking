// ISO week helpers (all arithmetic in UTC, week = Mon–Sun)

// Returns the Monday of the current calendar week as YYYY-MM-DD.
// Used as the default week in the Operations Dashboard.
export function getCurrentWeekStart() {
  return weekStartFor(new Date().toISOString().slice(0, 10));
}

// Adds n days to a date string (n may be negative).
export function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function weekStartFor(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  const day = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + (day === 0 ? -6 : 1 - day));
  return d.toISOString().slice(0, 10);
}

export function weekEndFor(weekStart) {
  const d = new Date(weekStart + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 6);
  return d.toISOString().slice(0, 10);
}

export function addWeeks(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n * 7);
  return d.toISOString().slice(0, 10);
}

// ISO 8601: Week 1 contains the year's first Thursday
export function isoWeekNumber(dateStr) {
  const monday   = new Date(weekStartFor(dateStr) + 'T00:00:00Z');
  const thursday = new Date(monday);
  thursday.setUTCDate(monday.getUTCDate() + 3);
  const year = thursday.getUTCFullYear();
  const jan4  = new Date(`${year}-01-04T00:00:00Z`);
  const w1Mon = new Date(jan4);
  const j4day = jan4.getUTCDay();
  w1Mon.setUTCDate(jan4.getUTCDate() - (j4day === 0 ? 6 : j4day - 1));
  const week = Math.floor((monday.getTime() - w1Mon.getTime()) / (7 * 86_400_000)) + 1;
  return { week, year };
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// Returns "Week 27 – Jun 29 to Jul 5"
export function fmtWeekLabel(weekStart) {
  const ws = new Date(weekStart + 'T00:00:00Z');
  const we = new Date(weekStart + 'T00:00:00Z');
  we.setUTCDate(we.getUTCDate() + 6);
  const { week } = isoWeekNumber(weekStart);
  return `Week ${week} – ${MONTHS[ws.getUTCMonth()]} ${ws.getUTCDate()} to ${MONTHS[we.getUTCMonth()]} ${we.getUTCDate()}`;
}

// Short range only: "Jun 29 – Jul 5" (for compact contexts)
export function fmtWeekRange(weekStart) {
  const ws = new Date(weekStart + 'T00:00:00Z');
  const we = new Date(weekStart + 'T00:00:00Z');
  we.setUTCDate(we.getUTCDate() + 6);
  return `${MONTHS[ws.getUTCMonth()]} ${ws.getUTCDate()} – ${MONTHS[we.getUTCMonth()]} ${we.getUTCDate()}`;
}
