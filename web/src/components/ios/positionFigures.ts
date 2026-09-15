/**
 * Pure numbers for PositionSummary (MOBILE §5.15). Money in integer cents.
 * Average cost leaves out fees (COPY §0.6), so total gain is value − shares × avgCost.
 */
import { DEFAULT_CURRENCY, formatMoneyCents, formatPercentPlain, spokenMoney, type CurrencyNames } from './signedText';

export interface PositionFigures {
  shares: number;
  /** Average price paid per share, cents. */
  avgCost: number;
  /** Current value = shares × price. */
  value: number;
  /** Total paid = shares × avgCost. */
  costBasis: number;
  /** value − costBasis. */
  totalGain: number;
  /** totalGain ÷ costBasis, null when nothing was paid. */
  totalGainFraction: number | null;
  /** shares × (price − sessionOpen). */
  sessionChange: number;
  /** value ÷ account value, null when the account value is 0. */
  shareOfAccount: number | null;
}

export function derivePositionFigures(
  holding: { shares: number; avgCost: number } | null | undefined,
  quote: { price: number; sessionOpen: number },
  accountValue: number,
): PositionFigures | null {
  if (!holding || !(holding.shares > 0)) return null;
  const { shares, avgCost } = holding;
  const value = shares * quote.price;
  const costBasis = shares * avgCost;
  const totalGain = value - costBasis;
  return {
    shares,
    avgCost,
    value,
    costBasis,
    totalGain,
    totalGainFraction: costBasis > 0 ? totalGain / costBasis : null,
    sessionChange: shares * (quote.price - quote.sessionOpen),
    shareOfAccount: accountValue > 0 ? value / accountValue : null,
  };
}

/** Glossary ids behind the PositionSummary "?" buttons (COPY §1.3 `position.*`). */
export type PositionTermId = 'stock' | 'invested' | 'avgCost' | 'totalGain' | 'sessionChange' | 'pctOfAccount';

interface CellBase {
  id: 'shares' | 'value' | 'avgCost' | 'totalGain' | 'sessionChange' | 'pctOfAccount';
  /** Visible label (MOBILE §5.15, from COPY §1.3 `position.*`). */
  label: string;
  termId: PositionTermId;
}

export interface PlainPositionCell extends CellBase {
  kind: 'plain';
  text: string;
  spoken: string;
}

export interface SignedPositionCell extends CellBase {
  kind: 'signed';
  /** Signed money change, integer cents. */
  value: number;
  /** Companion percent in parentheses, or null for none. */
  pct: number | null;
}

export type PositionCell = PlainPositionCell | SignedPositionCell;

const NOT_AVAILABLE = { text: '—', spoken: 'not available' };

/**
 * The six PositionSummary cells in reading order (2 columns × 3 rows):
 * Shares owned · Current value / Avg. price paid · Total gain/loss / Session change · Share of account.
 */
export function positionSummaryCells(f: PositionFigures, currency: CurrencyNames = DEFAULT_CURRENCY): PositionCell[] {
  const shares = f.shares.toLocaleString('en-US', { maximumFractionDigits: 0 });
  const pct = f.shareOfAccount === null ? NOT_AVAILABLE : percentOneDecimal(f.shareOfAccount);
  return [
    { id: 'shares', kind: 'plain', label: 'Shares owned', termId: 'stock', text: shares, spoken: `${shares} ${f.shares === 1 ? 'share' : 'shares'}` },
    { id: 'value', kind: 'plain', label: 'Current value', termId: 'invested', text: formatMoneyCents(f.value, currency), spoken: spokenMoney(f.value, currency) },
    { id: 'avgCost', kind: 'plain', label: 'Avg. price paid', termId: 'avgCost', text: formatMoneyCents(f.avgCost, currency), spoken: spokenMoney(f.avgCost, currency) },
    { id: 'totalGain', kind: 'signed', label: 'Total gain/loss', termId: 'totalGain', value: f.totalGain, pct: f.totalGainFraction },
    { id: 'sessionChange', kind: 'signed', label: 'Session change', termId: 'sessionChange', value: f.sessionChange, pct: null },
    { id: 'pctOfAccount', kind: 'plain', label: 'Share of account', termId: 'pctOfAccount', ...pct },
  ];
}

function percentOneDecimal(fraction: number): { text: string; spoken: string } {
  const text = formatPercentPlain(fraction, 1);
  return { text, spoken: `${text.slice(0, -1)} percent` };
}

/** Card footer, owned or not: "Cash available to trade: Ð248,349.55" (COPY §1.3 `portfolio.cashAvailable`). */
export function cashAvailableText(
  cashCents: number,
  currency: CurrencyNames = DEFAULT_CURRENCY,
): { label: string; text: string; spoken: string } {
  return { label: 'Cash available to trade', text: formatMoneyCents(cashCents, currency), spoken: spokenMoney(cashCents, currency) };
}
