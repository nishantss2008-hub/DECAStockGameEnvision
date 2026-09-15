/** All stats (MOBILE §7.7): KeyValueRows, each with a "?" that opens its glossary term. */
import { useNavigate } from 'react-router-dom';
import { LargeTitleNavBar } from '../../components/ios/LargeTitleNavBar';
import { InsetGroupedList } from '../../components/ios/InsetGroupedList';
import { KeyValueRow } from '../../components/ios/ListRow';
import { EmptyState } from '../../components/ios/EmptyState';
import { SkeletonGroup, SkeletonList } from '../../components/ios/Skeleton';
import { useDocumentTitle, useStackBack } from '../../shell/StubPage';
import { useCompanyData } from '../../components/research/useCompanyData';
import { TermTip } from '../../components/research/TermTip';
import { allStatsRows } from '../../components/research/researchModel';
import { RESEARCH } from '../../components/research/researchCopy';
import '../../components/research/research.css';

export default function AllStatsPage() {
  const data = useCompanyData();
  const { company, fundamentals, currency } = data;
  const back = useStackBack(data.basePath);
  const navigate = useNavigate();
  useDocumentTitle(company ? `${RESEARCH.allStatsTitle} · ${company.ticker}` : RESEARCH.allStatsTitle);
  const subtitle = company ? <p className="t-subhead rs-secondary rs-subtitle">{`${company.ticker} · ${company.name}`}</p> : null;

  return (
    <>
      <LargeTitleNavBar title={RESEARCH.allStatsTitle} back={back} statusLine={subtitle} />
      <div className="bx-page rs-page">
        {data.notFound ? (
          <EmptyState title={RESEARCH.notFoundTitle} body={RESEARCH.notFoundBody} action={{ label: RESEARCH.searchCompanies, onClick: () => navigate('/markets') }} />
        ) : !company || !fundamentals ? (
          <SkeletonGroup label={RESEARCH.loadingFinancials}>
            <SkeletonList rows={9} rowHeight={44} />
          </SkeletonGroup>
        ) : (
          <>
            <InsetGroupedList aria-label={RESEARCH.allStatsTitle} className="rs-section" footer={RESEARCH.unitsNote}>
              {allStatsRows(company, fundamentals, currency.symbol).map((row) => (
                <KeyValueRow key={row.label} label={row.label} info={<TermTip id={row.termId} />} value={<span className="ios-num">{row.value}</span>} />
              ))}
            </InsetGroupedList>
          </>
        )}
      </div>
    </>
  );
}
