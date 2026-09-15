/**
 * News dispatch card (MOBILE §7.11): TagPill (icon + type) · sentiment text · time · "You own this" → headline link
 * (stretched over the card) → "What this means" (NEWS_EXPLAIN) → "since the news" chips that open the company.
 * Chips are sibling links raised above the stretched link; there is never a link inside a link, and never a Trade button.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Company, NewsEvent } from '@deca/shared';
import { Crest } from '../ios/Crest';
import { InfoTipButton } from '../ios/InfoTipButton';
import { InfoTipSheet } from '../ios/InfoTipSheet';
import { TagPill, YouPill } from '../ios/Pill';
import { useCompositeHistory } from '../../hooks/useMarket';
import { NEWS_BADGE, NEWS_EXPLAIN } from '../../lib/glossary';
import { fill } from '../../shell/copy';
import { ChangeText, companyPath } from './MarketSections';
import { NEWS } from './marketCopy';
import { MAX_CHIPS, NEWS_TYPE_ICONS, chipMode, clockHM, compositeSince, sinceChips, sinceEntry, sinceSpoken } from './newsView';
import { TermTip } from './TermTip';

const SINCE_ENTRY = sinceEntry();

/** Local controlled InfoTip for "since the news" (not a glossary term, so it is not a `?sheet=term` route). */
export function useSinceTip() {
  const [open, setOpen] = useState(false);
  return {
    openTip: () => setOpen(true),
    sheet: <InfoTipSheet entry={open ? SINCE_ENTRY : null} open={open} onOpenChange={setOpen} />,
  };
}

export function SinceTipButton({ onOpen }: { onOpen: () => void }) {
  return <InfoTipButton entry={SINCE_ENTRY} className="bx-tip" onClick={onOpen} />;
}

export function DispatchMeta({ event, owned, withTick = false }: { event: NewsEvent; owned: boolean; withTick?: boolean }) {
  const time = clockHM(event.firedAt);
  const sentiment = NEWS.sentiment[event.sentiment].short;
  return (
    <p className="bx-dispatch__meta t-footnote">
      <TagPill icon={NEWS_TYPE_ICONS[event.type]}>{NEWS_BADGE[event.type]}</TagPill>
      <span className="bx-dispatch__sentiment">{sentiment}</span>
      {owned && <YouPill>{NEWS.youOwn}</YouPill>}
      <span className="bx-muted num">{withTick ? fill(NEWS.tickLine, { time, tick: event.tick.toLocaleString('en-US') }) : time}</span>
      {withTick && event.source === 'host' && <span className="bx-muted">{NEWS.sourceHost}</span>}
    </p>
  );
}

export function WhatThisMeans({ event, className }: { event: NewsEvent; className?: string }) {
  return (
    <div className={className ? `bx-dispatch__means ${className}` : 'bx-dispatch__means'}>
      <p className="t-footnote bx-dispatch__means-label">{NEWS.whatThisMeans}</p>
      <p className="t-subhead">{NEWS_EXPLAIN[event.type][event.sentiment]}</p>
    </div>
  );
}

/** "11 companies · Composite ▲ +0.61% since the news" for macro or wide dispatches. */
export function MarketLine({ event, compositeNow }: { event: NewsEvent; compositeNow: number | null }) {
  const { points } = useCompositeHistory(event.tick, event.tick);
  const pct = compositeSince(points[0]?.value ?? null, compositeNow);
  return (
    <p className="bx-dispatch__market t-subhead">
      <span className="num">{fill(NEWS.companyCount, { n: event.companyIds.length })}</span>
      {pct !== null && (
        <>
          <span aria-hidden="true">·</span>
          <span>{NEWS.composite}</span>
          <ChangeText value={pct} />
          <span className="bx-label-q">
            <span className="bx-muted">{fill(NEWS.sinceReport, { pct: '' }).trim()}</span>
            <TermTip id="index" />
          </span>
        </>
      )}
    </p>
  );
}

export interface DispatchCardProps {
  event: NewsEvent;
  byId: Record<string, Company>;
  owned: boolean;
  compositeNow: number | null;
  onSinceHelp: () => void;
}

export function DispatchCard({ event, byId, owned, compositeNow, onSinceHelp }: DispatchCardProps) {
  const chips = chipMode(event) === 'companies' ? sinceChips(event, byId).slice(0, MAX_CHIPS) : [];
  const headingId = `bx-dispatch-${event.id}`;
  return (
    <article className="bx-dispatch" aria-labelledby={headingId}>
      <DispatchMeta event={event} owned={owned} />
      <h2 id={headingId} className="t-headline bx-dispatch__headline">
        <Link to={`/news/${encodeURIComponent(event.id)}`} className="bx-dispatch__link">
          {event.headline}
        </Link>
      </h2>
      <WhatThisMeans event={event} />
      {chipMode(event) === 'market' ? (
        <div className="bx-dispatch__chips">
          <MarketLine event={event} compositeNow={compositeNow} />
        </div>
      ) : (
        chips.length > 0 && (
          <div className="bx-dispatch__chips">
            <ul role="list" className="bx-dispatch__chip-list">
              {chips.map((chip) => (
                <li key={chip.companyId}>
                  <Link className="bx-since-chip" to={companyPath(chip.ticker, 'news')} aria-label={`${chip.ticker}, ${chip.name}, ${sinceSpoken(chip.pct)}`}>
                    <Crest ticker={chip.ticker} sector={chip.sector} size={28} />
                    <span className="bx-since-chip__ticker">{chip.ticker}</span>
                    <ChangeText value={chip.pct} />
                    <span className="bx-muted">{fill(NEWS.sinceReport, { pct: '' }).trim()}</span>
                  </Link>
                </li>
              ))}
            </ul>
            <SinceTipButton onOpen={onSinceHelp} />
          </div>
        )
      )}
    </article>
  );
}
