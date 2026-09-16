/**
 * New game… (MOBILE §7.18, COPY §11 newGame): large sheet with the plain consequence, ToggleRow "Keep crews and
 * passwords" (default on) and its when-on / when-off line, then a typed NEW GAME alert → POST /admin/game/new.
 *
 * `game` is null before the first market exists (Control's empty state opens this same sheet to build one); the
 * starting-cash line then quotes the defaults the new game will be created with.
 */
import { useState } from 'react';
import { CURRENCY, DEFAULT_STARTING_CAPITAL, type GameState } from '@deca/shared';
import { Sheet } from '../ios/Sheet';
import { InsetGroupedList } from '../ios/InsetGroupedList';
import { ToggleRow } from '../ios/ListRow';
import { Button } from '../ios/Button';
import { Alert } from '../ios/Alert';
import { apiPost } from '../../lib/api';
import { resyncLive } from '../../lib/live';
import { formatMoney } from '../../lib/format';
import { fill } from '../../shell/copy';
import { HOST_SETTINGS } from './hostCopy';
import { useHostAction } from './useHostData';

const N = HOST_SETTINGS.newGame;

export function NewGameSheet({ game, open, onClose }: { game: GameState | null; open: boolean; onClose: () => void }) {
  const [keepCrews, setKeepCrews] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const { run, pending } = useHostAction();

  const startingCash = formatMoney(game?.startingCapital ?? DEFAULT_STARTING_CAPITAL, { symbol: game?.currency.symbol ?? CURRENCY.symbol });
  const keepCrewsLine = keepCrews ? fill(HOST_SETTINGS.keepCrews.whenOn, { startingCash }) : HOST_SETTINGS.keepCrews.whenOff;

  const start = async () => {
    setConfirming(false);
    const result = await run('newGame', () => apiPost('/api/admin/game/new', { keepCrews }), { success: N.done });
    // The new market is a whole new world and the server sends no event for it: pull it down.
    if (result.ok) {
      resyncLive();
      onClose();
    }
  };

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={(next) => !next && onClose()}
        title={N.title}
        detents="large"
        footer={
          <Button variant="filled" tone="destructive" size="large" fullWidth loading={pending === 'newGame'} onClick={() => setConfirming(true)}>
            {N.confirmButton}
          </Button>
        }
      >
        <div className="bx-sheet-body bx-host-form">
          <p className="t-body">{N.body}</p>
          <InsetGroupedList surface="sheet" aria-label={HOST_SETTINGS.keepCrews.label}>
            <ToggleRow
              title={HOST_SETTINGS.keepCrews.label}
              subtitle={keepCrewsLine}
              checked={keepCrews}
              onChange={setKeepCrews}
            />
          </InsetGroupedList>
          <p className="t-footnote bx-host-muted">{N.flavor}</p>
        </div>
      </Sheet>
      <Alert
        open={confirming}
        onOpenChange={(next) => !next && setConfirming(false)}
        title={N.confirmTitle}
        message={keepCrewsLine}
        cancelLabel={N.cancel}
        confirmLabel={N.confirmButton}
        destructive
        confirmWord={N.confirmWord}
        confirmWordLabel={N.confirmPrompt}
        onConfirm={() => void start()}
      />
    </>
  );
}
