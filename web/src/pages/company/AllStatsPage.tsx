/**
 * All stats (MOBILE §7.7, spec §5): the same nine fields the flat list showed, in five named groups —
 * Price, Value, Size, Health, Payouts — as two-column grids. Tapping a cell opens the same explanation
 * sheet the Key stats grid opens.
 */
import { useNavigate } from 'react-router-dom';
import { LargeTitleNavBar } from '../../components/ios/LargeTitleNavBar';
import { EmptyState } from '../../components/ios/EmptyState';
import { SkeletonGroup, SkeletonList } from '../../components/ios/Skeleton';
import { useSheet } from '../../shell/useSheet';
import { useDocumentTitle, useStackBack } from '../../shell/StubPage';
import { useCompanyData } from '../../components/research/useCompanyData';
import { StatGrid, StatSheet, statSheetRequest } from '../../components/research/StatGrid';
import { allStatsGroups } from '../../components/research/researchModel';
import { RESEARCH } from '../../components/research/researchCopy';
import '../../components/research/research.css';

export default function AllStatsPage() {
  const data = useCompanyData();
  const { company, fundamentals, currency } = data;
  const back = useStackBack(data.basePath);
  const navigate = useNavigate();
  const { open } = useSheet();
  useDocumentTitle(company ? `${RESEARCH.allStatsTitle} · ${company.ticker}` : RESEARCH.allStatsTitle);
  const subtitle = company ? <p className="t-subhead rs-secondary rs-subtitle">{`${company.ticker} · ${company.name}`}</p> : null;

  const groups = company && fundamentals ? allStatsGroups(company, fundamentals, data.averageFor, currency.symbol) : [];
  const cells = groups.flatMap((g) => g.cells);

  return (
    <>
      <LargeTitleNavBar title={RESEARCH.allStatsTitle} back={back} statusLine={subtitle} />
      <div className="bx-page rs-page">
        {data.notFound ? (
          <EmptyState title={RESEARCH.notFoundTitle} body={RESEARCH.notFoundBody} action={{ label: RESEARCH.searchCompanies, onClick: () => navigate('/markets') }} />
        ) : !company || !fundamentals ? (
          <SkeletonGroup label={RESEARCH.loadingFinancials}>
            <SkeletonList rows={5} rowHeight={72} />
          </SkeletonGroup>
        ) : (
          <>
            <p className="t-footnote rs-secondary rs-lead">{RESEARCH.tapHint}</p>
            {groups.map((group) => (
              <section
                key={group.id}
                className="rs-section rs-stats"
                aria-labelledby={`rs-stats-${group.id}`}
                aria-describedby={`rs-stats-note-${group.id}`}
              >
                <div className="ios-list__header" data-variant="prominent">
                  <h2 id={`rs-stats-${group.id}`} className="ios-list__title">
                    {group.label}
                  </h2>
                </div>
                <StatGrid cells={group.cells} onOpen={(cell) => open(statSheetRequest(cell))} />
                <p id={`rs-stats-note-${group.id}`} className="ios-list__footer">
                  {group.note}
                </p>
              </section>
            ))}
            <p className="t-footnote rs-secondary rs-units">{RESEARCH.unitsNote}</p>
            <StatSheet cells={cells} />
          </>
        )}
      </div>
    </>
  );
}
