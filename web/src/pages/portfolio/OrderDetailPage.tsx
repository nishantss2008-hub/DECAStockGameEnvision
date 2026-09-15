/**
 * Order detail (MOBILE §7.5), `/portfolio/activity/:orderId` (the order number, e.g. BX-7Q2F9K): header card
 * (icon · "Bought 500 KRKN" · status pill) → KeyValue card with a "?" on every row that has a glossary term
 * → Plain "View KRKN" button.
 */
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '../../components/ios/Button';
import { EmptyState } from '../../components/ios/EmptyState';
import { InsetGroupedList } from '../../components/ios/InsetGroupedList';
import { KeyValueRow } from '../../components/ios/ListRow';
import { LargeTitleNavBar } from '../../components/ios/LargeTitleNavBar';
import { TagPill } from '../../components/ios/Pill';
import { SkeletonGroup, SkeletonList } from '../../components/ios/Skeleton';
import { DEFAULT_CURRENCY } from '../../components/ios/signedText';
import { findActivity, orderDetailLines } from '../../components/portfolio/activity';
import { ActivityIcon, LineValue, companyPath } from '../../components/portfolio/rows';
import { TermTip } from '../../components/portfolio/TermTip';
import { useActivityItems } from '../../components/portfolio/usePortfolioView';
import '../../components/portfolio/portfolio.css';
import { ERRORS, LOADING } from '../../shell/copy';
import { useShellGame } from '../../shell/ShellData';
import { useDocumentTitle, useStackBack } from '../../shell/StubPage';

export default function OrderDetailPage() {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const back = useStackBack('/portfolio/activity');
  const { items, loading } = useActivityItems();
  const { game } = useShellGame();
  const item = findActivity(items, orderId);
  useDocumentTitle(item ? `Order ${item.orderNumber}` : 'Order');

  let content;
  if (loading) {
    content = (
      <SkeletonGroup label={LOADING.generic.title}>
        <SkeletonList rows={8} rowHeight={44} />
      </SkeletonGroup>
    );
  } else if (!item) {
    content = (
      <EmptyState
        title={ERRORS.pageLoad.title}
        body={ERRORS.pageLoad.body}
        action={{ label: 'Activity', onClick: () => navigate('/portfolio/activity', { replace: true }) }}
      />
    );
  } else {
    const currency = game?.currency ?? DEFAULT_CURRENCY;
    const lines = orderDetailLines(item, game?.feeBps ?? 10, currency.symbol);
    content = (
      <>
        <div className="pf-order-header">
          <ActivityIcon kind={item.kind} size={44} />
          <h2 className="t-title-2 t-emph">{item.title}</h2>
          <TagPill>{item.status}</TagPill>
        </div>
        <InsetGroupedList aria-label="Order details" className="pf-order-lines">
          {lines.map((l) => (
            <KeyValueRow
              key={l.label}
              label={l.label}
              info={l.termId ? <TermTip id={l.termId} /> : undefined}
              value={<LineValue line={l} currency={currency} mono={l.label === 'Order number'} />}
            />
          ))}
        </InsetGroupedList>
        <div className="pf-order-actions">
          <Button variant="plain" size="medium" onClick={() => navigate(companyPath(item.ticker))}>
            {`View ${item.ticker}`}
          </Button>
        </div>
      </>
    );
  }

  return (
    <>
      <LargeTitleNavBar title="Order" back={{ ...back, label: 'Activity' }} />
      <div className="bx-page pf-page">{content}</div>
    </>
  );
}
