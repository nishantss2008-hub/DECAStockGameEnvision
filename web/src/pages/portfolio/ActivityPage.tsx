/**
 * Activity (MOBILE §7.5): back to Portfolio · filter menu (All, Buys, Sells, Needs attention) → one plain
 * "Session n" group per session, newest first → last group: Balances. Rows open Order detail.
 */
import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ListFilter } from 'lucide-react';
import { EmptyState } from '../../components/ios/EmptyState';
import { InsetGroupedList } from '../../components/ios/InsetGroupedList';
import { DisclosureRow } from '../../components/ios/ListRow';
import { LargeTitleNavBar, NavBarButton } from '../../components/ios/LargeTitleNavBar';
import { Menu } from '../../components/ios/Menu';
import { SkeletonGroup, SkeletonList } from '../../components/ios/Skeleton';
import { filterActivity, groupBySession, type ActivityFilter } from '../../components/portfolio/activity';
import { PF_COPY } from '../../components/portfolio/PortfolioSections';
import { ActivityRow } from '../../components/portfolio/rows';
import { useActivityItems } from '../../components/portfolio/usePortfolioView';
import '../../components/portfolio/portfolio.css';
import { ERRORS, LOADING } from '../../shell/copy';
import { useShellGame } from '../../shell/ShellData';
import { useDocumentTitle, useStackBack } from '../../shell/StubPage';
import { DEFAULT_CURRENCY } from '../../components/ios/signedText';

export const ACTIVITY_FILTERS: { id: ActivityFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'buys', label: 'Buys' },
  { id: 'sells', label: 'Sells' },
  { id: 'attention', label: 'Needs attention' },
];

export default function ActivityPage() {
  useDocumentTitle('Activity');
  const back = useStackBack('/portfolio');
  const [params, setParams] = useSearchParams();
  const filter = ACTIVITY_FILTERS.find((f) => f.id === params.get('filter'))?.id ?? 'all';
  const { items, loading, error } = useActivityItems();
  const { game } = useShellGame();
  const currency = game?.currency ?? DEFAULT_CURRENCY;
  const groups = useMemo(() => groupBySession(filterActivity(items, filter)), [items, filter]);

  const setFilter = (id: string) => {
    const next = new URLSearchParams(params);
    if (id === 'all') next.delete('filter');
    else next.set('filter', id);
    setParams(next, { replace: true, preventScrollReset: true });
  };
  const filterLabel = ACTIVITY_FILTERS.find((f) => f.id === filter)!.label;

  const trailing = (
    <Menu
      groups={[{ label: 'Show', value: filter, onValueChange: setFilter, items: ACTIVITY_FILTERS.map((f) => ({ id: f.id, label: f.label, onSelect: () => setFilter(f.id) })) }]}
      trigger={<NavBarButton label={`Filter activity, ${filterLabel}`} icon={ListFilter} />}
    />
  );

  let content;
  if (error && items.length === 0) {
    content = (
      <EmptyState title={ERRORS.pageLoad.title} body={ERRORS.pageLoad.body} action={{ label: ERRORS.pageLoad.action, onClick: () => window.location.reload() }} />
    );
  } else if (loading) {
    content = (
      <SkeletonGroup label={LOADING.generic.title}>
        <SkeletonList rows={6} />
      </SkeletonGroup>
    );
  } else {
    content = (
      <>
        {groups.length === 0 ? (
          <div className="pf-card">
            <EmptyState title={PF_COPY.emptyOrders.title} body={PF_COPY.emptyOrders.body} flavor={PF_COPY.emptyOrders.flavor} />
          </div>
        ) : (
          groups.map((g) => (
            <InsetGroupedList key={g.session} header={`Session ${g.session}`} headerVariant="plain">
              {g.items.map((i) => (
                <ActivityRow key={i.orderNumber} item={i} currency={currency} />
              ))}
            </InsetGroupedList>
          ))
        )}
        <InsetGroupedList aria-label="Balances" className="pf-balances-link">
          <DisclosureRow title="Balances" to="/portfolio/balances" />
        </InsetGroupedList>
      </>
    );
  }

  return (
    <>
      <LargeTitleNavBar title="Activity" back={back} trailing={trailing} />
      <div className="bx-page pf-page">{content}</div>
    </>
  );
}
