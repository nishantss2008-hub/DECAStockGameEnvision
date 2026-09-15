import { useId, type ReactNode } from 'react';
import { SignedChange } from './SignedChange';
import { cx } from './iosCx';
import {
  cashAvailableText,
  derivePositionFigures,
  positionSummaryCells,
  type PositionTermId,
} from './positionFigures';
import { DEFAULT_CURRENCY, type CurrencyNames } from './signedText';
import './iosShared.css';
import './PositionSummary.css';

export type PositionSummaryTermId = PositionTermId | 'cashAvailable';

export interface PositionSummaryProps {
  ticker: string;
  /** The crew's holding in this company, or null/undefined when it owns none. Money in cents. */
  holding: { shares: number; avgCost: number } | null | undefined;
  /** Live quote, integer cents. */
  quote: { price: number; sessionOpen: number };
  /** Account value (cash + holdings), integer cents, for "Share of account". */
  accountValue: number;
  /** Cash available to trade, integer cents. Always shown in the card footer. */
  cash: number;
  currency?: CurrencyNames;
  /** Renders the InfoTip "?" for a glossary id, e.g. `(id) => <InfoTip termId={id} />`. */
  renderInfoTip?: (termId: PositionSummaryTermId) => ReactNode;
  /** Section header (MOBILE §5.15 "Your position"). */
  title?: string;
  headingLevel?: 2 | 3;
  className?: string;
}

/**
 * PositionSummary (MOBILE §5.15): prominent "Your position" header → card with a 2-column grid of
 * six figures (each label has its "?") → footer "Cash available to trade: Ð…" + "?", shown owned
 * or not, so a student sees their cash before tapping Buy. Not owned: one line
 * "You don't own any KRKN yet" (COPY §9 `lines.youOwnNone`). One column at large text sizes.
 */
export function PositionSummary({
  ticker,
  holding,
  quote,
  accountValue,
  cash,
  currency = DEFAULT_CURRENCY,
  renderInfoTip,
  title = 'Your position',
  headingLevel = 2,
  className,
}: PositionSummaryProps) {
  const headingId = `position-summary-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const Heading = headingLevel === 3 ? 'h3' : 'h2';
  const figures = derivePositionFigures(holding, quote, accountValue);
  const cashLine = cashAvailableText(cash, currency);

  return (
    <section className={cx('position-summary', className)} aria-labelledby={headingId}>
      <Heading id={headingId} className="position-summary__title">
        {title}
      </Heading>
      <div className="position-summary__card">
        {figures ? (
          <dl className="position-summary__grid">
            {positionSummaryCells(figures, currency).map((cell) => (
              <div key={cell.id} className="position-summary__cell" data-cell={cell.id}>
                <dt className="position-summary__label">
                  <span>{cell.label}</span>
                  {renderInfoTip?.(cell.termId)}
                </dt>
                <dd className="position-summary__value ios-num">
                  {cell.kind === 'plain' ? (
                    <>
                      <span aria-hidden="true">{cell.text}</span>
                      <span className="ios-sr-only">{cell.spoken}</span>
                    </>
                  ) : (
                    <SignedChange value={cell.value} kind="money" pct={cell.pct} currency={currency} strong wrap />
                  )}
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="position-summary__none">You don&apos;t own any {ticker} yet</p>
        )}
        <p className="position-summary__footer">
          <span>
            {cashLine.label}:{' '}
            {/* The amount and its "?" wrap as one unit, so the "?" never sits alone on a line
                where it would overlap the text above and be cut off by the card (large text). */}
            <span className="position-summary__glue">
              <span className="ios-num" aria-hidden="true">
                {cashLine.text}
              </span>
              <span className="ios-sr-only">{cashLine.spoken}</span>
              {renderInfoTip?.('cashAvailable')}
            </span>
          </span>
        </p>
      </div>
    </section>
  );
}
