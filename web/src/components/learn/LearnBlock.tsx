/** A titled Learn card: Headline heading (+ optional "?") over a rounded --cell card, with an optional footnote. */
import { useId, type ReactNode } from 'react';

export interface LearnBlockProps {
  title: ReactNode;
  info?: ReactNode;
  /** Decorative lead, e.g. the question number. */
  badge?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  id?: string;
}

export function LearnBlock({ title, info, badge, footer, children, id }: LearnBlockProps) {
  const uid = useId();
  return (
    <section className="bx-learn-block" id={id} aria-labelledby={`${uid}-t`}>
      <div className="bx-learn-block__header">
        {badge && (
          <span className="bx-learn-block__badge ios-num" aria-hidden="true">
            {badge}
          </span>
        )}
        <h2 id={`${uid}-t`} className="bx-learn-block__title">
          {title}
        </h2>
        {info}
      </div>
      <div className="bx-learn-card">{children}</div>
      {footer && <p className="bx-learn-block__footer">{footer}</p>}
    </section>
  );
}

export function LearnSub({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <div className="bx-learn-sub">
      <h3 className="bx-learn-sub__heading">{heading}</h3>
      {children}
    </div>
  );
}
