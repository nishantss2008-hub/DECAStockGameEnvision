/**
 * Overlay demos for the dev gallery: sheets, InfoTip sheet, menus, action sheets, alerts and toasts.
 * They portal to <body>, so they follow the page appearance (use Appearance: Dark to review them dark).
 * `?open=<id>` opens one on load, for screenshots.
 */
import { useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowUpDown, BookOpen, Building2, CircleCheck, CircleMinus, CirclePlus, Ellipsis, RefreshCw, Star, Wifi } from 'lucide-react';
import { formatNumber } from '../lib/format';
import { Button } from '../components/ios/Button';
import { Crest } from '../components/ios/Crest';
import { InsetGroupedList } from '../components/ios/InsetGroupedList';
import { ExplainRow, KeyValueRow } from '../components/ios/ListRow';
import { explainMetric } from '../lib/compare';
import { SegmentedControl } from '../components/ios/SegmentedControl';
import { Sheet } from '../components/ios/Sheet';
import { Menu } from '../components/ios/Menu';
import { ActionSheet } from '../components/ios/ActionSheet';
import { Alert } from '../components/ios/Alert';
import { useToast } from '../components/ios/Toast';
import { StatusLine } from '../components/ios/LargeTitleNavBar';
import { WaxSeal } from '../components/ios/WaxSeal';
import { Sparkline } from '../components/charts/Sparkline';
import { formatMoneyCents } from '../components/ios/signedText';
import { ACCOUNT, ACCOUNT_VALUE, STANDINGS } from './kitData';
import { KitDemo, KitSection, OpenTermContext, Tip, explainLabel } from './kitShared';

export const OVERLAY_IDS = [
  'trade',
  'filled',
  'status',
  'crew',
  'account',
  'welcome',
  'menu-sort',
  'menu-more',
  'menu-row',
  'discard',
  'signout',
  'endgame',
  'pause',
  'toast-update',
  'toast-online',
] as const;
export type OverlayId = (typeof OVERLAY_IDS)[number];

export function isOverlayId(value: string | null): value is OverlayId {
  return value !== null && (OVERLAY_IDS as readonly string[]).includes(value);
}

const noop = () => {};

function TradeSheetBody() {
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  return (
    <div className="kit-sheet-body">
      <SegmentedControl
        ariaLabel="Order side"
        size="large"
        value={side}
        onChange={setSide}
        options={[
          { value: 'buy', label: 'Buy' },
          { value: 'sell', label: 'Sell' },
        ]}
      />
      <p className="t-subhead kit-secondary">Step 2 · review before placing</p>
      <p className="t-body">Buy 500 shares of KRKN (Kraken Shipping Lines) at about the current price.</p>
      <InsetGroupedList header="Estimated cost" headerVariant="plain" headingLevel={3} surface="sheet">
        <KeyValueRow label="Estimated price per share" info={<Tip id="price" />} value="Ð84.12" />
        <KeyValueRow label="Estimated order value" value="Ð42,060.00" />
        <KeyValueRow label="Estimated fee (0.10%)" info={<Tip id="fee" />} value="Ð42.06" />
        <KeyValueRow label="Estimated total cost" value={<strong>Ð42,102.06</strong>} />
        <KeyValueRow label="Cash after this order" info={<Tip id="cashAvailable" />} value="Ð206,247.49" valueTone="secondary" />
      </InsetGroupedList>
      <p className="t-footnote kit-secondary">
        Estimated. Prices can change between this preview and when you place the order, so the final price may differ slightly.
      </p>
    </div>
  );
}

function FilledBody() {
  return (
    <div className="kit-sheet-body kit-center">
      <WaxSeal tone="brass" size={64} animate />
      <p className="t-title-1 t-emph">Order filled</p>
      <p className="t-body">Order filled: Bought 500 KRKN at Ð84.12 (Ð42,102.06).</p>
      <p className="t-footnote kit-secondary">Fair winds.</p>
    </div>
  );
}

