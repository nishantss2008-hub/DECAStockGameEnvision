/**
 * The game code (Kahoot-style join) on the host's Control screen: the code in large type, the link a
 * student can open to have it filled in, Copy link, and New code (for when a code has leaked to
 * someone who should not join). Students type the code on the sign-in screen's "Join game" tab.
 */
import { useState } from 'react';
import { Button } from '../ios/Button';
import { Alert } from '../ios/Alert';
import { apiPost } from '../../lib/api';
import { useAdminPoll } from '../../hooks/useAdmin';
import { useHostAction } from './useHostData';

/** The join link for a code: the sign-in screen reads `?code=`. */
export function joinLink(code: string, origin: string = window.location.origin): string {
  return `${origin}/login?code=${encodeURIComponent(code)}`;
}

export function GameCodeCard() {
  const { data, error, refresh } = useAdminPoll<{ code: string }>('/api/admin/join-code', 15_000);
  const { run, pending } = useHostAction();
  const [confirmNew, setConfirmNew] = useState(false);
  const code = data?.code ?? null;
  const host = window.location.host;

  const copy = async () => {
    if (!code) return;
    await run('copy', () => navigator.clipboard.writeText(joinLink(code)), { success: 'Join link copied' });
  };

  const rotate = async () => {
    setConfirmNew(false);
    const res = await run('rotate', () => apiPost<{ code: string }>('/api/admin/join-code/rotate'), { success: 'New game code ready' });
    if (res.ok) refresh();
  };

  return (
    <section className="bx-host-card bx-joincode" aria-labelledby="bx-joincode-title">
      <p id="bx-joincode-title" className="bx-joincode__label t-footnote">Game code</p>
      <p className="bx-joincode__code num" aria-live="polite">
        {code ?? (error ? '—' : '······')}
      </p>
      <p className="bx-joincode__how t-subhead">
        Students go to <strong>{host}</strong>, tap <strong>Join game</strong>, type this code and a crew name.
      </p>
      {error && !code && <p className="bx-joincode__how t-footnote">Couldn’t load the code. {error}</p>}
      <div className="bx-joincode__actions">
        <Button variant="tinted" onClick={() => void copy()} disabled={!code} loading={pending === 'copy'}>
          Copy join link
        </Button>
        <Button variant="plain" onClick={() => setConfirmNew(true)} disabled={!code} loading={pending === 'rotate'}>
          New code
        </Button>
      </div>
      <Alert
        open={confirmNew}
        onOpenChange={setConfirmNew}
        title="Make a new game code?"
        message="The old code stops working. Crews already in the game stay signed in."
        cancelLabel="Cancel"
        confirmLabel="New code"
        onConfirm={() => void rotate()}
      />
    </section>
  );
}
