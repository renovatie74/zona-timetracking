import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import EmployeeNav from '../components/EmployeeNav.jsx';
import { AttendanceCard } from '../components/AttendanceCard.jsx';
import { ProjectHoursSheet } from '../components/ProjectHoursSheet.jsx';
import { minsToLabel } from '../lib/timeUtils.js';
import { useTranslation } from '../i18n/index.jsx';
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

function isoWeekNumber(weekStart) {
  const monday   = new Date(weekStart + 'T00:00:00Z');
  const thursday = new Date(monday);
  thursday.setUTCDate(monday.getUTCDate() + 3);
  const year = thursday.getUTCFullYear();
  const jan4  = new Date(`${year}-01-04T00:00:00Z`);
  const w1Mon = new Date(jan4);
  const j4day = jan4.getUTCDay();
  w1Mon.setUTCDate(jan4.getUTCDate() - (j4day === 0 ? 6 : j4day - 1));
  return Math.floor((monday.getTime() - w1Mon.getTime()) / (7 * 86_400_000)) + 1;
}

function fmtWeekRange(start, end, weekPrefix, weekTo, months) {
  const s = new Date(start + 'T00:00:00Z');
  const e = new Date(end   + 'T00:00:00Z');
  const sStr = `${months[s.getUTCMonth()]} ${s.getUTCDate()}`;
  const eStr = `${months[e.getUTCMonth()]} ${e.getUTCDate()}`;
  const wk   = isoWeekNumber(start);
  return `${weekPrefix} ${wk} – ${sStr} ${weekTo} ${eStr}`;
}

function fmtDayHeading(dateStr, days, months) {
  const d = new Date(dateStr + 'T00:00:00Z');
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
  if (source === 'legacy')        return <span className="mt-source-badge mt-source-manual">Legacy</span>;
  return null;
}

