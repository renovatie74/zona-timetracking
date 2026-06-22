const BUSINESS_TZ = 'Europe/Amsterdam';

export function getBusinessToday() {
  return new Date().toLocaleDateString('en-CA', { timeZone: BUSINESS_TZ });
}

export function getBusinessWeekStart(dateStr) {
  const d   = new Date((dateStr ?? getBusinessToday()) + 'T00:00:00Z');
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

export function getCurrentBusinessWeekStart() {
  return getBusinessWeekStart(getBusinessToday());
}

export function isCurrentBusinessWeek(weekStart) {
  return weekStart === getCurrentBusinessWeekStart();
}
