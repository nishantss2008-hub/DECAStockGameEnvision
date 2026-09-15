import { ChangeTriangle } from './Pill';
import { cx } from './iosCx';
import {
  DEFAULT_CURRENCY,
  formatMoneyCents,
  signedParts,
  spokenMoney,
  type CurrencyNames,
  type SignedKind,
} from './signedText';
import './iosShared.css';
import './SignedChange.css';

export interface SignedChangeProps {
  /** Integer cents for `money`, a fraction for `pct` (0.0231 = +2.31%), a plain number for `number`. */
  value: number;
  kind: SignedKind;
  /** Optional companion percent shown in parentheses: "+Ð1.90 (+2.31%)". */
  pct?: number | null;
  /** Plain words after the value in `--label-2` regular, e.g. "this session". Also spoken. */
  suffix?: string;
  /** Draw the SVG triangle (default true). Never drawn for flat values. */
  caret?: boolean;
  /** 8px beside 11–15px text, 10px beside 17px+ (MOBILE §3.4). */
  caretSize?: 8 | 10;
  /** Semibold value text. */
  strong?: boolean;
  /** Decimal places (default 2). */
  digits?: number;
  currency?: CurrencyNames;
  /**
   * Hide the whole element from assistive tech, for when an enclosing label already says
   * the change (e.g. the StockHeader price sentence). Default false.
   */
  decorative?: boolean;
  /** Replaces the generated screen-reader words, e.g. "up 14.45 percent since you bought". */
  srLabel?: string;
  /**
   * `color` (default) uses `--gain`/`--loss`, for opaque surfaces only. `plain` inherits the
   * surrounding text colour, for glass bars where gain/loss text fails contrast (MOBILE §2.4);
   * the sign and triangle still show the direction.
   */
  tone?: 'color' | 'plain';
  /** Let the "(+14.45%)" companion wrap to its own line in narrow cells. */
  wrap?: boolean;
  className?: string;
}

/**
 * SignedChange (BRIEF §4, MOBILE §1.6 and §10): sign + SVG triangle + gain/loss colour, with
 * visually hidden words ("up 2.31 percent") so colour and the triangle never carry meaning
 * alone. Text colour is `--gain`/`--loss`, so place it only on opaque surfaces (MOBILE §2.2);
 * on a tinted capsule use ChangePill instead.
 */
export function SignedChange({
  value,
  kind,
  pct,
  suffix,
  caret = true,
  caretSize = 8,
  strong = false,
  digits,
  currency = DEFAULT_CURRENCY,
  decorative = false,
  srLabel,
  tone = 'color',
  wrap = false,
  className,
}: SignedChangeProps) {
  const main = signedParts(value, kind, { currency, digits });
  const companion = pct === null || pct === undefined ? null : signedParts(pct, 'pct');
  const spoken = srLabel ?? [main.spoken, companion?.spoken].filter(Boolean).join(', ') + (suffix ? ` ${suffix}` : '');

  return (
    <span
      className={cx('signed-change ios-num', strong && 'signed-change--strong', wrap && 'signed-change--wrap', className)}
      data-direction={main.direction}
      data-tone={tone}
      aria-hidden={decorative || undefined}
    >
      <span className="signed-change__visual" aria-hidden="true">
        <span className="signed-change__value">
          {/* The caret and the main value never separate; only the companion percent may wrap. */}
          <span className="signed-change__main">
            {caret && main.direction !== 'flat' && <ChangeTriangle direction={main.direction} size={caretSize} />}
            {main.text}
          </span>
          {companion && (
            <>
              {' '}
              <span className="signed-change__companion">({companion.text})</span>
            </>
          )}
        </span>
        {suffix && <span className="signed-change__suffix">{suffix}</span>}
      </span>
      {!decorative && <span className="ios-sr-only">{spoken}</span>}
    </span>
  );
}

export interface MoneyTextProps {
  /** Integer cents. */
  cents: number;
  currency?: CurrencyNames;
  className?: string;
}

/** Money for the eye ("Ð84.12") with the currency spelled out for VoiceOver ("84.12 doubloons", MOBILE §10). */
export function MoneyText({ cents, currency = DEFAULT_CURRENCY, className }: MoneyTextProps) {
  return (
    <span className={cx('ios-num', className)}>
      <span aria-hidden="true">{formatMoneyCents(cents, currency)}</span>
      <span className="ios-sr-only">{spokenMoney(cents, currency)}</span>
    </span>
  );
}
