/**
 * Glossary term › "See it on a company" (MOBILE §7.14): the term's ExplainRow for the example company (KRKN when it
 * exists) with live price, fundamentals and sector average, plus "Open KRKN" into the Learn stack with
 * `?highlight={termId}` so the company page highlights the same row. Only for terms that are company metrics.
 */
import { useMemo } from 'react';
import { InsetGroupedList } from '../ios/InsetGroupedList';
import { DisclosureRow, ExplainRow } from '../ios/ListRow';
import { SkeletonGroup, SkeletonRow } from '../ios/Skeleton';
import { explainMetric, metricValue, sectorAverages } from '../../lib/compare';
import { useCompanies } from '../../hooks/useCompanies';
import { useAllFundamentals } from '../../hooks/useAllFundamentals';
import { useShellGame } from '../../shell/ShellData';
import { ERRORS, LOADING, fill } from '../../shell/copy';
import { exampleCompany, learnCompanyPath, LEARN_MOBILE, metricForTerm, metricShortLabel } from './learnLogic';
import { TermInfo } from './TermInfo';

export function SeeItOnCompany({ termId }: { termId: string }) {
  const metric = metricForTerm(termId);
  const { game } = useShellGame();
  const { companies, byId, loading, error } = useCompanies();
  const fundamentals = useAllFundamentals(game?.marketCreatedAt ?? null);
  const company = exampleCompany(companies);
  const averageFor = useMemo(() => sectorAverages(fundamentals.byId, byId), [fundamentals.byId, byId]);

  if (!metric) return null;
  const busy = loading || fundamentals.loading;

  if (busy && !company) {
    return (
      <section className="bx-learn-section" aria-label={LEARN_MOBILE.seeItOnCompany}>
        <SkeletonGroup label={LOADING.generic.title}>
          <SkeletonRow height={112} crest={0} />
        </SkeletonGroup>
      </section>
    );
  }
  if (!company) {
    if (!error) return null;
    return (
      <InsetGroupedList header={LEARN_MOBILE.seeItOnCompany} footer={ERRORS.pageLoad.body}>
        <li className="ios-row bx-learn-error">{ERRORS.pageLoad.title}</li>
      </InsetGroupedList>
    );
  }

  const f = fundamentals.byId[company.id];
  const symbol = game?.currency?.symbol ?? 'Ð';
  const value = f ? metricValue(metric, f, company) : null;
  const explained = explainMetric(metric, value, averageFor(metric, company.sector), symbol);

  return (
    <InsetGroupedList header={LEARN_MOBILE.seeItOnCompany} footer={fundamentals.error ? ERRORS.pageLoad.title : undefined} className="bx-learn-see">
      {fundamentals.loading ? (
        <li className="ios-row">
          <SkeletonGroup label={LOADING.generic.title}>
            <SkeletonRow height={96} crest={0} />
          </SkeletonGroup>
        </li>
      ) : (
        <ExplainRow label={metricShortLabel(metric)} info={<TermInfo id={termId} />} explained={explained} id={`see-${termId}`} />
      )}
      <DisclosureRow to={learnCompanyPath(company.ticker, termId)} title={fill(LEARN_MOBILE.openTicker, { ticker: company.ticker })} aria-label={`${fill(LEARN_MOBILE.openTicker, { ticker: company.ticker })}, ${company.name}`} />
    </InsetGroupedList>
  );
}
