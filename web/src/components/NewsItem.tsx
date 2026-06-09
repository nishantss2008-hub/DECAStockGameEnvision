/**
 * NewsItem — a single dispatch (news event) rendered as a parchment card.
 *
 * Shows an impact badge (categorized + tinted by whether the magnitude moved
 * prices up or down), the affected companies as linked chips, a relative
 * timestamp, the headline, and the body. `magnitude` is a signed fractional
 * price jump; its sign drives the gain/loss tint.
 */

import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import type { Company, NewsEvent } from '@deca/shared';
import { classNames, formatPct } from '../lib/format';

const STYLE_ID = 'news-item-styles';
const CSS = `
.news-item { display: flex; flex-direction: column; gap: var(--sp-3); }
.news-item__head {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  flex-wrap: wrap;
}
.news-item__magnitude { font-weight: 700; font-size: var(--fs-sm); }
.news-item__time { font-size: var(--fs-xs); white-space: nowrap; }
.news-item__headline {
  font-family: var(--font-heading);
  font-size: var(--fs-md);
  font-weight: 700;
  color: var(--ink-900);
  line-height: 1.25;
  margin: 0;
}
.news-item__body {
  color: var(--ink-700);
  font-size: var(--fs-sm);
  line-height: var(--lh-normal);
}
.news-item__companies { display: flex; flex-wrap: wrap; gap: var(--sp-2); }
.news-item__chip { text-transform: uppercase; letter-spacing: 0.04em; }
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

export interface NewsItemProps {
  news: NewsEvent;
  /** Optional company lookup so chips can show tickers/emoji and link out. */
  companies?: Record<string, Company>;
  className?: string;
}

const IMPACT_ICON: Record<string, string> = {
  merger: '🤝',
  scandal: '🗡️',
  storm: '🌊',
  discovery: '💎',
  regulatory: '📜',
  earnings: '📈',
  management: '⚓',
  macro: '🌍',
};

/** A short, human relative time like '3m ago', '2h ago', 'just now'. */
function relativeTime(epochMs: number): string {
  const diff = Date.now() - epochMs;
  if (diff < 0) return 'just now';
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  return `${days}d ago`;
}

export default function NewsItem({ news, companies, className }: NewsItemProps) {
  useInjectedStyles();
  const icon = IMPACT_ICON[news.impact] ?? '🪙';
  const up = news.magnitude > 0;
  const down = news.magnitude < 0;
  const tone = up ? 'badge--gain' : down ? 'badge--loss' : 'badge--gold';

  const absolute = new Date(news.firedAt).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <article className={classNames('news-item panel', className)}>
      <header className="news-item__head">
        <span className={classNames('badge', tone)}>
          <span aria-hidden="true">{icon}</span>
          {news.impact}
        </span>
        {news.magnitude !== 0 && (
          <span className={classNames('news-item__magnitude mono', up ? 'gain' : 'loss')}>
            {formatPct(news.magnitude)}
          </span>
        )}
        <span className="spacer" />
        <time
          className="news-item__time muted"
          dateTime={new Date(news.firedAt).toISOString()}
          title={absolute}
        >
          {relativeTime(news.firedAt)}
        </time>
      </header>

      <h3 className="news-item__headline">{news.headline}</h3>

      {news.body && <p className="news-item__body">{news.body}</p>}

      {news.companyIds.length > 0 && (
        <div className="news-item__companies">
          {news.companyIds.map((id) => {
            const company = companies?.[id];
            return (
              <Link key={id} to={`/research/${id}`} className="chip news-item__chip">
                {company?.emoji && (
                  <span aria-hidden="true">{company.emoji}</span>
                )}
                {company?.ticker ?? id}
              </Link>
            );
          })}
        </div>
      )}
    </article>
  );
}
