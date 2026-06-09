/**
 * Admin — the captain's helm (role: admin only; App gates the route).
 *
 * Four sections:
 *   1. Game control — phase/tick from useGame + Start/Pause/Resume/End buttons
 *      (POST /admin/game/{start|pause|resume|end}).
 *   2. Crews — create-team form (POST /admin/teams) + a live list of teams
 *      (Firestore subscription to the `teams` collection).
 *   3. Fire news — choose company(ies), impact, a magnitude slider (-0.5..0.5),
 *      headline + body (POST /admin/news).
 *   4. Audit log — GET /admin/logs rendered as a table (the logs collection is
 *      NOT client-readable, so this goes through the authority service).
 *
 * All writes go through apiPost; the audit log is fetched with apiGet.
 */

import { useEffect, useState, type FormEvent } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import type { NewsImpact, Phase, Team } from '@deca/shared';
import { NEWS_IMPACTS } from '@deca/shared';
import { db } from '../firebase';
import { useGame } from '../hooks/useGame';
import { useCompanies } from '../hooks/useCompanies';
import { apiGet, apiPost, ApiRequestError } from '../lib/api';
import { classNames, formatMoney } from '../lib/format';

const STYLE_ID = 'admin-page-styles';
const CSS = `
.admin__grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--sp-5); }
.admin__grid .admin__full { grid-column: 1 / -1; }
.admin__phase {
  display: inline-flex;
  align-items: center;
  gap: 0.5em;
  font-family: var(--font-heading);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: var(--fs-sm);
  padding: 0.35em 0.9em;
  border-radius: var(--radius-pill);
  border: 1px solid;
}
.admin__phase--live { color: var(--gain-strong); border-color: rgba(84,189,134,0.6); background: rgba(63,155,107,0.16); }
.admin__phase--paused { color: var(--gold-700); border-color: rgba(201,161,59,0.6); background: rgba(201,161,59,0.16); }
.admin__phase--ended, .admin__phase--lobby { color: var(--ink-600); border-color: rgba(138,106,31,0.4); background: rgba(138,106,31,0.12); }
.admin__control-row { display: flex; flex-wrap: wrap; gap: var(--sp-3); margin-top: var(--sp-4); }
.admin__tick-meta { display: flex; gap: var(--sp-5); flex-wrap: wrap; margin-top: var(--sp-4); }
.admin__tick-stat { display: flex; flex-direction: column; }
.admin__tick-label { font-family: var(--font-heading); text-transform: uppercase; letter-spacing: 0.1em; font-size: var(--fs-xs); color: var(--ink-600); }
.admin__tick-value { font-family: var(--font-mono); font-weight: 700; font-size: var(--fs-md); color: var(--ink-900); }

.admin__form { display: flex; flex-direction: column; gap: var(--sp-4); }
.admin__company-picker {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  max-height: 13rem;
  overflow-y: auto;
  padding: var(--sp-2);
  border-radius: var(--radius-md);
  background: rgba(255, 251, 240, 0.5);
  border: 1px solid rgba(138, 106, 31, 0.3);
}
.admin__company-opt {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  padding: 0.35rem 0.5rem;
  border-radius: var(--radius-sm);
  cursor: pointer;
  color: var(--ink-800);
  font-size: var(--fs-sm);
}
.admin__company-opt:hover { background: rgba(138, 106, 31, 0.12); }
.admin__company-opt input { accent-color: var(--gold-600); }
.admin__company-ticker { font-family: var(--font-mono); font-weight: 700; }
.admin__slider-row { display: flex; align-items: center; gap: var(--sp-3); }
.admin__slider { flex: 1; accent-color: var(--gold-500); }
.admin__slider-value {
  font-family: var(--font-mono);
  font-weight: 700;
  min-width: 4.5rem;
  text-align: right;
}
.admin__teams-list { display: flex; flex-direction: column; gap: 0.25rem; max-height: 18rem; overflow-y: auto; }
.admin__log-time { white-space: nowrap; }
.admin__refresh-row { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-3); margin-bottom: var(--sp-3); }

@media (max-width: 900px) {
  .admin__grid { grid-template-columns: minmax(0, 1fr); }
}
`;

