/**
 * Compare (spec 2026-09-16 §4, MOBILE §7.6b) — `/markets/compare?view=&sort=&sector=`.
 *
 * The five-way metric table that used to sit under the Markets list. It kept every metric set it
 * had (Basics, Price, Value, Health, Analysts) and every column in each; what changed is that it is
 * now a screen of its own, reached from the Markets sort menu, so the density is the point rather
 * than an interruption.
 *
 * Companies only. Funds have no fundamentals to compare — a fund's numbers are its holdings' — so
 * showing them here as a row of dashes would teach the wrong thing. The Markets list is where a
 * fund and a company stand side by side.
 */
import { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { LargeTitleNavBar } from '../../components/ios/LargeTitleNavBar';
import { SkeletonGroup, SkeletonList } from '../../components/ios/Skeleton';
import { CompaniesSection, ColumnsHelpSheet } from '../../components/market/CompaniesSection';
import { LOADING, MARKETS } from '../../components/market/marketCopy';
import { parseMarketsQuery, withMarketsQuery, type MarketsQuery } from '../../components/market/marketsView';
import '../../components/market/market.css';
import { useAllFundamentals } from '../../hooks/useAllFundamentals';
import { useCompanies } from '../../hooks/useCompanies';
import { sessionInfo } from '../../lib/gameTime';
import { useShellGame } from '../../shell/ShellData';
import { useDocumentTitle, useStackBack } from '../../shell/StubPage';

export default function ComparePage() {
  useDocumentTitle(MARKETS.compareTitle);
  const location = useLocation();
  const navigate = useNavigate();
  const back = useStackBack('/markets');
  const { game } = useShellGame();
  const { companies, loading } = useCompanies();
  const { byId: fundamentals } = useAllFundamentals(game?.marketCreatedAt ?? null);

  const query = useMemo(() => parseMarketsQuery(location.search), [location.search]);
  const onQuery = (patch: Partial<MarketsQuery>) =>
    navigate({ pathname: location.pathname, search: withMarketsQuery(location.search, patch), hash: '' }, { replace: true, preventScrollReset: true, state: location.state });

  const tick = game?.currentTick ?? 0;
  const sessionStart = sessionInfo(tick, game?.sessionTicks ?? 1).startTick;

  return (
    <>
      <LargeTitleNavBar title={MARKETS.compareTitle} back={back} />
      <div className="bx-page bx-markets bx-compare">
        <p className="bx-compare__intro t-footnote">{MARKETS.compareIntro}</p>
        {loading && companies.length === 0 ? (
          <SkeletonGroup label={LOADING.prices.title}>
            <SkeletonList rows={8} rowHeight={76} />
          </SkeletonGroup>
        ) : (
          <CompaniesSection
            companies={companies}
            fundamentals={fundamentals}
            query={query}
            onQuery={onQuery}
            sessionStartTick={sessionStart}
            currentTick={tick}
          />
        )}
      </div>
      <ColumnsHelpSheet />
    </>
  );
}
