/**
 * Portfolio list rows (MOBILE §5.5): HoldingRow (64, Portfolio top 5), PositionRow (88, swipe + long press,
 * Positions) and ActivityRow (64, Activity and Portfolio recent). Compositions of the iOS ListRow / SwipeActions.
 */
import { CircleMinus, CirclePlus, TriangleAlert } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ListRow } from '../ios/ListRow';
import { Crest } from '../ios/Crest';
import { SignedChange } from '../ios/SignedChange';
import { SwipeActions } from '../ios/SwipeActions';
import { changeParts } from '../ios/changeText';
import { formatMoneyCents, formatPercentPlain, spokenMoney, signedParts, type CurrencyNames } from '../ios/signedText';
import { formatNumber } from '../../lib/format';
import type { ActivityItem, ActivityKind, DetailLine } from './activity';
import { showMetricValue, type PositionRow as PositionRowData, type ShowMetric } from './derive';

export const companyPath = (ticker: string) => `/portfolio/company/${ticker}`;

const sharesText = (n: number) => `${formatNumber(n)} ${n === 1 ? 'share' : 'shares'}`;

/* ─── HoldingRow ─────────────────────────────────────────────────────────────── */

const SHOW_CONTEXT: Record<ShowMetric, string> = { totalGain: 'since you bought', session: 'this session', pctOfAccount: 'of account' };

export function HoldingRow({ row, metric, currency }: { row: PositionRowData; metric: ShowMetric; currency: CurrencyNames }) {
  const shown = showMetricValue(row, metric);
  const change =
    shown.kind === 'share' ? (
      <span className="pf-share t-footnote num" aria-hidden="true">
        {formatPercentPlain(shown.value, 1)}
      </span>
    ) : (
      <SignedChange value={shown.value} kind="money" pct={shown.pct} currency={currency} strong className="t-footnote" decorative />
    );
  const spokenChange =
    shown.kind === 'share'
      ? `${formatPercentPlain(shown.value, 1).replace('%', ' percent')} ${SHOW_CONTEXT[metric]}`
      : `${signedParts(shown.value, 'money', { currency }).spoken}, ${changeParts(shown.pct ?? 0).spoken} ${SHOW_CONTEXT[metric]}`;
  return (
    <ListRow
      to={companyPath(row.ticker)}
      className="pf-holding-row"
      leading={<Crest ticker={row.ticker} sector={row.sector} size={36} />}
      leadingWidth={36}
      title={<span className="t-headline">{row.ticker}</span>}
      subtitle={sharesText(row.shares)}
      chevron={false}
      trailing={
        <span className="pf-trailing-stack">
          <span className="t-body t-emph num">{formatMoneyCents(row.value, currency)}</span>
          {change}
        </span>
      }
      aria-label={`${row.name}, ${row.ticker}, ${sharesText(row.shares)}, ${spokenMoney(row.value, currency)}, ${spokenChange}`}
    />
  );
}

/* ─── PositionRow ────────────────────────────────────────────────────────────── */

export interface PositionRowProps {
  row: PositionRowData;
  currency: CurrencyNames;
  onTrade: (ticker: string, side: 'buy' | 'sell') => void;
  onOpen: (ticker: string) => void;
}

