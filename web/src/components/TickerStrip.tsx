/**
 * TickerStrip — a horizontally scrolling marquee of every company's ticker,
 * current price, and day change (colored green/red).
 *
 * The content is duplicated end-to-end and translated with a CSS keyframe so
 * the scroll loops seamlessly. Each entry links through to that company's
 * research page. Honors `prefers-reduced-motion` (the animation is paused via
 * the global reduced-motion rule).
 *
 * The component is self-contained: its layout + the marquee keyframe are
 * injected once (guarded by id) so it renders correctly without external CSS,
 * while still emitting semantic class hooks the theme can enhance.
 */

import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import type { Company } from '@deca/shared';
import { classNames, formatPct, formatPrice } from '../lib/format';

export interface TickerStripProps {
  companies: Company[];
  /** Seconds for one full loop; larger = slower. Defaults to a length-based pace. */
  speedSeconds?: number;
  className?: string;
}

const STYLE_ID = 'ticker-strip-styles';
const CSS = `
.ticker-strip {
  position: relative;
  overflow: hidden;
  width: 100%;
  background: linear-gradient(180deg, var(--navy-900), var(--navy-800));
  border-top: 1px solid rgba(201, 161, 59, 0.25);
  border-bottom: 1px solid rgba(201, 161, 59, 0.25);
  box-shadow: inset 0 0 24px rgba(0, 0, 0, 0.45);
  -webkit-mask-image: linear-gradient(90deg, transparent, #000 6%, #000 94%, transparent);
  mask-image: linear-gradient(90deg, transparent, #000 6%, #000 94%, transparent);
}
.ticker-track {
  display: flex;
  width: max-content;
  animation-name: ticker-scroll;
  animation-timing-function: linear;
  animation-iteration-count: infinite;
}
.ticker-strip:hover .ticker-track { animation-play-state: paused; }
.ticker-group { display: flex; flex: none; }
.ticker-item {
  display: inline-flex;
  align-items: center;
  gap: 0.5em;
  padding: 0.55rem 1.1rem;
  border-right: 1px solid rgba(201, 161, 59, 0.12);
  font-size: var(--fs-sm);
  color: var(--text-on-deep);
  white-space: nowrap;
}
.ticker-item:hover { background: rgba(201, 161, 59, 0.08); }
.ticker-item__emoji { font-size: 1.05em; }
.ticker-item__symbol {
  font-family: var(--font-heading);
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--gold-200);
}
.ticker-item__price { color: var(--text-on-deep); }
.ticker-item__change { display: inline-flex; align-items: center; gap: 0.25em; }
@keyframes ticker-scroll {
  from { transform: translateX(0); }
  to { transform: translateX(-50%); }
}
@media (prefers-reduced-motion: reduce) {
  .ticker-track { animation: none; }
}
`;

function useInjectedStyles() {
  useEffect(() => {
    if (document.getElementById(STYLE_ID)) return;
    const el = document.createElement('style');
    el.id = STYLE_ID;
    el.textContent = CSS;
    document.head.appendChild(el);
  }, []);
}

function changeClass(dayChange: number): string {
  if (dayChange > 0) return 'gain';
  if (dayChange < 0) return 'loss';
  return 'flat';
}

function TickerEntry({ company }: { company: Company }) {
  const dir = changeClass(company.dayChange);
  const arrow = company.dayChange > 0 ? '▲' : company.dayChange < 0 ? '▼' : '◆';
  return (
    <Link to={`/research/${company.id}`} className="ticker-item" tabIndex={-1}>
      <span className="ticker-item__emoji" aria-hidden="true">
        {company.emoji}
      </span>
      <span className="ticker-item__symbol">{company.ticker}</span>
      <span className="ticker-item__price mono">{formatPrice(company.currentPrice)}</span>
      <span className={classNames('ticker-item__change mono', dir)}>
        <span aria-hidden="true">{arrow}</span>
        {formatPct(company.dayChange)}
      </span>
    </Link>
  );
}

export default function TickerStrip({
  companies,
  speedSeconds,
  className,
}: TickerStripProps) {
  useInjectedStyles();

  if (companies.length === 0) return null;

  // Pace the loop off the count so short and long lists feel similar.
  const duration = speedSeconds ?? Math.max(24, companies.length * 3.2);

  return (
    <div
      className={classNames('ticker-strip', className)}
      role="marquee"
      aria-label="Live company prices"
    >
      <div
        className="ticker-track"
        style={{ animationDuration: `${duration}s` }}
      >
        {/* Two copies back-to-back for a seamless wrap (-50% loop). */}
        {[0, 1].map((copy) => (
          <div className="ticker-group" key={copy} aria-hidden={copy === 1}>
            {companies.map((company) => (
              <TickerEntry key={`${copy}-${company.id}`} company={company} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
