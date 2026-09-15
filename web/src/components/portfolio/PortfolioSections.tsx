/**
 * Portfolio tab root sections (MOBILE §7.3): summary on the page (2), account value chart card (3),
 * Cash available + Rank tiles (4), Positions with the "Show" menu (5), Recent activity (6) and the prices
 * footer (7). Every metric has a "?" (§5.9).
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { rangeTabs, type GameClock, type GameState } from '@deca/shared';
import { ChartCard } from '../charts/ChartCard';
import { chartSummary, moneyFormatters, seriesStats } from '../charts/scrub';
import { EmptyState } from '../ios/EmptyState';
import { InsetGroupedList } from '../ios/InsetGroupedList';
import { Menu } from '../ios/Menu';
import { MoneyText, SignedChange } from '../ios/SignedChange';
import { formatPercentPlain, type CurrencyNames } from '../ios/signedText';
import { useCompositeHistory, useMarket } from '../../hooks/useMarket';
import { useTeamHistory } from '../../hooks/useTeamHistory';
import { formatMoney, formatNumber, formatTickTime } from '../../lib/format';
import type { ActivityItem } from './activity';
import { rankText, rebaseSeries, tickEpoch, valueSeries, vsCompositePoints, type AccountTotals, type PositionRow, type ShowMetric } from './derive';
import { ActivityRow, HoldingRow } from './rows';
import { TermTip } from './TermTip';

/** COPY-TBD mobile.* strings used on Portfolio (MOBILE §7.0). */
export const PF_COPY = {
  accountValue: 'Account value',
  thisSession: 'this session',
  sinceStart: 'since the game began',
  vsComposite: 'vs Pirate Composite',
  points: 'points',
  startingCash: 'Starting cash',
  composite: 'Pirate Composite',
  cashAvailable: 'Cash available',
  ofAccount: '{pct} of account',
  rank: 'Rank',
  standings: 'Standings',
  positions: 'Positions',
  seeAll: 'See all',
  seeAllCount: 'See all {n}',
  show: { label: 'Show', totalGain: 'Total gain', session: 'Session', pctOfAccount: '% of account' } as Record<'label' | ShowMetric, string>,
  recentActivity: 'Recent activity',
  pricesFooter: 'Prices update every {tickSeconds} seconds · as of {time}',
  emptyPositions: {
    title: 'No positions yet',
    body: "You haven't bought any shares. Research a company, then place a small order to get started.",
    action: 'Open Markets',
    flavor: 'The hold is empty.',
  },
  emptyOrders: { title: 'No orders yet', body: 'Orders you place will show here, with their prices and fees.', flavor: 'The logbook awaits its first entry.' },
} as const;

const fillIn = (t: string, v: Record<string, string | number>) => t.replace(/\{(\w+)\}/g, (m, k: string) => (k in v ? String(v[k]) : m));

/* ─── 2. Summary ─────────────────────────────────────────────────────────────── */

export function AccountSummary({
  totalValue,
  totals,
  compositeChange,
  currency,
}: {
  totalValue: number;
  totals: AccountTotals;
  compositeChange: number | null;
  currency: CurrencyNames;
}) {
  const vs = compositeChange === null ? null : vsCompositePoints(totals.totalPct, compositeChange);
  return (
    <section className="pf-summary" aria-label="Account summary">
      <div className="pf-label">
        <span>{PF_COPY.accountValue}</span>
        <TermTip id="accountValue" />
      </div>
      <p className="pf-value num" data-testid="account-value">
        <MoneyText cents={totalValue} currency={currency} />
      </p>
      <div className="pf-change">
        <SignedChange value={totals.sessionValueChange} kind="money" pct={totals.sessionPct} currency={currency} strong suffix={PF_COPY.thisSession} />
        <TermTip id="sessionChange" />
      </div>
      <div className="pf-change">
        <SignedChange value={totals.totalGain} kind="money" pct={totals.totalPct} currency={currency} strong suffix={PF_COPY.sinceStart} />
        <TermTip id="totalGain" />
      </div>
      {vs !== null && (
        <div className="pf-vs">
          <span>{PF_COPY.vsComposite}</span>
          <SignedChange value={vs} kind="number" suffix={PF_COPY.points} />
          <TermTip id="index" />
        </div>
      )}
    </section>
  );
}

