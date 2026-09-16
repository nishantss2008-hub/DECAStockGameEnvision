/**
 * Account sheet (MOBILE §7.15, large, `?sheet=account`): crew header · How to play / Game rules · Display (Solid
 * bars, Text size) · Add to Home Screen / Reload app · Sign out (confirmation action sheet) · wordmark footer.
 * Game rules, Text size and Add to Home Screen push inside the sheet.
 */
import { useState } from 'react';
import { DEFAULT_TICK_INTERVAL_MS } from '@deca/shared';
import { useNavigate } from 'react-router-dom';
import { BookOpen, ChevronLeft, ListChecks, RotateCw, Smartphone, Type } from 'lucide-react';
import { Sheet } from '../components/ios/Sheet';
import { Button } from '../components/ios/Button';
import { Crest } from '../components/ios/Crest';
import { ActionSheet } from '../components/ios/ActionSheet';
import { InsetGroupedList } from '../components/ios/InsetGroupedList';
import { ActionRow, DisclosureRow, KeyValueRow, ToggleRow } from '../components/ios/ListRow';
import type { RoutedSheetProps } from '../shell/useSheet';
import { useShellGame } from '../shell/ShellData';
import { useWalkthrough } from '../shell/useWalkthrough';
import { useInlineTip } from '../shell/InlineTip';
import { applySolidBars, crewInitials, homeScreenPlatform, readSolidBars } from '../shell/device';
import { isStandalone, localStore } from '../shell/storage';
import { useAuth } from '../lib/auth';
import { useLeaderboard } from '../hooks/useLeaderboard';
import { formatMoney, formatNumber, formatPct } from '../lib/format';
import { lengthLabel, lengthPhrase } from '../lib/gameLength';
import { GLOSSARY } from '../lib/glossary';
import { GUIDE, MOBILE, SETTINGS, SHELL, SIGN_IN, WALKTHROUGH, fill } from '../shell/copy';

type View = 'main' | 'rules' | 'textSize' | 'homeScreen';

function GameRules() {
  const { game } = useShellGame();
  const tickSeconds = Math.round((game?.tickIntervalMs ?? DEFAULT_TICK_INTERVAL_MS) / 1000);
  const feePct = formatPct((game?.feeBps ?? 10) / 10_000);
  const limitOn = (game?.maxPositionPct ?? 1) < 1;
  const limitPct = formatPct(game?.maxPositionPct ?? 1, { digits: 0 });
  // The glossary lines plus this game's rule sentence (COPY §7).
  const tick = useInlineTip('tick', fill(GUIDE.ticks, { tickSeconds }));
  const fee = useInlineTip('fee', fill(GUIDE.fees, { feePct }));
  const limit = useInlineTip('positionLimit', limitOn ? fill(GUIDE.limit, { limitPct }) : GUIDE.limitOff);
  if (!game) return null;
  const length = game.gameLengthMs;
  return (
    <InsetGroupedList surface="sheet" aria-label={SHELL.gameRules} footer={fill(SETTINGS.derived, { length: lengthPhrase(length), tickSeconds, totalTicks: formatNumber(game.totalTicks) })}>
      <KeyValueRow label={SETTINGS.gameLength} value={lengthLabel(length)} />
      <KeyValueRow label={GLOSSARY.tick?.label ?? 'Price update'} info={tick.button} value={`${tickSeconds} s`} />
      {tick.panel}
      <KeyValueRow label={SETTINGS.tradingFee} info={fee.button} value={feePct} />
      {fee.panel}
      <KeyValueRow label={SETTINGS.positionLimit} info={limit.button} value={limitOn ? limitPct : SETTINGS.limitOff} />
      {limit.panel}
      <KeyValueRow label={SETTINGS.startingCash} value={formatMoney(game.startingCapital, { symbol: game.currency.symbol })} />
    </InsetGroupedList>
  );
}

