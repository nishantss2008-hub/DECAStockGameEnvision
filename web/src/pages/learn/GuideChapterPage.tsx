/** Learn guide chapters (MOBILE §6.5): `/learn/guide`, `/learn/five-questions`, `/learn/basics`. */
import { useLocation } from 'react-router-dom';
import { LargeTitleNavBar } from '../../components/ios/LargeTitleNavBar';
import { useDocumentTitle, useStackBack } from '../../shell/StubPage';
import { GameGuide } from '../../components/learn/GameGuide';
import { FiveQuestions } from '../../components/learn/FiveQuestionsChapter';
import { TradingBasics } from '../../components/learn/TradingBasics';
import { chapterForPath, LEARN_PATHS, type ChapterId } from '../../components/learn/learnLogic';
import { FIVE_QUESTIONS_TITLE, GUIDE_COPY, TRADING_BASICS_TITLE } from '../../components/learn/learnCopy';
import '../../components/learn/learn.css';

const CHAPTERS: Record<ChapterId, { title: string; inline: string; Body: () => JSX.Element }> = {
  guide: { title: GUIDE_COPY.title, inline: GUIDE_COPY.title, Body: GameGuide },
  fiveQuestions: { title: FIVE_QUESTIONS_TITLE, inline: '5 questions', Body: FiveQuestions },
  basics: { title: TRADING_BASICS_TITLE, inline: TRADING_BASICS_TITLE, Body: TradingBasics },
};

export default function GuideChapterPage() {
  const { pathname } = useLocation();
  const chapter = CHAPTERS[chapterForPath(pathname) ?? 'guide'];
  const back = useStackBack(LEARN_PATHS.root);
  useDocumentTitle(chapter.title);
  const { Body } = chapter;
  return (
    <>
      <LargeTitleNavBar title={chapter.title} inlineTitle={chapter.inline} back={back} />
      <div className="bx-page bx-learn bx-learn-chapter">
        <Body />
      </div>
    </>
  );
}
