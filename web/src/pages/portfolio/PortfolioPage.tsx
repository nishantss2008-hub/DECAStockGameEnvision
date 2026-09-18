/**
 * Portfolio tab root (MOBILE §7.3): account summary → account value chart (range tabs,
 * starting-cash baseline, Pirate Composite compare) → Cash available + Rank tiles → top 5 positions
 * with the Show menu → the Activity row → prices footer.
 *
 * 2026-09-17: no walkthrough card above the summary (the required "Meet the market" flow covers the
 * same ground, and Learn replays it) and no three-row "Recent activity" block — Activity is one
 * labelled row to the full list, which is where a crew reads its orders anyway.
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
  ActivityLink,
  PricesFooter,
  TopPositions,
} from '../../components/portfolio/PortfolioSections';
import { usePortfolioView } from '../../components/portfolio/usePortfolioView';
import '../../components/portfolio/portfolio.css';
import { useLeaderboard } from '../../hooks/useLeaderboard';
import { useMarket } from '../../hooks/useMarket';
import { useAuth } from '../../lib/auth';
import { ShellNavBar } from '../../shell/ShellNavBar';
import { useDocumentTitle } from '../../shell/StubPage';
import { useIntroGate } from '../../shell/useIntroGate';
import { ERRORS, LOADING } from '../../shell/copy';

export default function PortfolioPage() {
  useDocumentTitle('Portfolio');
  const navigate = useNavigate();
  const { openTrade } = useIntroGate();
  const { teamId } = useAuth();
  const view = usePortfolioView();
  const { market } = useMarket();
  const { leaderboard } = useLeaderboard();
  const { team, totals, rows, game, clock, currency } = view;

  const trade = (
    <NavBarButton label="Trade" icon={ArrowLeftRight} aria-haspopup="dialog" onClick={() => openTrade({ ticker: null, side: 'buy' })} />
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
        <ActivityLink />
        <PricesFooter game={game} />
      </>
    );
  }

  return (
    <>
      <ShellNavBar title="Portfolio" actions={trade} />
      <div className="bx-page pf-page">{content}</div>
    </>
  );
}