/* ─── 3. Chart card ──────────────────────────────────────────────────────────── */

/**
 * Y-axis labels: compact money ("Ð1.08M"), but in thousands when the plotted values sit close together,
 * so neighbouring ticks never read the same ("Ð997.5K", "Ð998K").
 */
function axisFormatter(points: readonly { y: number }[], compare: readonly { y: number }[], reference: number, symbol: string) {
  let min = reference;
  let max = reference;
  for (const p of [...points, ...compare]) {
    if (p.y < min) min = p.y;
    if (p.y > max) max = p.y;
  }
  const spanUnits = (max - min) / 100;
  if (spanUnits >= 30_000) return (cents: number) => formatMoney(cents, { symbol, compact: true });
  const digits = spanUnits < 3_000 ? 1 : 0;
  return (cents: number) => `${cents < 0 ? '−' : ''}${symbol}${formatNumber(Math.abs(cents) / 100_000, digits)}K`;
}

export function AccountChart({
  teamId,
  game,
  clock,
  totalValue,
  startingCapital,
  compositeOpen,
  currency,
}: {
  teamId: string | null;
  game: GameState | null;
  clock: GameClock | null;
  totalValue: number;
  startingCapital: number;
  compositeOpen: number | null;
  currency: CurrencyNames;
}) {
  const toTick = game?.currentTick ?? 0;
  const started = Boolean(game && game.phase !== 'lobby');
  const history = useTeamHistory(started ? teamId : null, null, toTick);
  const composite = useCompositeHistory(started ? null : -1, started ? toTick : -1);
  const [range, setRange] = useState('all');
  const ranges = useMemo(() => (clock ? rangeTabs(clock) : []), [clock]);

  const points = useMemo(() => {
    const pts = [...valueSeries(history.points)];
    const last = pts[pts.length - 1];
    if (started && (!last || last.x < toTick)) pts.push({ x: toTick, y: totalValue });
    return pts;
  }, [history.points, started, toTick, totalValue]);

  const compare = useMemo(() => {
    const base = compositeOpen && compositeOpen > 0 ? compositeOpen : (composite.points[0]?.value ?? 0);
    return rebaseSeries(composite.points, base, startingCapital);
  }, [composite.points, compositeOpen, startingCapital]);

  const formatters = useMemo(() => {
    const at = tickEpoch(game);
    const x = (tick: number) => {
      const epoch = at(tick);
      return epoch === null ? `Tick ${tick}` : formatTickTime(epoch);
    };
    return { ...moneyFormatters(currency), formatX: x, spokenX: x };
  }, [game, currency]);

  const stats = seriesStats(points, startingCapital);
  return (
    <ChartCard
      className="pf-chart"
      label={PF_COPY.accountValue}
      points={points}
      plotHeight={180}
      summary={stats ? chartSummary('total', stats, formatters) : ''}
      formatters={formatters}
      formatAxis={axisFormatter(points, compare, startingCapital, currency.symbol)}
      reference={{ y: startingCapital, label: PF_COPY.startingCash }}
      compare={compare.length > 1 ? { points: compare, label: PF_COPY.composite } : undefined}
      ranges={ranges}
      range={range}
      onRangeChange={setRange}
      loading={history.loading && points.length < 2}
      paused={game?.phase === 'paused'}
    />
  );
}

/* ─── 4. Tiles ───────────────────────────────────────────────────────────────── */

