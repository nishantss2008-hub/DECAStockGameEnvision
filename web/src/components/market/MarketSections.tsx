/**
 * Markets tab sections (MOBILE §7.6 rows 3–7): Pirate Composite card, breadth line, Industry groups chips,
 * Biggest moves, Watchlist.
 */
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { isFund, type Company, type IndexQuote, type Instrument, type MarketBreadth } from '@deca/shared';
import { Sparkline } from '../charts/Sparkline';
import { InsetGroupedList } from '../ios/InsetGroupedList';
import { ListRow, StockRow } from '../ios/ListRow';
import { SignedChange } from '../ios/SignedChange';
import { changeParts } from '../ios/changeText';
import { ChangeTriangle } from '../ios/Pill';
import { formatMoney, formatMoneySpoken } from '../../lib/format';
import { breadthText, compositeParts, type SectorChip } from './marketsView';
import { MARKETS } from './marketCopy';
import { TermTip } from './TermTip';

export function companyPath(ticker: string, tab: 'markets' | 'news' = 'markets'): string {
  return `/${tab}/company/${encodeURIComponent(ticker)}`;
}

export function CompanyStockRow({
  company,
  tab = 'markets',
  sparkline,
  onClick,
}: {
  company: Company;
  tab?: 'markets' | 'news';
  sparkline?: ReactNode;
  onClick?: () => void;
}) {
  return <InstrumentStockRow instrument={company} tab={tab} sparkline={sparkline} onClick={onClick} />;
}

/**
 * One row for either kind of instrument. A fund takes the crest colour of the sector it tracks (the
 * broad fund has none) and says "Fund" in its spoken label, so assistive tech never calls a basket a
 * company; everything else — path, price, change pill — is identical, which is the point.
 */
export function InstrumentStockRow({
  instrument,
  tab = 'markets',
  sparkline,
  onClick,
}: {
  instrument: Instrument;
  tab?: 'markets' | 'news';
  sparkline?: ReactNode;
  onClick?: () => void;
}) {
  const fund = isFund(instrument);
  const spoken = `${changeParts(instrument.sessionChange).spoken} ${MARKETS.thisSession}`;
  return (
    <StockRow
      to={companyPath(instrument.ticker, tab)}
      onClick={onClick}
      ticker={instrument.ticker}
      name={instrument.name}
      sector={fund ? instrument.sector : instrument.sector}
      priceText={formatMoney(instrument.currentPrice)}
      priceSpoken={formatMoneySpoken(instrument.currentPrice)}
      change={instrument.sessionChange}
      changeContext={MARKETS.thisSession}
      aria-label={
        fund
          ? [instrument.name, instrument.ticker, MARKETS.fundBadge, formatMoneySpoken(instrument.currentPrice), spoken].join(', ')
          : undefined
      }
      sparkline={sparkline}
    />
  );
}

export function CompositeCard({ quote, trend }: { quote: IndexQuote; trend: readonly number[] }) {
  const parts = compositeParts(quote);
  return (
    <section className="bx-composite" aria-labelledby="bx-composite-name">
      <div className="bx-composite__top">
        <div className="bx-composite__main">
          <span className="bx-label-q t-footnote">
            <span className="bx-composite__eyebrow">{MARKETS.compositeLabel}</span>
            <TermTip id="index" />
          </span>
          <h2 id="bx-composite-name" className="t-headline bx-composite__name">
            {MARKETS.compositeName}
          </h2>
          <span className="bx-composite__value num">{parts.valueText}</span>
        </div>
        {trend.length > 1 && <Sparkline values={trend} width={96} height={32} reference={quote.sessionOpen} className="bx-composite__spark" />}
      </div>
      <SignedChange className="bx-composite__line" kind="number" value={parts.points} pct={parts.sessionPct} suffix={MARKETS.thisSession} strong />
      <SignedChange className="bx-composite__line" kind="pct" value={parts.totalPct} suffix={MARKETS.sinceStart} strong />
    </section>
  );
}

export function BreadthLine({ breadth }: { breadth: Pick<MarketBreadth, 'advancers' | 'decliners' | 'unchanged'> }) {
  return (
    <p className="bx-breadth t-footnote">
      <span>{breadthText(breadth)}</span>
      <TermTip id="breadth" />
    </p>
  );
}

/** Signed % text coloured by direction with a triangle; spoken as "up 2.05 percent". */
export function ChangeText({ value, className }: { value: number; className?: string }) {
  const parts = changeParts(value);
  return (
    <span className={className ? `bx-chg num ${className}` : 'bx-chg num'} data-direction={parts.direction}>
      <span aria-hidden="true">
        {parts.direction !== 'flat' && <ChangeTriangle direction={parts.direction} />}
        {parts.text}
      </span>
      <span className="ios-sr-only">{parts.spoken}</span>
    </span>
  );
}

export function SectorChips({ chips }: { chips: readonly SectorChip[] }) {
  if (chips.length === 0) return null;
  return (
    <section className="bx-section" aria-labelledby="bx-sectors-title">
      <div className="bx-section__header">
        <h2 id="bx-sectors-title" className="bx-section__title">
          {MARKETS.industryGroups}
        </h2>
        <TermTip id="index" />
      </div>
      <ul className="bx-chips" role="list">
        {chips.map((chip) => (
          <li key={chip.sector}>
            <Link className="bx-chip" to={`/markets/sector/${chip.slug}`}>
              <span>{chip.name}</span>
              <ChangeText value={chip.sessionChange} />
              <span className="ios-sr-only">{MARKETS.thisSession}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function BiggestMoves({ up, down }: { up: readonly Company[]; down: readonly Company[] }) {
  return (
    <section className="bx-section" aria-labelledby="bx-moves-title">
      <div className="bx-section__header">
        <h2 id="bx-moves-title" className="bx-section__title">
          {MARKETS.biggestMoves}
        </h2>
        <TermTip id="sessionChange" />
      </div>
      {up.length === 0 && down.length === 0 ? (
        <p className="bx-muted t-subhead">{MARKETS.noMoves}</p>
      ) : (
        <div className="bx-stack">
          {up.length > 0 && (
            <InsetGroupedList header={MARKETS.up} headerVariant="plain" headingLevel={3}>
              {up.map((c) => (
                <CompanyStockRow key={c.id} company={c} />
              ))}
            </InsetGroupedList>
          )}
          {down.length > 0 && (
            <InsetGroupedList header={MARKETS.down} headerVariant="plain" headingLevel={3}>
              {down.map((c) => (
                <CompanyStockRow key={c.id} company={c} />
              ))}
            </InsetGroupedList>
          )}
        </div>
      )}
    </section>
  );
}

/** Starred instruments — funds are starrable exactly like companies (spec §3). */
export function WatchlistSection({ instruments }: { instruments: readonly Instrument[] }) {
  return (
    <InsetGroupedList header={MARKETS.watchlist} className="bx-section">
      {instruments.length === 0 ? (
        <ListRow title={MARKETS.watchlistEmpty.title} subtitle={MARKETS.watchlistEmpty.body} />
      ) : (
        instruments.map((c) => <InstrumentStockRow key={c.id} instrument={c} />)
      )}
    </InsetGroupedList>
  );
}
