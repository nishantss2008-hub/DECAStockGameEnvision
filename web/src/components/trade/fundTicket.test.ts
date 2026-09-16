/**
 * Pricing a FUND order in the ticket (spec 2026-09-16 §2).
 *
 * The contract these tests pin: the equivalent (beta, sharesOutstanding) pair must make the shared
 * `estimateOrder` reproduce the two numbers the server actually binds on — the interval cap in fund
 * shares, and λ per fund share — so the preview and the fill agree.
 */
import { describe, expect, it } from 'vitest';
import { MODEL, impactLambda, intervalShareCap, type Company, type Fund } from '@deca/shared';
import { fundTicketInputs } from './fundTicket';

const co = (id: string, ticker: string, price: number, shares: number, beta = 1): Company =>
  ({ id, ticker, name: ticker, currentPrice: price, sharesOutstanding: shares, beta }) as Company;

const KRKN = co('kraken', 'KRKN', 8_412, 242_000_000);
const FDUT = co('flying-dutchman', 'FDUT', 4_206, 120_000_000, 1.4);
const BY_ID = { kraken: KRKN, 'flying-dutchman': FDUT };

const FUND = {
  kind: 'fund',
  id: 'shipping-lanes',
  ticker: 'SHIPS',
  holdings: [
    { companyId: 'kraken', ticker: 'KRKN', weight: 0.5 },
    { companyId: 'flying-dutchman', ticker: 'FDUT', weight: 0.5 },
  ],
  divisor: 63.09,
} as unknown as Fund;

/** The shares of company i one fund share carries: wᵢ/divisor. */
const perShare = (companyId: string) => FUND.holdings.find((h) => h.companyId === companyId)!.weight / FUND.divisor;

describe('fundTicketInputs', () => {
  it('reproduces the tightest constituent cap, converted into fund shares', () => {
    const { sharesOutstanding } = fundTicketInputs(FUND, BY_ID);
    const expected = Math.floor(
      Math.min(
        intervalShareCap(KRKN.sharesOutstanding) / perShare('kraken'),
        intervalShareCap(FDUT.sharesOutstanding) / perShare('flying-dutchman'),
      ),
    );
    expect(intervalShareCap(sharesOutstanding)).toBe(expected);
  });

  it('never understates the basket λ, and overstates it by a fraction of a basis point', () => {
    const { beta, sharesOutstanding } = fundTicketInputs(FUND, BY_ID);
    const legs = [
      { c: KRKN, u: perShare('kraken') },
      { c: FDUT, u: perShare('flying-dutchman') },
    ];
    const totalValue = legs.reduce((s, l) => s + l.u * l.c.currentPrice, 0);
    const basket = legs.reduce((s, l) => s + ((l.u * l.c.currentPrice) / totalValue) * impactLambda(l.c.beta, l.c.sharesOutstanding) * l.u, 0);
    const lambda = impactLambda(beta, sharesOutstanding);

    // sigD has a floor (impactVolRef at beta 0), so λ lands on or above the basket's — never below.
    expect(lambda).toBeGreaterThanOrEqual(basket);
    // What a student would actually see: half the order's own impact, in bps, on a 1,000-share order.
    const bps = (l: number) => ((l * 1_000) / 2) * 10_000;
    expect(bps(lambda) - bps(basket)).toBeLessThan(0.01);
  });

  it("is below any single constituent's λ per share: a basket order is spread across its members", () => {
    const { beta, sharesOutstanding } = fundTicketInputs(FUND, BY_ID);
    expect(impactLambda(beta, sharesOutstanding)).toBeLessThan(impactLambda(KRKN.beta, KRKN.sharesOutstanding));
    expect(impactLambda(beta, sharesOutstanding)).toBeLessThan(impactLambda(FDUT.beta, FDUT.sharesOutstanding));
  });

  it('keeps the derived beta inside the model range rather than producing a negative variance', () => {
    const { beta } = fundTicketInputs(FUND, BY_ID);
    expect(beta).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(beta)).toBe(true);
    expect(MODEL.advDivisor).toBeGreaterThan(0);
  });

  it('refuses to guess when a constituent has not arrived: zero ADV invalidates the estimate', () => {
    expect(fundTicketInputs(FUND, { kraken: KRKN })).toEqual({ beta: 0, sharesOutstanding: 0 });
    expect(fundTicketInputs({ ...FUND, divisor: 0 } as Fund, BY_ID)).toEqual({ beta: 0, sharesOutstanding: 0 });
    expect(fundTicketInputs({ ...FUND, holdings: [] } as unknown as Fund, BY_ID)).toEqual({ beta: 0, sharesOutstanding: 0 });
  });
});
