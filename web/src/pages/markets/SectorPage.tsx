/**
 * Sector list (MOBILE §6.5 `/markets/sector/:sectorId`): the industry group index with its changes, then the group's
 * companies by size, and a link to All companies filtered to the group.
 */
import { useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { EmptyState } from '../../components/ios/EmptyState';
import { InsetGroupedList } from '../../components/ios/InsetGroupedList';
import { LargeTitleNavBar } from '../../components/ios/LargeTitleNavBar';
import { SignedChange } from '../../components/ios/SignedChange';
import { SkeletonGroup, SkeletonList } from '../../components/ios/Skeleton';
import { CompanyStockRow } from '../../components/market/MarketSections';
import { TermTip } from '../../components/market/TermTip';
import { LOADING, MARKETS } from '../../components/market/marketCopy';
import { filterBySector, sectorChips, sectorShortName, sortCompanies } from '../../components/market/marketsView';
import '../../components/market/market.css';
import { useCompanies } from '../../hooks/useCompanies';
import { useMarket } from '../../hooks/useMarket';
import { formatIndex } from '../../lib/format';
import { sectorFromSlug, sectorSlug } from '../../lib/sector';
import { useDocumentTitle, useStackBack } from '../../shell/StubPage';

export default function SectorPage() {
  const { sectorId = '' } = useParams();
  const sector = sectorFromSlug(sectorId);
  const name = sector ? sectorShortName(sector) : MARKETS.industryGroups;
  useDocumentTitle(name);
  const back = useStackBack('/markets');
  const navigate = useNavigate();
  const { companies, loading } = useCompanies();
  const { market } = useMarket();
  const members = useMemo(() => (sector ? sortCompanies(filterBySector(companies, sector), 'size') : []), [companies, sector]);
  const chip = useMemo(() => sectorChips(market, companies).find((c) => c.sector === sector), [market, companies, sector]);

  let body;
  if (!sector) {
    body = <EmptyState title={MARKETS.sectorNotFound.title} action={{ label: MARKETS.sectorNotFound.action, onClick: () => navigate('/markets') }} />;
  } else if (loading && companies.length === 0) {
    body = (
      <SkeletonGroup label={LOADING.prices.title}>
        <SkeletonList rows={4} />
      </SkeletonGroup>
    );
  } else {
    body = (
      <>
        {chip && (
          <section className="bx-composite" aria-labelledby="bx-sector-index">
            <span className="bx-label-q t-footnote">
              <span id="bx-sector-index" className="bx-composite__eyebrow">
                {MARKETS.sectorIndex}
              </span>
              <TermTip id="index" />
            </span>
            {chip.value !== null && <span className="bx-composite__value num">{formatIndex(chip.value)}</span>}
            <SignedChange className="bx-composite__line" kind="pct" value={chip.sessionChange} suffix={MARKETS.thisSession} strong />
            <SignedChange className="bx-composite__line" kind="pct" value={chip.totalChange} suffix={MARKETS.sinceStart} strong />
          </section>
        )}
        <InsetGroupedList
          header={MARKETS.companies}
          className="bx-section"
          footer={<Link to={`/markets?sector=${sectorSlug(sector)}#companies`}>{MARKETS.seeAllCompanies}</Link>}
        >
          {members.length === 0 ? <li className="ios-row-item bx-muted bx-empty-row">{MARKETS.noCompanies}</li> : members.map((c) => <CompanyStockRow key={c.id} company={c} />)}
        </InsetGroupedList>
      </>
    );
  }

  return (
    <>
      <LargeTitleNavBar title={name} back={back} />
      <div className="bx-page bx-markets">{body}</div>
    </>
  );
}