function useInjectedStyles() {
  useEffect(() => {
    if (document.getElementById(STYLE_ID)) return;
    const el = document.createElement('style');
    el.id = STYLE_ID;
    el.textContent = CSS;
    document.head.appendChild(el);
  }, []);
}

function errMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiRequestError) return err.message;
  if (err instanceof Error) return err.message;
  return fallback;
}

/* ---------------------------------------------------------- game control */

const PHASE_CLASS: Record<Phase, string> = {
  live: 'admin__phase--live',
  paused: 'admin__phase--paused',
  ended: 'admin__phase--ended',
  lobby: 'admin__phase--lobby',
};

function GameControl() {
  const { game } = useGame();
  const phase = game?.phase ?? 'lobby';
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function act(action: 'start' | 'pause' | 'resume' | 'end') {
    setBusy(action);
    setError(null);
    setNotice(null);
    try {
      await apiPost(`/admin/game/${action}`);
      setNotice(`Game ${action} command sent.`);
    } catch (err) {
      setError(errMessage(err, `Could not ${action} the game.`));
    } finally {
      setBusy(null);
    }
  }

  const totalTicks = game
    ? Math.max(0, Math.round((game.endAt && game.startAt
        ? (game.endAt - game.startAt) / game.tickIntervalMs
        : 0)))
    : 0;

  return (
    <section className="panel">
      <h3 className="panel-title">
        <span aria-hidden="true">🧭</span>
        Game Control
      </h3>

      <div className="row wrap" style={{ gap: 'var(--sp-3)' }}>
        <span className={classNames('admin__phase', PHASE_CLASS[phase])}>
          {phase}
        </span>
      </div>

      <div className="admin__tick-meta">
        <div className="admin__tick-stat">
          <span className="admin__tick-label">Current Tick</span>
          <span className="admin__tick-value">
            {game ? game.currentTick.toLocaleString('en-US') : '—'}
            {totalTicks > 0 && (
              <span className="muted"> / {totalTicks.toLocaleString('en-US')}</span>
            )}
          </span>
        </div>
        <div className="admin__tick-stat">
          <span className="admin__tick-label">Tick Interval</span>
          <span className="admin__tick-value">
            {game ? `${Math.round(game.tickIntervalMs / 1000)}s` : '—'}
          </span>
        </div>
        <div className="admin__tick-stat">
          <span className="admin__tick-label">Starting Chest</span>
          <span className="admin__tick-value">
            {game ? formatMoney(game.startingCapital) : '—'}
          </span>
        </div>
      </div>

      <div className="admin__control-row">
        <button
          type="button"
          className="btn btn--buy"
          disabled={busy !== null || phase === 'live' || phase === 'ended'}
          onClick={() => act('start')}
        >
          {busy === 'start' ? 'Starting…' : '⚑ Start Voyage'}
        </button>
        <button
          type="button"
          className="btn"
          disabled={busy !== null || phase !== 'live'}
          onClick={() => act('pause')}
        >
          {busy === 'pause' ? 'Pausing…' : '⏸ Pause'}
        </button>
        <button
          type="button"
          className="btn"
          disabled={busy !== null || phase !== 'paused'}
          onClick={() => act('resume')}
        >
          {busy === 'resume' ? 'Resuming…' : '▶ Resume'}
        </button>
        <button
          type="button"
          className="btn btn--danger"
          disabled={busy !== null || phase === 'ended' || phase === 'lobby'}
          onClick={() => act('end')}
        >
          {busy === 'end' ? 'Ending…' : '⚓ End Voyage'}
        </button>
      </div>

      {error && (
        <p className="alert alert--error" role="alert" style={{ marginTop: 'var(--sp-3)' }}>
          {error}
        </p>
      )}
      {notice && !error && (
        <p className="alert alert--success" role="status" style={{ marginTop: 'var(--sp-3)' }}>
          {notice}
        </p>
      )}
    </section>
  );
}

/* ---------------------------------------------------------------- crews */

