/** "Trading basics" (COPY §8): explanation, worked example in doubloons (sample numbers), and a caution. */
import { GUIDE_COPY, TRADING_BASICS } from './learnCopy';
import { LEARN_MOBILE } from './learnLogic';
import { LearnBlock, LearnSub } from './LearnBlock';
import { TermInfo } from './TermInfo';
import { useCurrencyText } from './useCurrencyText';

export function TradingBasics() {
  const cur = useCurrencyText();
  return (
    <>
      <p className="bx-learn-note">{GUIDE_COPY.examplesNote}</p>
      {TRADING_BASICS.map((t) => (
        <LearnBlock key={t.id} id={`basics-${t.id}`} title={t.title} info={<TermInfo id={t.glossary} />}>
          <p className="bx-learn-text">{cur(t.explain)}</p>
          <LearnSub heading={LEARN_MOBILE.example}>
            <ol className="bx-learn-steps ios-num">
              {t.example.map((line) => (
                <li key={line}>{cur(line)}</li>
              ))}
            </ol>
          </LearnSub>
          <LearnSub heading={LEARN_MOBILE.keepInMind}>
            <p className="bx-learn-text">{cur(t.caution)}</p>
          </LearnSub>
        </LearnBlock>
      ))}
    </>
  );
}
