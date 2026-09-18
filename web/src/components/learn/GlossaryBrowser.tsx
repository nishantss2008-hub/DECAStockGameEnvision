/**
 * Learn glossary (MOBILE §7.14): seven topic groups ("The basics", "Value", "Trading"…), each a 44px row that
 * opens in place to its own 44px DisclosureRows showing the plain label with the finance term as detail (or under
 * the label when it does not fit). Closed, the whole glossary is seven rows instead of 4,528px of letter sections.
 * With a query: ranked results from `glossarySearch` — every term, whatever its group is doing — or COPY §12
 * `empty.glossarySearch`.
 */
import { useId, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { InsetGroupedList } from '../ios/InsetGroupedList';
import { DisclosureRow } from '../ios/ListRow';
import { EmptyState } from '../ios/EmptyState';
import { useLargeText } from '../ios/largeText';
import { glossaryTermPath } from '../ios/InfoTipSheet';
import { GLOSSARY_LIST, glossarySearch, type GlossaryEntry } from '../../lib/glossary';
import { fill } from '../../shell/copy';
import { glossaryGroupSections, groupTermsCount, GROUPED_ROW_TEXT_ROOM_PX, LEARN_MOBILE, termFitsBeside, type GlossarySection } from './learnLogic';
import { GLOSSARY_SEARCH_EMPTY } from './learnCopy';

function TermRow({ entry, large, roomPx }: { entry: GlossaryEntry; large: boolean; roomPx?: number }) {
  const beside = termFitsBeside(entry.label, entry.term, large, roomPx);
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

/**
 * One topic inside the glossary card: a heading button that owns its list of terms (`aria-expanded` +
 * `aria-controls`), then the terms when it is open. The button is the row, so it keeps the 44px target,
 * the list-row look and the chevron — which points down while the group is open.
 */
function GroupRows({ section, large }: { section: GlossarySection; large: boolean }) {
  const [open, setOpen] = useState(false);
  const panelId = `${useId()}-terms`;
  return (
    <>
      <li className="ios-row-item bx-learn-group" data-open={open || undefined}>
        <h3 className="bx-learn-group__heading">
          <button
            type="button"
            className="ios-row ios-row--interactive ios-row--disclosure bx-learn-group__toggle"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => setOpen((o) => !o)}
          >
            <span className="ios-row__text">
              <span className="ios-row__title">{section.label}</span>
            </span>
            <span className="ios-row__trailing">
              <span className="ios-row__detail">{groupTermsCount(section.entries.length)}</span>
            </span>
            <ChevronRight className="ios-row__chevron bx-learn-group__chevron" size={14} strokeWidth={2.5} aria-hidden="true" />
          </button>
        </h3>
      </li>
      {open && (
        <li className="ios-row-item bx-learn-group__panel">
          <ul id={panelId} className="bx-learn-group__terms" role="list">
            {section.entries.map((entry) => (
              <TermRow key={entry.id} entry={entry} large={large} roomPx={GROUPED_ROW_TEXT_ROOM_PX} />
            ))}
          </ul>
        </li>
      )}
    </>
  );
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
      <div className="ios-list bx-learn-groups" data-surface="page">
        <ul className="ios-list__card" role="list">
          {glossaryGroupSections(GLOSSARY_LIST).map((section) => (
            <GroupRows key={section.group} section={section} large={large} />
          ))}
        </ul>
      </div>
    </section>
  );
}
