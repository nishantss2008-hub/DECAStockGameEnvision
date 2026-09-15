/**
 * InfoTipSheet (MOBILE §5.9, §7.14): the phone explanation for a "?" tap.
 *
 * Opaque sheet at content height (up to large) over a light scrim: label (Title 2) and term,
 * then What it is / Why it matters / Usually a good sign when…, then a Tinted "Open in Learn"
 * link to `/learn/glossary/:termId`. Lives in the URL as `?sheet=term&id=peRatio` (§6.5).
 *
 * `InfoTipLines` renders the same three blocks for inline "?" rows inside sheets and the
 * Learn term page, so every surface uses the COPY §2 text the same way.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { GlossaryEntry } from '../../lib/glossary';
import { Sheet } from './Sheet';
import './Button.css';
import './InfoTipSheet.css';

export interface InfoTipCopy {
  whatItIs: string;
  whyItMatters: string;
  /** Heading of the third block; the entry text continues the sentence (COPY §0.4). */
  usuallyGood: string;
  openInLearn: string;
  close: string;
}

/** MOBILE §5.9 / §7.14 wording. */
export const INFO_TIP_COPY: InfoTipCopy = {
  whatItIs: 'What it is',
  whyItMatters: 'Why it matters',
  usuallyGood: 'Usually a good sign when…',
  openInLearn: 'Open in Learn',
  close: 'Close',
};

export function glossaryTermPath(termId: string): string {
  return `/learn/glossary/${encodeURIComponent(termId)}`;
}

export interface InfoTipLinesProps {
  entry: GlossaryEntry;
  copy?: Pick<InfoTipCopy, 'whatItIs' | 'whyItMatters' | 'usuallyGood'>;
  /** Heading level for the block titles (h3 inside a sheet whose title is an h2). */
  headingLevel?: 3 | 4;
  /** `inline` uses Subhead text for rows that expand inside a sheet (§5.9). */
  density?: 'sheet' | 'inline';
  id?: string;
}

export function InfoTipLines({ entry, copy = INFO_TIP_COPY, headingLevel = 3, density = 'sheet', id }: InfoTipLinesProps) {
  const H = headingLevel === 3 ? 'h3' : 'h4';
  const block = (heading: string, body: ReactNode) => (
    <div className="ios-infotip-lines__block">
      <H className="ios-infotip-lines__heading">{heading}</H>
      <p className="ios-infotip-lines__body">{body}</p>
    </div>
  );
  return (
    <div className="ios-infotip-lines" data-density={density} id={id}>
      {block(copy.whatItIs, entry.whatItIs)}
      {block(copy.whyItMatters, entry.whyItMatters)}
      {block(
        copy.usuallyGood,
        <>
          <span aria-hidden="true">…</span>
          {entry.usuallyGoodWhen}
        </>,
      )}
    </div>
  );
}

export interface InfoTipSheetProps {
  /** The term to explain; `null` when no term sheet is in the URL. */
  entry: GlossaryEntry | null;
  /** Defaults to `entry !== null`. */
  open?: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called when "Open in Learn" is pressed, before the link navigates. */
  onOpenInLearn?: (entry: GlossaryEntry) => void;
  learnHref?: (termId: string) => string;
  copy?: InfoTipCopy;
}

export function InfoTipSheet({
  entry,
  open,
  onOpenChange,
  onOpenInLearn,
  learnHref = glossaryTermPath,
  copy = INFO_TIP_COPY,
}: InfoTipSheetProps) {
  const isOpen = open ?? entry !== null;
  // Keep the last term on screen while the sheet animates out after the URL param is removed.
  const [shown, setShown] = useState<GlossaryEntry | null>(entry);
  useEffect(() => {
    if (entry) setShown(entry);
  }, [entry]);

  const current = entry ?? shown;
  if (!current) return null;

  return (
    <Sheet
      open={isOpen && current !== null}
      onOpenChange={(next) => onOpenChange(next)}
      onClosed={() => {
        if (!entry) setShown(null);
      }}
      title={current.label}
      subtitle={current.term}
      headerLayout="leading"
      detents="fit"
      scrim="info"
      closeLabel={copy.close}
      className="ios-infotip-sheet"
    >
      <InfoTipLines entry={current} copy={copy} />
      <div className="ios-infotip-sheet__actions">
        <Link
          to={learnHref(current.id)}
          className="ios-button"
          data-style="tinted"
          data-size="medium"
          onClick={() => onOpenInLearn?.(current)}
        >
          <span className="ios-button__label">{copy.openInLearn}</span>
        </Link>
      </div>
    </Sheet>
  );
}
