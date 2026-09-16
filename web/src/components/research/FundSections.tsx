/**
 * A fund's detail screen (spec 2026-09-16 §3, MOBILE §7.7b).
 *
 * "What this fund holds" REPLACES Key stats. A fund has no earnings, no balance sheet, no analyst
 * and no news of its own, so those sections are absent here rather than rendered as empty shells of
 * dashes — an empty shell would teach a student that the numbers exist and are merely missing.
 *
 * What a fund does have is its basket, and that is PUBLIC by design: the constituent list, each
 * one's share of the fund's value, and each one's session change, plus one plain sentence saying
 * the price is those companies added together. Nothing about hidden quality or grades appears here,
 * before the game ends or at any other time.
 */
import type { Fund } from '@deca/shared';
import { InsetGroupedList } from '../ios/InsetGroupedList';
import { ListRow } from '../ios/ListRow';
import { ChangePill } from '../ios/Pill';
import { Crest } from '../ios/Crest';
import { changeParts } from '../ios/changeText';
import { RangeBar } from '../charts/RangeBar';
import { formatMoney, formatPct } from '../../lib/format';
import { FUNDS_EXTRA } from '../../lib/fundCopy';
import { companyPath } from '../market/MarketSections';
import type { FundHoldingRow } from '../market/marketsView';
import { formatMoneyCents, spokenMoney, type CurrencyNames } from '../ios/signedText';
import { sessionBounds } from './researchModel';
import { RESEARCH } from './researchCopy';

/** A constituent's share of the fund's value. One decimal: a three-way split reads "33.3%". */
function weightText(weight: number): string {
  return formatPct(weight, { digits: 1 });
}

/**
 * "What this fund holds": one row per constituent — crest, ticker over name, its share of the fund,
 * and its session change — then the session-range bar the quote block always carries.
 *
 * The rows link to the companies, because "what is Kraken?" is the next question a student asks
 * once they can see that the fund is a third Kraken.
 */
export function FundHoldingsSection({
  fund,
  rows,
  currency,
}: {
  fund: Fund;
  rows: readonly FundHoldingRow[];
  currency: CurrencyNames;
}) {
  const money = (cents: number) => formatMoneyCents(cents, currency);
  const { low, high } = sessionBounds(fund);
  return (
    <section className="rs-section rs-holdings" aria-labelledby="rs-holdings-title" aria-describedby="rs-holdings-note">
      <div className="ios-list__header" data-variant="prominent">
        <h2 id="rs-holdings-title" className="ios-list__title">
          {FUNDS_EXTRA.holdings.title}
        </h2>
      </div>
      {/* The one sentence the whole screen exists to say. */}
      <p className="t-subhead rs-holdings__lead">{FUNDS_EXTRA.fund.whyItMatters}</p>
      {rows.length === 0 ? (
        <p className="t-subhead rs-secondary">{FUNDS_EXTRA.holdings.empty}</p>
      ) : (
        <ul className="ios-list__card rs-holdings__card" role="list">
          {rows.map((row) => (
            <ListRow
              key={row.companyId}
              to={companyPath(row.ticker)}
              leading={<Crest ticker={row.ticker} sector={row.sector ?? undefined} size={32} />}
              leadingWidth={32}
              title={row.ticker}
              subtitle={row.name}
              aria-label={[
                row.name,
                row.ticker,
                `${weightText(row.weight)} ${FUNDS_EXTRA.holdings.weightLabel.toLowerCase()}`,
                `${changeParts(row.sessionChange).spoken} ${RESEARCH.thisSession}`,
              ].join(', ')}
              trailing={
                <>
                  <span className="rs-holdings__weight ios-num">{weightText(row.weight)}</span>
                  <ChangePill value={row.sessionChange} />
                </>
              }
            />
          ))}
        </ul>
      )}
      <div className="rs-range rs-card">
        <RangeBar
          low={low}
          high={high}
          value={fund.currentPrice}
          formatter={money}
          spokenFormatter={(v) => spokenMoney(v, currency)}
          label={RESEARCH.sessionRange}
          valueLabel={RESEARCH.priceNow}
        />
      </div>
      <p id="rs-holdings-note" className="ios-list__footer">
        {FUNDS_EXTRA.holdings.note} {FUNDS_EXTRA.fund.noNews}
      </p>
    </section>
  );
}

/**
 * About a fund: what it holds, what that does to the price, and the §13 caution — which never says
 * a fund is safe or better, only that spreading out cannot stop a market-wide fall.
 */
export function FundAboutSection({ fund, openPrice }: { fund: Fund; openPrice: number }) {
  return (
    <InsetGroupedList header={RESEARCH.about} className="rs-section">
      <li className="ios-row rs-card-row">
        <p className="t-body rs-about">{fund.description}</p>
      </li>
      <li className="ios-row rs-card-row">
        <p className="t-footnote rs-secondary">{FUNDS_EXTRA.fund.openPrice.replace('{price}', formatMoney(openPrice))}</p>
      </li>
    </InsetGroupedList>
  );
}
