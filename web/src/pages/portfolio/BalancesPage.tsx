/**
 * Balances (MOBILE §7.5): KeyValue card with a "?" on each row (COPY §1.3 `portfolio.*` display labels) and
 * the footer "Account value Ð… = cash + invested."
 */
import { EmptyState } from '../../components/ios/EmptyState';
import { InsetGroupedList } from '../../components/ios/InsetGroupedList';
import { KeyValueRow } from '../../components/ios/ListRow';
import { LargeTitleNavBar } from '../../components/ios/LargeTitleNavBar';
import { SkeletonGroup, SkeletonList } from '../../components/ios/Skeleton';
import { formatMoneyCents } from '../../components/ios/signedText';
import { balanceLines } from '../../components/portfolio/activity';
import { LineValue } from '../../components/portfolio/rows';
import { TermTip } from '../../components/portfolio/TermTip';
import { usePortfolioView } from '../../components/portfolio/usePortfolioView';
import '../../components/portfolio/portfolio.css';
import { ERRORS, LOADING } from '../../shell/copy';
import { useDocumentTitle, useStackBack } from '../../shell/StubPage';

export default function BalancesPage() {
  useDocumentTitle('Balances');
  const back = useStackBack('/portfolio/activity');
  const { team, totals, currency, loading, error } = usePortfolioView();

  let content;
  if (error && !team) {
    content = (
      <EmptyState title={ERRORS.pageLoad.title} body={ERRORS.pageLoad.body} action={{ label: ERRORS.pageLoad.action, onClick: () => window.location.reload() }} />
    );
  } else if (loading || !team || !totals) {
    content = (
      <SkeletonGroup label={LOADING.generic.title}>
        <SkeletonList rows={6} rowHeight={44} />
      </SkeletonGroup>
    );
  } else {
    const lines = balanceLines(
      { cash: team.cashBalance, invested: totals.invested, unrealized: totals.unrealized, realized: team.realizedPnl, fees: team.feesPaid, trades: team.tradeCount },
      currency.symbol,
    );
    content = (
      <InsetGroupedList aria-label="Balances" footer={`Account value ${formatMoneyCents(team.totalValue, currency)} = cash + invested.`}>
        {lines.map((l) => (
          <KeyValueRow key={l.label} label={l.label} info={l.termId ? <TermTip id={l.termId} /> : undefined} value={<LineValue line={l} currency={currency} />} />
        ))}
      </InsetGroupedList>
    );
  }

  return (
    <>
      <LargeTitleNavBar title="Balances" back={{ ...back, label: 'Activity' }} />
      <div className="bx-page pf-page">{content}</div>
    </>
  );
}