export function AccountTiles({ cash, cashPct, rank, crews, currency }: { cash: number; cashPct: number; rank: number; crews: number; currency: CurrencyNames }) {
  const rankValue = rankText(rank, crews);
  return (
    <div className="pf-tiles">
      <div className="pf-tile">
        <div className="pf-tile__label">
          <span>{PF_COPY.cashAvailable}</span>
          <TermTip id="cashAvailable" className="pf-tile__tip" />
        </div>
        <p className="pf-tile__value num">
          <MoneyText cents={cash} currency={currency} />
        </p>
        <p className="pf-tile__sub num">{fillIn(PF_COPY.ofAccount, { pct: formatPercentPlain(cashPct, 1) })}</p>
      </div>
      <div className="pf-tile pf-tile--link">
        <div className="pf-tile__label">
          <span>{PF_COPY.rank}</span>
          <TermTip id="accountValue" className="pf-tile__tip" />
        </div>
        <p className="pf-tile__value num" aria-hidden="true">
          {rankValue}
        </p>
        <Link to="/standings" className="pf-tile__link" aria-label={rank > 0 && crews > 0 ? `${PF_COPY.standings}, rank ${rankValue}` : PF_COPY.standings}>
          <span aria-hidden="true">{PF_COPY.standings}</span>
          <ChevronRight size={14} strokeWidth={2.5} aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}

/* ─── 5. Positions (top 5) ───────────────────────────────────────────────────── */

const SHOW_ORDER: ShowMetric[] = ['totalGain', 'session', 'pctOfAccount'];

export function TopPositions({ rows, currency, onOpenMarkets }: { rows: PositionRow[]; currency: CurrencyNames; onOpenMarkets: () => void }) {
  const [metric, setMetric] = useState<ShowMetric>('totalGain');
  const termFor: Record<ShowMetric, string> = { totalGain: 'totalGain', session: 'sessionChange', pctOfAccount: 'pctOfAccount' };
  const headingId = 'pf-positions-title';
  return (
    <section className="ios-list ios-list--has-header pf-positions" aria-labelledby={headingId}>
      <div className="ios-list__header" data-variant="prominent">
        <h2 id={headingId} className="ios-list__title">
          {PF_COPY.positions}
        </h2>
        {rows.length > 0 && (
          <div className="ios-list__action">
            <Link to="/portfolio/positions">{fillIn(PF_COPY.seeAllCount, { n: rows.length })}</Link>
          </div>
        )}
      </div>
      {rows.length === 0 ? (
        <div className="pf-card">
          <EmptyState
            title={PF_COPY.emptyPositions.title}
            body={PF_COPY.emptyPositions.body}
            flavor={PF_COPY.emptyPositions.flavor}
            action={{ label: PF_COPY.emptyPositions.action, onClick: onOpenMarkets }}
            headingLevel={3}
          />
        </div>
      ) : (
        <>
          <div className="pf-show">
            <Menu
              label={PF_COPY.show.label}
              groups={[
                {
                  label: PF_COPY.show.label,
                  value: metric,
                  onValueChange: (id) => setMetric(id as ShowMetric),
                  items: SHOW_ORDER.map((m) => ({ id: m, label: PF_COPY.show[m], onSelect: () => setMetric(m) })),
                },
              ]}
              align="start"
              trigger={
                <button type="button" className="pf-chip">
                  <span>
                    {PF_COPY.show.label}: {PF_COPY.show[metric]}
                  </span>
                  <ChevronDown size={14} strokeWidth={2.5} aria-hidden="true" />
                </button>
              }
            />
            <TermTip id={termFor[metric]} />
          </div>
          <ul className="ios-list__card" role="list">
            {rows.slice(0, 5).map((r) => (
              <HoldingRow key={r.companyId} row={r} metric={metric} currency={currency} />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

/* ─── 6. Recent activity ─────────────────────────────────────────────────────── */

export function RecentActivity({ items, currency }: { items: ActivityItem[]; currency: CurrencyNames }) {
  if (items.length === 0) {
    return (
      <InsetGroupedList header={PF_COPY.recentActivity} className="pf-recent">
        <li className="pf-card-item">
          <EmptyState title={PF_COPY.emptyOrders.title} body={PF_COPY.emptyOrders.body} flavor={PF_COPY.emptyOrders.flavor} headingLevel={3} />
        </li>
      </InsetGroupedList>
    );
  }
  return (
    <InsetGroupedList header={PF_COPY.recentActivity} headerAction={<Link to="/portfolio/activity">{PF_COPY.seeAll}</Link>} className="pf-recent">
      {items.slice(0, 3).map((i) => (
        <ActivityRow key={i.orderNumber} item={i} currency={currency} />
      ))}
    </InsetGroupedList>
  );
}

/* ─── 7. Footer ──────────────────────────────────────────────────────────────── */

export function PricesFooter({ game }: { game: GameState | null }) {
  if (!game || game.lastTickAt == null) return null;
  return (
    <p className="pf-footer num">
      {fillIn(PF_COPY.pricesFooter, { tickSeconds: Math.round(game.tickIntervalMs / 1000), time: formatTickTime(game.lastTickAt) })}
    </p>
  );
}
