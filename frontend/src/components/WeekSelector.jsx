import { addWeeks, fmtWeekLabel } from '../lib/weekUtils.js';

export default function WeekSelector({ weekStart, onChange }) {
  return (
    <div className="week-nav">
      <button type="button" className="week-nav-btn" onClick={() => onChange(addWeeks(weekStart, -1))}>‹</button>
      <span className="week-nav-label">{fmtWeekLabel(weekStart)}</span>
      <button type="button" className="week-nav-btn" onClick={() => onChange(addWeeks(weekStart, 1))}>›</button>
    </div>
  );
}
