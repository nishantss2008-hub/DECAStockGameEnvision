/**
 * Live data for the Company, Financials and All stats pages (MOBILE §7.7–§7.8), from the `:ticker` route param:
 * the company and its research profile, sector averages (useAllFundamentals + compare.ts), the crew's holding,
 * the game clock and currency.
 */
import { useEffect, useMemo, useState, type RefObject } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import type { Company, Fundamentals, Holding } from '@deca/shared';
import { useCompanies } from '../../hooks/useCompanies';
import { useCompany } from '../../hooks/useCompany';
import { useAllFundamentals } from '../../hooks/useAllFundamentals';
import { usePortfolio } from '../../hooks/usePortfolio';
import { sectorAverages, type SectorAverage, type MetricId } from '../../lib/compare';
import { formatTickTime } from '../../lib/format';
import { useShellGame } from '../../shell/ShellData';
import { DEFAULT_CURRENCY, type CurrencyNames } from '../ios/signedText';

export interface CompanyData {
  ticker: string;
  /** "/markets/company/KRKN" in whichever tab stack the page lives. */
  basePath: string;
  company: Company | null;
  fundamentals: Fundamentals | null;
  companiesById: Record<string, Company>;
  holding: Holding | null;
  /** Every holding of the crew, for the live account value. */
  holdings: readonly Holding[];
  averageFor: (id: MetricId) => SectorAverage | null;
  currency: CurrencyNames;
  timeText: string;
  loading: boolean;
  notFound: boolean;
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
  const listed = byTicker[ticker] ?? null;
  const { company: live, fundamentals, loading: companyLoading, error: companyError } = useCompany(listed?.id ?? null);
  const { game } = useShellGame();
  const { holdings } = usePortfolio();
  const all = useAllFundamentals(game?.marketCreatedAt ?? null);
  const company = live ?? listed;

  const averages = useMemo(() => {
    const funds = { ...all.byId };
    if (company && fundamentals && !funds[company.id]) funds[company.id] = fundamentals;
    return Object.keys(funds).length ? sectorAverages(funds, byId) : null;
  }, [all.byId, byId, company, fundamentals]);

  const holding = company ? (holdings.find((h) => h.companyId === company.id) ?? null) : null;
  const tickAt = game && company && game.lastTickAt && company.lastTick <= game.currentTick
    ? game.lastTickAt - (game.currentTick - company.lastTick) * game.tickIntervalMs
    : null;

  return {
    ticker,
    basePath: companyBasePath(pathname, ticker),
    company,
    fundamentals,
    companiesById: byId,
    holding,
    holdings,
    averageFor: (id) => (averages && company ? averages(id, company.sector) : null),
    currency: game?.currency ?? DEFAULT_CURRENCY,
    timeText: tickAt ? formatTickTime(tickAt) : '—',
    loading: listLoading || (Boolean(listed) && companyLoading && !company),
    notFound: !listLoading && !listed,
    error: listError ?? companyError ?? null,
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
