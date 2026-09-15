/**
 * "Read a company in 5 questions" (COPY §6): per question, the metrics to look at (each opens its InfoTip), where
 * to find them on the phone, what to compare, a worked example with sample numbers, and the caution tip.
 */
import { CircleQuestionMark } from 'lucide-react';
import { GLOSSARY, infoTipAriaLabel } from '../../lib/glossary';
import { useSheet } from '../../shell/useSheet';
import { FIVE_QUESTIONS } from './fiveQuestions';
import { GUIDE_COPY } from './learnCopy';
import { LEARN_MOBILE, phoneWhere } from './learnLogic';
import { LearnBlock, LearnSub } from './LearnBlock';
import { useCurrencyText } from './useCurrencyText';

/** COPY §3.2 research.fiveQuestionsNote. */
export const FIVE_QUESTIONS_NOTE = 'Each answer is one clue, not the whole story.';

export function TermChips({ ids }: { ids: readonly string[] }) {
  const { open } = useSheet();
  return (
    <ul className="bx-learn-chips">
      {ids.map((id) => {
        const entry = GLOSSARY[id];
        if (!entry) return null;
        return (
          <li key={id}>
            <button type="button" className="bx-learn-chip" aria-haspopup="dialog" aria-label={infoTipAriaLabel(entry)} onClick={() => open({ kind: 'term', id })}>
              <span>{entry.label}</span>
              <CircleQuestionMark size={17} strokeWidth={1.75} aria-hidden="true" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function FiveQuestions() {
  const cur = useCurrencyText();
  return (
    <>
      <p className="bx-learn-intro">{FIVE_QUESTIONS_NOTE}</p>
      <p className="bx-learn-note">{GUIDE_COPY.examplesNote}</p>
      {FIVE_QUESTIONS.map((q, i) => (
        <LearnBlock key={q.id} id={`question-${q.id}`} badge={i + 1} title={q.question} footer={cur(q.tip)}>
          <LearnSub heading={LEARN_MOBILE.lookAt}>
            <TermChips ids={q.lookAt} />
          </LearnSub>
          <LearnSub heading={LEARN_MOBILE.whereToFind}>
            <ul className="bx-learn-where">
              {phoneWhere(q.where).map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </LearnSub>
          <LearnSub heading={LEARN_MOBILE.compare}>
            <p className="bx-learn-text">{cur(q.compare)}</p>
          </LearnSub>
          <LearnSub heading={LEARN_MOBILE.example}>
            <p className="bx-learn-text bx-learn-example ios-num">{cur(q.example)}</p>
          </LearnSub>
        </LearnBlock>
      ))}
    </>
  );
}
