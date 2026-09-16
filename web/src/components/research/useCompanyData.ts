/**
 * Live data for the Company, Financials and All stats pages (MOBILE §7.7–§7.8), from the `:ticker` route param:
 * the instrument and its research profile, peer comparisons (useAllFundamentals + compare.ts), the crew's holding,
 * the game clock and currency.
 *
 * The `:ticker` route serves BOTH kinds (spec 2026-09-16 §3), so this hook resolves an
 * `Instrument` and then narrows:
 *   - `instrument` — whatever the ticker named; the header, chart, position and trade buttons use it;
 *   - `company` — set only when the ticker is a company, so every fundamentals-shaped section
 *     (Key stats, All stats, Financials, analyst view) simply does not render for a fund;
 *   - `fund` — set only when it is a fund, and carries the public holdings and weights.
 *
 * `notFound` therefore means "no COMPANY by that ticker", which is exactly right for the two pages
 * that only exist for companies: `/…/stats` and `/…/financials` show their empty state for a fund
 * rather than an empty shell of dashes.
 */
import { useEffect, useMemo, useState, type RefObject } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { isFund, type Company, type Fund, type Fundamentals, type Holding, type Instrument } from '@deca/shared';
import { useCompanies } from '../../hooks/useCompanies';
import { useCompany } from '../../hooks/useCompany';
import { useFunds } from '../../hooks/useInstruments';
import { useAllFundamentals } from '../../hooks/useAllFundamentals';
import { usePortfolio } from '../../hooks/usePortfolio';
import { peerComparisons, type PeerComparison, type MetricId } from '../../lib/compare';
import { formatTickTime } from '../../lib/format';
import { useShellGame } from '../../shell/ShellData';
import { DEFAULT_CURRENCY, type CurrencyNames } from '../ios/signedText';

export interface CompanyData {
  ticker: string;
  /** "/markets/company/KRKN" in whichever tab stack the page lives. */
  basePath: string;
  /** Whatever the ticker named: a company or a fund. */
  instrument: Instrument | null;
  /** Set only when the ticker is a company. */
  company: Company | null;
  /** Set only when the ticker is a fund; holdings and weights are public. */
  fund: Fund | null;
  fundamentals: Fundamentals | null;
  companiesById: Record<string, Company>;
  /** Companies AND funds by id: a crew's holdings can name either, so account value needs both. */
  instrumentsById: Record<string, Instrument>;
  holding: Holding | null;
  /** Every holding of the crew, for the live account value. */
  holdings: readonly Holding[];
  /** The COPY §3.2 comparison for this company: its sector peers, never itself. */
  averageFor: (id: MetricId) => PeerComparison | null;
  currency: CurrencyNames;
  timeText: string;
  loading: boolean;
  /** No COMPANY by this ticker. True for a fund, which is what /stats and /financials want. */
  notFound: boolean;
  /** No instrument at all by this ticker. */
  unknownTicker: boolean;
  error: string | null;
}

export function companyBasePath(pathname: string, ticker: string): string {
  const tab = pathname.split('/')[1] || 'markets';
  return `/${tab}/company/${ticker.toUpperCase()}`;
}

export function useCompanyData(): CompanyData {
  const { ticker: raw = '' } = useParams();
  const ticker = raw.toUpperCase();
  const { pathname } = useLocation();
  const { byId, byTicker, loading: listLoading, error: listError } = useCompanies();
  const { byId: fundsById, byTicker: fundsByTicker, loading: fundsLoading, error: fundsError } = useFunds();
  const listedCompany = byTicker[ticker] ?? null;
  const listedFund = fundsByTicker[ticker] ?? null;
  const { company: live, fundamentals, loading: companyLoading, error: companyError } = useCompany(listedCompany?.id ?? null);
  const { game } = useShellGame();
  const { holdings } = usePortfolio();
  const all = useAllFundamentals(game?.marketCreatedAt ?? null);
  const company = live ?? listedCompany;
  const instrument: Instrument | null = company ?? listedFund;

  const averages = useMemo(() => {
    const byCompany = { ...all.byId };
    if (company && fundamentals && !byCompany[company.id]) byCompany[company.id] = fundamentals;
    return Object.keys(byCompany).length ? peerComparisons(byCompany, byId) : null;
  }, [all.byId, byId, company, fundamentals]);

  const holding = instrument ? (holdings.find((h) => h.companyId === instrument.id) ?? null) : null;
  const tickAt = game && instrument && game.lastTickAt && instrument.lastTick <= game.currentTick
    ? game.lastTickAt - (game.currentTick - instrument.lastTick) * game.tickIntervalMs
    : null;
  const rosterLoading = listLoading || fundsLoading;

  return {
    ticker,
    basePath: companyBasePath(pathname, ticker),
    instrument,
    company,
    fund: instrument && isFund(instrument) ? instrument : null,
    fundamentals,
    companiesById: byId,
    instrumentsById: { ...byId, ...fundsById },
    holding,
    holdings,
    averageFor: (id) => (averages && company ? averages(id, company) : null),
    currency: game?.currency ?? DEFAULT_CURRENCY,
    timeText: tickAt ? formatTickTime(tickAt) : '—',
    loading: rosterLoading || (Boolean(listedCompany) && companyLoading && !company),
    notFound: !rosterLoading && !listedCompany,
    unknownTicker: !rosterLoading && !listedCompany && !listedFund,
    error: listError ?? fundsError ?? companyError ?? null,
  };
}

/** True once the element's bottom edge scrolls under the fixed top bar (drives the collapsed company bar). */
export function useScrolledPast(ref: RefObject<HTMLElement | null>, offset = 96): boolean {
  const [past, setPast] = useState(false);
  useEffect(() => {
    let frame = 0;
    const check = () => {
      frame = 0;
      const el = ref.current;
      if (el) setPast(el.getBoundingClientRect().bottom < offset);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(check);
    };
    check();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [ref, offset]);
  return past;
}
