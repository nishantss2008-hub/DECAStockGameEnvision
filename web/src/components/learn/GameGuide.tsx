/** "How the game works" (COPY §7) with this game's settings; each rule has a "?" for its glossary term. */
import { useShellGame } from '../../shell/ShellData';
import { guideParagraphs } from './learnLogic';
import { GUIDE_COPY } from './learnCopy';
import { LearnBlock } from './LearnBlock';
import { TermInfo } from './TermInfo';

/** Glossary term explained by each guide paragraph. */
export const GUIDE_TERMS: Record<string, string> = {
  start: 'startingCash',
  ticks: 'tick',
  prices: 'news',
  fees: 'fee',
  impact: 'priceImpact',
  limit: 'positionLimit',
  health: 'quality',
  end: 'researchGrade',
};

export function GameGuide() {
  const { game } = useShellGame();
  return (
    <>
      <p className="bx-learn-intro">{GUIDE_COPY.flavor}</p>
      {guideParagraphs(game).map((p) => (
        <LearnBlock key={p.id} title={p.heading} info={GUIDE_TERMS[p.id] ? <TermInfo id={GUIDE_TERMS[p.id]!} /> : undefined}>
          <p className="bx-learn-text">{p.body}</p>
        </LearnBlock>
      ))}
    </>
  );
}
