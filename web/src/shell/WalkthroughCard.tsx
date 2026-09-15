/**
 * Walkthrough card for the top of Portfolio (MOBILE §7.2): TagPill · Title 3 · "Step n of 3" · step title/body ·
 * decorative dots · Tinted action, Plain Back/Next · Plain "Got it, hide this" · "Open the Learn guide".
 * Renders nothing unless the walkthrough is open. Hiding shows an Undo toast.
 */
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ios/Button';
import { TagPill } from '../components/ios/Pill';
import { useToast } from '../components/ios/Toast';
import { useWalkthrough } from './useWalkthrough';
import { MOBILE, WALKTHROUGH, fill } from './copy';

export function WalkthroughCard() {
  const w = useWalkthrough();
  const navigate = useNavigate();
  const toast = useToast();
  if (!w.open) return null;
  const step = WALKTHROUGH.steps[w.step] ?? WALKTHROUGH.steps[0];
  const counterId = 'bx-walkthrough-step';

  const hide = () => {
    const before = w.state;
    w.dismiss();
    toast.show({ title: MOBILE.toasts.walkthroughHidden, action: { label: MOBILE.toasts.undo, onAction: () => w.restore(before) } });
  };

  return (
    <section className="bx-walkthrough" aria-labelledby="bx-walkthrough-title">
      <TagPill>{WALKTHROUGH.eyebrow}</TagPill>
      <h2 id="bx-walkthrough-title" className="t-title-3 t-emph bx-walkthrough__title">
        {WALKTHROUGH.title}
      </h2>
      <p id={counterId} className="t-footnote bx-walkthrough__counter">
        {fill(WALKTHROUGH.stepCounter, { n: w.step + 1 })}
      </p>
      <h3 className="t-headline bx-walkthrough__step">{step.title}</h3>
      <p className="t-subhead bx-walkthrough__body">{step.body}</p>
      <div className="bx-walkthrough__dots" aria-hidden="true">
        {WALKTHROUGH.steps.map((s, i) => (
          <span key={s.id} data-current={i === w.step || undefined} />
        ))}
      </div>
      <div className="bx-walkthrough__actions">
        <Button variant="tinted" size="medium" onClick={() => navigate(step.route)}>
          {step.action}
        </Button>
        <span className="bx-walkthrough__pager">
          {w.step > 0 && (
            <Button variant="plain" size="medium" onClick={w.back} aria-describedby={counterId}>
              {WALKTHROUGH.back}
            </Button>
          )}
          {w.step < w.steps - 1 && (
            <Button variant="plain" size="medium" onClick={w.next} aria-describedby={counterId}>
              {WALKTHROUGH.next}
            </Button>
          )}
        </span>
      </div>
      <div className="bx-walkthrough__footer">
        <Button variant="plain" size="small" onClick={hide}>
          {WALKTHROUGH.dismiss}
        </Button>
        <a className="bx-walkthrough__link t-subhead" href="/learn/guide" onClick={(e) => { e.preventDefault(); navigate('/learn/guide'); }}>
          {WALKTHROUGH.learnLink}
        </a>
      </div>
    </section>
  );
}
