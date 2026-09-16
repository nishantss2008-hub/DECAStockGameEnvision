/**
 * Positions (MOBILE §7.4): back to Portfolio · sort menu · "What these numbers mean" (`?sheet=help&set=positions`)
 * → summary strip (Invested, Unrealized, Session) → "Where your money is" allocation → PositionRows with
 * swipe Sell/Buy and a long-press menu (both open the Trade sheet at `?sheet=trade`) → swipe hint footer.
 */
import { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowUpDown, CircleQuestionMark } from 'lucide-react';
import { AllocationBar } from '../../components/charts/AllocationBar';
import { EmptyState } from '../../components/ios/EmptyState';
import { InsetGroupedList } from '../../components/ios/InsetGroupedList';
import { LargeTitleNavBar, NavBarButton } from '../../components/ios/LargeTitleNavBar';
import { Menu } from '../../components/ios/Menu';
import { MoneyText, SignedChange } from '../../components/ios/SignedChange';
import { SkeletonGroup, SkeletonList } from '../../components/ios/Skeleton';
import { PF_COPY } from '../../components/portfolio/PortfolioSections';
import { NUMBERS_HELP_TITLE, PositionsHelpSheet } from '../../components/portfolio/PositionsHelpSheet';
import { PositionRow, companyPath } from '../../components/portfolio/rows';
import { TermTip } from '../../components/portfolio/TermTip';
import { allocationItems, sortPositions, type PositionSort } from '../../components/portfolio/derive';
import { usePortfolioView } from '../../components/portfolio/usePortfolioView';
import '../../components/portfolio/portfolio.css';
import { ERRORS, LOADING } from '../../shell/copy';
import { useDocumentTitle, useStackBack } from '../../shell/StubPage';
import { useSheet } from '../../shell/useSheet';
import { useIntroGate } from '../../shell/useIntroGate';

const SORTS: { id: PositionSort; label: string }[] = [
  { id: 'value', label: 'Value' },
  { id: 'totalPct', label: 'Total gain %' },
  { id: 'session', label: 'Session change' },
  { id: 'name', label: 'Name' },
];

export const SWIPE_HINT = 'Swipe a row for Buy and Sell, or open the company.';

export default function PositionsPage() {
  useDocumentTitle('Positions');
  const back = useStackBack('/portfolio');
  const navigate = useNavigate();
  const { sheet, open, close } = useSheet();
  const { openTrade } = useIntroGate();
  const [params, setParams] = useSearchParams();
  const sort = (SORTS.find((s) => s.id === params.get('sort'))?.id ?? 'value') as PositionSort;
  const { team, rows, totals, currency, loading, error } = usePortfolioView();
  const sorted = useMemo(() => sortPositions(rows, sort), [rows, sort]);

  const setSort = (id: string) => {
    const next = new URLSearchParams(params);
    if (id === 'value') next.delete('sort');
    else next.set('sort', id);
    setParams(next, { replace: true, preventScrollReset: true });
  };

  const trailing = (
    <span className="bx-navbar-trailing">
      <Menu
        groups={[{ label: 'Sort by', value: sort, onValueChange: setSort, items: SORTS.map((s) => ({ id: s.id, label: s.label, onSelect: () => setSort(s.id) })) }]}
        trigger={<NavBarButton label="Sort positions" icon={ArrowUpDown} />}
      />
      <NavBarButton label={NUMBERS_HELP_TITLE} icon={CircleQuestionMark} aria-haspopup="dialog" onClick={() => open({ kind: 'help', set: 'positions' })} />
    </span>
  );

  let content;
  if (error && !team) {
    content = (
      <EmptyState
        title={ERRORS.pageLoad.title}
        body={ERRORS.pageLoad.body}
        action={{ label: ERRORS.pageLoad.action, onClick: () => window.location.reload() }}
      />
    );
  } else if (loading || !team || !totals) {
    content = (
      <SkeletonGroup label={LOADING.generic.title}>
        <SkeletonList rows={6} rowHeight={88} />
      </SkeletonGroup>
    );
  } else if (rows.length === 0) {
    content = (
      <div className="pf-card">
        <EmptyState
          title={PF_COPY.emptyPositions.title}
          body={PF_COPY.emptyPositions.body}
          flavor={PF_COPY.emptyPositions.flavor}
          action={{ label: PF_COPY.emptyPositions.action, onClick: () => navigate('/markets') }}
        />
      </div>
    );
  } else {
    content = (
      <>
        <dl className="pf-strip" aria-label="Positions summary">
          <div className="pf-strip__cell">
            <dt className="pf-strip__label">
              Invested
              <TermTip id="invested" />
            </dt>
            <dd className="pf-strip__value num" style={{ margin: 0 }}>
              <MoneyText cents={totals.invested} currency={currency} />
            </dd>
          </div>
          <div className="pf-strip__cell">
            <dt className="pf-strip__label">
              Unrealized
              <TermTip id="unrealizedGain" />
            </dt>
            <dd className="pf-strip__value" style={{ margin: 0 }}>
              <SignedChange value={totals.unrealized} kind="money" currency={currency} strong wrap />
            </dd>
          </div>
          <div className="pf-strip__cell">
            <dt className="pf-strip__label">
              Session
              <TermTip id="sessionChange" />
            </dt>
            <dd className="pf-strip__value" style={{ margin: 0 }}>
              <SignedChange value={totals.sessionValueChange} kind="money" currency={currency} strong wrap />
            </dd>
          </div>
        </dl>

        <section className="pf-alloc" aria-labelledby="pf-alloc-title">
          <h2 id="pf-alloc-title" className="pf-alloc__header">
            Where your money is
            <TermTip id="pctOfAccount" />
          </h2>
          <AllocationBar items={allocationItems(rows, team.cashBalance)} legendLabel="Where your money is" />
        </section>

        <InsetGroupedList aria-label="Positions" footer={SWIPE_HINT} className="pf-positions-list">
          {sorted.map((r) => (
            <PositionRow
              key={r.companyId}
              row={r}
              currency={currency}
              onTrade={(ticker, side) => openTrade({ ticker, side })}
              onOpen={(ticker) => navigate(companyPath(ticker))}
            />
          ))}
        </InsetGroupedList>
      </>
    );
  }

  const helpOpen = sheet?.kind === 'help' && sheet.set === 'positions';
  return (
    <>
      <LargeTitleNavBar title="Positions" back={back} trailing={trailing} />
      <div className="bx-page pf-page">{content}</div>
      <PositionsHelpSheet open={helpOpen} onClose={close} />
    </>
  );
}
