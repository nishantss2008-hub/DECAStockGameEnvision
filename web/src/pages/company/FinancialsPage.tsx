/**
 * Financials (MOBILE §7.8): plain summary, 4-year bar chart, "Read a company in 5 questions" groups of ExplainRows
 * with sector averages, and Income | Balance | Cash flow statement tables. Owns `?sheet=help&set=statements-*`.
 */
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { LargeTitleNavBar } from '../../components/ios/LargeTitleNavBar';
import { InsetGroupedList } from '../../components/ios/InsetGroupedList';
import { DisclosureRow } from '../../components/ios/ListRow';
import { SegmentedControl } from '../../components/ios/SegmentedControl';
import { EmptyState } from '../../components/ios/EmptyState';
import { Button } from '../../components/ios/Button';
import { Sheet } from '../../components/ios/Sheet';
import { InfoTipLines } from '../../components/ios/InfoTipSheet';
import { SkeletonGroup, SkeletonList } from '../../components/ios/Skeleton';
import { GLOSSARY } from '../../lib/glossary';
import { useSheet } from '../../shell/useSheet';
import type { HelpSet } from '../../shell/sheetParams';
import { useDocumentTitle, useStackBack } from '../../shell/StubPage';
import { useCompanyData } from '../../components/research/useCompanyData';
import { MetricExplainRow } from '../../components/research/CompanySections';
import { HistoryBars } from '../../components/research/HistoryBars';
import { StatementTable } from '../../components/research/StatementTable';
import { FINANCIAL_QUESTIONS, historyBars, statementSummary, statementTable, type StatementKind } from '../../components/research/researchModel';
import { RESEARCH, fillCopy } from '../../components/research/researchCopy';
import '../../components/research/research.css';

const HELP_FOR: Record<StatementKind, HelpSet> = { income: 'statements-income', balance: 'statements-balance', cashflow: 'statements-cashflow' };

export default function FinancialsPage() {
  const data = useCompanyData();
  const { company, fundamentals, currency } = data;
  const back = useStackBack(data.basePath);
  const navigate = useNavigate();
  const { search } = useLocation();
  const { sheet, open, close } = useSheet();
  const [kind, setKind] = useState<StatementKind>('income');
  const highlight = new URLSearchParams(search).get('highlight');
  useDocumentTitle(company ? `${RESEARCH.financialsTitle} · ${company.ticker}` : RESEARCH.financialsTitle);

  useEffect(() => {
    if (highlight && fundamentals) document.getElementById(`metric-${highlight}`)?.scrollIntoView({ block: 'center' });
  }, [highlight, fundamentals]);

  const subtitle = company ? <p className="t-subhead rs-secondary rs-subtitle">{`${company.ticker} · ${company.name}`}</p> : null;
  const helpSet = sheet?.kind === 'help' ? sheet.set : null;
  const helpKind = (Object.keys(HELP_FOR) as StatementKind[]).find((k) => HELP_FOR[k] === helpSet) ?? null;

  if (data.notFound) {
    return (
      <>
        <LargeTitleNavBar title={RESEARCH.financialsTitle} back={back} />
        <div className="bx-page">
          <EmptyState title={RESEARCH.notFoundTitle} body={RESEARCH.notFoundBody} action={{ label: RESEARCH.searchCompanies, onClick: () => navigate('/markets') }} />
        </div>
      </>
    );
  }

  return (
    <>
      <LargeTitleNavBar title={RESEARCH.financialsTitle} back={back} statusLine={subtitle} />
      <div className="bx-page rs-page">
        {!company || !fundamentals ? (
          <SkeletonGroup label={RESEARCH.loadingFinancials}>
            <SkeletonList rows={6} rowHeight={88} />
          </SkeletonGroup>
        ) : (
          <>
            <FinancialsBody company={company} fundamentals={fundamentals} data={data} highlight={highlight} kind={kind} setKind={setKind} onHelp={() => open({ kind: 'help', set: HELP_FOR[kind] })} />
            <StatementsHelpSheet kind={helpKind} fundamentals={fundamentals} symbol={currency.symbol} onClose={close} />
          </>
        )}
      </div>
    </>
  );
}

