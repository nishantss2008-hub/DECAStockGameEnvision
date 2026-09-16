/** "Meet the market" as data: the card order, the step in the URL, and the completion check. */
import { describe, expect, it } from 'vitest';
import { SECTORS, type Company, type Fund } from '@deca/shared';
import { sectorSlug } from '../../lib/sector';
import { INTRO_COMPANIES } from './introCopy';
import {
  buildIntroStages,
  introComplete,
  introHref,
  introSearch,
  INTRO_PATH,
  INTRO_STEPS,
  stepFromSearch,
} from './introFlow';

const company = (ticker: string, sector: string, startPrice: number): Company =>
  ({ id: ticker.toLowerCase(), ticker, name: INTRO_COMPANIES[ticker]!.name, sector, startPrice, description: 'seed placeholder' }) as Company;

const fund = (ticker: string, name: string, description: string): Fund =>
  ({ kind: 'fund', id: ticker.toLowerCase(), ticker, name, description, startPrice: 10_000 }) as Fund;

const LIVE = {
  companies: [
    company('LVTH', 'Shipping & Salvage', 4_100),
    company('KRKN', 'Shipping & Salvage', 8_412),
    company('FDUT', 'Shipping & Salvage', 5_550),
    company('CJST', 'Provisions & Spice', 3_000),
    company('BRTH', 'Provisions & Spice', 3_100),
    company('GLGD', 'Provisions & Spice', 3_200),
  ],
  funds: [
    fund('FLEET', 'Grand Fleet Fund', 'The same amount of all 15 companies.'),
    fund('SHIPS', 'Shipping Lanes Fund', 'An equal slice of the three Shipping & Salvage companies.'),
  ],
};

describe('buildIntroStages', () => {
  it('runs in the order design §6 fixes: goal, share, composite, five sectors, funds, done', () => {
    const stages = buildIntroStages(LIVE);
    expect(stages).toHaveLength(INTRO_STEPS);
    expect(stages.map((s) => s.id)).toEqual(['goal', 'share', 'composite', ...SECTORS.map(sectorSlug), 'funds', 'done']);
    expect(stages.map((s) => s.kind)).toEqual(['card', 'card', 'card', ...SECTORS.map(() => 'sector'), 'funds', 'card']);
    expect(INTRO_STEPS).toBe(10);
  });

  it('gives each sector card its three live companies by ticker, with the COPY line and the opening price', () => {
    const shipping = buildIntroStages(LIVE).find((s) => s.id === 'shipping-salvage')!;
    expect(shipping.kind).toBe('sector');
    if (shipping.kind !== 'sector') throw new Error('unreachable');
    expect(shipping.title).toBe('Shipping & Salvage');
    expect(shipping.companies.map((c) => c.ticker)).toEqual(['FDUT', 'KRKN', 'LVTH']);
    expect(shipping.companies.map((c) => c.openPrice)).toEqual([5_550, 8_412, 4_100]);
    // The seed's "{name} — {sector}." placeholder never reaches a student: COPY §14 wins.
    expect(shipping.companies.map((c) => c.description)).toEqual([
      INTRO_COMPANIES.FDUT!.description,
      INTRO_COMPANIES.KRKN!.description,
      INTRO_COMPANIES.LVTH!.description,
    ]);
  });

  it('still reads before the market has loaded, from COPY alone, with no prices invented', () => {
    const naval = buildIntroStages({ companies: [], funds: [] }).find((s) => s.id === 'naval-arms')!;
    if (naval.kind !== 'sector') throw new Error('unreachable');
    expect(naval.companies.map((c) => c.ticker)).toEqual(['BBRD', 'CNBR', 'MRED']);
    expect(naval.companies.every((c) => c.openPrice === null)).toBe(true);
  });

  it('lists the live funds with the server’s own "holds" line, never a fund written here', () => {
    const funds = buildIntroStages(LIVE).find((s) => s.id === 'funds')!;
    if (funds.kind !== 'funds') throw new Error('unreachable');
    expect(funds.funds).toEqual([
      { ticker: 'FLEET', name: 'Grand Fleet Fund', holds: 'The same amount of all 15 companies.', openPrice: 10_000 },
      { ticker: 'SHIPS', name: 'Shipping Lanes Fund', holds: 'An equal slice of the three Shipping & Salvage companies.', openPrice: 10_000 },
    ]);
    expect(buildIntroStages({ companies: [], funds: [] }).find((s) => s.id === 'funds')).toMatchObject({ funds: [] });
  });
});

describe('the step in the URL', () => {
  it.each([
    ['', 1],
    ['?step=1', 1],
    ['?step=7', 7],
    ['?step=10', 10],
    ['?step=11', 10],
    ['?step=0', 1],
    ['?step=-3', 1],
    ['?step=two', 1],
    ['?other=4', 1],
  ])('%s → step %i', (search, step) => {
    expect(stepFromSearch(search)).toBe(step);
  });

  it('builds clean links: no param for the first card, ?step=n after it', () => {
    expect(introSearch(1)).toBe('');
    expect(introSearch(4)).toBe('?step=4');
    expect(introSearch(99)).toBe(`?step=${INTRO_STEPS}`);
    expect(introHref()).toBe(INTRO_PATH);
    expect(introHref(3)).toBe(`${INTRO_PATH}?step=3`);
  });
});

describe('introComplete', () => {
  it('is true only for a real server timestamp', () => {
    expect(introComplete({ introCompletedAt: 1_700_000_000_000 })).toBe(true);
    expect(introComplete({ introCompletedAt: null })).toBe(false);
    expect(introComplete({ introCompletedAt: 0 })).toBe(false);
    expect(introComplete(null)).toBe(false);
    expect(introComplete(undefined)).toBe(false);
  });
});
