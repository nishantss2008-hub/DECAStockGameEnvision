/**
 * Small host building blocks: the "?" that opens a host InfoTip sheet (no Learn link: the Learn tab is crew-only),
 * a metric legend, the host top bar with its phase status line, and loading / error states.
 */
import { useRef, useState, type ReactNode } from 'react';
import { RotateCw } from 'lucide-react';
import type { GameState } from '@deca/shared';
import { InfoTipButton } from '../ios/InfoTipButton';
import { InfoTipLines } from '../ios/InfoTipSheet';
import { Sheet } from '../ios/Sheet';
import { LargeTitleNavBar, StatusLine, type LargeTitleNavBarProps } from '../ios/LargeTitleNavBar';
import { EmptyState } from '../ios/EmptyState';
import { SkeletonList } from '../ios/Skeleton';
import type { StatusTone } from '../ios/Pill';
import { CompassLoader } from '../ios/CompassRose';
import { LOADING } from '../../shell/copy';
import { hostStatusText } from './adminFormat';
import { hostTermEntry } from './hostLogic';
import { HOST_PHONE } from './hostCopy';
import './admin.css';

/** "?" for a glossary or host-only term; opens a fitted InfoTip sheet. */
export function HostInfo({ termId }: { termId: string }) {
  const entry = hostTermEntry(termId);
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  if (!entry) return null;
  return (
    <>
      <InfoTipButton ref={button} entry={entry} onClick={() => setOpen(true)} />
      <Sheet
        open={open}
        onOpenChange={(next) => setOpen(next)}
        title={entry.label}
        subtitle={entry.term}
        headerLayout="leading"
        detents="fit"
        scrim="info"
        finalFocus={button}
      >
        <div className="bx-host-tip">
          <InfoTipLines entry={entry} headingLevel={3} />
        </div>
      </Sheet>
    </>
  );
}

/** A label followed by its "?". */
export function MetricLabel({ label, termId }: { label: ReactNode; termId: string }) {
  return (
    <span className="bx-host-metric">
      <span>{label}</span>
      <HostInfo termId={termId} />
    </span>
  );
}

/** "What these numbers mean": every metric on the screen with its "?" (phone lists have no column headers). */
export function MetricLegend({ items, label = HOST_PHONE.market.meaning }: { items: Array<{ label: string; termId: string }>; label?: string }) {
  return (
    <section className="bx-host-legend" aria-label={label}>
      <h2 className="t-footnote bx-host-legend__title">{label}</h2>
      <ul className="bx-host-legend__list">
        {items.map((i) => (
          <li key={i.termId}>
            <MetricLabel label={i.label} termId={i.termId} />
          </li>
        ))}
      </ul>
    </section>
  );
}

export function phaseTone(game: GameState | null): StatusTone {
  if (!game) return 'idle';
  return game.phase === 'live' ? 'open' : game.phase === 'paused' ? 'paused' : 'idle';
}

export function HostNavBar({ game, ...rest }: Omit<LargeTitleNavBarProps, 'statusLine'> & { game: GameState | null }) {
  return (
    <LargeTitleNavBar
      {...rest}
      statusLine={<StatusLine tone={phaseTone(game)}>{game ? hostStatusText(game.phase) : LOADING.generic.title}</StatusLine>}
    />
  );
}

export function HostLoading({ rows = 6 }: { rows?: number }) {
  return (
    <div className="bx-host-loading" aria-busy="true">
      <SkeletonList rows={rows} />
      <span className="ios-sr-only">{LOADING.generic.title}</span>
    </div>
  );
}

export function HostLoadError({ onRetry, message }: { onRetry?: () => void; message?: string | null }) {
  return (
    <EmptyState
      icon={RotateCw}
      title={HOST_PHONE.loadError}
      body={message ?? HOST_PHONE.offlineBody}
      action={onRetry ? { label: HOST_PHONE.retry, onClick: onRetry } : undefined}
    />
  );
}

export function HostPageLoader() {
  return <CompassLoader label={LOADING.generic.title} flavor={LOADING.generic.flavor} />;
}
