/**
 * Sign in (MOBILE §7.1, `/login`): full-screen hull, top-aligned so the keyboard never covers the button. Crew and
 * Host tabs; COPY §12 signIn errors in a role="alert" slot that replaces the helper; fields get aria-invalid and
 * focus returns to the first field. After a crew signs in with trading turned off, the same slot shows
 * signIn.disabled for a moment before the app opens.
 *
 * Join (the default tab) is the Kahoot-style path: the host's game code + a crew name. A new crew name creates the
 * crew and shows its 4-digit PIN once, for teammates; an existing crew name asks for that PIN. `?code=` prefills it.
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

type Mode = 'join' | 'crew' | 'host';

/** Server error codes whose message is already written for a student (routes/auth.ts /auth/join). */
const JOIN_ERRORS = new Set(['bad_code', 'needs_pin', 'bad_pin', 'pin_locked', 'game_over', 'bad_name', 'rate_limited']);
type Stage = 'idle' | 'submitting' | 'signedIn';

/** How long the "trading is turned off" note stays before the app opens. */
export const TRADING_OFF_NOTICE_MS = 3500;

function errorText(err: unknown, mode: Mode): string {
  if (mode === 'join' && err instanceof ApiRequestError && JOIN_ERRORS.has(err.code)) return err.message;
  if (mode === 'join' && err instanceof ApiRequestError && err.code === 'bad_request') return 'Enter the game code and a crew name.';
  if (err instanceof ApiRequestError && (err.code === 'bad_login' || err.code === 'bad_request' || err.code === 'bad_name')) return SIGN_IN.error;
  return ERRORS.pageLoad.body;
}

export default function SignInPage() {
  const { user, role, teamId, loading, login, loginAdmin, join, logout } = useAuth();
  const location = useLocation();
  const [mode, setMode] = useState<Mode>('join');
  const [code, setCode] = useState(() => new URLSearchParams(location.search).get('code')?.toUpperCase() ?? '');
  const [pin, setPin] = useState('');
  const [needsPin, setNeedsPin] = useState(false);
  /** The PIN this device's join just created; the app opens only after the student has seen it. */
  const [issuedPin, setIssuedPin] = useState<string | null>(null);
  const [pinSeen, setPinSeen] = useState(false);
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
    const holdForPin = issuedPin !== null && !pinSeen;
    const ready = !holdForPin && (stage === 'idle' || role === 'admin' || teamDoc.error !== null || (teamDoc.data !== null && (!tradingOff || noticeDone)));
    if (ready) return <Navigate to={gate.to} replace />;
  }

  const busy = stage !== 'idle';
  const invalid = error !== null;
  const slotId = 'bx-signin-slot';

  const focusFirst = () => (mode === 'host' ? passwordField.current : firstField.current)?.focus();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (mode === 'join') {
      if (!code.trim() || !name.trim() || (needsPin && !pin.trim())) {
        setError(needsPin && !pin.trim() ? 'Enter your crew’s 4-digit PIN.' : 'Enter the game code and a crew name.');
        focusFirst();
        return;
      }
      setError(null);
      setStage('submitting');
      try {
        const result = await join(code.trim(), name.trim(), needsPin ? pin.trim() : undefined);
        if (result.pin) setIssuedPin(result.pin);
        setStage('signedIn');
      } catch (err) {
        setStage('idle');
        if (err instanceof ApiRequestError && err.code === 'needs_pin') setNeedsPin(true);
        setError(errorText(err, mode));
        focusFirst();
      }
      return;
    }
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
      setError(errorText(err, mode));
      focusFirst();
    }
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
  };

  if (issuedPin && !pinSeen && user) {
    return (
      <div className="hull bx-signin">
        <CompassRose size={344} className="bx-signin__rose" />
        <main className="bx-signin__main">
          <div className="bx-signin__lockup">
            <CompassRose size={56} className="bx-signin__mark" />
            <h1 className="bx-signin__wordmark font-brand">You’re in!</h1>
            <div className="bx-signin__rule" aria-hidden="true" />
            <p className="bx-signin__flavor t-subhead">Your crew PIN</p>
          </div>
          <div className="bx-signin__card bx-signin__pin" role="status" aria-label={`Crew PIN ${issuedPin.split('').join(' ')}`}>
            <p className="bx-signin__pin-digits">{issuedPin}</p>
            <p className="bx-signin__help t-footnote">
              Teammates join on their own phones with the game code, your crew name and this PIN. Write it down — it is shown
              only once. (Your host can reset it if you lose it.)
            </p>
          </div>
          <Button type="button" variant="filled" size="large" fullWidth onClick={() => setPinSeen(true)}>
            Start trading
          </Button>
        </main>
      </div>
    );
  }

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
              { value: 'join', label: 'Join game' },
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
            {mode === 'join' && (
              <label className="bx-signin__field">
                <span className="bx-signin__label t-body">Game code</span>
                <input
                  ref={firstField}
                  className="bx-signin__input bx-signin__input--code t-body"
                  name="gamecode"
                  autoComplete="off"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  enterKeyHint="next"
                  maxLength={12}
                  placeholder="ABC123"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  aria-invalid={invalid || undefined}
                  aria-describedby={slotId}
                  disabled={busy}
                />
              </label>
            )}
            {mode !== 'host' && (
              <label className="bx-signin__field">
                <span className="bx-signin__label t-body">{MOBILE.signInFields.crew}</span>
                <input
                  ref={mode === 'crew' ? firstField : undefined}
                  className="bx-signin__input t-body"
                  name="username"
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  enterKeyHint="next"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (needsPin) {
                      setNeedsPin(false);
                      setPin('');
                    }
                  }}
                  aria-invalid={invalid || undefined}
                  aria-describedby={slotId}
                  disabled={busy}
                />
              </label>
            )}
            {mode === 'join' && needsPin && (
              <label className="bx-signin__field">
                <span className="bx-signin__label t-body">Crew PIN</span>
                <input
                  className="bx-signin__input t-body"
                  name="crewpin"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={8}
                  enterKeyHint="go"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                  aria-invalid={invalid || undefined}
                  aria-describedby={slotId}
                  disabled={busy}
                  autoFocus
                />
              </label>
            )}
            {mode !== 'join' && (
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
            )}
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
            ) : mode === 'join' ? (
              <p className="bx-signin__help t-footnote">
                Type the game code your host shows, then pick a crew name. Joining a crew that already exists? You’ll need its PIN.
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
