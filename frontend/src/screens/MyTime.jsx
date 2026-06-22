import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import EmployeeNav from '../components/EmployeeNav.jsx';
import {
  getBusinessToday,
  getCurrentBusinessWeekStart,
  getBusinessWeekStart,
  isFutureBusinessDate,
  formatBusinessTime,
} from '../lib/businessTime.js';

const api = path => `/api${path}`;

function pad2(n) { return String(n).padStart(2, '0'); }

function fmtDuration(minutes) {
  if (minutes == null || minutes < 0) return '0h 00m';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${pad2(m)}m`;
}

function weekEndFor(weekStart) {
  const d = new Date(weekStart + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 6);
  return d.toISOString().slice(0, 10);
}

function addWeeks(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n * 7);
  return d.toISOString().slice(0, 10);
}

function fmtWeekRange(start, end) {
  const s = new Date(start + 'T00:00:00Z');
  const e = new Date(end   + 'T00:00:00Z');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const sStr = `${months[s.getUTCMonth()]} ${s.getUTCDate()}`;
  const eStr = `${months[e.getUTCMonth()]} ${e.getUTCDate()}`;
  return `${sStr} – ${eStr}`;
}

function fmtDayHeading(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${days[d.getUTCDay()]}, ${months[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

function weekDays(weekStart) {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });
}

function SourceBadge({ source }) {
  if (source === 'automatic')    return <span className="mt-source-badge mt-source-auto">Auto</span>;
  if (source === 'manual_worker') return <span className="mt-source-badge mt-source-manual">Manual</span>;
  if (source === 'manual_admin')  return <span className="mt-source-badge mt-source-admin">Corrected</span>;
  return null;
}

// ── Project picker ────────────────────────────────────────────────────────────
function ProjectPicker({ projects, onSelect, onCancel }) {
  const recent = projects.filter(p => p.recent_rank != null).sort((a, b) => a.recent_rank - b.recent_rank);
  const rest   = projects.filter(p => p.recent_rank == null);

  return (
    <div className="em-overlay" onClick={onCancel}>
      <div className="em-picker" onClick={e => e.stopPropagation()}>
        <div className="em-picker-header">
          <h2 className="em-picker-title">Select Project</h2>
          <button className="em-btn-close" onClick={onCancel} aria-label="Cancel">✕</button>
        </div>

        <div className="em-project-list">
          {recent.length > 0 && (
            <>
              <p className="em-section-label">Recent</p>
              {recent.map(p => (
                <button key={p.id} className="em-project-btn" onClick={() => onSelect(p)}>
                  <span className="em-project-name">{p.name}</span>
                  {p.project_code && <span className="em-project-code">{p.project_code}</span>}
                </button>
              ))}
            </>
          )}
          {rest.length > 0 && (
            <>
              <p className="em-section-label">All Projects</p>
              {rest.map(p => (
                <button key={p.id} className="em-project-btn" onClick={() => onSelect(p)}>
                  <span className="em-project-name">{p.name}</span>
                  {p.project_code && <span className="em-project-code">{p.project_code}</span>}
                </button>
              ))}
            </>
          )}
          {recent.length === 0 && rest.length === 0 && (
            <p className="em-no-results">No assigned projects found</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Entry form sheet ──────────────────────────────────────────────────────────
function EntryFormSheet({ date, projects, initialEntry, onSave, onCancel, busy }) {
  const isEdit = !!initialEntry;

  const defaultStart = initialEntry
    ? new Date(initialEntry.start_time).toTimeString().slice(0, 5)
    : '08:00';
  const defaultStop = initialEntry
    ? new Date(initialEntry.stop_time).toTimeString().slice(0, 5)
    : '09:00';

  const [selectedProject, setSelectedProject] = useState(
    initialEntry ? projects.find(p => p.id === initialEntry.project_id) ?? null : null,
  );
  const [startTime, setStartTime] = useState(defaultStart);
  const [stopTime,  setStopTime]  = useState(defaultStop);
  const [notes,     setNotes]     = useState(initialEntry?.notes ?? '');
  const [picking,   setPicking]   = useState(false);
  const [formError, setFormError] = useState('');

  const handleSave = () => {
    if (!selectedProject) { setFormError('Please select a project.'); return; }
    if (!startTime || !stopTime) { setFormError('Start and end times are required.'); return; }
    const startISO = new Date(`${date}T${startTime}`).toISOString();
    const stopISO  = new Date(`${date}T${stopTime}`).toISOString();
    if (stopISO <= startISO) { setFormError('End time must be after start time.'); return; }
    setFormError('');
    onSave({
      entryId:    initialEntry?.id,
      project_id: selectedProject.id,
      start_time: startISO,
      stop_time:  stopISO,
      notes:      notes || null,
    });
  };

  return (
    <>
      <div className="em-overlay" onClick={onCancel}>
        <div className="mt-form-sheet" onClick={e => e.stopPropagation()}>
          <div className="mt-form-header">
            <h2 className="mt-form-title">{isEdit ? 'Edit Entry' : 'Add Entry'}</h2>
            <button className="em-btn-close" onClick={onCancel} aria-label="Cancel">✕</button>
          </div>

          <div className="mt-form-date">{fmtDayHeading(date)}</div>

          {formError && <div className="mt-form-error">{formError}</div>}

          <div className="mt-form-field">
            <label className="mt-form-label">Project</label>
            <button className="mt-project-select-btn" onClick={() => setPicking(true)}>
              {selectedProject
                ? <><span className="em-project-name">{selectedProject.name}</span>{selectedProject.project_code && <span className="em-project-code">{selectedProject.project_code}</span>}</>
                : <span className="mt-project-placeholder">Tap to select…</span>}
            </button>
          </div>

          <div className="mt-form-row">
            <div className="mt-form-field">
              <label className="mt-form-label" htmlFor="mt-start">Start</label>
              <input
                id="mt-start"
                className="mt-time-input"
                type="time"
                value={startTime}
                onChange={e => setStartTime(e.target.value)}
              />
            </div>
            <div className="mt-form-field">
              <label className="mt-form-label" htmlFor="mt-stop">End</label>
              <input
                id="mt-stop"
                className="mt-time-input"
                type="time"
                value={stopTime}
                onChange={e => setStopTime(e.target.value)}
              />
            </div>
          </div>

          <div className="mt-form-field">
            <label className="mt-form-label" htmlFor="mt-notes">Notes <span className="mt-optional">(optional)</span></label>
            <input
              id="mt-notes"
              className="mt-notes-input"
              type="text"
              placeholder="Brief description…"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              maxLength={200}
            />
          </div>

          <button className="mt-save-btn" onClick={handleSave} disabled={busy}>
            {busy ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Entry'}
          </button>
        </div>
      </div>

      {picking && (
        <ProjectPicker
          projects={projects}
          onSelect={p => { setSelectedProject(p); setPicking(false); }}
          onCancel={() => setPicking(false)}
        />
      )}
    </>
  );
}

// ── Mileage bottom-sheet modal ────────────────────────────────────────────────
function MileageSheet({ weekStart, initial, onSave, onCancel, busy }) {
  const [km,  setKm]  = useState(initial != null ? String(initial) : '');
  const [err, setErr] = useState('');

  const handleSave = () => {
    const v = Number(km);
    if (km === '' || !isFinite(v) || v < 0) {
      setErr('Enter a valid distance (0 km or more).');
      return;
    }
    setErr('');
    onSave(v);
  };

  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const s = new Date(weekStart + 'T00:00:00Z');
  const e = new Date(weekStart + 'T00:00:00Z');
  e.setUTCDate(e.getUTCDate() + 6);
  const weekLabel = `${months[s.getUTCMonth()]} ${s.getUTCDate()} – ${months[e.getUTCMonth()]} ${e.getUTCDate()}`;

  return (
    <div className="em-overlay" onClick={onCancel}>
      <div className="mt-form-sheet" onClick={ev => ev.stopPropagation()}>
        <div className="mt-form-header">
          <h2 className="mt-form-title">Weekly Mileage</h2>
          <button className="em-btn-close" onClick={onCancel} aria-label="Cancel">✕</button>
        </div>

        <div className="mt-form-date">{weekLabel}</div>

        {err && <div className="mt-form-error">{err}</div>}

        <div className="mt-form-field">
          <label className="mt-form-label" htmlFor="mt-km">Distance (km)</label>
          <input
            id="mt-km"
            className="mt-time-input"
            type="number"
            min="0"
            step="0.1"
            placeholder="0"
            value={km}
            onChange={ev => setKm(ev.target.value)}
            autoFocus
          />
        </div>

        <button className="mt-save-btn" onClick={handleSave} disabled={busy}>
          {busy ? 'Saving…' : 'Save Mileage'}
        </button>
      </div>
    </div>
  );
}

// ── Delete confirmation ───────────────────────────────────────────────────────
function DeleteConfirm({ onConfirm, onCancel, busy }) {
  return (
    <div className="em-overlay" onClick={onCancel}>
      <div className="em-modal" onClick={e => e.stopPropagation()}>
        <p className="em-modal-text">Delete this time entry? This cannot be undone.</p>
        <div className="em-modal-actions">
          <button className="em-modal-discard" onClick={onConfirm} disabled={busy}>Delete</button>
          <button className="em-modal-cancel"  onClick={onCancel}  disabled={busy}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── Day section ───────────────────────────────────────────────────────────────
function DaySection({ dateStr, entries, isCurrentWeek, onAdd, onEdit, onDelete }) {
  const closed = entries.filter(e => e.stop_time);
  const total  = closed.reduce((s, e) => s + (e.rounded_duration_minutes ?? e.duration_minutes ?? 0), 0);

  return (
    <div className="mt-day-section">
      <div className="mt-day-header">
        <div className="mt-day-info">
          <span className="mt-day-name">{fmtDayHeading(dateStr)}</span>
          {total > 0 && <span className="mt-day-total">{fmtDuration(total)}</span>}
        </div>
        {isCurrentWeek && !isFutureBusinessDate(dateStr) && (
          <button className="mt-add-btn" onClick={() => onAdd(dateStr)} aria-label={`Add entry for ${dateStr}`}>
            + Add
          </button>
        )}
      </div>

      {entries.length === 0 ? (
        <div className="mt-no-entries">No entries</div>
      ) : (
        <ul className="mt-entry-list">
          {entries.map(e => (
            <li key={e.id} className="mt-entry-row">
              <div className="mt-entry-main">
                <SourceBadge source={e.entry_source} />
                <div className="mt-entry-detail">
                  <span className="mt-entry-project">{e.project_name}</span>
                  <span className="mt-entry-times">
                    {formatBusinessTime(e.start_time)} – {e.stop_time ? formatBusinessTime(e.stop_time) : 'ongoing'}
                    {e.stop_time && <span className="mt-entry-dur">{fmtDuration(e.rounded_duration_minutes ?? e.duration_minutes)}</span>}
                  </span>
                  {e.notes && <span className="mt-entry-notes">{e.notes}</span>}
                </div>
              </div>
              {isCurrentWeek && e.entry_source === 'manual_worker' && e.stop_time && !isFutureBusinessDate(e.start_time.slice(0, 10)) && (
                <div className="mt-entry-actions">
                  <button className="mt-action-btn" onClick={() => onEdit(e)} aria-label="Edit entry">
                    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
                      <path d="M10.5 2L13 4.5L5 12.5H2.5V10L10.5 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                    </svg>
                  </button>
                  <button className="mt-action-btn mt-action-delete" onClick={() => onDelete(e.id)} aria-label="Delete entry">
                    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
                      <path d="M2 4h11M5 4V2.5h5V4M6 7v5M9 7v5M3.5 4l.8 8.5h7.4L12.5 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function MyTime() {
  const { logout } = useAuth();
  const navigate   = useNavigate();

  const [weekStart, setWeekStart] = useState(getCurrentBusinessWeekStart);
  const weekEnd     = weekEndFor(weekStart);
  const isCurrentWk = weekStart === getCurrentBusinessWeekStart();

  const [entries,      setEntries]      = useState([]);
  const [projects,     setProjects]     = useState([]);
  const [mileage,      setMileage]      = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [busy,         setBusy]         = useState(false);
  const [mileageBusy,  setMileageBusy]  = useState(false);
  const [error,        setError]        = useState('');
  const [mileageModal, setMileageModal] = useState(false);

  const [formTarget,   setFormTarget]   = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const loadWeek = useCallback(async () => {
    setLoading(true);
    try {
      const [myRes, projRes, mlRes] = await Promise.all([
        fetch(api(`/my-time?week=${weekStart}`),              { credentials: 'include' }),
        fetch(api('/projects/mine'),                           { credentials: 'include' }),
        fetch(api(`/my-mileage?week_start=${weekStart}`),     { credentials: 'include' }),
      ]);
      const [myData, projData, mlData] = await Promise.all([
        myRes.json(), projRes.json(), mlRes.json(),
      ]);
      setEntries(myData.data   ?? []);
      setProjects(projData.data ?? []);
      setMileage(mlData.data   ?? null);
    } catch {
      // leave previous state
    } finally {
      setLoading(false);
    }
  }, [weekStart]);

  useEffect(() => { loadWeek(); }, [loadWeek]);

  const handleSave = async ({ entryId, project_id, start_time, stop_time, notes }) => {
    setBusy(true);
    setError('');
    try {
      const url    = entryId ? api(`/my-time/${entryId}`) : api('/my-time');
      const method = entryId ? 'PUT' : 'POST';
      const res    = await fetch(url, {
        method,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id, start_time, stop_time, notes }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Could not save entry');
      } else {
        setFormTarget(null);
        await loadWeek();
      }
    } catch {
      setError('Network error. Please try again.');
    }
    setBusy(false);
  };

  const handleDelete = async (id) => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(api(`/my-time/${id}`), { method: 'DELETE', credentials: 'include' });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? 'Could not delete entry');
      } else {
        setDeleteTarget(null);
        await loadWeek();
      }
    } catch {
      setError('Network error. Please try again.');
    }
    setBusy(false);
  };

  const handleSaveMileage = async (km) => {
    setMileageBusy(true);
    setError('');
    try {
      const res = await fetch(api('/my-mileage'), {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ week_start: weekStart, mileage_km: km }),
      });
      const data = await res.json();
      if (res.ok) {
        setMileage(data.data);
        setMileageModal(false);
      } else {
        setError(data.error ?? 'Could not save mileage');
      }
    } catch {
      setError('Network error. Please try again.');
    }
    setMileageBusy(false);
  };

  const handleSignOut = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const weekTotal = entries
    .filter(e => e.stop_time)
    .reduce((s, e) => s + (e.rounded_duration_minutes ?? e.duration_minutes ?? 0), 0);

  const byDate = {};
  for (const e of entries) {
    const key = e.start_time.slice(0, 10);
    (byDate[key] ??= []).push(e);
  }

  if (loading) {
    return (
      <div className="mt-root em-loading">
        <div className="em-spinner" aria-label="Loading" />
      </div>
    );
  }

  return (
    <div className="mt-root">
      <div className="em-topbar">
        <button className="em-signout-btn" onClick={handleSignOut}>Sign out</button>
      </div>

      {error && (
        <div className="em-error-banner" role="alert">
          {error}
          <button className="em-error-close" onClick={() => setError('')}>✕</button>
        </div>
      )}

      <div className="mt-screen">
        {/* Week navigation */}
        <div className="mt-week-nav">
          <button
            className="mt-week-arrow"
            onClick={() => setWeekStart(ws => addWeeks(ws, -1))}
            aria-label="Previous week"
          >
            ‹
          </button>
          <div className="mt-week-label">
            <span className="mt-week-range">{fmtWeekRange(weekStart, weekEnd)}</span>
            {isCurrentWk && <span className="mt-week-current-chip">This week</span>}
          </div>
          <button
            className="mt-week-arrow"
            onClick={() => setWeekStart(ws => addWeeks(ws, 1))}
            disabled={isCurrentWk}
            aria-label="Next week"
          >
            ›
          </button>
        </div>

        {weekTotal > 0 && (
          <div className="mt-week-total">
            <span>Week total</span>
            <strong>{fmtDuration(weekTotal)}</strong>
          </div>
        )}

        {/* Mileage row */}
        <div className="mt-mileage-row">
          <span className="mt-mileage-label">Mileage</span>
          <div className="mt-mileage-value">
            <strong>{mileage != null ? `${mileage.mileage_km} km` : '—'}</strong>
            {isCurrentWk && (
              <button
                className="mt-mileage-edit-btn"
                onClick={() => setMileageModal(true)}
                aria-label="Edit mileage"
              >
                <svg width="14" height="14" viewBox="0 0 15 15" fill="none" aria-hidden="true">
                  <path d="M10.5 2L13 4.5L5 12.5H2.5V10L10.5 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Day list — scrollable */}
        <div className="mt-day-list">
          {weekDays(weekStart).map(dateStr => (
            <DaySection
              key={dateStr}
              dateStr={dateStr}
              entries={byDate[dateStr] ?? []}
              isCurrentWeek={isCurrentWk}
              onAdd={d => setFormTarget({ date: d, entry: null })}
              onEdit={e => setFormTarget({ date: e.start_time.slice(0, 10), entry: e })}
              onDelete={id => setDeleteTarget(id)}
            />
          ))}
          <div className="mt-list-bottom-pad" />
        </div>
      </div>

      <EmployeeNav />

      {mileageModal && (
        <MileageSheet
          weekStart={weekStart}
          initial={mileage?.mileage_km}
          onSave={handleSaveMileage}
          onCancel={() => setMileageModal(false)}
          busy={mileageBusy}
        />
      )}

      {formTarget && (
        <EntryFormSheet
          date={formTarget.date}
          projects={projects}
          initialEntry={formTarget.entry}
          onSave={handleSave}
          onCancel={() => setFormTarget(null)}
          busy={busy}
        />
      )}

      {deleteTarget != null && (
        <DeleteConfirm
          onConfirm={() => handleDelete(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
          busy={busy}
        />
      )}
    </div>
  );
}
