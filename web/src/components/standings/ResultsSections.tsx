/** The five Final results pages (MOBILE §7.13) and their sheets. Words: COPY §10 via ./copy. */
import { useId } from 'react';
import { ArrowUpDown, CircleQuestionMark } from 'lucide-react';
import type { FinalEntry, LeaderboardEntry } from '@deca/shared';
import { WaxSeal } from '../ios/WaxSeal';
import { Podium } from '../ios/Podium';
import { InsetGroupedList } from '../ios/InsetGroupedList';
import { KeyValueRow, ListRow } from '../ios/ListRow';
import { ChangePill, TagPill } from '../ios/Pill';
import { Crest } from '../ios/Crest';
import { Button } from '../ios/Button';
import { Menu } from '../ios/Menu';
import { Sheet } from '../ios/Sheet';
import { EmptyState } from '../ios/EmptyState';
import { ScatterChart } from '../charts/ScatterChart';
import { formatMoney, formatNumber, formatPct } from '../../lib/format';
import { GLOSSARY } from '../../lib/glossary';
import { ordinal } from '../ios/ornamentGeometry';
import { useInlineTip } from '../../shell/InlineTip';
import { RESULTS, REVEAL, STANDINGS } from './copy';
import { StandingRow, TermTip } from './StandingRow';
import {
  LABEL_COPY,
  PILLAR_COPY,
  luckExtremes,
  luckPoints,
  revealLine,
  scatterPoints,
  type HoldingRevealRow,
  type RevealRow,
  type RevealSort,
  type ResearchSummary,
} from './reveal';
import { fill, podiumEntries, placeSummary } from './standings';

function PageHeading({ children, id, className }: { children: string; id: string; className?: string }) {
  return (
    <h1 id={id} tabIndex={-1} className={className ?? 't-title-1 t-emph bx-results__h1'}>
      {children}
    </h1>
  );
}

/* ─── 1 Voyage complete (hull) ─────────────────────────────────────────────── */

export function VoyagePage({ entries, teamId, symbol, headingId }: { entries: FinalEntry[]; teamId: string | null; symbol: string; headingId: string }) {
  const place = placeSummary(entries, teamId, symbol);
  return (
    <div className="bx-results__voyage">
      <WaxSeal tone="crimson" size={120} />
      <PageHeading id={headingId} className="font-brand bx-results__ceremony">
        {RESULTS.pages[0]}
      </PageHeading>
      <Podium entries={podiumEntries(entries, symbol)} label={RESULTS.podiumLabel} />
      {place && (
        <p className="t-title-3 t-emph bx-results__finished">
          <span>{fill(RESULTS.finished, { ordinal: ordinal(place.rank), n: place.count })}</span>
          <TermTip id="accountValue" />
        </p>
      )}
    </div>
  );
}

/* ─── 2 Your crew ──────────────────────────────────────────────────────────── */