function CrewManager() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'teams'), orderBy('name', 'asc'));
    const unsub = onSnapshot(
      q,
      (snap) => setTeams(snap.docs.map((d) => d.data() as Team)),
      () => setTeams([]),
    );
    return unsub;
  }, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      await apiPost('/admin/teams', { name: name.trim(), password });
      setNotice(`Crew “${name.trim()}” registered.`);
      setName('');
      setPassword('');
    } catch (err) {
      setError(errMessage(err, 'Could not register the crew.'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="panel">
      <h3 className="panel-title">
        <span aria-hidden="true">🏴‍☠️</span>
        Crews ({teams.length})
      </h3>

      <form className="admin__form" onSubmit={handleCreate}>
        <div className="field">
          <label className="label" htmlFor="admin-team-name">
            Crew Name
          </label>
          <input
            id="admin-team-name"
            className="input"
            type="text"
            placeholder="The Salty Dogs"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={submitting}
            required
          />
        </div>
        <div className="field">
          <label className="label" htmlFor="admin-team-pass">
            Password
          </label>
          <input
            id="admin-team-pass"
            className="input"
            type="text"
            placeholder="At least 6 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={submitting}
            required
            minLength={6}
          />
        </div>
        <button
          type="submit"
          className="btn"
          disabled={submitting || !name.trim() || password.length < 6}
        >
          {submitting ? 'Registering…' : 'Register Crew'}
        </button>
      </form>

      {error && (
        <p className="alert alert--error" role="alert" style={{ marginTop: 'var(--sp-3)' }}>
          {error}
        </p>
      )}
      {notice && !error && (
        <p className="alert alert--success" role="status" style={{ marginTop: 'var(--sp-3)' }}>
          {notice}
        </p>
      )}

      <hr className="divider" />

      {teams.length === 0 ? (
        <p className="muted text-center">No crews registered yet.</p>
      ) : (
        <div className="table-wrap admin__teams-list">
          <table className="table">
            <thead>
              <tr>
                <th>Crew</th>
                <th className="num">Cash</th>
                <th className="num">Total Value</th>
                <th className="num">Rank</th>
              </tr>
            </thead>
            <tbody>
              {teams.map((t) => (
                <tr key={t.id}>
                  <td>{t.name}</td>
                  <td className="num">{formatMoney(t.cashBalance)}</td>
                  <td className="num">{formatMoney(t.totalValue)}</td>
                  <td className="num">{t.rank ? `#${t.rank}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------- fire news */

function NewsComposer() {
  const { companies } = useCompanies();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [impact, setImpact] = useState<NewsImpact>('discovery');
  const [magnitude, setMagnitude] = useState(0);
  const [headline, setHeadline] = useState('');
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleFire(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      await apiPost('/admin/news', {
        companyIds: Array.from(selected),
        impact,
        magnitude,
        headline: headline.trim(),
        body: body.trim(),
      });
      setNotice('Dispatch fired to the feed.');
      setHeadline('');
      setBody('');
      setMagnitude(0);
      setSelected(new Set());
    } catch (err) {
      setError(errMessage(err, 'Could not fire the dispatch.'));
    } finally {
      setSubmitting(false);
    }
  }

  const magTone = magnitude > 0 ? 'gain' : magnitude < 0 ? 'loss' : 'flat';
  const canFire =
    !submitting && selected.size > 0 && headline.trim().length > 0;

  return (
    <section className="panel admin__full">
      <h3 className="panel-title">
        <span aria-hidden="true">📜</span>
        Fire a Dispatch
      </h3>

      <form className="admin__form" onSubmit={handleFire}>
        <div className="admin__grid">
          <div className="field">
            <label className="label">Affected Houses ({selected.size} selected)</label>
            <div className="admin__company-picker">
              {companies.length === 0 && (
                <span className="muted" style={{ padding: 'var(--sp-2)' }}>
                  No companies loaded.
                </span>
              )}
              {companies.map((c) => (
                <label key={c.id} className="admin__company-opt">
                  <input
                    type="checkbox"
                    checked={selected.has(c.id)}
                    onChange={() => toggle(c.id)}
                  />
                  <span aria-hidden="true">{c.emoji}</span>
                  <span className="admin__company-ticker">{c.ticker}</span>
                  <span className="muted">{c.name}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="stack">
            <div className="field">
              <label className="label" htmlFor="admin-news-impact">
                Impact
              </label>
              <select
                id="admin-news-impact"
                className="select"
                value={impact}
                onChange={(e) => setImpact(e.target.value as NewsImpact)}
              >
                {NEWS_IMPACTS.map((i) => (
                  <option key={i} value={i}>
                    {i}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label className="label" htmlFor="admin-news-mag">
                Magnitude (price jump)
              </label>
              <div className="admin__slider-row">
                <input
                  id="admin-news-mag"
                  className="admin__slider"
                  type="range"
                  min={-0.5}
                  max={0.5}
                  step={0.01}
                  value={magnitude}
                  onChange={(e) => setMagnitude(Number(e.target.value))}
                />
                <span className={classNames('admin__slider-value', magTone)}>
                  {magnitude > 0 ? '+' : ''}
                  {(magnitude * 100).toFixed(0)}%
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="field">
          <label className="label" htmlFor="admin-news-headline">
            Headline
          </label>
          <input
            id="admin-news-headline"
            className="input"
            type="text"
            placeholder="Galleon runs aground off Tortuga"
            value={headline}
            onChange={(e) => setHeadline(e.target.value)}
            required
          />
        </div>

        <div className="field">
          <label className="label" htmlFor="admin-news-body">
            Body
          </label>
          <textarea
            id="admin-news-body"
            className="textarea"
            placeholder="The full dispatch as it will appear to crews…"
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </div>

        <button type="submit" className="btn btn--lg" disabled={!canFire}>
          {submitting ? 'Firing…' : '🔥 Fire Dispatch'}
        </button>
      </form>

      {error && (
        <p className="alert alert--error" role="alert" style={{ marginTop: 'var(--sp-3)' }}>
          {error}
        </p>
      )}
      {notice && !error && (
        <p className="alert alert--success" role="status" style={{ marginTop: 'var(--sp-3)' }}>
          {notice}
        </p>
      )}
    </section>
  );
}

/* ------------------------------------------------------------- audit log */

interface AuditLogEntry {
  id?: string;
  timestamp?: number;
  at?: number;
  action?: string;
  type?: string;
  actor?: string;
  detail?: unknown;
  message?: string;
  [key: string]: unknown;
}

function formatLogTime(entry: AuditLogEntry): string {
  const ts = entry.timestamp ?? entry.at;
  if (typeof ts !== 'number') return '—';
  return new Date(ts).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function describeDetail(entry: AuditLogEntry): string {
  if (typeof entry.message === 'string') return entry.message;
  if (entry.detail == null) return '';
  if (typeof entry.detail === 'string') return entry.detail;
  try {
    return JSON.stringify(entry.detail);
  } catch {
    return String(entry.detail);
  }
}

function AuditLog() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  async function fetchLogs() {
    setLoading(true);
    setError(null);
    try {
      const res = await apiGet<{ logs: AuditLogEntry[] }>('/admin/logs');
      setLogs(Array.isArray(res?.logs) ? res.logs : []);
      setLoaded(true);
    } catch (err) {
      setError(errMessage(err, 'Could not load the audit log.'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="panel admin__full">
      <div className="admin__refresh-row">
        <h3 className="panel-title" style={{ marginBottom: 0 }}>
          <span aria-hidden="true">🗂️</span>
          Audit Log
        </h3>
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={() => void fetchLogs()}
          disabled={loading}
        >
          {loading ? 'Loading…' : loaded ? 'Refresh' : 'Load Log'}
        </button>
      </div>

      {error && (
        <p className="alert alert--error" role="alert">
          {error}
        </p>
      )}

      {!error && loaded && logs.length === 0 && (
        <p className="muted text-center">No audit entries recorded yet.</p>
      )}

      {!error && !loaded && !loading && (
        <p className="muted text-center">
          Load the log to review every admin action and engine event.
        </p>
      )}

      {logs.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th className="admin__log-time">When</th>
                <th>Action</th>
                <th>Actor</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((entry, i) => (
                <tr key={entry.id ?? i}>
                  <td className="mono admin__log-time">{formatLogTime(entry)}</td>
                  <td>{entry.action ?? entry.type ?? '—'}</td>
                  <td className="mono">{entry.actor ?? '—'}</td>
                  <td className="muted">{describeDetail(entry)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/* ----------------------------------------------------------------- page */

export default function Admin() {
  useInjectedStyles();

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Quartermaster’s Quarters</p>
          <h1>The Helm</h1>
        </div>
        <span className="badge badge--gold">Admin</span>
      </header>

      <div className="admin__grid">
        <GameControl />
        <CrewManager />
        <NewsComposer />
        <AuditLog />
      </div>
    </div>
  );
}
