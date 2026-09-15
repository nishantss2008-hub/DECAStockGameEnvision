/**
 * Portfolio tab root (MOBILE §7.3): walkthrough card slot → account summary → account value chart
 * (range tabs, starting-cash baseline, Pirate Composite compare) → Cash available + Rank tiles →
 * top 5 positions with the Show menu → recent activity → prices footer.
 */
import { useNavigate } from 'react-router-dom';
import { ArrowLeftRight } from 'lucide-react';
import { NavBarButton } from '../../components/ios/LargeTitleNavBar';
import { EmptyState } from '../../components/ios/EmptyState';
import { SkeletonChart, SkeletonGroup, SkeletonHeader, SkeletonList } from '../../components/ios/Skeleton';
import {
  AccountChart,
  AccountSummary,
  AccountTiles,
  PricesFooter,
  RecentActivity,
  TopPositions,
} from '../../components/portfolio/PortfolioSections';
import { useActivityItems, usePortfolioView } from '../../components/portfolio/usePortfolioView';
import '../../components/portfolio/portfolio.css';
import { useLeaderboard } from '../../hooks/useLeaderboard';
import { useMarket } from '../../hooks/useMarket';
import { useAuth } from '../../lib/auth';
import { ShellNavBar } from '../../shell/ShellNavBar';
import { useDocumentTitle } from '../../shell/StubPage';
import { useSheet } from '../../shell/useSheet';
import { WalkthroughCard } from '../../shell/WalkthroughCard';
import { ERRORS, LOADING } from '../../shell/copy';

export default function PortfolioPage() {
  useDocumentTitle('Portfolio');
  const navigate = useNavigate();
  const { open } = useSheet();
  const { teamId } = useAuth();
  const view = usePortfolioView();
  const activity = useActivityItems();
  const { market } = useMarket();
  const { leaderboard } = useLeaderboard();
  const { team, totals, rows, game, clock, currency } = view;

  const trade = (
    <NavBarButton label="Trade" icon={ArrowLeftRight} aria-haspopup="dialog" onClick={() => open({ kind: 'trade', ticker: null, side: 'buy' })} />
  );

  let content;
  if (view.error && !team) {
    content = (
      <EmptyState
        title={ERRORS.pageLoad.title}
        body={ERRORS.pageLoad.body}
        flavor={ERRORS.pageLoad.flavor}
        action={{ label: ERRORS.pageLoad.action, onClick: () => window.location.reload() }}
      />
    );
  } else if (view.loading || !team || !totals) {
    content = (
      <SkeletonGroup label={LOADING.generic.title}>
        <div className="pf-skeleton">
          <SkeletonHeader />
          <SkeletonChart plotHeight={180} />
          <SkeletonList rows={5} />
        </div>
      </SkeletonGroup>
    );
  } else {
    const started = Boolean(game && game.phase !== 'lobby');
    content = (
      <>
        <AccountSummary
          totalValue={team.totalValue}
          totals={totals}
          compositeChange={started && market ? market.composite.change : null}
          currency={currency}
        />
        <AccountChart
          teamId={teamId}
          game={game}
          clock={clock}
          totalValue={team.totalValue}
          startingCapital={view.startingCapital}
          compositeOpen={market?.composite.open ?? null}
          currency={currency}
        />
        <AccountTiles cash={team.cashBalance} cashPct={totals.cashPct} rank={team.rank} crews={leaderboard?.entries.length ?? 0} currency={currency} />
        <TopPositions rows={rows} currency={currency} onOpenMarkets={() => navigate('/markets')} />
        {!activity.loading && <RecentActivity items={activity.items} currency={currency} />}
        <PricesFooter game={game} />
      </>
    );
  }

  return (
    <>
      <ShellNavBar title="Portfolio" actions={trade} />
      <div className="bx-page pf-page">
        <WalkthroughCard />
        {content}
      </div>
    </>
  );
}