export function CrewPage({
  entry,
  count,
  symbol,
  research,
  holdings,
  headingId,
}: {
  entry: FinalEntry | null;
  count: number;
  symbol: string;
  research: ResearchSummary;
  holdings: { rows: HoldingRevealRow[]; average: number | null; bOrBetter: number };
  headingId: string;
}) {
  const grade = research.grade ? REVEAL.researchGrade.grades[research.grade] : null;
  const gradeEntry = GLOSSARY.researchGrade;
  return (
    <>
      <PageHeading id={headingId}>{RESULTS.pages[1]}</PageHeading>
      {entry && (
        <InsetGroupedList aria-label={RESULTS.pages[1]}>
          <KeyValueRow label={RESULTS.finalValue} info={<TermTip id="accountValue" />} value={<span className="num">{formatMoney(entry.totalValue, { symbol })}</span>} />
          <KeyValueRow label={RESULTS.totalReturn} info={<TermTip id="totalGain" />} value={<ChangePill value={entry.returnPct} />} />
          <KeyValueRow label={RESULTS.rank} info={<TermTip id="accountValue" />} value={<span className="num">{fill(STANDINGS.rankOf, { rank: entry.rank, n: count })}</span>} />
        </InsetGroupedList>
      )}
      <section className="bx-grade" aria-labelledby={`${headingId}-grade`}>
        <h2 id={`${headingId}-grade`} className="t-title-3 t-emph bx-grade__title">
          {REVEAL.researchGrade.title}
          {gradeEntry && <TermTip id="researchGrade" />}
        </h2>
        {research.held && grade ? (
          <>
            <div className="bx-grade__hero">
              <span className="bx-grade__letter" aria-hidden="true">{research.grade}</span>
              <div>
                <p className="t-headline sr-only">{fill(RESULTS.grade, { grade: research.grade! })}</p>
                <p className="t-body">{grade.meaning}</p>
                <p className="t-footnote bx-grade__flavor">{grade.flavor}</p>
              </div>
            </div>
            <p className="t-subhead bx-grade__body">{REVEAL.researchGrade.body}</p>
            <InsetGroupedList aria-label={REVEAL.researchGrade.title}>
              <KeyValueRow label={RESULTS.health} info={<TermTip id="quality" />} value={<span className="num">{research.health}</span>} />
              {research.marketAverage !== null && <KeyValueRow label={REVEAL.researchGrade.marketAverage} value={<span className="num">{research.marketAverage}</span>} valueTone="secondary" />}
              {research.winner !== null && <KeyValueRow label={REVEAL.researchGrade.winner} value={<span className="num">{research.winner}</span>} valueTone="secondary" />}
            </InsetGroupedList>
          </>
        ) : (
          <p className="t-body bx-grade__body">{REVEAL.researchGrade.noHoldings}</p>
        )}
        {holdings.rows.length > 0 && (
          <div className="bx-table-wrap">
            <table className="bx-holdings-table">
              <caption className="sr-only">{REVEAL.researchGrade.title}</caption>
              <thead>
                <tr>
                  <th scope="col" className="t-footnote">{REVEAL.researchGrade.holdingsTable.holding}</th>
                  <th scope="col" className="t-footnote bx-num-col">
                    <span className="bx-th-tip">{REVEAL.researchGrade.holdingsTable.weight}<TermTip id="pctOfAccount" /></span>
                  </th>
                  <th scope="col" className="t-footnote bx-num-col">
                    <span className="bx-th-tip">{RESULTS.health}<TermTip id="quality" /></span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {holdings.rows.map((r) => (
                  <tr key={r.companyId}>
                    <th scope="row" className="t-body t-emph">{r.ticker}</th>
                    <td className="t-body num bx-num-col">{formatPct(r.weight, { digits: 1 })}</td>
                    <td className="t-body num bx-num-col">
                      {r.quality} <TagPill>{r.grade}</TagPill>
                    </td>
                  </tr>
                ))}
              </tbody>
              {holdings.average !== null && (
                <tfoot>
                  <tr>
                    <th scope="row" className="t-subhead">{REVEAL.researchGrade.holdingsTable.total}</th>
                    <td />
                    <td className="t-subhead t-emph num bx-num-col">{holdings.average}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
        {holdings.rows.length > 0 && <p className="t-subhead bx-grade__note">{fill(REVEAL.researchGrade.gradeBOrBetter, { pct: formatPct(holdings.bOrBetter, { digits: 0 }) })}</p>}
        <p className="t-subhead bx-grade__note">{REVEAL.researchGrade.rankNote}</p>
        <p className="t-subhead bx-grade__note">{REVEAL.researchGrade.nextTime}</p>
      </section>
    </>
  );
}

/* ─── 3 Market reveal ──────────────────────────────────────────────────────── */

export function RevealPage({
  rows,
  sort,
  onSort,
  onHelp,
  onRow,
  headingId,
}: {
  rows: RevealRow[];
  sort: RevealSort;
  onSort: (s: RevealSort) => void;
  onHelp: () => void;
  onRow: (row: RevealRow) => void;
  headingId: string;
}) {
  const sortLabel = REVEAL.table.sortOptions[sort];
  return (
    <>
      <p className="t-footnote t-emph bx-results__eyebrow">{REVEAL.eyebrow}</p>
      <PageHeading id={headingId}>{REVEAL.title}</PageHeading>
      <p className="t-body bx-results__intro">{REVEAL.intro}</p>
      <p className="t-subhead bx-results__muted">{REVEAL.hiddenDuringPlay}</p>
      {rows.length === 0 ? (
        <EmptyState title={RESULTS.empty.title} body={RESULTS.empty.body} flavor={RESULTS.empty.flavor} headingLevel={2} />
      ) : (
        <>
          <div className="bx-reveal__tools">
            <Menu
              label={REVEAL.table.sortBy}
              groups={[
                {
                  label: REVEAL.table.sortBy,
                  value: sort,
                  onValueChange: (id) => onSort(id as RevealSort),
                  items: (['quality', 'luck', 'actual'] as const).map((id) => ({ id, label: REVEAL.table.sortOptions[id], onSelect: () => onSort(id) })),
                },
              ]}
              trigger={
                <Button variant="gray" size="small" icon={ArrowUpDown} aria-label={`${REVEAL.table.sortBy}: ${sortLabel}`}>
                  {sortLabel}
                </Button>
              }
            />
            <button type="button" className="ios-infotip-button bx-reveal__help" aria-haspopup="dialog" aria-label={RESULTS.whatTheseMean} onClick={onHelp}>
              <CircleQuestionMark size={22} strokeWidth={1.75} aria-hidden="true" />
            </button>
          </div>
          <InsetGroupedList
            header={REVEAL.table.title}
            headingLevel={2}
            footer={fill(REVEAL.table.caption, { n: rows.length })}
          >
            {rows.map((r) => (
              <ListRow
                key={r.companyId}
                onClick={() => onRow(r)}
                stacked={false}
                className="bx-reveal-row"
                aria-label={`${r.ticker}, ${r.name}. ${RESULTS.health} ${r.quality}, ${fill(RESULTS.grade, { grade: r.grade })}. ${r.drivers}. ${revealLine(r).replace(/−/g, 'minus ')}. ${LABEL_COPY[r.label]}`}
                leading={
                  <span aria-hidden="true">
                    <Crest ticker={r.ticker} sector={r.sector} size={36} />
                  </span>
                }
                leadingWidth={36}
                title={
                  <span className="bx-reveal-row__title">
                    <span className="t-emph">{r.ticker}</span>
                    <span className="num">{`${RESULTS.health} ${r.quality}`}</span>
                    <TagPill>{r.grade}</TagPill>
                  </span>
                }
                subtitle={
                  <span className="bx-reveal-row__sub">
                    <span>{r.drivers}</span>
                    <span className="num bx-reveal-row__line">
                      {revealLine(r).split(' · ').map((part, i) => (
                        <span key={part}>
                          {i > 0 ? ' · ' : ''}
                          {part}
                        </span>
                      ))}
                    </span>
                    <span className="t-emph">{LABEL_COPY[r.label]}</span>
                  </span>
                }
              />
            ))}
          </InsetGroupedList>
          <section className="bx-results__notes">
            <h2 className="t-headline">{REVEAL.hiddenSurprise.title}</h2>
            <p className="t-subhead">{REVEAL.hiddenSurprise.body}</p>
            <p className="t-subhead">{REVEAL.hiddenSurprise.note}</p>
            <p className="t-subhead">{REVEAL.closingPrice}</p>
          </section>
        </>
      )}
    </>
  );
}

/** Content-height sheet for one company's reveal: health, grade, pillars, expected/actual/luck, result. */
export function RevealDetailSheet({ row, onClose }: { row: RevealRow | null; onClose: () => void }) {
  const health = useInlineTip('quality');
  return (
    <Sheet open={row !== null} onOpenChange={(next) => !next && onClose()} title={row ? `${row.ticker} · ${row.name}` : ''} detents="fit">
      {row && (
        <div className="bx-sheet-body">
          <InsetGroupedList surface="sheet" aria-label={fill(RESULTS.detailsFor, { ticker: row.ticker })}>
            <KeyValueRow label={RESULTS.health} info={health.button} value={<span className="num">{row.quality}</span>} />
            {health.panel}
            <KeyValueRow label={REVEAL.table.columns.grade} value={row.grade} />
            <KeyValueRow label={REVEAL.table.columns.expected} value={<span className="num">{formatPct(row.expected, { signed: true })}</span>} />
            <KeyValueRow label={REVEAL.table.columns.actual} value={<span className="num">{formatPct(row.actual, { signed: true })}</span>} />
            <KeyValueRow label={REVEAL.table.columns.luck} value={<span className="num">{luckPoints(row.luck)}</span>} />
            <KeyValueRow label={REVEAL.table.columns.label} value={LABEL_COPY[row.label]} />
          </InsetGroupedList>
          <p className="t-subhead bx-results__muted bx-detail__meaning">{REVEAL.labels[row.label].meaning}</p>
          <InsetGroupedList surface="sheet" header={REVEAL.table.columns.drivers} headingLevel={3}>
            {(['prof', 'grow', 'safe', 'val'] as const).map((k) => (
              <KeyValueRow key={k} label={PILLAR_COPY[k].name} value={row.pillars[k] >= 0 ? PILLAR_COPY[k].high : PILLAR_COPY[k].low} valueTone="secondary" stacked />
            ))}
          </InsetGroupedList>
        </div>
      )}
    </Sheet>
  );
}

/** `?sheet=help&set=results-scorecard`: "What these numbers mean" (COPY §10 table.help + labels.*.meaning). */
export function ScorecardHelpSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const h = REVEAL.table.help;
  const items: Array<[string, string]> = [
    [REVEAL.table.columns.quality, h.quality],
    [REVEAL.table.columns.grade, h.grade],
    [REVEAL.table.columns.expected, h.expected],
    [REVEAL.table.columns.actual, h.actual],
    [REVEAL.table.columns.luck, h.luck],
    ...(Object.keys(REVEAL.labels) as Array<keyof typeof REVEAL.labels>).map((k) => [REVEAL.labels[k].name, REVEAL.labels[k].meaning] as [string, string]),
  ];
  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()} title={RESULTS.whatTheseMean} detents="medium-large">
      <div className="bx-sheet-body">
        <dl className="bx-help-list">
          {items.map(([term, text]) => (
            <div key={term} className="bx-help-list__item">
              <dt className="t-headline">{term}</dt>
              <dd className="t-body">{text}</dd>
            </div>
          ))}
        </dl>
      </div>
    </Sheet>
  );
}

/* ─── 4 Luck vs. research (dark) ───────────────────────────────────────────── */

export function LuckPage({ rows, heldIds, onViewList, headingId }: { rows: RevealRow[]; heldIds: ReadonlySet<string>; onViewList: () => void; headingId: string }) {
  const { luckiest, unluckiest } = luckExtremes(rows);
  const s = REVEAL.scatter;
  const summary = [
    `${s.title}: ${rows.length} companies.`,
    luckiest ? `${fill(s.luckiest, { ticker: luckiest })}.` : '',
    unluckiest ? `${fill(s.unluckiest, { ticker: unluckiest })}.` : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <>
      <PageHeading id={headingId}>{RESULTS.pages[3]}</PageHeading>
      <p className="t-body bx-results__intro">{REVEAL.intro}</p>
      {rows.length === 0 ? (
        <EmptyState title={RESULTS.empty.title} body={RESULTS.empty.body} headingLevel={2} />
      ) : (
        <section className="bx-luck" aria-label={s.title}>
          <h2 className="t-headline">
            {s.title}
            <TermTip id="quality" />
          </h2>
          <ScatterChart
            points={scatterPoints(rows, heldIds)}
            xLabel={s.xLabel}
            yLabel={s.yLabel}
            xDomain={[0, 100]}
            formatX={(x) => formatNumber(x)}
            formatY={(y) => formatPct(y, { signed: true, digits: 0 })}
            trend={{ label: s.trendLabel }}
            callouts={[
              ...(luckiest ? [{ pointId: luckiest, text: fill(s.luckiest, { ticker: luckiest }) }] : []),
              ...(unluckiest && unluckiest !== luckiest ? [{ pointId: unluckiest, text: fill(s.unluckiest, { ticker: unluckiest }) }] : []),
            ]}
            legend={{ highlighted: s.yourHoldings, others: s.others }}
            summary={summary}
            caption={s.caption}
            height={280}
            footer={
              <Button variant="plain" size="small" onClick={onViewList}>
                {RESULTS.viewAsList}
              </Button>
            }
          />
        </section>
      )}
    </>
  );
}

/* ─── 5 Final standings ────────────────────────────────────────────────────── */

export function FinalPage({ entries, teamId, symbol, onDone, onOpenCrew, headingId }: { entries: LeaderboardEntry[]; teamId: string | null; symbol: string; onDone: () => void; onOpenCrew: (id: string) => void; headingId: string }) {
  const tipId = useId();
  return (
    <>
      <PageHeading id={headingId}>{RESULTS.pages[4]}</PageHeading>
      <InsetGroupedList
        aria-label={RESULTS.pages[4]}
        footer={
          <span className="bx-standings__footer" id={tipId}>
            <span>{`${fill(STANDINGS.crewsCount, { n: entries.length })} · ${STANDINGS.footer}`}</span>
            <TermTip id="accountValue" />
          </span>
        }
      >
        {[...entries].sort((a, b) => a.rank - b.rank).map((e) => (
          <StandingRow key={e.teamId} entry={e} you={e.teamId === teamId} view="total" symbol={symbol} showMovement={false} onOpen={() => onOpenCrew(e.teamId)} />
        ))}
      </InsetGroupedList>
      <div className="bx-results__done">
        <Button variant="filled" size="large" fullWidth onClick={onDone}>
          {RESULTS.done}
        </Button>
      </div>
    </>
  );
}