function CrewBody() {
  const crew = STANDINGS[1]!;
  return (
    <div className="kit-sheet-body">
      <div className="kit-inline">
        <Crest initials={crew.initials} size={44} />
        <div>
          <p className="t-headline">Rank {crew.rank} of 14</p>
          <p className="t-footnote kit-secondary num">{formatMoneyCents(crew.value)}</p>
        </div>
      </div>
      <div className="kit-spark-fill">
        <Sparkline values={ACCOUNT_VALUE.map((p) => p.y)} fill height={64} />
      </div>
      <InsetGroupedList header="This crew" headerVariant="plain" headingLevel={3} surface="sheet">
        <KeyValueRow label="Total return" info={<Tip id="totalGain" />} value="+9.77%" />
        <KeyValueRow label="Change this session" info={<Tip id="sessionChange" />} value="+1.40%" />
        <KeyValueRow label="Share of account in cash" info={<Tip id="pctOfAccount" />} value="18.2%" />
        <KeyValueRow label="Companies held" info={<Tip id="diversification" />} value="9" />
      </InsetGroupedList>
      <InsetGroupedList header="Key stats they hold most" headerVariant="plain" headingLevel={3} surface="sheet">
        <ExplainRow
          label={explainLabel('peRatio')}
          info={<Tip id="peRatio" />}
          explained={explainMetric('peRatio', 17.8, { scope: 'sector', sector: 'Shipping & Salvage', value: 22.1, count: 4 }, 'Ð')}
        />
        <ExplainRow
          label={explainLabel('netMargin')}
          info={<Tip id="netMargin" />}
          explained={explainMetric('netMargin', 0.14, { scope: 'sector', sector: 'Shipping & Salvage', value: 0.1, count: 4 }, 'Ð')}
        />
      </InsetGroupedList>
    </div>
  );
}

export interface OverlayDemosProps {
  initial: OverlayId | null;
}

function Trigger({ label, onClick, children }: { label: string; onClick: () => void; children?: ReactNode }) {
  return (
    <div className="kit-trigger">
      <Button variant="gray" size="medium" onClick={onClick}>
        {label}
      </Button>
      {children ? <p className="t-footnote kit-secondary">{children}</p> : null}
    </div>
  );
}

