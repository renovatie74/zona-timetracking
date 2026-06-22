import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../auth.jsx';
import { useGPS }  from '../hooks/useGPS.js';
import { useNavigate } from 'react-router-dom';

const api = path => `/api${path}`;

function pad2(n) { return String(n).padStart(2, '0'); }

function fmtDuration(minutes) {
  if (minutes == null || minutes < 0) return '0h 00m';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${pad2(m)}m`;
}

function fmtTime(isoString) {
  if (!isoString) return '—';
  const d = new Date(isoString);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function fmtDate(isoDate) {
  const d = new Date(isoDate + 'T00:00:00Z');
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
}

function useElapsed(startIso) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!startIso) return;
    const update = () => setElapsed(Math.floor((Date.now() - new Date(startIso).getTime()) / 60000));
    update();
    const id = setInterval(update, 30000);
    return () => clearInterval(id);
  }, [startIso]);
  return elapsed;
}

// ── Project picker ────────────────────────────────────────────────────────────
// Shows Recent (rank 1-2) and All Available as permanent groups.
// Typing in the search field filters both groups — it never replaces the list.
function ProjectPicker({ allProjects, onSelect, onCancel, busy }) {
  const [search, setSearch] = useState('');

  const q = search.trim().toLowerCase();

  const filter = list =>
    q ? list.filter(p => p.name.toLowerCase().includes(q) || (p.project_code ?? '').toLowerCase().includes(q)) : list;

  const recent = filter(allProjects.filter(p => p.recent_rank != null).sort((a, b) => a.recent_rank - b.recent_rank));
  const rest   = filter(allProjects.filter(p => p.recent_rank == null));

  const totalFiltered = recent.length + rest.length;

  return (
    <div className="em-overlay" onClick={onCancel}>
      <div className="em-picker" onClick={e => e.stopPropagation()}>
        <div className="em-picker-header">
          <h2 className="em-picker-title">Select Project</h2>
          <button className="em-btn-close" onClick={onCancel} aria-label="Cancel">✕</button>
        </div>

        <div className="em-search-wrap">
          <input
            className="em-search"
            type="search"
            placeholder="Search projects…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoFocus
          />
        </div>

        <div className="em-project-list">
          {totalFiltered === 0 && (
            <p className="em-no-results">No projects found</p>
          )}

          {recent.length > 0 && (
            <>
              <p className="em-section-label">Recent</p>
              {recent.map(p => (
                <ProjectRow key={p.id} project={p} onSelect={onSelect} busy={busy} />
              ))}
            </>
          )}

          {rest.length > 0 && (
            <>
              <p className="em-section-label">All Projects</p>
              {rest.map(p => (
                <ProjectRow key={p.id} project={p} onSelect={onSelect} busy={busy} />
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ProjectRow({ project: p, onSelect, busy }) {
  return (
    <button className="em-project-btn" onClick={() => onSelect(p)} disabled={busy}>
      <span className="em-project-name">{p.name}</span>
      {p.project_code && <span className="em-project-code">{p.project_code}</span>}
    </button>
  );
}

// ── Today's history strip ─────────────────────────────────────────────────────
function TodayHistory({ entries }) {
  if (!entries || entries.length === 0) return null;

  const closed  = entries.filter(e => e.stop_time);
  const total   = closed.reduce((sum, e) => sum + (e.rounded_duration_minutes ?? e.duration_minutes ?? 0), 0);

  return (
    <div className="em-history">
      <div className="em-history-header">
        <span className="em-history-title">Today</span>
        <span className="em-history-total">{fmtDuration(total)}</span>
      </div>
      <ul className="em-history-list">
        {entries.map(e => (
          <li key={e.id} className="em-history-item">
            <div className="em-history-times">
              {fmtTime(e.start_time)}{e.stop_time ? ` – ${fmtTime(e.stop_time)}` : ' – ongoing'}
            </div>
            <div className="em-history-project">{e.project_name}</div>
            {e.stop_time && (
              <div className="em-history-durations">
                <span>Actual {fmtDuration(e.duration_minutes)}</span>
                <span className="em-history-rounded">Rounded {fmtDuration(e.rounded_duration_minutes)}</span>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Idle view ─────────────────────────────────────────────────────────────────
function IdleView({ user, todayEntries, onCheckin }) {
  const closed  = (todayEntries ?? []).filter(e => e.stop_time);
  const total   = closed.reduce((sum, e) => sum + (e.rounded_duration_minutes ?? e.duration_minutes ?? 0), 0);
  const last    = closed[0];  // most recent closed entry (DESC order)

  return (
    <div className="em-screen">
      <header className="em-header">
        <div className="em-greeting">Good day, <strong>{user?.first_name}</strong></div>
        <div className="em-status-badge em-badge-idle">Not checked in</div>
      </header>

      <div className="em-date-bar">
        <span className="em-date-label">{fmtDate(todayISO())}</span>
      </div>

      {(total > 0 || last) && (
        <div className="em-today-summary">
          {total > 0 && (
            <div className="em-today-row">
              <span>Hours today</span>
              <strong>{fmtDuration(total)}</strong>
            </div>
          )}
          {last && (
            <div className="em-today-row">
              <span>Last project</span>
              <strong className="em-today-project">{last.project_code ? `${last.project_code} ` : ''}{last.project_name}</strong>
            </div>
          )}
        </div>
      )}

      <TodayHistory entries={todayEntries} />

      {(!todayEntries || todayEntries.length === 0) && (
        <div className="em-hero">
          <div className="em-clock-icon" aria-hidden="true">⏱</div>
          <p className="em-hero-text">Tap below to start your work session</p>
        </div>
      )}

      <button className="em-btn-checkin" onClick={onCheckin}>
        Check In
      </button>
    </div>
  );
}

// ── Active session view ───────────────────────────────────────────────────────
function ActiveView({ user, session, onCheckout, onSwitch }) {
  const elapsed = useElapsed(session.start_time);

  return (
    <div className="em-screen">
      <header className="em-header">
        <div className="em-greeting">Good day, <strong>{user?.first_name}</strong></div>
        <div className="em-status-badge em-badge-active">Checked in</div>
      </header>

      {session.unclosed_warning && (
        <div className="em-warning">
          Session open for more than 12 hours. Please check out.
        </div>
      )}

      <div className="em-session-card">
        <div className="em-session-project">{session.project_name}</div>
        <div className="em-session-time">
          <span className="em-time-label">Started</span>
          <span className="em-time-value">{fmtTime(session.start_time)}</span>
        </div>
        <div className="em-session-elapsed">
          <span className="em-elapsed-label">Duration</span>
          <span className="em-elapsed-value">{fmtDuration(elapsed)}</span>
        </div>
        {session.gps_status === 'captured' && (
          <div className="em-gps-chip em-gps-ok">📍 GPS captured</div>
        )}
        {session.gps_status === 'denied' && (
          <div className="em-gps-chip em-gps-deny">📍 Location denied</div>
        )}
      </div>

      <button className="em-btn-switch" onClick={onSwitch}>
        Switch Project
      </button>

      <button className="em-btn-checkout" onClick={onCheckout}>
        Check Out
      </button>
    </div>
  );
}

// ── Session summary view ──────────────────────────────────────────────────────
function SummaryView({ summary, onDone }) {
  return (
    <div className="em-screen">
      <header className="em-header">
        <div className="em-status-badge em-badge-done">Session complete</div>
      </header>

      <div className="em-summary-card">
        <div className="em-summary-title">Great work!</div>
        <div className="em-summary-row">
          <span>Project</span>
          <strong>{summary.project_name}</strong>
        </div>
        <div className="em-summary-row">
          <span>Start</span>
          <strong>{fmtTime(summary.start_time)}</strong>
        </div>
        <div className="em-summary-row">
          <span>End</span>
          <strong>{fmtTime(summary.stop_time)}</strong>
        </div>
        <div className="em-summary-row">
          <span>Duration</span>
          <strong>{fmtDuration(summary.rounded_duration_minutes ?? summary.duration_minutes)}</strong>
        </div>
      </div>

      <button className="em-btn-checkin" onClick={onDone}>
        Done
      </button>
    </div>
  );
}

// ── Discard confirmation modal ────────────────────────────────────────────────
function DiscardConfirmModal({ mode, onCancel, onDiscard, busy }) {
  const isSwitch = mode === 'switch';
  return (
    <div className="em-overlay" onClick={onCancel}>
      <div className="em-modal" onClick={e => e.stopPropagation()}>
        <p className="em-modal-text">
          {isSwitch
            ? 'This session is shorter than 10 minutes and will not be recorded. Do you want to discard it and switch project?'
            : 'This session is shorter than 10 minutes and will not be recorded. Do you want to discard it?'}
        </p>
        <div className="em-modal-actions">
          <button className="em-modal-discard" onClick={onDiscard} disabled={busy}>
            {isSwitch ? 'Discard and Switch' : 'Discard Session'}
          </button>
          <button className="em-modal-cancel" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────
export default function EmployeeDashboard() {
  const { user, logout } = useAuth();
  const gps      = useGPS();
  const navigate = useNavigate();

  const [session,      setSession]      = useState(null);
  const [allProjects,  setAllProjects]  = useState([]);
  const [todayEntries, setTodayEntries] = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [busy,         setBusy]         = useState(false);  // GPS/API in flight
  const [picking,      setPicking]      = useState(false);
  const [summary,      setSummary]      = useState(null);
  const [error,        setError]        = useState('');
  // 'checkin' | 'switch' — distinguishes what happens after project is picked
  const [pickMode,     setPickMode]     = useState('checkin');
  // null | 'checkout' | 'switch' — set when checkout returns short_session: true
  const [discardMode,  setDiscardMode]  = useState(null);

  const today = todayISO();

  const loadAll = useCallback(async () => {
    try {
      const [activeRes, projectsRes, historyRes] = await Promise.all([
        fetch(api('/time-entries/active'),              { credentials: 'include' }),
        fetch(api('/projects/mine'),                    { credentials: 'include' }),
        fetch(api(`/time-entries/mine?date_from=${today}&date_to=${today}`), { credentials: 'include' }),
      ]);
      const [activeData, projectsData, historyData] = await Promise.all([
        activeRes.json(), projectsRes.json(), historyRes.json(),
      ]);
      setSession(activeData.data ?? null);
      setAllProjects(projectsData.data ?? []);
      setTodayEntries(historyData.data ?? []);
    } catch {
      // leave previous state, don't crash
    } finally {
      setLoading(false);
    }
  }, [today]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── Check in ────────────────────────────────────────────────────────────────
  const handleProjectSelect = async (project) => {
    setPicking(false);
    setBusy(true);
    setError('');

    const gpsData = await gps.capture();

    try {
      const res  = await fetch(api('/time-entries/checkin'), {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: project.id, gps: gpsData }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Check-in failed');
      } else {
        setSession({ ...data.data, project_name: project.name });
        await loadAll();
      }
    } catch {
      setError('Network error. Please try again.');
    }
    setBusy(false);
  };

  // ── Check out ───────────────────────────────────────────────────────────────
  const handleCheckout = async ({ thenSwitch = false } = {}) => {
    setBusy(true);
    setError('');

    const gpsData = await gps.capture();

    try {
      const res  = await fetch(api('/time-entries/checkout'), {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gps: gpsData }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.short_session) {
          setDiscardMode(thenSwitch ? 'switch' : 'checkout');
        } else {
          setError(data.error ?? 'Check-out failed');
        }
        setBusy(false);
        return;
      }
      setSession(null);
      await loadAll();
      if (thenSwitch) {
        setPickMode('switch');
        setPicking(true);
      } else {
        setSummary(data.data);
      }
    } catch {
      setError('Network error. Please try again.');
    }
    setBusy(false);
  };

  const handleSwitch    = () => handleCheckout({ thenSwitch: true });
  const handleSummaryDone = () => setSummary(null);

  // ── Discard short session ────────────────────────────────────────────────────
  const handleDiscard = async () => {
    const mode = discardMode;
    setDiscardMode(null);
    setBusy(true);
    setError('');
    try {
      const res = await fetch(api('/time-entries/discard'), {
        method: 'POST', credentials: 'include',
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? 'Could not discard session');
        setBusy(false);
        return;
      }
      setSession(null);
      await loadAll();
      if (mode === 'switch') {
        setPickMode('checkin');
        setPicking(true);
      }
    } catch {
      setError('Network error. Please try again.');
    }
    setBusy(false);
  };

  const handleSignOut = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="em-root em-loading">
        <div className="em-spinner" aria-label="Loading" />
      </div>
    );
  }

  return (
    <div className="em-root">
      <div className="em-topbar">
        <button className="em-signout-btn" onClick={handleSignOut}>Sign out</button>
      </div>

      {error && (
        <div className="em-error-banner" role="alert">
          {error}
          <button className="em-error-close" onClick={() => setError('')}>✕</button>
        </div>
      )}

      {summary ? (
        <SummaryView summary={summary} onDone={handleSummaryDone} />
      ) : session ? (
        <ActiveView
          user={user}
          session={session}
          onCheckout={() => handleCheckout()}
          onSwitch={handleSwitch}
        />
      ) : (
        <IdleView
          user={user}
          todayEntries={todayEntries}
          onCheckin={() => { setPickMode('checkin'); setError(''); setPicking(true); }}
        />
      )}

      {picking && (
        <ProjectPicker
          allProjects={allProjects}
          onSelect={handleProjectSelect}
          onCancel={() => setPicking(false)}
          busy={busy}
        />
      )}

      {discardMode && (
        <DiscardConfirmModal
          mode={discardMode}
          onCancel={() => setDiscardMode(null)}
          onDiscard={handleDiscard}
          busy={busy}
        />
      )}
    </div>
  );
}