function FinancialsBody({
  company,
  fundamentals,
  data,
  highlight,
  kind,
  setKind,
  onHelp,
}: {
  company: NonNullable<ReturnType<typeof useCompanyData>['company']>;
  fundamentals: NonNullable<ReturnType<typeof useCompanyData>['fundamentals']>;
  data: ReturnType<typeof useCompanyData>;
  highlight: string | null;
  kind: StatementKind;
  setKind: (k: StatementKind) => void;
  onHelp: () => void;
}) {
  const symbol = data.currency.symbol;
  const summary = statementSummary(fundamentals.history, symbol);
  const bars = historyBars(fundamentals.history);
  return (
    <>
      {summary && <p className="t-subhead rs-lead">{summary}</p>}
      {bars.length > 1 && (
        <div className="rs-card rs-section">
          <HistoryBars bars={bars} symbol={symbol} height={200} interactive />
        </div>
      )}

      <h2 className="t-title-3 t-emph rs-group-title">{RESEARCH.fiveQuestions}</h2>
      <p className="t-footnote rs-secondary rs-group-note">{RESEARCH.fiveQuestionsNote}</p>
      {FINANCIAL_QUESTIONS.map((q) => (
        <InsetGroupedList key={q.id} header={q.question} footer={q.tip} className="rs-section" headingLevel={3}>
          {q.metrics.map((id) => (
            <MetricExplainRow
              key={id}
              id={id}
              company={company}
              fundamentals={fundamentals}
              average={data.averageFor(id)}
              symbol={symbol}
              highlighted={highlight === id}
            />
          ))}
          {q.id === 'news' ? <DisclosureRow to="/news" title={fillCopy(RESEARCH.newsAbout, { ticker: company.ticker })} /> : null}
        </InsetGroupedList>
      ))}

      <section className="rs-section" aria-labelledby="rs-statements">
        <h2 id="rs-statements" className="t-headline rs-heading">
          {RESEARCH.statementsLabel}
        </h2>
        <SegmentedControl<StatementKind>
          className="rs-statement-switch"
          ariaLabel={RESEARCH.statementsLabel}
          value={kind}
          onChange={setKind}
          options={[
            { value: 'income', label: RESEARCH.statements.income },
            { value: 'balance', label: RESEARCH.statements.balance },
            { value: 'cashflow', label: RESEARCH.statements.cashflow },
          ]}
        />
        <StatementTable table={statementTable(kind, fundamentals, symbol)} />
        <p className="t-footnote rs-secondary rs-units">{RESEARCH.unitsNote}</p>
        <Button variant="plain" size="medium" aria-haspopup="dialog" onClick={onHelp}>
          {RESEARCH.numbersHelp}
        </Button>
      </section>
    </>
  );
}

function StatementsHelpSheet({
  kind,
  fundamentals,
  symbol,
  onClose,
}: {
  kind: StatementKind | null;
  fundamentals: NonNullable<ReturnType<typeof useCompanyData>['fundamentals']>;
  symbol: string;
  onClose: () => void;
}) {
  const [shown, setShown] = useState<StatementKind | null>(kind);
  useEffect(() => {
    if (kind) setShown(kind);
  }, [kind]);
  const rows = shown ? statementTable(shown, fundamentals, symbol).rows : [];
  return (
    <Sheet
      open={kind !== null}
      onOpenChange={(next) => !next && onClose()}
      onClosed={() => setShown(null)}
      title={RESEARCH.numbersHelp}
      detents="medium-large"
      closeLabel="Done"
    >
      <div className="rs-help">
        {rows.map((row) => {
          const entry = GLOSSARY[row.termId];
          if (!entry) return null;
          return (
            <section key={row.termId} className="rs-help__item" aria-labelledby={`rs-help-${row.termId}`}>
              <h3 id={`rs-help-${row.termId}`} className="t-headline">
                {row.label}
              </h3>
              <InfoTipLines entry={entry} headingLevel={4} density="inline" />
            </section>
          );
        })}
      </div>
    </Sheet>
  );
}