export function PositionRow({ row, currency, onTrade, onOpen }: PositionRowProps) {
  const total = signedParts(row.totalGain, 'money', { currency });
  const session = signedParts(row.sessionGain, 'money', { currency });
  const label = [
    `${row.name}, ${row.ticker}`,
    `current value ${spokenMoney(row.value, currency)}`,
    `total gain or loss ${total.spoken}, ${changeParts(row.totalPct).spoken}`,
    `${sharesText(row.shares)}, paid ${spokenMoney(row.avgCost, currency)} each`,
    `change this session ${session.spoken}`,
  ].join('. ');
  return (
    <li className="pf-swipe-item">
      <SwipeActions
        menuLabel={`Actions for ${row.ticker}`}
        actions={[
          { id: 'sell', label: 'Sell', icon: CircleMinus, tone: 'sell', onSelect: () => onTrade(row.ticker, 'sell') },
          { id: 'buy', label: 'Buy', icon: CirclePlus, tone: 'buy', onSelect: () => onTrade(row.ticker, 'buy') },
        ]}
        menuGroups={[
          {
            items: [
              { id: 'buy', label: 'Buy', icon: CirclePlus, onSelect: () => onTrade(row.ticker, 'buy') },
              { id: 'sell', label: 'Sell', icon: CircleMinus, onSelect: () => onTrade(row.ticker, 'sell') },
            ],
          },
          { items: [{ id: 'open', label: `View ${row.ticker}`, onSelect: () => onOpen(row.ticker) }] },
        ]}
      >
        <Link className="pf-position-row" to={companyPath(row.ticker)} aria-label={label} data-ticker={row.ticker}>
          <Crest ticker={row.ticker} sector={row.sector} size={36} className="pf-position-row__crest" />
          <span className="pf-position-row__main" aria-hidden="true">
            <span className="pf-position-row__line">
              <span className="t-headline">{row.ticker}</span>
              <span className="t-body t-emph num">{formatMoneyCents(row.value, currency)}</span>
            </span>
            <span className="pf-position-row__line pf-position-row__line--small">
              <span className="pf-position-row__name t-footnote">{row.name}</span>
              <SignedChange value={row.totalGain} kind="money" pct={row.totalPct} currency={currency} strong className="t-footnote" decorative />
            </span>
            <span className="pf-position-row__line pf-position-row__line--small">
              <span className="pf-position-row__name t-footnote num">
                {sharesText(row.shares)} · paid {formatMoneyCents(row.avgCost, currency)}
              </span>
              <SignedChange value={row.sessionGain} kind="money" currency={currency} strong className="t-footnote" decorative />
            </span>
          </span>
        </Link>
      </SwipeActions>
    </li>
  );
}

/* ─── ActivityRow ────────────────────────────────────────────────────────────── */

export function ActivityIcon({ kind, size = 32 }: { kind: ActivityKind; size?: 32 | 44 }) {
  const Icon = kind === 'buy' ? CirclePlus : kind === 'sell' ? CircleMinus : TriangleAlert;
  return (
    <span className="pf-icon-circle" data-size={size} aria-hidden="true">
      <Icon size={size === 44 ? 26 : 20} strokeWidth={1.75} />
    </span>
  );
}

export function ActivityRow({ item, currency }: { item: ActivityItem; currency: CurrencyNames }) {
  const netText = item.net === null ? '—' : formatMoneyCents(item.net, currency, { signed: true });
  const netSpoken = item.net === null ? 'nothing moved' : `cash ${item.net < 0 ? 'out' : 'in'} ${spokenMoney(Math.abs(item.net), currency)}`;
  return (
    <ListRow
      to={`/portfolio/activity/${item.orderNumber}`}
      className="pf-activity-row"
      leading={<ActivityIcon kind={item.kind} />}
      leadingWidth={32}
      title={item.title}
      subtitle={<span className="num pf-tertiary">{item.subtitle}</span>}
      trailing={
        <span className="pf-trailing-stack">
          <span className="t-body num">{netText}</span>
          <span className="t-footnote pf-secondary">{item.status}</span>
        </span>
      }
      aria-label={`${item.title}, ${item.subtitle}, ${netSpoken}, ${item.status}`}
    />
  );
}

/** A KeyValueRow value: money rows speak the currency name instead of the symbol (MOBILE §10). */
export function LineValue({ line, currency, mono = false }: { line: DetailLine; currency: CurrencyNames; mono?: boolean }) {
  if (line.cents === undefined) return <span className={mono ? 'font-mono' : undefined}>{line.value}</span>;
  return (
    <>
      <span aria-hidden="true">{line.value}</span>
      <span className="ios-sr-only">{spokenMoney(line.cents, currency)}</span>
    </>
  );
}
