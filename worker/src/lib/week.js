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
