/**
 * The Markets list (spec 2026-09-16 §4, MOBILE §7.6): Apple Stocks semantics — one row per
 * instrument, two sections, **Funds** first and then **Companies grouped by sector**.
 *
 * Every row is the same StockRow the rest of the app uses (crest · ticker over name · sparkline ·
 * price over change pill), so a fund and a company are the same object on screen and neither needs
 * a second row pattern. The five-way metric table is not here: comparing is its own screen
 * (`/markets/compare`), because a dense table is only right when comparing is the whole job.
 *
 * Hidden-data rule: a fund's holdings and weights are public, so a fund row may say what it holds;
 * nothing about quality or grades appears anywhere before the game ends.
 */
import { Link } from 'react-router-dom';
import type { Company, Fund } from '@deca/shared';
import { Sparkline } from '../charts/Sparkline';
import { InsetGroupedList } from '../ios/InsetGroupedList';
import { StockRow } from '../ios/ListRow';
import { changeParts } from '../ios/changeText';
import { useHistory } from '../../hooks/useHistory';
import { formatMoney, formatMoneySpoken } from '../../lib/format';
import { sectorSlug } from '../../lib/sector';
import { fill } from '../../shell/copy';
import { companyPath } from './MarketSections';
import { MARKETS } from './marketCopy';
import type { SectorGroup } from './marketsView';

export interface RowSparkProps {
  /** Instrument id: a fund's series is read from `/api/funds/:id/history`. */
  id: string;
  kind: 'company' | 'fund';
  reference: number;
  from: number;
  to: number;
}

/** 48×20 session sparkline, referenced to the session open so its fill shows the day's direction. */
export function RowSpark({ id, kind, reference, from, to }: RowSparkProps) {
  const { points } = useHistory(id, from, to, kind);
  const values = points.map((p) => p.price);
  if (values.length < 2) return null;
  return <Sparkline values={values} width={48} height={20} reference={reference} />;
}

export interface InstrumentRowProps {
  sessionStartTick: number;
  currentTick: number;
}

/**
 * A fund row. Identical to a company row except for the crest colour (a sector fund takes the
 * sector it tracks; the broad fund has none) and the spoken label, which names it as a fund so a
 * VoiceOver user is never told a basket is a company.
 */
export function FundStockRow({ fund, sessionStartTick, currentTick }: { fund: Fund } & InstrumentRowProps) {
  return (
    <StockRow
      to={companyPath(fund.ticker)}
      ticker={fund.ticker}
      name={fund.name}
      sector={fund.sector}
      priceText={formatMoney(fund.currentPrice)}
      priceSpoken={formatMoneySpoken(fund.currentPrice)}
      change={fund.sessionChange}
      changeContext={MARKETS.thisSession}
      aria-label={[fund.name, fund.ticker, MARKETS.fundBadge, formatMoneySpoken(fund.currentPrice), `${changeParts(fund.sessionChange).spoken} ${MARKETS.thisSession}`].join(', ')}
      sparkline={<RowSpark id={fund.id} kind="fund" reference={fund.sessionOpen} from={sessionStartTick} to={currentTick} />}
    />
  );
}


export function CompanyRow({ company, sessionStartTick, currentTick }: { company: Company } & InstrumentRowProps) {
  return (
    <StockRow
      to={companyPath(company.ticker)}
      ticker={company.ticker}
      name={company.name}
      sector={company.sector}
      priceText={formatMoney(company.currentPrice)}
      priceSpoken={formatMoneySpoken(company.currentPrice)}
      change={company.sessionChange}
      changeContext={MARKETS.thisSession}
      sparkline={<RowSpark id={company.id} kind="company" reference={company.sessionOpen} from={sessionStartTick} to={currentTick} />}
    />
  );
}

/** Section 1: the funds, in server order (broad fund first). Silent when the server sent none. */
export function FundsSection({ funds, sessionStartTick, currentTick }: { funds: readonly Fund[] } & InstrumentRowProps) {
  if (funds.length === 0) return null;
  return (
    <InsetGroupedList header={MARKETS.funds} className="bx-section" footer={MARKETS.fundsNote}>
      {funds.map((f) => (
        <FundStockRow key={f.id} fund={f} sessionStartTick={sessionStartTick} currentTick={currentTick} />
      ))}
    </InsetGroupedList>
  );
}

/**
 * Section 2: the companies, one group per sector with its own header. The header links to the
 * sector screen, which is where the sector index and its members already live.
 */
export function SectorGroupsSection({ groups, sessionStartTick, currentTick }: { groups: readonly SectorGroup[] } & InstrumentRowProps) {
  if (groups.length === 0) return null;
  return (
    <section id="companies" className="bx-section bx-sector-groups" aria-labelledby="bx-companies-title">
      <div className="bx-section__header">
        <h2 id="bx-companies-title" className="bx-section__title">
          {MARKETS.companies}
        </h2>
        <Link className="bx-section__action" to="/markets/compare">
          {MARKETS.compare}
        </Link>
      </div>
      <div className="bx-stack">
        {groups.map((g) => (
          <InsetGroupedList
            key={g.sector}
            header={g.name}
            headerVariant="plain"
            headingLevel={3}
            headerAction={
              <Link className="bx-group-link" to={`/markets/sector/${sectorSlug(g.sector)}`}>
                {fill(MARKETS.seeGroup, { sector: g.name })}
              </Link>
            }
          >
            {g.companies.map((c) => (
              <CompanyRow key={c.id} company={c} sessionStartTick={sessionStartTick} currentTick={currentTick} />
            ))}
          </InsetGroupedList>
        ))}
      </div>
      <p className="bx-footer t-footnote">{MARKETS.helper}</p>
    </section>
  );
}
