/**
 * Login — the gateway to the Buccaneer Exchange.
 *
 * A pirate-themed hero with the game title and a credential card that toggles
 * between two modes:
 *   - Crew (team): TEAM NAME + password  -> useAuth().login   -> redirect to /
 *   - Captain (admin): password           -> useAuth().loginAdmin -> redirect to /admin
 *
 * On success we navigate to the role's home (the auth gate in App will keep
 * everyone honest); on failure we surface a friendly, themed error. The page
 * injects its own styles once so it stands alone visually.
 */

import { useEffect, useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { classNames } from '../lib/format';

const STYLE_ID = 'login-page-styles';
const CSS = `
.login {
  flex: 1;
  min-height: 100vh;
  display: grid;
  grid-template-columns: 1.1fr 0.9fr;
  align-items: stretch;
}
.login__hero {
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: var(--sp-5);
  padding: var(--sp-10) var(--sp-8);
  background:
    radial-gradient(900px 600px at 18% 12%, rgba(201, 161, 59, 0.18), transparent 60%),
    radial-gradient(700px 600px at 92% 96%, rgba(47, 125, 122, 0.18), transparent 55%),
    linear-gradient(160deg, var(--navy-900), var(--navy-800) 60%, var(--navy-900));
  border-right: 1px solid rgba(201, 161, 59, 0.3);
}
.login__hero::after {
  content: '🧭';
  position: absolute;
  right: -3rem;
  bottom: -3rem;
  font-size: 22rem;
  opacity: 0.06;
  pointer-events: none;
  transform: rotate(-12deg);
}
.login__hero-inner { position: relative; max-width: 30rem; }
.login__title {
  font-family: var(--font-display);
  font-size: clamp(3rem, 7vw, var(--fs-display));
  line-height: 1;
  color: var(--gold-300);
  text-shadow: 0 2px 0 rgba(0, 0, 0, 0.45), 0 0 32px rgba(201, 161, 59, 0.3);
  margin-bottom: var(--sp-4);
}
.login__tagline {
  font-size: var(--fs-md);
  color: var(--mist-200);
  line-height: var(--lh-normal);
  max-width: 26rem;
}
.login__manifest {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  margin-top: var(--sp-5);
}
.login__manifest-item {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  color: var(--mist-300);
  font-size: var(--fs-sm);
}
.login__manifest-item span:first-child { font-size: 1.2rem; }

.login__panel-wrap {
  display: grid;
  place-items: center;
  padding: var(--sp-8) var(--sp-6);
}
.login__card { width: 100%; max-width: 25rem; }
.login__tabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.25rem;
  padding: 0.25rem;
  margin-bottom: var(--sp-5);
  border-radius: var(--radius-md);
  background: rgba(138, 106, 31, 0.14);
  border: 1px solid rgba(138, 106, 31, 0.3);
}
.login__tab {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.45em;
  border: none;
  background: transparent;
  cursor: pointer;
  font-family: var(--font-heading);
  font-weight: 600;
  font-size: var(--fs-sm);
  letter-spacing: 0.04em;
  color: var(--ink-700);
  padding: 0.6em 0.5em;
  border-radius: var(--radius-sm);
  transition: background-color var(--dur) var(--ease), color var(--dur) var(--ease);
}
.login__tab.is-active {
  color: var(--navy-900);
  background: linear-gradient(180deg, var(--gold-400), var(--gold-500));
  box-shadow: var(--shadow-sm);
}
.login__form { display: flex; flex-direction: column; gap: var(--sp-4); }
.login__hint { font-size: var(--fs-xs); color: var(--ink-600); }
.login__flag {
  font-family: var(--font-display);
  color: var(--gold-300);
  font-size: var(--fs-lg);
  text-align: center;
  margin-bottom: var(--sp-2);
}

@media (max-width: 880px) {
  .login { grid-template-columns: 1fr; }
  .login__hero {
    border-right: none;
    border-bottom: 1px solid rgba(201, 161, 59, 0.3);
    padding: var(--sp-8) var(--sp-5);
    text-align: center;
    align-items: center;
  }
  .login__hero-inner { margin: 0 auto; }
  .login__manifest-item { justify-content: center; }
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

type Mode = 'team' | 'admin';

/** Map a raw auth/login error to a friendly, themed message. */
function friendlyError(err: unknown, mode: Mode): string {
  const code =
    typeof err === 'object' && err && 'code' in err
      ? String((err as { code: unknown }).code)
      : '';
  if (
    code.includes('wrong-password') ||
    code.includes('user-not-found') ||
    code.includes('invalid-credential') ||
    code.includes('invalid-login')
  ) {
    return mode === 'admin'
      ? 'That captain’s key does not fit the lock.'
      : 'No crew by that name with those colors. Check the name and password.';
  }
  if (code.includes('too-many-requests')) {
    return 'Too many attempts. Drop anchor a moment and try again.';
  }
  if (code.includes('invalid-email')) {
    return 'That crew name cannot be mapped to a valid credential.';
  }
  return 'Could not board. Try again, matey.';
}

export default function Login() {
  useInjectedStyles();
  const navigate = useNavigate();
  const location = useLocation();
  const { login, loginAdmin } = useAuth();

  const [mode, setMode] = useState<Mode>('team');
  const [teamName, setTeamName] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Where to send a team after login: respect a captured "from" if present.
  const from =
    (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ?? '/';

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      if (mode === 'team') {
        await login(teamName.trim(), password);
        navigate(from === '/login' ? '/' : from, { replace: true });
      } else {
        await loginAdmin(password);
        navigate('/admin', { replace: true });
      }
    } catch (err) {
      setError(friendlyError(err, mode));
      setSubmitting(false);
    }
  }

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
  }

  return (
    <div className="login">
      <section className="login__hero">
        <div className="login__hero-inner">
          <p className="eyebrow">Letters of Marque · Est. 1718</p>
          <h1 className="login__title">Buccaneer Exchange</h1>
          <p className="login__tagline">
            Chart the markets of the high seas. Research the great trading houses,
            read the dispatches, and grow your chest of doubloons before the
            voyage ends — but beware: no captain knows which way the tide will
            turn.
          </p>
          <div className="login__manifest">
            <div className="login__manifest-item">
              <span aria-hidden="true">🪙</span>
              <span>Start with a chest of 1,000,000 Doubloons (Ð)</span>
            </div>
            <div className="login__manifest-item">
              <span aria-hidden="true">🔍</span>
              <span>Full company research — fundamentals, financials & more</span>
            </div>
            <div className="login__manifest-item">
              <span aria-hidden="true">🏴‍☠️</span>
              <span>Outrank the fleet on a live leaderboard</span>
            </div>
          </div>
        </div>
      </section>

      <div className="login__panel-wrap">
        <div className="panel login__card">
          <p className="login__flag" aria-hidden="true">
            ⚓ ⚜ ⚓
          </p>

          <div className="login__tabs" role="tablist" aria-label="Sign in as">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'team'}
              className={classNames('login__tab', mode === 'team' && 'is-active')}
              onClick={() => switchMode('team')}
            >
              <span aria-hidden="true">🏴‍☠️</span>
              Crew
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'admin'}
              className={classNames('login__tab', mode === 'admin' && 'is-active')}
              onClick={() => switchMode('admin')}
            >
              <span aria-hidden="true">⚓</span>
              Captain
            </button>
          </div>

          <form className="login__form" onSubmit={handleSubmit}>
            {mode === 'team' && (
              <div className="field">
                <label className="label" htmlFor="login-team">
                  Crew Name
                </label>
                <input
                  id="login-team"
                  className="input"
                  type="text"
                  autoComplete="username"
                  placeholder="The Salty Dogs"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  disabled={submitting}
                  required
                />
              </div>
            )}

            <div className="field">
              <label className="label" htmlFor="login-password">
                {mode === 'team' ? 'Password' : 'Captain’s Key'}
              </label>
              <input
                id="login-password"
                className="input"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={submitting}
                required
              />
            </div>

            {error && (
              <p className="alert alert--error" role="alert">
                {error}
              </p>
            )}

            <button
              type="submit"
              className="btn btn--block btn--lg"
              disabled={submitting || (mode === 'team' && !teamName.trim()) || !password}
            >
              {submitting
                ? 'Boarding…'
                : mode === 'team'
                ? 'Board the Ship'
                : 'Take the Helm'}
            </button>

            <p className="login__hint muted">
              {mode === 'team'
                ? 'Enter the crew name your quartermaster registered, exactly as given.'
                : 'For the game host only. Use the captain’s key issued to you.'}
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
