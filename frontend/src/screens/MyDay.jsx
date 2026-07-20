import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import EmployeeNav from '../components/EmployeeNav.jsx';
import { AttendanceCard } from '../components/AttendanceCard.jsx';
import { ProjectHoursSheet } from '../components/ProjectHoursSheet.jsx';
import { fmtWeekLabel, weekStartFor } from '../lib/weekUtils.js';
import { minsToLabel } from '../lib/timeUtils.js';

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00Z');
  const days   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${days[d.getUTCDay()]}, ${months[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

// ── Delete confirmation ────────────────────────────────────────────────────────
function DeleteConfirm({ onConfirm, onCancel, busy }) {
  return createPortal(
    <div className="em-overlay" onClick={onCancel}>
      <div className="em-modal" onClick={e => e.stopPropagation()}>
        <p className="em-modal-text">Delete this entry? This cannot be undone.</p>
        <div className="em-modal-actions">
          <button className="em-modal-discard" onClick={onConfirm} disabled={busy}>Delete</button>
          <button className="em-modal-cancel"  onClick={onCancel}  disabled={busy}>Cancel</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── Main screen ────────────────────────────────────────────────────────────────
export default function MyDay() {
  const [dayData,      setDayData]      = useState(null);
  const [projects,     setProjects]     = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [busy,         setBusy]         = useState(false);
  const [error,        setError]        = useState('');
  const [sheetTarget,  setSheetTarget]  = useState(null); // null | { existing? }
  const [deleteTarget, setDeleteTarget] = useState(null);

  const date = todayISO();
  const weekLabel = fmtWeekLabel(weekStartFor(date));

  const load = useCallback(async () => {
    setError('');
    try {
      const [dayRes, projRes] = await Promise.all([
        fetch(`/api/my-day?date=${date}`),
        fetch('/api/projects/mine'),
      ]);
      const [dayBody, projBody] = await Promise.all([dayRes.json(), projRes.json()]);
      if (dayRes.ok)  setDayData(dayBody.data);
      else            setError(dayBody.error ?? 'Failed to load');
      if (projRes.ok) setProjects(projBody.data ?? []);
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    function onKey(e) {
      if (e.key !== 'Escape') return;
      if (deleteTarget !== null) { setDeleteTarget(null); return; }
      if (sheetTarget !== null)  { setSheetTarget(null);  return; }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [deleteTarget, sheetTarget]);

  function handleAttendanceSaved(a) {
    setDayData(prev => ({
      ...prev,
      attendance: a,
      totals: {
        ...prev?.totals,
        attendance_minutes: a.duration_minutes,
        variance_minutes:   (prev?.totals?.allocated_project_minutes ?? 0) - a.duration_minutes,
      },
    }));
  }

  async function handleHoursSave({ project_id, hours_minutes, note }) {
    setBusy(true);
    setError('');
    try {
      const existing = sheetTarget?.existing;
      const url    = existing ? `/api/my-day/project-hours/${existing.id}` : '/api/my-day/project-hours';
      const method = existing ? 'PUT' : 'POST';
      const payload = existing
        ? { hours_minutes, note }
        : { work_date: date, project_id, hours_minutes, note };
      const res  = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const body = await res.json();
      if (!res.ok) { setError(body.error ?? 'Save failed'); setBusy(false); return; }
      setSheetTarget(null);
      setDayData(prev => {
        const oldList = prev?.project_hours ?? [];
        const newList = existing
          ? oldList.map(e => e.id === existing.id ? body.data : e)
          : [...oldList, body.data];
        const allocated = newList.reduce((s, e) => s + e.hours_minutes, 0);
        return {
          ...prev,
          project_hours: newList,
          totals: { ...prev?.totals, allocated_project_minutes: allocated, variance_minutes: allocated - (prev?.totals?.attendance_minutes ?? 0) },
        };
      });
    } catch {
      setError('Network error');
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id) {
    setBusy(true);
    try {
      const res = await fetch(`/api/my-day/project-hours/${id}`, { method: 'DELETE' });
      if (!res.ok) { const b = await res.json(); setError(b.error ?? 'Delete failed'); setBusy(false); return; }
      setDeleteTarget(null);
      setDayData(prev => {
        const newList   = (prev?.project_hours ?? []).filter(e => e.id !== id);
        const allocated = newList.reduce((s, e) => s + e.hours_minutes, 0);
        return {
          ...prev,
          project_hours: newList,
          totals: { ...prev?.totals, allocated_project_minutes: allocated, variance_minutes: allocated - (prev?.totals?.attendance_minutes ?? 0) },
        };
      });
    } catch {
      setError('Network error');
    } finally {
      setBusy(false);
    }
  }

  const entries      = dayData?.project_hours ?? [];
  const attMins      = dayData?.totals?.attendance_minutes ?? 0;
  const allocated    = dayData?.totals?.allocated_project_minutes ?? 0;
  const variance     = allocated - attMins;
  const showVariance = attMins > 0 && allocated > 0 && variance !== 0;

  if (loading) {
    return (
      <div className="mt-root em-loading">
        <div className="em-spinner" aria-label="Loading" />
      </div>
    );
  }

  return (
    <div className="mt-root">
      {error && (
        <div className="em-error-banner" role="alert">
          {error}
          <button className="em-error-close" onClick={() => setError('')}>✕</button>
        </div>
      )}

      <div className="mt-screen">
        {/* Header */}
        <div className="mt-week-nav" style={{ paddingBottom: '0.25rem' }}>
          <div className="mt-week-label" style={{ textAlign: 'left' }}>
            <span className="mt-week-range">{fmtDate(date)}</span>
            <span className="mt-week-current-chip">{weekLabel}</span>
          </div>
        </div>

        {/* Attendance card */}
        <AttendanceCard
          attendance={dayData?.attendance ?? null}
          date={date}
          onSave={handleAttendanceSaved}
        />

        {/* Project hours */}
        <div className="md-section-card">
          <div className="md-section-header">
            <span className="md-section-label">Project Hours</span>
            <button
              className="mt-add-btn"
              onClick={() => setSheetTarget({})}
              aria-label="Add project hours"
            >
              + Add
            </button>
          </div>

          {entries.length === 0 ? (
            <p className="mt-no-entries">No project hours recorded today.</p>
          ) : (
            <ul className="mt-entry-list" style={{ marginTop: '0.25rem' }}>
              {entries.map(e => (
                <li key={e.id} className="mt-entry-row">
                  <div className="mt-entry-main">
                    <div className="mt-entry-detail">
                      <span className="mt-entry-project">{e.project_name}</span>
                      {e.note && <span className="mt-entry-notes">{e.note}</span>}
                    </div>
                  </div>
                  <span style={{ fontWeight: 600, fontSize: '0.875rem', marginRight: '0.5rem' }}>
                    {minsToLabel(e.hours_minutes)}
                  </span>
                  <div className="mt-entry-actions">
                    <button className="mt-action-btn" onClick={() => setSheetTarget({ existing: e })} aria-label="Edit">
                      <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
                        <path d="M10.5 2L13 4.5L5 12.5H2.5V10L10.5 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                      </svg>
                    </button>
                    <button className="mt-action-btn mt-action-delete" onClick={() => setDeleteTarget(e.id)} aria-label="Delete">
                      <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
                        <path d="M2 4h11M5 4V2.5h5V4M6 7v5M9 7v5M3.5 4l.8 8.5h7.4L12.5 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {entries.length > 0 && (
            <div className="mt-week-total" style={{ marginTop: '0.5rem', borderTop: '1px solid var(--color-border)', paddingTop: '0.5rem' }}>
              <span>Total allocated</span>
              <strong>{minsToLabel(allocated)}</strong>
            </div>
          )}

          {showVariance && (
            <div style={{
              marginTop: '0.5rem', padding: '0.4rem 0.6rem', borderRadius: '6px',
              background: 'var(--color-warning-bg, #fff8e1)',
              color: 'var(--color-warning, #b45309)',
              fontSize: '0.8rem',
            }}>
              {variance > 0
                ? `${minsToLabel(variance)} over attendance`
                : `${minsToLabel(-variance)} under attendance`}
              {' — '}attendance and allocated hours don't have to match.
            </div>
          )}
        </div>

        <div className="mt-list-bottom-pad" />
      </div>

      <EmployeeNav />

      {sheetTarget !== null && (
        <ProjectHoursSheet
          date={date}
          projects={projects}
          existing={sheetTarget.existing ?? null}
          attendanceMinutes={attMins}
          projectHours={entries}
          onSave={handleHoursSave}
          onCancel={() => setSheetTarget(null)}
          busy={busy}
        />
      )}

      {deleteTarget !== null && (
        <DeleteConfirm
          onConfirm={() => handleDelete(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
          busy={busy}
        />
      )}
    </div>
  );
}