// ── Legacy entry form (kept for editing existing start/stop entries only) ─────
function LegacyEntrySheet({ date, projects, initialEntry, onSave, onCancel, busy }) {
  const { t } = useTranslation();
  const days   = t('days');
  const months = t('months');

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
  const [formError, setFormError] = useState('');

  const handleSave = () => {
    if (!selectedProject) { setFormError(t('pleaseSelectProject')); return; }
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

  return createPortal(
    <div className="em-overlay" onClick={onCancel}>
      <div className="mt-form-sheet" onClick={e => e.stopPropagation()}>
        <div className="mt-form-header">
          <h2 className="mt-form-title">{t('editEntry')}</h2>
          <button className="em-btn-close" onClick={onCancel} aria-label="Cancel">✕</button>
        </div>

        <div className="mt-form-date">{fmtDayHeading(date, days, months)}</div>

        {formError && <div className="mt-form-error">{formError}</div>}

        <div className="mt-form-row">
          <div className="mt-form-field">
            <label className="mt-form-label" htmlFor="mt-start">{t('start')}</label>
            <input
              id="mt-start"
              className="mt-time-input"
              type="time"
              value={startTime}
              onChange={e => setStartTime(e.target.value)}
            />
          </div>
          <div className="mt-form-field">
            <label className="mt-form-label" htmlFor="mt-stop">{t('end')}</label>
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
          <label className="mt-form-label" htmlFor="mt-notes">{t('notes')} <span className="mt-optional">({t('optional')})</span></label>
          <input
            id="mt-notes"
            className="mt-notes-input"
            type="text"
            placeholder={t('briefDescription')}
            value={notes}
            onChange={e => setNotes(e.target.value)}
            maxLength={200}
          />
        </div>

        <button className="mt-save-btn" onClick={handleSave} disabled={busy}>
          {busy ? t('saving') : t('saveChanges')}
        </button>
      </div>
    </div>,
    document.body
  );
}

// ── Mileage bottom-sheet modal ────────────────────────────────────────────────
function MileageSheet({ weekStart, initial, onSave, onCancel, busy }) {
  const { t } = useTranslation();
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

  const months = t('months');
  const s = new Date(weekStart + 'T00:00:00Z');
  const e = new Date(weekStart + 'T00:00:00Z');
  e.setUTCDate(e.getUTCDate() + 6);
  const weekLabel = `${months[s.getUTCMonth()]} ${s.getUTCDate()} – ${months[e.getUTCMonth()]} ${e.getUTCDate()}`;

  return createPortal(
    <div className="em-overlay" onClick={onCancel}>
      <div className="mt-form-sheet" onClick={ev => ev.stopPropagation()}>
        <div className="mt-form-header">
          <h2 className="mt-form-title">{t('weeklyMileage')}</h2>
          <button className="em-btn-close" onClick={onCancel} aria-label="Cancel">✕</button>
        </div>

        <div className="mt-form-date">{weekLabel}</div>

        {err && <div className="mt-form-error">{err}</div>}

        <div className="mt-form-field">
          <label className="mt-form-label" htmlFor="mt-km">{t('distanceKm')}</label>
          <input
            id="mt-km"
            className="mt-time-input"
            type="text"
            inputMode="decimal"
            placeholder="0"
            value={km}
            onChange={ev => setKm(ev.target.value)}
          />
        </div>

        <button className="mt-save-btn" onClick={handleSave} disabled={busy}>
          {busy ? t('saving') : t('saveMileage')}
        </button>
      </div>
    </div>,
    document.body
  );
}

// ── Delete confirmation ───────────────────────────────────────────────────────
function DeleteConfirm({ message, onConfirm, onCancel, busy }) {
  const { t } = useTranslation();
  return createPortal(
    <div className="em-overlay" onClick={onCancel}>
      <div className="em-modal" onClick={e => e.stopPropagation()}>
        <p className="em-modal-text">{message}</p>
        <div className="em-modal-actions">
          <button className="em-modal-discard" onClick={onConfirm} disabled={busy}>{t('delete')}</button>
          <button className="em-modal-cancel"  onClick={onCancel}  disabled={busy}>{t('cancel')}</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── Shared styles for DaySection ─────────────────────────────────────────────
const DAY_CARD = {
  background:   'var(--color-surface, var(--color-card-bg, #fff))',
  border:       '1px solid var(--color-border)',
  borderRadius: '10px',
  padding:      '0.875rem 1rem 1rem',
  marginBottom: '0.75rem',
};

const SUB_LABEL = {
  fontSize:      '0.6875rem',
  fontWeight:    600,
  letterSpacing: '0.06em',
  color:         'var(--color-grey-500, #8a8a8a)',
  textTransform: 'uppercase',
  marginBottom:  '0.375rem',
};

const AMBER_BTN = {
  display:     'flex',
  alignItems:  'center',
  gap:         '0.25rem',
  padding:     '0.3rem 0.65rem',
  border:      '1px solid var(--color-amber, #c8a46a)',
  borderRadius:'6px',
  background:  'transparent',
  color:       'var(--color-amber-dark, #92660a)',
  fontSize:    '0.8125rem',
  fontWeight:  500,
  cursor:      'pointer',
  whiteSpace:  'nowrap',
  flexShrink:  0,
};

// ── Day section ───────────────────────────────────────────────────────────────
function DaySection({
  dateStr, entries, attendance, projectHours, isCurrentWeek,
  onAttendanceSaved, onAddHours, onEditHours, onDeleteHours,
  onEditLegacy, onDeleteLegacy,
}) {
  const { t } = useTranslation();
  const days   = t('days');
  const months = t('months');
  const isFuture    = isFutureBusinessDate(dateStr);
  const closed      = entries.filter(e => e.stop_time);
  const legacyTotal = closed.reduce((s, e) => s + (e.rounded_duration_minutes ?? e.duration_minutes ?? 0), 0);
  const phTotal     = (projectHours ?? []).reduce((s, h) => s + h.hours_minutes, 0);
  const displayTotal = phTotal || legacyTotal;
  const hasPH       = (projectHours ?? []).length > 0;

  return (
    <div className="mt-day-section" style={DAY_CARD}>

      {/* 1. Day header — date + total only, no generic "+ Add" button */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
        <span className="mt-day-name">{fmtDayHeading(dateStr, days, months)}</span>
        <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-grey-500, #8a8a8a)' }}>
          {fmtDuration(displayTotal)}
        </span>
      </div>

      {/* 2. Attendance section */}
      <div style={{ marginBottom: '0.875rem' }}>
        <div style={SUB_LABEL}>{t('attendance')}</div>
        <AttendanceCard
          compact
          attendance={attendance}
          date={dateStr}
          onSave={a => onAttendanceSaved(dateStr, a)}
          autoEdit={false}
          editable={!isFuture}
        />
      </div>

      {/* 3. Project Hours section */}
      <div>
        {hasPH ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.375rem' }}>
            <div style={SUB_LABEL}>{t('projectHours')}</div>
            {!isFuture && (
              <button style={AMBER_BTN} onClick={() => onAddHours(dateStr)}>
                {t('addProjectHours')}
              </button>
            )}
          </div>
        ) : (
          <div style={{ ...SUB_LABEL, marginBottom: '0.375rem' }}>{t('projectHours')}</div>
        )}

        {hasPH ? (
          <ul className="mt-entry-list">
            {(projectHours ?? []).map(h => (
              <li key={`ph-${h.id}`} className="mt-entry-row">
                <div className="mt-entry-main">
                  <div className="mt-entry-detail">
                    <span className="mt-entry-project">{h.project_name}</span>
                    {h.note && <span className="mt-entry-notes">{h.note}</span>}
                  </div>
                </div>
                <span style={{ fontWeight: 600, fontSize: '0.875rem', marginRight: '0.5rem' }}>
                  {minsToLabel(h.hours_minutes)}
                </span>
                {!isFuture && (
                  <div className="mt-entry-actions">
                    <button className="mt-action-btn" onClick={() => onEditHours(dateStr, h)} aria-label="Edit hours">
                      <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
                        <path d="M10.5 2L13 4.5L5 12.5H2.5V10L10.5 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                      </svg>
                    </button>
                    <button className="mt-action-btn mt-action-delete" onClick={() => onDeleteHours(h.id, dateStr)} aria-label="Delete hours">
                      <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
                        <path d="M2 4h11M5 4V2.5h5V4M6 7v5M9 7v5M3.5 4l.8 8.5h7.4L12.5 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
            <span style={{ color: 'var(--color-grey-500, #8a8a8a)', fontSize: '0.875rem' }}>
              {t('noProjectHours')}
            </span>
            {!isFuture && (
              <button style={AMBER_BTN} onClick={() => onAddHours(dateStr)}>
                {t('addProjectHours')}
              </button>
            )}
          </div>
        )}
      </div>

      {/* 4. Legacy time entries (old start/stop model) */}
      {entries.length > 0 && (
        <div style={{ marginTop: '0.75rem', borderTop: '1px dashed var(--color-border)', paddingTop: '0.5rem' }}>
          <ul className="mt-entry-list">
            {entries.map(e => (
              <li key={e.id} className="mt-entry-row">
                <div className="mt-entry-main">
                  <SourceBadge source="legacy" />
                  <div className="mt-entry-detail">
                    <span className="mt-entry-project">{e.project_name}</span>
                    <span className="mt-entry-times">
                      {formatBusinessTime(e.start_time)} – {e.stop_time ? formatBusinessTime(e.stop_time) : 'ongoing'}
                      {e.stop_time && <span className="mt-entry-dur">{fmtDuration(e.rounded_duration_minutes ?? e.duration_minutes)}</span>}
                    </span>
                    {e.notes && <span className="mt-entry-notes">{e.notes}</span>}
                  </div>
                </div>
                {isCurrentWeek && e.entry_source === 'manual_worker' && e.stop_time && !isFuture && (
                  <div className="mt-entry-actions">
                    <button className="mt-action-btn" onClick={() => onEditLegacy(e)} aria-label="Edit entry">
                      <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
                        <path d="M10.5 2L13 4.5L5 12.5H2.5V10L10.5 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                      </svg>
                    </button>
                    <button className="mt-action-btn mt-action-delete" onClick={() => onDeleteLegacy(e.id)} aria-label="Delete entry">
                      <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
                        <path d="M2 4h11M5 4V2.5h5V4M6 7v5M9 7v5M3.5 4l.8 8.5h7.4L12.5 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function MyTime() {
  const { logout } = useAuth();
  const navigate   = useNavigate();
  const { t }      = useTranslation();

  const [weekStart, setWeekStart] = useState(getCurrentBusinessWeekStart);
  const weekEnd     = weekEndFor(weekStart);
  const isCurrentWk = weekStart === getCurrentBusinessWeekStart();

  const [entries,      setEntries]      = useState([]);
  const [myDayWeek,    setMyDayWeek]    = useState(null);
  const [projects,     setProjects]     = useState([]);
  const [mileage,      setMileage]      = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [busy,         setBusy]         = useState(false);
  const [mileageBusy,  setMileageBusy]  = useState(false);
  const [error,        setError]        = useState('');
  const [mileageModal, setMileageModal] = useState(false);

  const [sheetTarget,  setSheetTarget]  = useState(null);
  const [deleteTarget,       setDeleteTarget]       = useState(null);
  const [legacyDeleteTarget, setLegacyDeleteTarget] = useState(null);
  const [legacyFormTarget, setLegacyFormTarget] = useState(null);

  const loadWeek = useCallback(async () => {
    setLoading(true);
    try {
      const [myRes, projRes, mlRes, myDayRes] = await Promise.all([
        fetch(api(`/my-time?week=${weekStart}`),              { credentials: 'include' }),
        fetch(api('/projects/mine'),                           { credentials: 'include' }),
        fetch(api(`/my-mileage?week_start=${weekStart}`),     { credentials: 'include' }),
        fetch(api(`/my-day/week?week=${weekStart}`),           { credentials: 'include' }),
      ]);
      const [myData, projData, mlData, mdData] = await Promise.all([
        myRes.json(), projRes.json(), mlRes.json(), myDayRes.json(),
      ]);
      setEntries(myData.data     ?? []);
      setProjects(projData.data  ?? []);
      const mlEntries = Array.isArray(mlData.data) ? mlData.data : [];
      setMileage(mlEntries.length > 0 ? mlEntries.reduce((s, e) => s + (e.km || 0), 0) : null);
      setMyDayWeek(mdData.data   ?? null);
    } catch {
      // leave previous state
    } finally {
      setLoading(false);
    }
  }, [weekStart]);

  useEffect(() => { loadWeek(); }, [loadWeek]);

  useEffect(() => {
    function onKey(e) {
      if (e.key !== 'Escape') return;
      if (deleteTarget)       { setDeleteTarget(null);       return; }
      if (legacyDeleteTarget) { setLegacyDeleteTarget(null); return; }
      if (sheetTarget)        { setSheetTarget(null);        return; }
      if (legacyFormTarget)   { setLegacyFormTarget(null);   return; }
      if (mileageModal)       { setMileageModal(false);      return; }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [deleteTarget, legacyDeleteTarget, sheetTarget, legacyFormTarget, mileageModal]);

  function handleAttendanceSaved(dateStr, a) {
    setMyDayWeek(prev => ({
      ...prev,
      attendance_by_date: { ...(prev?.attendance_by_date ?? {}), [dateStr]: a },
    }));
  }

  async function handleProjectHoursSave({ project_id, hours_minutes, note }) {
    setBusy(true);
    setError('');
    const date     = sheetTarget.date;
    const existing = sheetTarget.existing;
    try {
      const url     = existing ? `/api/my-day/project-hours/${existing.id}` : '/api/my-day/project-hours';
      const method  = existing ? 'PUT' : 'POST';
      const payload = existing
        ? { hours_minutes, note }
        : { work_date: date, project_id, hours_minutes, note };
      const res  = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const body = await res.json();
      if (!res.ok) { setError(body.error ?? t('couldNotSaveEntry')); return; }
      setSheetTarget(null);
      setMyDayWeek(prev => {
        const oldList = prev?.project_hours_by_date?.[date] ?? [];
        const newList = existing
          ? oldList.map(e => e.id === existing.id ? body.data : e)
          : [...oldList, body.data];
        return { ...prev, project_hours_by_date: { ...(prev?.project_hours_by_date ?? {}), [date]: newList } };
      });
    } catch {
      setError(t('networkError'));
    } finally {
      setBusy(false);
    }
  }

  async function handleProjectHoursDelete() {
    if (!deleteTarget) return;
    setBusy(true);
    setError('');
    const { id, date } = deleteTarget;
    try {
      const res = await fetch(`/api/my-day/project-hours/${id}`, { method: 'DELETE' });
      if (!res.ok) { const b = await res.json(); setError(b.error ?? t('couldNotDeleteEntry')); return; }
      setDeleteTarget(null);
      setMyDayWeek(prev => ({
        ...prev,
        project_hours_by_date: {
          ...(prev?.project_hours_by_date ?? {}),
          [date]: (prev?.project_hours_by_date?.[date] ?? []).filter(e => e.id !== id),
        },
      }));
    } catch {
      setError(t('networkError'));
    } finally {
      setBusy(false);
    }
  }

  const handleLegacySave = async ({ entryId, project_id, start_time, stop_time, notes }) => {
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
        setError(data.error ?? t('couldNotSaveEntry'));
      } else {
        setLegacyFormTarget(null);
        await loadWeek();
      }
    } catch {
      setError(t('networkErrorRetry'));
    }
    setBusy(false);
  };

  const handleLegacyDelete = async () => {
    if (!legacyDeleteTarget) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch(api(`/my-time/${legacyDeleteTarget}`), { method: 'DELETE', credentials: 'include' });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? t('couldNotDeleteEntry'));
      } else {
        setLegacyDeleteTarget(null);
        await loadWeek();
      }
    } catch {
      setError(t('networkErrorRetry'));
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
        setError(data.error ?? t('couldNotSaveMileage'));
      }
    } catch {
      setError(t('networkErrorRetry'));
    }
    setMileageBusy(false);
  };

  const handleSignOut = async () => {
    try { await logout(); } catch { /* expired or offline */ }
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

  const months     = t('months');
  const weekPrefix = t('weekPrefix');
  const weekTo     = t('weekTo');

  return (
    <div className="mt-root">
      <div className="em-topbar">
        <button className="em-signout-btn" onClick={handleSignOut}>{t('signOut')}</button>
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
            <span className="mt-week-range">{fmtWeekRange(weekStart, weekEnd, weekPrefix, weekTo, months)}</span>
            {isCurrentWk && <span className="mt-week-current-chip">{t('thisWeek')}</span>}
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
            <span>{t('weekTotal')}</span>
            <strong>{fmtDuration(weekTotal)}</strong>
          </div>
        )}

        {/* Mileage row */}
        <div className="mt-mileage-row">
          <span className="mt-mileage-label">{t('mileage')}</span>
          <div className="mt-mileage-value">
            <strong>{mileage != null ? `${mileage} km` : '—'}</strong>
          </div>
        </div>

        {/* Day list */}
        <div className="mt-day-list">
          {weekDays(weekStart).map(dateStr => (
            <DaySection
              key={dateStr}
              dateStr={dateStr}
              entries={byDate[dateStr] ?? []}
              attendance={myDayWeek?.attendance_by_date?.[dateStr] ?? null}
              projectHours={myDayWeek?.project_hours_by_date?.[dateStr] ?? []}
              isCurrentWeek={isCurrentWk}
              onAttendanceSaved={handleAttendanceSaved}
              onAddHours={d => setSheetTarget({ date: d, existing: null })}
              onEditHours={(d, h) => setSheetTarget({ date: d, existing: h })}
              onDeleteHours={(id, d) => setDeleteTarget({ id, date: d })}
              onEditLegacy={e => setLegacyFormTarget({ date: e.start_time.slice(0, 10), entry: e })}
              onDeleteLegacy={id => setLegacyDeleteTarget(id)}
            />
          ))}
          <div className="mt-list-bottom-pad" />
        </div>
      </div>

      <EmployeeNav />

      {sheetTarget && (
        <ProjectHoursSheet
          date={sheetTarget.date}
          projects={projects}
          existing={sheetTarget.existing}
          attendanceMinutes={myDayWeek?.attendance_by_date?.[sheetTarget.date]?.duration_minutes ?? 0}
          projectHours={myDayWeek?.project_hours_by_date?.[sheetTarget.date] ?? []}
          onSave={handleProjectHoursSave}
          onCancel={() => setSheetTarget(null)}
          busy={busy}
        />
      )}

      {deleteTarget && (
        <DeleteConfirm
          message={t('deleteEntryConfirm')}
          onConfirm={handleProjectHoursDelete}
          onCancel={() => setDeleteTarget(null)}
          busy={busy}
        />
      )}

      {legacyFormTarget && (
        <LegacyEntrySheet
          date={legacyFormTarget.date}
          projects={projects}
          initialEntry={legacyFormTarget.entry}
          onSave={handleLegacySave}
          onCancel={() => setLegacyFormTarget(null)}
          busy={busy}
        />
      )}

      {legacyDeleteTarget && (
        <DeleteConfirm
          message={t('deleteTimeEntryConfirm')}
          onConfirm={handleLegacyDelete}
          onCancel={() => setLegacyDeleteTarget(null)}
          busy={busy}
        />
      )}
    </div>
  );
}
