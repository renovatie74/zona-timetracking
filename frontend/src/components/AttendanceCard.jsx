import { useState, useEffect } from 'react';
import { minsFromTime, stepTime, minsToLabel } from '../lib/timeUtils.js';

const START_CHIPS  = ['06:00','06:30','07:00','07:30','08:00','08:30','09:00'];
const FINISH_CHIPS = ['14:00','14:30','15:00','15:30','16:00','16:30','17:00','17:30','18:00'];

const PENCIL = (
  <svg width="14" height="14" viewBox="0 0 15 15" fill="none" aria-hidden="true">
    <path d="M10.5 2L13 4.5L5 12.5H2.5V10L10.5 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
  </svg>
);

function TimeChipPicker({ chips, value, onChange }) {
  const hasMins = minsFromTime(value) !== null;
  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.25rem' }}>
        {chips.map(t => (
          <button
            key={t}
            type="button"
            onClick={() => onChange(t)}
            style={{
              padding: '0.35rem 0.65rem',
              borderRadius: '6px',
              fontSize: '0.875rem',
              fontWeight: value === t ? 700 : 400,
              border: `2px solid ${value === t ? 'var(--color-amber, #c8a46a)' : 'var(--color-border)'}`,
              background: value === t ? 'var(--color-amber-light, #fdf3e0)' : 'transparent',
              color: value === t ? 'var(--color-amber-dark, #92660a)' : 'var(--color-text)',
              cursor: 'pointer',
              transition: 'all 0.1s',
            }}
          >
            {t}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
        <button
          type="button"
          className="btn-step"
          onClick={() => onChange(stepTime(value, -15))}
          disabled={!hasMins || minsFromTime(value) <= 0}
        >−</button>
        <span style={{ minWidth: '3.5rem', textAlign: 'center', fontWeight: 600, fontSize: '0.9375rem' }}>
          {value || '—'}
        </span>
        <button
          type="button"
          className="btn-step"
          onClick={() => onChange(stepTime(value, 15))}
          disabled={!hasMins || minsFromTime(value) >= 1425}
        >+</button>
      </div>
    </div>
  );
}

function EditForm({ start, finish, setStart, setFinish, attendance, saving, canSave, showFinishErr, err, onSave, onCancel }) {
  return (
    <>
      <div className="mt-form-field" style={{ marginBottom: '0.75rem' }}>
        <label className="mt-form-label">Start</label>
        <TimeChipPicker chips={START_CHIPS} value={start} onChange={setStart} />
      </div>
      <div className="mt-form-field" style={{ marginBottom: '0.75rem' }}>
        <label className="mt-form-label">Finish</label>
        <TimeChipPicker chips={FINISH_CHIPS} value={finish} onChange={setFinish} />
        {showFinishErr && (
          <div className="mt-form-error" style={{ marginTop: '0.35rem' }}>
            Finish must be later than Start
          </div>
        )}
      </div>
      {err && <div className="mt-form-error" style={{ marginBottom: '0.5rem' }}>{err}</div>}
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button className="mt-save-btn" style={{ flex: 1 }} disabled={saving || !canSave} onClick={onSave}>
          {saving ? 'Saving…' : 'Save Attendance'}
        </button>
        <button className="mt-week-arrow" style={{ flexShrink: 0 }} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </>
  );
}

// attendance  — attendance record from server (or null)
// date        — ISO date string for the work day
// onSave      — callback(attendanceRecord) when saved successfully
// autoEdit    — open in edit mode automatically when no attendance (default true, set false for week view)
// editable    — show edit button / allow editing (default true, set false for future dates)
// compact     — inline layout without card wrapper or section header (used in MyTime week view)
export function AttendanceCard({ attendance, date, onSave, autoEdit = true, editable = true, compact = false }) {
  const [editing, setEditing] = useState(autoEdit ? !attendance : false);
  const [start,   setStart]   = useState(attendance?.start_time  ?? '');
  const [finish,  setFinish]  = useState(attendance?.finish_time ?? '');
  const [saving,  setSaving]  = useState(false);
  const [err,     setErr]     = useState('');

  useEffect(() => {
    if (!attendance) {
      if (autoEdit) setEditing(true);
      return;
    }
    setStart(attendance.start_time);
    setFinish(attendance.finish_time);
    setEditing(false);
  }, [attendance]); // eslint-disable-line

  async function handleSave() {
    setErr('');
    setSaving(true);
    try {
      const res  = await fetch('/api/my-day/attendance', {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ work_date: date, start_time: start, finish_time: finish }),
      });
      const body = await res.json();
      if (!res.ok) { setErr(body.error ?? 'Save failed'); return; }
      onSave(body.data);
      setEditing(false);
    } catch {
      setErr('Network error');
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    setStart(attendance?.start_time ?? '');
    setFinish(attendance?.finish_time ?? '');
    setEditing(false);
    setErr('');
  }

  const startMins  = minsFromTime(start);
  const finishMins = minsFromTime(finish);
  const finishAfterStart = startMins !== null && finishMins !== null && finishMins > startMins;
  const canSave = start && finishAfterStart &&
    (start !== attendance?.start_time || finish !== attendance?.finish_time || !attendance);
  const showFinishErr = finish && startMins !== null && finishMins !== null && finishMins <= startMins;

  // ── Compact mode (MyTime week view) ─────────────────────────────────────────
  // No card wrapper, no section header; attendance and edit button shown inline.
  if (compact) {
    if (editing) {
      return (
        <EditForm
          start={start} finish={finish} setStart={setStart} setFinish={setFinish}
          attendance={attendance} saving={saving} canSave={canSave}
          showFinishErr={showFinishErr} err={err}
          onSave={handleSave} onCancel={cancel}
        />
      );
    }
    if (attendance) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: '1.75rem' }}>
          <div>
            <span className="md-time-range">{attendance.start_time} – {attendance.finish_time}</span>
            <span className="md-duration" style={{ marginLeft: '0.625rem' }}>{minsToLabel(attendance.duration_minutes)}</span>
          </div>
          {editable && (
            <button className="mt-mileage-edit-btn" onClick={() => setEditing(true)} aria-label="Edit attendance">
              {PENCIL}
            </button>
          )}
        </div>
      );
    }
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: '1.75rem' }}>
        <span style={{ color: 'var(--color-grey-500, #8a8a8a)', fontSize: '0.875rem' }}>Not set</span>
        {editable && (
          <button
            onClick={() => setEditing(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.3rem',
              padding: '0.3rem 0.65rem',
              border: '1px solid var(--color-amber, #c8a46a)',
              borderRadius: '6px',
              background: 'transparent',
              color: 'var(--color-amber-dark, #92660a)',
              fontSize: '0.8125rem', fontWeight: 500, cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {PENCIL}
            Set Attendance
          </button>
        )}
      </div>
    );
  }

  // ── Standard mode (MyDay single-day view) ────────────────────────────────────
  return (
    <div className="md-attendance-card">
      <div className="md-section-header">
        <span className="md-section-label">Attendance</span>
        {editable && !editing && (
          <button className="mt-mileage-edit-btn" onClick={() => setEditing(true)} aria-label="Edit attendance">
            {PENCIL}
          </button>
        )}
      </div>

      {editing ? (
        <EditForm
          start={start} finish={finish} setStart={setStart} setFinish={setFinish}
          attendance={attendance} saving={saving} canSave={canSave}
          showFinishErr={showFinishErr} err={err}
          onSave={handleSave} onCancel={cancel}
        />
      ) : attendance ? (
        <div className="md-attendance-summary">
          <span className="md-time-range">{attendance.start_time} – {attendance.finish_time}</span>
          <span className="md-duration">{minsToLabel(attendance.duration_minutes)}</span>
        </div>
      ) : (
        <p className="mt-no-entries" style={{ marginTop: '0.25rem' }}>Not set</p>
      )}
    </div>
  );
}
