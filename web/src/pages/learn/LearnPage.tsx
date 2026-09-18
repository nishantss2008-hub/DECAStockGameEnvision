/**
 * Learn tab root (MOBILE §7.14): large title + status line · SearchField "Search 73 terms" · chapter card
 * (Meet the market, How the game works, Read a company in 5 questions, Trading basics) · Glossary topics.
 * The query lives in `?q=` (replace) so Back from a term keeps the search.
 */
import { useSearchParams } from 'react-router-dom';
import { ArrowLeftRight, BookOpen, Compass, Ship } from 'lucide-react';
import { SearchField } from '../../components/ios/SearchField';
import { InsetGroupedList } from '../../components/ios/InsetGroupedList';
import { DisclosureRow } from '../../components/ios/ListRow';
import { GLOSSARY_LIST, glossarySearch } from '../../lib/glossary';
import { ShellNavBar } from '../../shell/ShellNavBar';
import { useDocumentTitle } from '../../shell/StubPage';
import { GlossaryBrowser, glossaryResultsText } from '../../components/learn/GlossaryBrowser';
import { chapterSubtitles, LEARN_MOBILE, LEARN_PATHS, searchTermsPlaceholder } from '../../components/learn/learnLogic';
import { FIVE_QUESTIONS_TITLE, GUIDE_COPY, TRADING_BASICS_TITLE } from '../../components/learn/learnCopy';
import { INTRO } from '../../components/learn/introCopy';
import '../../components/learn/learn.css';

export default function LearnPage() {
  useDocumentTitle(LEARN_MOBILE.title);
  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? '';
  const subtitles = chapterSubtitles();

  const setQuery = (next: string) => {
    const p = new URLSearchParams(params);
    if (next) p.set('q', next);
    else p.delete('q');
    setParams(p, { replace: true, preventScrollReset: true });
  };
  const searching = query.trim().length > 0;
  const count = searching ? glossarySearch(query).length : GLOSSARY_LIST.length;

  return (
    <>
      <ShellNavBar title={LEARN_MOBILE.title} />
      <div className="bx-page bx-learn">
        <div className="bx-learn-search">
          <SearchField
            value={query}
            onChange={setQuery}
            placeholder={searchTermsPlaceholder(GLOSSARY_LIST.length)}
            announcement={searching ? glossaryResultsText(count) : undefined}
          />
        </div>
        {!searching && (
          <InsetGroupedList aria-label={LEARN_MOBILE.chapters} className="bx-learn-chapters">
            {/*
              Replayable any time (design §6): the same flow a crew must finish before its first order, and now
              the only "how to play" on the phone. The Portfolio walkthrough card it used to reopen is gone, so
              the second row that armed it led nowhere; this row is where a lost student goes instead.
            */}
            <DisclosureRow icon={Ship} title={INTRO.learnRow} subtitle={subtitles.meetTheMarket} to={LEARN_PATHS.meetTheMarket} />
            <DisclosureRow icon={BookOpen} title={GUIDE_COPY.title} subtitle={subtitles.guide} to={LEARN_PATHS.guide} />
            <DisclosureRow icon={Compass} title={FIVE_QUESTIONS_TITLE} subtitle={subtitles.fiveQuestions} to={LEARN_PATHS.fiveQuestions} />
            <DisclosureRow icon={ArrowLeftRight} title={TRADING_BASICS_TITLE} subtitle={subtitles.basics} to={LEARN_PATHS.basics} />
          </InsetGroupedList>
        )}
        <GlossaryBrowser query={query} />
      </div>
    </>
  );
}
