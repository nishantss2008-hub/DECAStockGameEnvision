/**
 * Sheets are search params on the current URL (MOBILE §6.5), so browser and Android Back close them:
 * `?sheet=trade&ticker=KRKN&side=buy` · `?sheet=term&id=peRatio` · `?sheet=account` · `?sheet=crew&id=:crewId` ·
 * `?sheet=status` · `?sheet=welcome` · `?sheet=help&set=markets-basics` · `?sheet=stat&id=peRatio`.
 * Pure parsing and building; the router side lives in useSheet.ts.
 */
import type { OrderSide } from '@deca/shared';

export const HELP_SETS = [
  'markets-basics',
  'markets-price',
  'markets-value',
  'markets-health',
  'markets-analysts',
  'positions',
  'results-scorecard',
  'statements-income',
  'statements-balance',
  'statements-cashflow',
  'company-analyst',
] as const;
export type HelpSet = (typeof HELP_SETS)[number];

export type SheetRequest =
  | { kind: 'trade'; ticker: string | null; side: OrderSide }
  | { kind: 'term'; id: string }
  | { kind: 'account' }
  | { kind: 'crew'; id: string }
  | { kind: 'status' }
  | { kind: 'welcome' }
  | { kind: 'help'; set: HelpSet }
  /** One stat of the company grid, explained (MOBILE §7.7). `id` is a MetricId or a stat field id. */
  | { kind: 'stat'; id: string };

export type SheetKind = SheetRequest['kind'];

/**
 * Sheets the page renders itself, because their content needs the page's data. SheetHost
 * leaves these alone; the page watches `useSheet().sheet` for them.
 */
export const PAGE_OWNED_SHEETS: ReadonlySet<SheetKind> = new Set<SheetKind>(['help', 'stat']);

/** Every param a sheet may own; closing a sheet removes all of them (`step` is the Trade sheet's inner step). */
export const SHEET_PARAM_KEYS = ['sheet', 'ticker', 'side', 'id', 'set', 'step'] as const;

const TICKER = /^[A-Za-z0-9]{1,8}$/;
const ID = /^[A-Za-z0-9_-]{1,64}$/;

const toParams = (search: string | URLSearchParams): URLSearchParams =>
  typeof search === 'string' ? new URLSearchParams(search) : new URLSearchParams(search);

export function parseSheet(search: string | URLSearchParams): SheetRequest | null {
  const p = toParams(search);
  const id = p.get('id');
  switch (p.get('sheet')) {
    case 'trade': {
      const ticker = p.get('ticker');
      return {
        kind: 'trade',
        ticker: ticker && TICKER.test(ticker) ? ticker.toUpperCase() : null,
        side: p.get('side') === 'sell' ? 'sell' : 'buy',
      };
    }
    case 'term':
      return id && ID.test(id) ? { kind: 'term', id } : null;
    case 'stat':
      return id && ID.test(id) ? { kind: 'stat', id } : null;
    case 'crew':
      return id && ID.test(id) ? { kind: 'crew', id } : null;
    case 'account':
      return { kind: 'account' };
    case 'status':
      return { kind: 'status' };
    case 'welcome':
      return { kind: 'welcome' };
    case 'help': {
      const set = p.get('set');
      return (HELP_SETS as readonly string[]).includes(set ?? '') ? { kind: 'help', set: set as HelpSet } : null;
    }
    default:
      return null;
  }
}

const serialize = (p: URLSearchParams): string => {
  const s = p.toString();
  return s ? `?${s}` : '';
};

/** The search string without any sheet params ('' or '?a=b'). */
export function withoutSheet(search: string | URLSearchParams): string {
  const p = toParams(search);
  for (const key of SHEET_PARAM_KEYS) p.delete(key);
  return serialize(p);
}

/** The search string with `req` as the only open sheet; page params are kept. */
export function withSheet(search: string | URLSearchParams, req: SheetRequest): string {
  const p = new URLSearchParams(withoutSheet(search));
  p.set('sheet', req.kind);
  switch (req.kind) {
    case 'trade':
      if (req.ticker) p.set('ticker', req.ticker);
      p.set('side', req.side);
      break;
    case 'term':
    case 'crew':
    case 'stat':
      p.set('id', req.id);
      break;
    case 'help':
      p.set('set', req.set);
      break;
    default:
      break;
  }
  return serialize(p);
}
