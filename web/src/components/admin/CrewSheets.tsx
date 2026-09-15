/**
 * Crew forms (MOBILE §7.18 Crews): Add crew (large sheet: Crew name, Password with Show toggle, initials preview,
 * starting cash read-only from settings) and Reset password (new password field). Errors use COPY §11.1 inline.
 */
import { useEffect, useId, useState } from 'react';
import type { GameState, Team } from '@deca/shared';
import { Sheet } from '../ios/Sheet';
import { Button } from '../ios/Button';
import { Crest } from '../ios/Crest';
import { apiPost } from '../../lib/api';
import { formatMoney } from '../../lib/format';
import { fill } from '../../shell/copy';
import { crewFormProblem } from './adminFormat';
import { crewInitials } from './hostLogic';
import { HOST_ERRORS, HOST_PHONE } from './hostCopy';
import { useHostAction } from './useHostData';

const C = HOST_PHONE.crews;

function PasswordField({ id, label, value, onChange, hintId }: { id: string; label: string; value: string; onChange: (v: string) => void; hintId: string }) {
  const [show, setShow] = useState(false);
  return (
    <>
      <label className="bx-host-field" htmlFor={id}>
        <span className="t-footnote">{label}</span>
        <input id={id} type={show ? 'text' : 'password'} autoComplete="new-password" value={value} onChange={(e) => onChange(e.target.value)} aria-describedby={hintId} />
      </label>
      <label className="bx-host-check">
        <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />
        <span className="t-subhead">{C.show}</span>
      </label>
      <p id={hintId} className="t-footnote bx-host-muted">
        {C.passwordHint}
      </p>
    </>
  );
}

export function AddCrewSheet({ game, open, onClose }: { game: GameState | null; open: boolean; onClose: () => void }) {
  const id = useId();
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { run, pending } = useHostAction();
  useEffect(() => {
    if (open) {
      setName('');
      setPassword('');
      setError(null);
    }
  }, [open]);

  const problem = crewFormProblem(name, password);
  const initials = crewInitials(name);
  const submit = async () => {
    if (problem) {
      setError(problem === 'name' ? `${HOST_ERRORS.bad_name.title}. ${HOST_ERRORS.bad_name.message}` : C.passwordHint);
      return;
    }
    const result = await run('add', () => apiPost('/admin/teams', { name: name.trim(), password }), { success: fill(C.added, { crew: name.trim() }), quiet: true });
    if (result.ok) onClose();
    else setError(result.message ? `${result.title}. ${result.message}` : result.title);
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title={C.add}
      detents="large"
      keyboardAware
      footer={
        <Button variant="filled" size="large" fullWidth disabled={!name.trim() || password.length < 4} loading={pending === 'add'} onClick={() => void submit()}>
          {C.create}
        </Button>
      }
    >
      <form
        className="bx-sheet-body bx-host-form"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <label className="bx-host-field" htmlFor={`${id}-name`}>
          <span className="t-footnote">{C.name}</span>
          <input id={`${id}-name`} autoComplete="off" autoCapitalize="words" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <PasswordField id={`${id}-pw`} label={C.password} value={password} onChange={setPassword} hintId={`${id}-pw-hint`} />
        <div className="bx-host-kv">
          <span className="t-subhead">{C.initials}</span>
          <span className="bx-host-kv__value">
            {initials ? <Crest initials={initials} size={28} /> : null}
            <span className="t-body">{initials || '—'}</span>
          </span>
        </div>
        <div className="bx-host-kv">
          <span className="t-subhead">{C.startingCash}</span>
          <span className="t-body num">{game ? formatMoney(game.startingCapital, { symbol: game.currency.symbol }) : '—'}</span>
        </div>
        {error && (
          <p role="alert" className="t-footnote bx-host-error">
            {error}
          </p>
        )}
        <button type="submit" hidden />
      </form>
    </Sheet>
  );
}

export function ResetPasswordSheet({ team, open, onClose }: { team: Team; open: boolean; onClose: () => void }) {
  const id = useId();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { run, pending } = useHostAction();
  useEffect(() => {
    if (open) {
      setPassword('');
      setError(null);
    }
  }, [open]);

  const submit = async () => {
    const result = await run('password', () => apiPost(`/admin/teams/${encodeURIComponent(team.id)}/password`, { password }), {
      success: fill(C.passwordSaved, { crew: team.name }),
      quiet: true,
    });
    if (result.ok) onClose();
    else setError(result.message ? `${result.title}. ${result.message}` : result.title);
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title={C.resetPassword.replace('…', '')}
      subtitle={team.name}
      detents="medium"
      keyboardAware
      footer={
        <Button variant="filled" size="large" fullWidth disabled={password.length < 4} loading={pending === 'password'} onClick={() => void submit()}>
          {C.savePassword}
        </Button>
      }
    >
      <div className="bx-sheet-body bx-host-form">
        <PasswordField id={`${id}-pw`} label={C.newPassword} value={password} onChange={setPassword} hintId={`${id}-hint`} />
        {error && (
          <p role="alert" className="t-footnote bx-host-error">
            {error}
          </p>
        )}
      </div>
    </Sheet>
  );
}
