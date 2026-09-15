/**
 * Learn glossary (MOBILE §7.14): letter sections ("A", "B"…) of 44px DisclosureRows showing the plain label with
 * the finance term as detail (or under the label when it does not fit), no side index. With a query: ranked
 * results from `glossarySearch`, or COPY §12 `empty.glossarySearch`.
 */
import { InsetGroupedList } from '../ios/InsetGroupedList';
import { DisclosureRow } from '../ios/ListRow';
import { EmptyState } from '../ios/EmptyState';
import { useLargeText } from '../ios/largeText';
import { glossaryTermPath } from '../ios/InfoTipSheet';
import { GLOSSARY_LIST, glossarySearch, type GlossaryEntry } from '../../lib/glossary';
import { fill } from '../../shell/copy';
import { glossarySections, LEARN_MOBILE, termFitsBeside } from './learnLogic';
import { GLOSSARY_SEARCH_EMPTY } from './learnCopy';

function TermRow({ entry, large }: { entry: GlossaryEntry; large: boolean }) {
  const beside = termFitsBeside(entry.label, entry.term, large);
  return (
    <DisclosureRow
      to={glossaryTermPath(entry.id)}
      title={entry.label}
      detail={beside ? entry.term : undefined}
      subtitle={beside ? undefined : entry.term}
      className="bx-learn-term-row"
    />
  );
}

export function glossaryResultsText(n: number): string {
  return n === 1 ? LEARN_MOBILE.oneResult : fill(LEARN_MOBILE.resultsCount, { n });
}

export function GlossaryBrowser({ query }: { query: string }) {
  const large = useLargeText();
  const q = query.trim();

  if (q) {
    const results = glossarySearch(q);
    if (results.length === 0) {
      return (
        <div className="bx-learn-empty">
          <EmptyState title={fill(GLOSSARY_SEARCH_EMPTY.title, { query: q })} body={GLOSSARY_SEARCH_EMPTY.body} />
        </div>
      );
    }
    return (
      <InsetGroupedList aria-label={glossaryResultsText(results.length)} className="bx-learn-results">
        {results.map((entry) => (
          <TermRow key={entry.id} entry={entry} large={large} />
        ))}
      </InsetGroupedList>
    );
  }

  return (
    <section className="bx-learn-glossary" aria-labelledby="bx-learn-glossary-title">
      <div className="ios-list__header bx-learn-glossary__header" data-variant="prominent">
        <h2 id="bx-learn-glossary-title" className="ios-list__title">
          {LEARN_MOBILE.glossary}
        </h2>
      </div>
      {glossarySections(GLOSSARY_LIST).map((section) => (
        <InsetGroupedList key={section.letter} header={section.letter} headerVariant="plain" headingLevel={3} className="bx-learn-letter">
          {section.entries.map((entry) => (
            <TermRow key={entry.id} entry={entry} large={large} />
          ))}
        </InsetGroupedList>
      ))}
    </section>
  );
}