export function OverlaysSection({ initial }: OverlayDemosProps) {
  // Menus position against their trigger, so a deep-linked menu opens after the first paint.
  const deferred = initial?.startsWith('menu-') ?? false;
  const [open, setOpen] = useState<OverlayId | null>(deferred ? null : initial);
  const [sort, setSort] = useState('value');
  const [watching, setWatching] = useState(false);
  const toast = useToast();
  const openTerm = useContext(OpenTermContext);
  const toastShown = useRef(false);
  const close = () => setOpen(null);
  const is = (id: OverlayId) => open === id;

  useEffect(() => {
    if (!deferred || !initial) return undefined;
    const frame = window.requestAnimationFrame(() => setOpen(initial));
    return () => window.cancelAnimationFrame(frame);
  }, [deferred, initial]);

  useEffect(() => {
    if (toastShown.current) return;
    if (initial === 'toast-update') {
      toastShown.current = true;
      toast.show({ id: 'update', title: 'Update ready', icon: RefreshCw, action: { label: 'Reload', onAction: noop } });
    } else if (initial === 'toast-online') {
      toastShown.current = true;
      toast.show({ id: 'online', title: 'Back online', icon: Wifi, timeoutMs: 0 });
    }
  }, [initial, toast]);

  return (
    <KitSection
      id="overlays"
      title="Sheets, menus, action sheets, alerts and toasts"
      spec="MOBILE §5.8 Sheet · §5.9 InfoTip · §5.10 Menu · §5.11 ActionSheet/Alert · §5.12 Toast"
      note="Overlays portal to the page, so they follow the page appearance. Switch Appearance to Dark to review them dark."
      single
    >
      {() => (
        <div className="kit-grid">
          <KitDemo label="Sheets">
            <div className="kit-triggers">
              <Trigger label="Trade sheet (large)" onClick={() => setOpen('trade')}>
                Not resizable, X then title, pinned footer.
              </Trigger>
              <Trigger label="Order filled (large)" onClick={() => setOpen('filled')}>
                Seal stamp, no Close while the result shows.
              </Trigger>
              <Trigger label="Market status (medium)" onClick={() => setOpen('status')}>
                Inset 8px, light scrim, tap scrim to close.
              </Trigger>
              <Trigger label="Crew card (medium to large)" onClick={() => setOpen('crew')}>
                Grabber cycles detents.
              </Trigger>
              <Trigger label="InfoTip sheet (fit)" onClick={() => openTerm('peRatio')}>
                Content height up to large; grabber only when taller than medium.
              </Trigger>
              <Trigger label="Account (large, Done)" onClick={() => setOpen('account')} />
              <Trigger label="Welcome (no header)" onClick={() => setOpen('welcome')} />
            </div>
          </KitDemo>
          <KitDemo label="Menus (glass)">
            <div className="kit-triggers">
              <div className="kit-trigger">
                <Menu
                  open={is('menu-sort')}
                  onOpenChange={(o) => setOpen(o ? 'menu-sort' : null)}
                  align="start"
                  trigger={
                    <Button variant="gray" size="medium" icon={ArrowUpDown}>
                      Sort positions
                    </Button>
                  }
                  groups={[
                    {
                      label: 'Sort by',
                      value: sort,
                      onValueChange: setSort,
                      items: [
                        { id: 'value', label: 'Value', onSelect: noop },
                        { id: 'gain', label: 'Total gain %', onSelect: noop },
                        { id: 'session', label: 'Session change', onSelect: noop },
                        { id: 'name', label: 'Name', onSelect: noop },
                      ],
                    },
                  ]}
                />
              </div>
              <div className="kit-trigger">
                <Menu
                  open={is('menu-more')}
                  onOpenChange={(o) => setOpen(o ? 'menu-more' : null)}
                  align="start"
                  trigger={
                    <Button variant="gray" size="medium" icon={Ellipsis}>
                      More options
                    </Button>
                  }
                  groups={[
                    {
                      items: [
                        { id: 'five', label: 'Read a company in 5 questions', icon: BookOpen, onSelect: noop },
                        {
                          id: 'watch',
                          label: watching ? 'Remove from watchlist' : 'Add to watchlist',
                          icon: Star,
                          onSelect: () => setWatching((w) => !w),
                        },
                      ],
                    },
                  ]}
                />
              </div>
              <div className="kit-trigger">
                <Menu
                  open={is('menu-row')}
                  onOpenChange={(o) => setOpen(o ? 'menu-row' : null)}
                  align="start"
                  trigger={
                    <Button variant="gray" size="medium">
                      KRKN row (long-press menu)
                    </Button>
                  }
                  groups={[
                    {
                      items: [
                        { id: 'buy', label: 'Buy', icon: CirclePlus, onSelect: noop },
                        { id: 'sell', label: 'Sell', icon: CircleMinus, onSelect: noop },
                      ],
                    },
                    { items: [{ id: 'view', label: 'View company', icon: Building2, onSelect: noop }] },
                  ]}
                />
              </div>
            </div>
          </KitDemo>
          <KitDemo label="Action sheets and alerts">
            <div className="kit-triggers">
              <Trigger label="Discard this order?" onClick={() => setOpen('discard')} />
              <Trigger label="Sign out of Saltwind Traders?" onClick={() => setOpen('signout')} />
              <Trigger label="Host: End the game now? (type END)" onClick={() => setOpen('endgame')} />
              <Trigger label="Host: Pause trading?" onClick={() => setOpen('pause')} />
            </div>
          </KitDemo>
          <KitDemo label="Toasts (glass, below the top bar)">
            <div className="kit-triggers">
              <Trigger
                label="Update ready · Reload"
                onClick={() => toast.show({ id: 'update', title: 'Update ready', icon: RefreshCw, action: { label: 'Reload', onAction: noop } })}
              >
                Stays until dismissed because it has an action.
              </Trigger>
              <Trigger label="Back online" onClick={() => toast.show({ id: 'online', title: 'Back online', icon: Wifi })}>
                Stays at least 6 seconds; pauses on hover or focus.
              </Trigger>
              <Trigger
                label="Walkthrough hidden · Undo"
                onClick={() => toast.show({ id: 'walkthrough', title: 'Walkthrough hidden', icon: CircleCheck, action: { label: 'Undo', onAction: noop } })}
              />
            </div>
          </KitDemo>

          <Sheet
            open={is('trade')}
            onOpenChange={(o) => !o && close()}
            title="Buy KRKN"
            detents="large"
            footer={
              <div className="kit-sheet-footer">
                <Button fullWidth tone="buy">
                  Place order
                </Button>
                <Button fullWidth variant="plain">
                  Edit order
                </Button>
              </div>
            }
          >
            <TradeSheetBody />
          </Sheet>

          <Sheet
            open={is('filled')}
            onOpenChange={(o) => !o && close()}
            title="Order filled"
            headerLayout="hidden"
            showClose={false}
            detents="large"
            footer={
              <div className="kit-sheet-footer">
                <Button fullWidth onClick={close}>
                  Done
                </Button>
                <Button fullWidth variant="gray">
                  View activity
                </Button>
              </div>
            }
          >
            <FilledBody />
          </Sheet>

          <Sheet open={is('status')} onOpenChange={(o) => !o && close()} title="Market status" headerLayout="leading" detents="medium" scrim="info">
            <div className="kit-sheet-body">
              <StatusLine tone="open">Market open · Sails up</StatusLine>
              <p className="t-body">Trading is open. Prices update every 30 seconds.</p>
              <InsetGroupedList aria-label="Game clock" surface="sheet">
                <KeyValueRow label="Time left" info={<Tip id="session" />} value="37:17:42" />
                <KeyValueRow label="Tick" info={<Tip id="tick" />} value={`${formatNumber(1284)} of ${formatNumber(5760)}`} />
                <KeyValueRow label="Session" value="2 of 8" />
              </InsetGroupedList>
            </div>
          </Sheet>

          <Sheet open={is('crew')} onOpenChange={(o) => !o && close()} title="Tortuga Capital" subtitle="Rank 2 of 14" headerLayout="leading" detents="medium-large" scrim="info">
            <CrewBody />
          </Sheet>

          <Sheet
            open={is('account')}
            onOpenChange={(o) => !o && close()}
            title="Account"
            detents="large"
            showClose={false}
            trailing={
              <Button variant="plain" size="medium" onClick={close}>
                Done
              </Button>
            }
          >
            <div className="kit-sheet-body">
              <div className="kit-inline">
                <Crest initials={ACCOUNT.initials} size={64} />
                <div>
                  <p className="t-title-2 t-emph">{ACCOUNT.crew}</p>
                  <p className="t-footnote kit-secondary">Rank 3 of 14</p>
                </div>
              </div>
              <InsetGroupedList header="Display" headerVariant="plain" headingLevel={3} surface="sheet" footer="Turns off see-through bars. Use it if text on the bars is hard to read.">
                <KeyValueRow label="Solid bars" value="Off" valueTone="secondary" />
                <KeyValueRow label="Text size" value="Follows iPhone" valueTone="secondary" />
              </InsetGroupedList>
              <p className="kit-wordmark font-brand">Buccaneer Exchange</p>
              <p className="t-footnote kit-secondary kit-center">A market simulation. No real money.</p>
            </div>
          </Sheet>

          <Sheet open={is('welcome')} onOpenChange={(o) => !o && close()} title="Welcome aboard, Saltwind Traders" headerLayout="hidden" detents="large" showClose={false}>
            <div className="kit-sheet-body kit-welcome">
              <p className="t-title-1 t-emph">Welcome aboard, Saltwind Traders</p>
              <ul className="kit-welcome__list" role="list">
                <li className="t-body">You start with Ð1,000,000.00 in cash.</li>
                <li className="t-body">Prices update every 30 seconds for the whole game.</li>
                <li className="t-body">Healthier companies tend to do better over time, but news and luck matter.</li>
              </ul>
              <Button fullWidth onClick={close}>
                Start the walkthrough
              </Button>
              <Button fullWidth variant="plain" onClick={close}>
                Skip for now
              </Button>
            </div>
          </Sheet>

          <ActionSheet
            open={is('discard')}
            onOpenChange={(o) => !o && close()}
            title="Discard this order?"
            actions={[{ id: 'discard', label: 'Discard order', destructive: true, onSelect: noop }]}
            cancelLabel="Keep editing"
          />
          <ActionSheet
            open={is('signout')}
            onOpenChange={(o) => !o && close()}
            title="Sign out of Saltwind Traders?"
            actions={[{ id: 'signout', label: 'Sign out', destructive: true, onSelect: noop }]}
            cancelLabel="Cancel"
          />
          <Alert
            open={is('endgame')}
            onOpenChange={(o) => !o && close()}
            title="End the game now?"
            message="Trading closes for good, holdings are valued at closing prices, and the market reveal opens. This can't be undone."
            cancelLabel="Cancel"
            confirmLabel="End game"
            destructive
            confirmWord="END"
            confirmWordLabel="Type END to confirm"
            onConfirm={close}
          />
          <Alert
            open={is('pause')}
            onOpenChange={(o) => !o && close()}
            title="Pause trading?"
            message="Crews can't place orders, and the clock stops until you resume."
            cancelLabel="Cancel"
            confirmLabel="Pause"
            onConfirm={close}
          />
        </div>
      )}
    </KitSection>
  );
}
