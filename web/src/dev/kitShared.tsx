/**
 * Shared scaffolding for the dev-only component gallery: appearance panes, demo captions,
 * glossary lookups and the InfoTip opener.
 */
import { createContext, useContext, type ReactNode } from 'react';
import { COPY_DATA, GLOSSARY, type GlossaryEntry } from '../lib/glossary';
import { InfoTipButton } from '../components/ios/InfoTipButton';

export type Appearance = 'both' | 'light' | 'dark';
export type PaneTone = 'light' | 'dark';

export const AppearanceContext = createContext<Appearance>('both');

/** Glossary entry by id; the gallery only uses ids that exist (glossary.test.ts lists them). */
export function term(id: string): GlossaryEntry {
  const entry = GLOSSARY[id];
  if (!entry) throw new Error(`Kit: unknown glossary id "${id}"`);
  return entry;
}

/** COPY §3.1 plain label with the short finance term, e.g. "Price vs. profit (P/E)". */
export function explainLabel(id: string): string {
  return COPY_DATA.explain.find((t) => t.id === id)?.label ?? term(id).label;
}

/** Opens the InfoTip sheet for a glossary id (the gallery mounts one sheet at its root). */
export const OpenTermContext = createContext<(id: string) => void>(() => {});

/** "?" button that opens the shared InfoTip sheet. */
export function Tip({ id }: { id: string }) {
  const open = useContext(OpenTermContext);
  return <InfoTipButton entry={term(id)} onClick={() => open(id)} />;
}

export interface KitSectionProps {
  id: string;
  title: string;
  /** MOBILE.md section the component implements. */
  spec: string;
  note?: ReactNode;
  /**
   * Overlays portal to <body>, so they follow the page appearance instead of a pane.
   * Single sections render once; switch Appearance to review them dark.
   */
  single?: boolean;
  children: (tone: PaneTone) => ReactNode;
}

/** A gallery section: heading, then the demos once per appearance (light pane, `.dark` pane). */
export function KitSection({ id, title, spec, note, single = false, children }: KitSectionProps) {
  const appearance = useContext(AppearanceContext);
  const panes: PaneTone[] = single || appearance !== 'both' ? [appearance === 'dark' ? 'dark' : 'light'] : ['light', 'dark'];
  return (
    <section id={id} className="kit-section" aria-labelledby={`${id}-title`}>
      <header className="kit-section__header">
        <h2 id={`${id}-title`} className="kit-section__title">
          {title}
        </h2>
        <p className="kit-section__spec">{spec}</p>
        {note ? <p className="kit-section__note">{note}</p> : null}
      </header>
      <div className="kit-section__panes" data-count={panes.length}>
        {panes.map((tone) => (
          <div
            key={tone}
            className={['kit-pane', panes.length > 1 ? (tone === 'dark' ? 'dark' : 'kit-light') : null].filter(Boolean).join(' ')}
            data-tone={tone}
          >
            {panes.length > 1 ? (
              <p className="kit-pane__label" aria-hidden="true">
                {tone === 'dark' ? 'Dark' : 'Light'}
              </p>
            ) : null}
            {children(tone)}
          </div>
        ))}
      </div>
    </section>
  );
}

export function KitDemo({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <figure className="kit-demo" data-wide={wide ? '' : undefined}>
      <figcaption className="kit-demo__label">{label}</figcaption>
      <div className="kit-demo__body">{children}</div>
    </figure>
  );
}

/** A phone-width frame. Fixed-position chrome (tab bar, top bar) is positioned inside it. */
export function PhoneFrame({ children, height, scrollTop = 0, label }: { children: ReactNode; height: number; scrollTop?: number; label: string }) {
  return (
    <div className="kit-phone" style={{ height }} role="group" aria-label={label}>
      <div
        className="kit-phone__scroll"
        ref={(node) => {
          if (node && scrollTop) node.scrollTop = scrollTop;
        }}
      >
        {children}
      </div>
    </div>
  );
}
