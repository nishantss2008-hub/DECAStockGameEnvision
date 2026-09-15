/**
 * Sign in (MOBILE §7.1, `/login`): full-screen hull, top-aligned so the keyboard never covers the button. Crew and
 * Host tabs; COPY §12 signIn errors in a role="alert" slot that replaces the helper; fields get aria-invalid and
 * focus returns to the first field. After a crew signs in with trading turned off, the same slot shows
 * signIn.disabled for a moment before the app opens.
 */
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Eye, EyeOff, Lock, TriangleAlert } from 'lucide-react';
import type { Team } from '@deca/shared';
import { useAuth } from '../lib/auth';
import { ApiRequestError } from '../lib/api';
import { useDocSnapshot } from '../hooks/useSnapshot';
import { Button } from '../components/ios/Button';
import { CompassRose } from '../components/ios/CompassRose';
import { SegmentedControl } from '../components/ios/SegmentedControl';
import { FullScreenLoader } from '../shell/Guards';
import { gateFor } from '../shell/gate';
import { useDocumentTitle } from '../shell/StubPage';
import { ERRORS, MOBILE, SHELL, SIGN_IN } from '../shell/copy';
import '../shell/signIn.css';

type Mode = 'crew' | 'host';
type Stage = 'idle' | 'submitting' | 'signedIn';

/** How long the "trading is turned off" note stays before the app opens. */
export const TRADING_OFF_NOTICE_MS = 3500;

function errorText(err: unknown): string {
  if (err instanceof ApiRequestError && (err.code === 'bad_login' || err.code === 'bad_request' || err.code === 'bad_name')) return SIGN_IN.error;
  return ERRORS.pageLoad.body;
}

export default function SignInPage() {
  const { user, role, teamId, loading, login, loginAdmin, logout } = useAuth();
  const location = useLocation();
  const [mode, setMode] = useState<Mode>('crew');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [reveal, setReveal] = useState(false);
  const [stage, setStage] = useState<Stage>('idle');
  const [error, setError] = useState<string | null>(null);
  const [noticeDone, setNoticeDone] = useState(false);
  const firstField = useRef<HTMLInputElement | null>(null);
  const passwordField = useRef<HTMLInputElement | null>(null);
  useDocumentTitle('Sign in');

  // Hull ground behind Safari's bars while mounted (§9.2).
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-hull', '');
    return () => root.removeAttribute('data-hull');
  }, []);

  // Signed in without a role (claims unreadable): sign out and say so.
  useEffect(() => {
    if (!loading && user && role === null) {
      void logout();
      setStage('idle');
      setError(ERRORS.pageLoad.body);
    }
  }, [loading, user, role, logout]);

  const watchTeam = stage !== 'idle' && role === 'team' && teamId ? `teams/${teamId}` : null;
  const teamDoc = useDocSnapshot<Team>(watchTeam);
  const tradingOff = Boolean(teamDoc.data?.tradingDisabled);

  useEffect(() => {
    if (!tradingOff) return undefined;
    const id = setTimeout(() => setNoticeDone(true), TRADING_OFF_NOTICE_MS);
    return () => clearTimeout(id);
  }, [tradingOff]);

  const gate = gateFor('login', { loading, signedIn: Boolean(user), role }, location);
  if (gate.kind === 'loading' && stage === 'idle') return <FullScreenLoader />;
  if (gate.kind === 'redirect') {
    const ready = stage === 'idle' || role === 'admin' || teamDoc.error !== null || (teamDoc.data !== null && (!tradingOff || noticeDone));
    if (ready) return <Navigate to={gate.to} replace />;
  }

  const busy = stage !== 'idle';
  const invalid = error !== null;
  const slotId = 'bx-signin-slot';

  const focusFirst = () => (mode === 'crew' ? firstField.current : passwordField.current)?.focus();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if ((mode === 'crew' && !name.trim()) || !password) {
      setError(SIGN_IN.error);
      focusFirst();
      return;
    }
    setError(null);
    setStage('submitting');
    try {
      if (mode === 'crew') await login(name.trim(), password);
      else await loginAdmin(password);
      setStage('signedIn');
    } catch (err) {
      setStage('idle');
      setError(errorText(err));
      focusFirst();
    }
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
  };

  return (
    <div className="hull bx-signin">
      <CompassRose size={344} className="bx-signin__rose" />
      <main className="bx-signin__main">
        <div className="bx-signin__lockup">
          <CompassRose size={56} className="bx-signin__mark" />
          <h1 className="bx-signin__wordmark font-brand" aria-label="Buccaneer Exchange">
            <span aria-hidden="true">Buccaneer</span>
            <span aria-hidden="true">Exchange</span>
          </h1>
          <div className="bx-signin__rule" aria-hidden="true" />
          <p className="bx-signin__flavor t-subhead">{MOBILE.signInFlavor}</p>
        </div>

        <div className="bx-signin__mode">
          <SegmentedControl
            options={[
              { value: 'crew', label: SHELL.crewTab },
              { value: 'host', label: SHELL.hostTab },
            ]}
            value={mode}
            onChange={switchMode}
            ariaLabel={SHELL.signInAs}
          />
        </div>

        <form className="bx-signin__form" aria-label={MOBILE.signInButton.idle} onSubmit={submit} noValidate>
          <div className="bx-signin__card" data-invalid={invalid || undefined}>
            {mode === 'crew' && (
              <label className="bx-signin__field">
                <span className="bx-signin__label t-body">{MOBILE.signInFields.crew}</span>
                <input
                  ref={firstField}
                  className="bx-signin__input t-body"
                  name="username"
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  enterKeyHint="next"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  aria-invalid={invalid || undefined}
                  aria-describedby={slotId}
                  disabled={busy}
                />
              </label>
            )}
            <div className="bx-signin__field">
              <label className="bx-signin__label t-body" htmlFor="bx-signin-password">
                {mode === 'crew' ? MOBILE.signInFields.password : SHELL.hostPassword}
              </label>
              <input
                id="bx-signin-password"
                ref={passwordField}
                className="bx-signin__input t-body"
                name="password"
                type={reveal ? 'text' : 'password'}
                autoComplete="current-password"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="go"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-invalid={invalid || undefined}
                aria-describedby={slotId}
                disabled={busy}
              />
              <button
                type="button"
                className="bx-signin__eye"
                aria-label={MOBILE.signInFields.show}
                aria-pressed={reveal}
                onClick={() => setReveal((r) => !r)}
              >
                {reveal ? <EyeOff size={20} aria-hidden="true" /> : <Eye size={20} aria-hidden="true" />}
              </button>
            </div>
          </div>

          <div id={slotId} className="bx-signin__slot">
            {error ? (
              <p className="bx-signin__msg t-subhead" role="alert">
                <TriangleAlert size={17} aria-hidden="true" />
                <span>{error}</span>
              </p>
            ) : tradingOff ? (
              <p className="bx-signin__msg t-subhead" role="alert">
                <Lock size={17} aria-hidden="true" />
                <span>{SIGN_IN.disabled}</span>
              </p>
            ) : mode === 'crew' ? (
              <p className="bx-signin__help t-footnote">{SIGN_IN.help}</p>
            ) : null}
          </div>

          <Button type="submit" variant="filled" size="large" fullWidth loading={busy} loadingLabel={MOBILE.signInButton.loading}>
            {MOBILE.signInButton.idle}
          </Button>
        </form>
      </main>
      <footer className="bx-signin__footer t-footnote">{SIGN_IN.footer}</footer>
    </div>
  );
}
