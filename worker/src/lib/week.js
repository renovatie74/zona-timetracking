// ISO week helpers — week = Monday through Sunday, all arithmetic in UTC.

export function weekStartFor(dateStr) {
  const d   = new Date(dateStr + 'T00:00:00Z');
  const day = d.getUTCDay(); // 0=Sun … 6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

export function weekEndFor(dateStr) {
  const d = new Date(weekStartFor(dateStr) + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 6);
  return d.toISOString().slice(0, 10);
}

export function currentWeekStart() {
  return weekStartFor(new Date().toISOString().slice(0, 10));
}

// ISO 8601 week number — Week 1 contains the year's first Thursday.
// Returns { week: number, year: number }
export function isoWeekNumber(dateStr) {
  const monday   = new Date(weekStartFor(dateStr) + 'T00:00:00Z');
  // Thursday of this week
  const thursday = new Date(monday);
  thursday.setUTCDate(monday.getUTCDate() + 3);
  const year = thursday.getUTCFullYear();
  // Week 1 of year: Monday of the week containing Jan 4
  const jan4  = new Date(`${year}-01-04T00:00:00Z`);
  const w1Mon = new Date(jan4);
  const j4day = jan4.getUTCDay();
  w1Mon.setUTCDate(jan4.getUTCDate() - (j4day === 0 ? 6 : j4day - 1));
  const week  = Math.floor((monday.getTime() - w1Mon.getTime()) / (7 * 86_400_000)) + 1;
  return { week, year };
}
