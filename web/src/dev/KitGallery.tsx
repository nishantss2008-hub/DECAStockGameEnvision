/**
 * Dev-only component gallery (served at /kit.html by `vite`, never part of the production build).
 *
 * Renders every iOS component and chart in its states, in light and in dark (a `.dark` pane), with
 * BRIEF §7 data and COPY words. URL parameters make every screenshot reproducible:
 *   ?theme=both|light|dark   appearance (default both: light and dark panes side by side)
 *   ?text=large              28px root + html[data-large-text] (MOBILE §3.5 stacked rows, menu segments)
 *   ?bars=solid              html[data-solid-bars] (MOBILE §2.1 Solid bars)
 *   ?open=<overlay id>       opens one overlay on load (see OVERLAY_IDS)
 *   ?term=<glossary id>      opens the InfoTip sheet for a term
 *   ?section=<id>            renders only that section
 */
import { useEffect, useMemo, useState, type ComponentType } from 'react';
import { InfoTipSheet } from '../components/ios/InfoTipSheet';
import { SegmentedControl } from '../components/ios/SegmentedControl';
import { GLOSSARY } from '../lib/glossary';
import {
  BadgesSection,
  ChartsSection,
  ControlsSection,
  FeedbackSection,
  FoundationsSection,
  ListsSection,
  NavigationSection,
  OrnamentsSection,
  QuoteSection,
  SearchSection,
  TicketSection,
} from './kitSections';
import { OverlaysSection, isOverlayId } from './kitOverlays';
import { AppearanceContext, OpenTermContext, type Appearance } from './kitShared';
import './KitGallery.css';

type TextSize = 'default' | 'large';
type Bars = 'glass' | 'solid';

const SECTIONS: Array<{ id: string; title: string; Component: ComponentType }> = [
  { id: 'foundations', title: 'Foundations', Component: FoundationsSection },
  { id: 'navigation', title: 'Tab bar, top bar', Component: NavigationSection },
  { id: 'search', title: 'Search', Component: SearchSection },
  { id: 'lists', title: 'Lists and rows', Component: ListsSection },
  { id: 'controls', title: 'Controls', Component: ControlsSection },
  { id: 'badges', title: 'Pills and crests', Component: BadgesSection },
  { id: 'quote', title: 'Quote and position', Component: QuoteSection },
  { id: 'charts', title: 'Charts', Component: ChartsSection },
  { id: 'feedback', title: 'Banners and states', Component: FeedbackSection },
  { id: 'ticket', title: 'Keypad and swipe', Component: TicketSection },
  { id: 'ornaments', title: 'Ornaments', Component: OrnamentsSection },
];

function readParams() {
  const params = new URLSearchParams(window.location.search);
  const theme = params.get('theme');
  const open = params.get('open');
  return {
    appearance: (theme === 'light' || theme === 'dark' ? theme : 'both') as Appearance,
    text: (params.get('text') === 'large' ? 'large' : 'default') as TextSize,
    bars: (params.get('bars') === 'solid' ? 'solid' : 'glass') as Bars,
    open: isOverlayId(open) ? open : null,
    term: params.get('term'),
    section: params.get('section'),
  };
}

function writeParam(key: string, value: string | null) {
  const url = new URL(window.location.href);
  if (value === null) url.searchParams.delete(key);
  else url.searchParams.set(key, value);
  window.history.replaceState(null, '', url);
}

export function KitGallery() {
  const initial = useMemo(readParams, []);
  const [appearance, setAppearance] = useState<Appearance>(initial.appearance);
  const [text, setText] = useState<TextSize>(initial.text);
  const [bars, setBars] = useState<Bars>(initial.bars);
  const [termId, setTermId] = useState<string | null>(initial.term && GLOSSARY[initial.term] ? initial.term : null);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', appearance === 'dark');
    // Light and Both pin the light tokens on the page even when the device is in dark mode
    // (kitLightTokens.ts); the dark pane and the Dark appearance use the real `.dark` tokens.
    root.classList.toggle('kit-light', appearance !== 'dark');
    root.dataset.kitAppearance = appearance;
    writeParam('theme', appearance === 'both' ? null : appearance);
  }, [appearance]);

  useEffect(() => {
    const root = document.documentElement;
    root.toggleAttribute('data-large-text', text === 'large');
    root.style.fontSize = text === 'large' ? '28px' : '';
    writeParam('text', text === 'large' ? 'large' : null);
  }, [text]);

  useEffect(() => {
    document.documentElement.toggleAttribute('data-solid-bars', bars === 'solid');
    writeParam('bars', bars === 'solid' ? 'solid' : null);
  }, [bars]);

  const visible = initial.section ? SECTIONS.filter((s) => s.id === initial.section) : SECTIONS;
  const showOverlays = !initial.section || initial.section === 'overlays';

  return (
    <AppearanceContext.Provider value={appearance}>
      <OpenTermContext.Provider value={setTermId}>
        <div className="kit" data-appearance={appearance}>
          <header className="kit-header">
            <div className="kit-header__titles">
              <p className="kit-header__eyebrow">Buccaneer Exchange · dev only</p>
              <h1 className="kit-header__title">Component kit</h1>
              <p className="kit-header__lede">
                Every phone component in each state, in light and dark, with the shared sample data. Not part of the production build.
              </p>
            </div>
            <div className="kit-toolbar" role="group" aria-label="Gallery settings">
              <div className="kit-toolbar__item">
                <span className="kit-toolbar__label">Appearance</span>
                <SegmentedControl
                  ariaLabel="Appearance"
                  value={appearance}
                  onChange={setAppearance}
                  options={[
                    { value: 'both', label: 'Both' },
                    { value: 'light', label: 'Light' },
                    { value: 'dark', label: 'Dark' },
                  ]}
                />
              </div>
              <div className="kit-toolbar__item">
                <span className="kit-toolbar__label">Text size</span>
                <SegmentedControl
                  ariaLabel="Text size"
                  value={text}
                  onChange={setText}
                  options={[
                    { value: 'default', label: 'Default' },
                    { value: 'large', label: 'Large' },
                  ]}
                />
              </div>
              <div className="kit-toolbar__item">
                <span className="kit-toolbar__label">Bars</span>
                <SegmentedControl
                  ariaLabel="Bars"
                  value={bars}
                  onChange={setBars}
                  options={[
                    { value: 'glass', label: 'Glass' },
                    { value: 'solid', label: 'Solid' },
                  ]}
                />
              </div>
            </div>
            <nav className="kit-index" aria-label="Sections">
              <ul role="list">
                {[...SECTIONS, { id: 'overlays', title: 'Overlays' }].map((s) => (
                  <li key={s.id}>
                    <a className="kit-index__link" href={`#${s.id}`}>
                      {s.title}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </header>

          <main className="kit-main">
            {visible.map(({ id, Component }) => (
              <Component key={`${id}-${appearance}`} />
            ))}
            {showOverlays ? <OverlaysSection initial={initial.open} /> : null}
          </main>

          <InfoTipSheet entry={termId ? GLOSSARY[termId] ?? null : null} onOpenChange={(open) => !open && setTermId(null)} />
        </div>
      </OpenTermContext.Provider>
    </AppearanceContext.Provider>
  );
}
