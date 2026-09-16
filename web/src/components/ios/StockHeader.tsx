import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Sector } from '@deca/shared';
import { DURATION_MS } from '../../theme/motion';
import { Crest } from './Crest';
import { ChangeTriangle } from './Pill';
import { SignedChange } from './SignedChange';
import { cx } from './iosCx';
import { DEFAULT_CURRENCY, formatMoneyCents, type CurrencyNames } from './signedText';
import { splitLastWord } from './labelText';
import { asOfText, scrubLineText, stockBarSubtitle, stockPriceSentence, type StockHeaderScrub } from './stockHeaderText';
import './iosShared.css';
import './StockHeader.css';

/** Text followed by an optional "?", with the last word and the "?" kept on one line (labelText.ts). */
function WithInfo({ text, info }: { text: string; info: ReactNode }) {
  if (!info) return <span>{text}</span>;
  const [head, last] = splitLastWord(text);
  return (
    <span>
      {head}
      <span className="stock-header__glue">
        {last}
        {info}
      </span>
    </span>
  );
}

/** Glossary ids for the header's "?" buttons (COPY §1.1: `sessionChange`, `tick`). */
export type StockHeaderTermId = 'sessionChange' | 'tick';

export type { StockHeaderScrub };

export interface StockHeaderProps {
  name: string;
  ticker: string;
  /** Absent on the broad fund, which tracks the whole market rather than one sector. */
  sector?: Sector;
  /** Last price, integer cents. */
  price: number;
  /** Session open price, integer cents (for the money change). */
  sessionOpen: number;
  /** `Company.sessionChange`: signed fraction vs the session open. */
  sessionChange: number;
  /** Tick of the last price. */
  tick: number;
  /** Time of the last price, e.g. "14:02:30". */
  timeText: string;
  /** While the chart is scrubbed: the price and change lines show the scrubbed point instead. */
  scrub?: StockHeaderScrub | null;
  currency?: CurrencyNames;
  /** Renders the InfoTip "?" for a glossary id, e.g. `(id) => <InfoTip termId={id} />`. */
  renderInfoTip?: (termId: StockHeaderTermId) => ReactNode;
  /** The company page's one `<h1>` by default. */
  headingLevel?: 1 | 2;
  className?: string;
}

/**
 * StockHeader (MOBILE §5.14): crest 44 · name over "KRKN · sector" → price (Large Title) →
 * "▲ +Ð1.90 (+2.31%) this session" + ? → "As of tick 1,284 · 14:02:30" + ?.
 * The price block has one spoken sentence ("Kraken Shipping Lines, 84.12 doubloons, up 2.31
 * percent this session"); ticking prices are never announced (no live region). A new price
 * flashes its background for 300ms, except under reduced motion.
 */
export function StockHeader({
  name,
  ticker,
  sector,
  price,
  sessionOpen,
  sessionChange,
  tick,
  timeText,
  scrub = null,
  currency = DEFAULT_CURRENCY,
  renderInfoTip,
  headingLevel = 1,
  className,
}: StockHeaderProps) {
  const Heading = headingLevel === 1 ? 'h1' : 'h2';
  const spokenSentence = stockPriceSentence(name, price, sessionChange, currency);

  // Price flash on a new tick (not while scrubbing). The key restarts the CSS animation; the flash
  // switches off after its 300ms (--dur-flash) or when a scrub starts, so releasing a scrub never
  // replays an old flash. A timer, not animationend, because reduced motion runs no animation.
  const previous = useRef(price);
  const [flash, setFlash] = useState<{ direction: 'up' | 'down'; n: number; active: boolean } | null>(null);
  useEffect(() => {
    if (price === previous.current) return;
    const direction = price > previous.current ? 'up' : 'down';
    previous.current = price;
    setFlash((f) => ({ direction, n: (f?.n ?? 0) + 1, active: true }));
  }, [price]);
  const scrubbing = scrub !== null;
  const flashActive = Boolean(flash?.active);
  useEffect(() => {
    if (!flashActive) return undefined;
    const end = () => setFlash((f) => (f && f.active ? { ...f, active: false } : f));
    if (scrubbing) {
      end();
      return undefined;
    }
    const timer = setTimeout(end, DURATION_MS.flash);
    return () => clearTimeout(timer);
  }, [flashActive, flash?.n, scrubbing]);

  const shownPrice = scrub ? scrub.price : price;

  return (
    <div className={cx('stock-header', className)} data-scrubbing={scrub ? '' : undefined}>
      <div className="stock-header__identity">
        <Crest ticker={ticker} sector={sector} size={44} />
        <div className="stock-header__names">
          <Heading className="stock-header__name">{name}</Heading>
          <p className="stock-header__meta">
            {ticker} · {sector}
          </p>
        </div>
      </div>

      <div className="stock-header__quote">
        <p className="ios-sr-only">{spokenSentence}</p>
        <p
          key={scrub ? 'scrub' : `live-${flash?.n ?? 0}`}
          className="stock-header__price ios-num"
          data-flash={!scrub && flash?.active ? flash.direction : undefined}
          aria-hidden="true"
        >
          <span className="stock-header__price-value">{formatMoneyCents(shownPrice, currency)}</span>
        </p>

        {scrub ? (
          <p className="stock-header__line stock-header__scrub ios-num" aria-hidden="true">
            {scrubLineText(scrub.timeText, scrub.tick)}
          </p>
        ) : (
          <p className="stock-header__line stock-header__change">
            <SignedChange value={price - sessionOpen} kind="money" pct={sessionChange} strong currency={currency} decorative />{' '}
            <span className="stock-header__suffix">
              <WithInfo text="this session" info={renderInfoTip?.('sessionChange')} />
            </span>
          </p>
        )}

        <p className="stock-header__asof ios-num" data-hidden={scrub ? '' : undefined}>
          <WithInfo text={asOfText(tick, timeText)} info={renderInfoTip?.('tick')} />
        </p>
      </div>
    </div>
  );
}

export interface StockBarSubtitleProps {
  /** Last price, integer cents. */
  price: number;
  /** Signed session change as a fraction. */
  sessionChange: number;
  currency?: CurrencyNames;
  className?: string;
}

/**
 * Collapsed-bar subtitle for a company page (MOBILE §5.14): "Ð84.12 · ▲ +2.31%". It sits on glass,
 * so it inherits the bar's `--label-2` instead of gain/loss colour (MOBILE §2.4); the sign and
 * triangle carry the direction. Hidden from assistive tech: StockHeader says it once (MOBILE §10).
 */
export function StockBarSubtitle({ price, sessionChange, currency = DEFAULT_CURRENCY, className }: StockBarSubtitleProps) {
  const { price: priceText, change } = stockBarSubtitle(price, sessionChange, currency);
  return (
    <span className={cx('stock-bar-subtitle ios-num', className)} aria-hidden="true">
      {priceText} ·{' '}
      <span className="stock-bar-subtitle__change">
        {change.direction !== 'flat' && <ChangeTriangle direction={change.direction} size={8} />}
        {change.text}
      </span>
    </span>
  );
}