export default function AccountSheet({ open, onClose, onClosed }: RoutedSheetProps) {
  const { team, game } = useShellGame();
  const { logout } = useAuth();
  const { leaderboard } = useLeaderboard();
  const walkthrough = useWalkthrough();
  const navigate = useNavigate();
  const [view, setView] = useState<View>('main');
  const [solid, setSolid] = useState(() => readSolidBars(localStore()));
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const standalone = isStandalone();
  const platform = homeScreenPlatform(navigator.userAgent, navigator.maxTouchPoints ?? 0);
  const crew = team?.name ?? '';

  const count = leaderboard?.entries.length ?? 0;
  const rankLine =
    team && game && team.rank > 0 && count > 0
      ? fill(SHELL.rankLine, { rank: team.rank, count, value: formatMoney(team.totalValue, { symbol: game.currency.symbol }) })
      : team && game
        ? formatMoney(team.totalValue, { symbol: game.currency.symbol })
        : '';

  const titles: Record<View, string> = { main: SHELL.account, rules: SHELL.gameRules, textSize: MOBILE.textSize.row, homeScreen: MOBILE.homeScreen.row };
  const homeTip = platform === 'ios' ? MOBILE.homeScreen.tipIos : platform === 'android' ? MOBILE.homeScreen.tipAndroid : MOBILE.homeScreen.tipChromebook;

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={(next) => !next && onClose()}
        onClosed={() => {
          setView('main');
          onClosed();
        }}
        title={titles[view]}
        detents="large"
        showClose={false}
        leading={
          view !== 'main' ? (
            <Button variant="plain" size="medium" icon={ChevronLeft} onClick={() => setView('main')}>
              {SHELL.account}
            </Button>
          ) : undefined
        }
        trailing={
          <Button variant="plain" size="medium" onClick={onClose}>
            {MOBILE.done}
          </Button>
        }
        className="bx-account-sheet"
      >
        <div className="bx-sheet-body">
          {view === 'main' && (
            <>
              <div className="bx-account__crew">
                <Crest initials={crewInitials(crew)} size={64} />
                <p className="t-title-2 t-emph">{crew}</p>
                {rankLine && <p className="t-subhead bx-account__rank num">{rankLine}</p>}
              </div>
              <InsetGroupedList surface="sheet" aria-label={WALKTHROUGH.reopen}>
                <DisclosureRow
                  title={WALKTHROUGH.reopen}
                  icon={BookOpen}
                  onClick={() => {
                    walkthrough.show();
                    navigate('/portfolio', { replace: true });
                  }}
                />
                <DisclosureRow title={SHELL.gameRules} icon={ListChecks} onClick={() => setView('rules')} />
              </InsetGroupedList>
              <InsetGroupedList surface="sheet" header={SHELL.display} headerVariant="plain" footer={MOBILE.solidBars.footer}>
                <ToggleRow
                  title={MOBILE.solidBars.row}
                  checked={solid}
                  onChange={(on) => {
                    setSolid(on);
                    applySolidBars(on, document.documentElement, localStore());
                  }}
                />
                <DisclosureRow title={MOBILE.textSize.row} icon={Type} onClick={() => setView('textSize')} />
              </InsetGroupedList>
              <InsetGroupedList surface="sheet" aria-label={MOBILE.homeScreen.row} footer={MOBILE.helpHost}>
                {!standalone && <DisclosureRow title={MOBILE.homeScreen.row} icon={Smartphone} onClick={() => setView('homeScreen')} />}
                {standalone && (
                  <ActionRow onClick={() => window.location.reload()}>
                    <RotateCw size={20} aria-hidden="true" /> {SHELL.reloadApp}
                  </ActionRow>
                )}
              </InsetGroupedList>
              <InsetGroupedList surface="sheet" aria-label={MOBILE.signOut.row}>
                <ActionRow tone="destructive" onClick={() => setConfirmSignOut(true)}>
                  {MOBILE.signOut.row}
                </ActionRow>
              </InsetGroupedList>
              <footer className="bx-account__footer">
                <p className="font-brand bx-account__wordmark">Buccaneer Exchange</p>
                <p className="t-footnote">{SIGN_IN.footer}</p>
              </footer>
            </>
          )}
          {view === 'rules' && <GameRules />}
          {view === 'textSize' && (
            <p className="t-body bx-account__explain">{platform === 'ios' ? MOBILE.textSize.footerIos : MOBILE.textSize.footerOther}</p>
          )}
          {view === 'homeScreen' && <p className="t-body bx-account__explain">{homeTip}</p>}
        </div>
      </Sheet>
      <ActionSheet
        open={confirmSignOut}
        onOpenChange={setConfirmSignOut}
        title={fill(MOBILE.signOut.title, { crew })}
        cancelLabel={SHELL.cancel}
        actions={[
          {
            id: 'sign-out',
            label: MOBILE.signOut.confirm,
            destructive: true,
            onSelect: () => {
              setConfirmSignOut(false);
              void logout().then(() => navigate('/login', { replace: true }));
            },
          },
        ]}
      />
    </>
  );
}
