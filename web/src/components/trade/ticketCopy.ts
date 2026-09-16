/**
 * Order ticket words, verbatim from COPY §9 (`ticket`, `ticket-errors`) plus the phone strings of
 * MOBILE §7.0 / §7.10 (`mobile.discard`, `mobile.marketClosedFix`, `mobile.offlineReason`, `mobile.done`).
 */

import { FUNDS_EXTRA } from '../../lib/fundCopy';

export const TICKET = {
  explain: {
    marketOrderBuy: 'Buys right away at about the current price.',
    marketOrderSell: 'Sells right away at about the current price.',
    fee: '{feePct} charged on every trade.',
    priceImpact: 'Big orders nudge the price against you.',
    priceImpactDetailBuy: 'Because of its size, this order pays about {impactPct} more per share.',
    priceImpactDetailSell: 'Because of its size, this order gets about {impactPct} less per share.',
    priceImpactTiny: 'This order is small for {ticker}, so the nudge is under 0.01%.',
    positionLimit: "A buy can't put more than {limitPct} of your account into one company.",
    positionLimitOff: 'This game has no limit on how much of your account can be in one company.',
    intervalLimit: 'You can trade up to {cap} shares of {ticker} per price update.',
  },
  lines: {
    /** COPY §13 `funds-extra.trading`: what a fund order actually does to the companies inside it. */
    fundBuy: FUNDS_EXTRA.trading.buy,
    fundSell: FUNDS_EXTRA.trading.sell,
    shareOfAccount: 'This order would make {ticker} {pct} of your account.',
    amountModeBuy: '≈ {shares} shares · {leftover} stays as cash',
    amountModeSell: '≈ {shares} shares of the {owned} you own',
    youOwn: 'You own {owned} shares',
    youOwnNone: "You don't own any {ticker} yet",
    priceAsOf: 'Price as of tick {tick}',
    previewRecapBuy: 'Buy {qty} shares of {ticker} ({name}) at about the current price.',
    previewRecapSell: 'Sell {qty} shares of {ticker} ({name}) at about the current price.',
    pricedAt: 'Priced at tick {tick} · {time}',
    estimatedNote:
      'Estimated. Prices can change between this preview and when you place the order, so the final price may differ slightly.',
    filledBuy: 'Order filled: Bought {qty} {ticker} at {price} ({total}).',
    filledSell: 'Order filled: Sold {qty} {ticker} at {price} ({total}).',
    filledFlavor: 'Fair winds.',
    filledVsPreviewAbove: '{diff} above the preview estimate of {est}',
    filledVsPreviewBelow: '{diff} below the preview estimate of {est}',
    filledVsPreviewSame: 'Same as the preview estimate',
    /** MOBILE §7.10 helper under the amount in Shares mode. */
    withFee: '≈ {total} with fee',
    /** MOBILE §7.10 note when a new tick updates the preview in place. */
    updatedForTick: 'Updated for tick {tick}',
    /** MOBILE §7.10 Filled headline (Title 3). */
    boughtHeadline: 'Bought {qty} {ticker} at {price}',
    soldHeadline: 'Sold {qty} {ticker} at {price}',
    orderLine: 'Order # {number} · tick {tick}',
  },
  stages: {
    entry: 'Step 1 · enter your order',
    preview: 'Step 2 · review before placing',
    filled: 'Step 3 · order filled',
    rejected: 'Needs attention',
  },
  buttons: {
    buy: 'Buy',
    sell: 'Sell',
    shares: 'Shares',
    amount: 'Doubloons',
    preview: 'Preview order',
    edit: 'Edit order',
    place: 'Place order',
    placing: 'Placing order…',
    clear: 'Clear',
    tradeAgain: 'Trade again',
    viewActivity: 'View activity',
    close: 'Close',
    done: 'Done',
    back: 'Back',
  },
  chips: { buy: ['10', '50', '100', 'Max'], sell: ['25%', '50%', 'All'] },
  /** COPY §1.4 short labels. */
  labels: {
    cashAvailable: 'Cash available',
    estPrice: 'Est. price',
    estImpact: 'Price impact',
    estValue: 'Order value',
    estFee: 'Fee',
    estTotalBuy: 'Total cost',
    estTotalSell: 'You receive',
    cashAfter: 'Cash after',
    sharesAfter: 'Shares after',
    pctOfAccountAfter: '% after',
    avgCostAfter: 'Avg. price after',
    orderFilled: 'Order filled',
    previewTitle: 'Preview order',
    amountShares: 'Number of shares',
    amountDoubloons: 'Amount in {currency}',
    sideLabel: 'Action',
    modeLabel: 'Order by',
    decreaseShares: 'One share fewer',
    increaseShares: 'One share more',
    decreaseAmount: '{symbol}100 less',
    increaseAmount: '{symbol}100 more',
    quickAmounts: 'Quick amounts',
    thisSession: 'this session',
  },
  discard: { title: 'Discard this order?', confirm: 'Discard order', keep: 'Keep editing' },
  offlineReason: "You're offline",
  marketClosedFix: 'Open Markets',
} as const;

export interface TicketErrorCopy {
  title: string;
  message: string;
  fix: string | null;
  messageNoneOwned?: string;
  messageAtLimit?: string;
  messageOneSecond?: string;
}

/** COPY §9 `ticket-errors`. `market_closed.fix` is the phone's "Open Markets" (MOBILE §7.0). */
export const TICKET_ERRORS: Record<string, TicketErrorCopy> = {
  insufficient_funds: {
    title: 'Not enough cash',
    message:
      'This order is {shortfall} more than your cash available to trade ({cash}). Lower the shares or amount, or use the most you can afford.',
    fix: 'Use max ({maxShares} shares)',
  },
  insufficient_shares: {
    title: 'Not enough shares',
    message: 'You own {owned} shares of {ticker}, so you can sell up to {owned}. Lower the number of shares or choose All.',
    messageNoneOwned: "You don't own any {ticker} shares, so there is nothing to sell. Switch to Buy or pick a company you own.",
    fix: 'Sell all {owned}',
  },
  position_limit: {
    title: 'Over the position limit',
    message: 'This would put more than {limitPct} of your account in {ticker}. You can buy up to {maxShares} more shares.',
    messageAtLimit:
      '{ticker} already makes up {limitPct} or more of your account, the most a buy can reach. You can buy more only if that share falls below the limit.',
    fix: 'Use {maxShares}',
  },
  interval_limit: {
    title: 'Too many shares for one price update',
    message:
      'You can trade up to {cap} shares of {ticker} per price update. Lower the shares, or place the rest after the next update in about {seconds} seconds.',
    messageOneSecond:
      'You can trade up to {cap} shares of {ticker} per price update. Lower the shares, or place the rest after the next update in about 1 second.',
    fix: 'Use {cap}',
  },
  price_moved: {
    title: 'Price moved',
    message:
      'The price of {ticker} moved more than 2% since your preview, from {quoted} to {last}. Review the updated estimate, then place the order again.',
    fix: 'Review updated order',
  },
  market_closed: {
    title: 'Market not open yet',
    message: 'Trading opens when the host starts the game. You can research companies and preview orders now.',
    fix: 'Open Markets',
  },
  market_closed_ended: {
    title: 'Game ended',
    message: "The game has ended, so trading is closed. See how every crew finished and what drove each company's price.",
    fix: 'See final standings',
  },
  paused: {
    title: 'Trading paused',
    message: 'The host has paused trading. We kept your order details, so you can place it as soon as trading resumes.',
    fix: null,
  },
  trading_disabled: {
    title: 'Trading turned off for your crew',
    message:
      'The host has turned off trading for your crew. Ask your host to turn it back on; you can still research and view your account.',
    fix: null,
  },
  /** The "Meet the market" gate (design 2026-09-16 §6). Its fix opens the flow. */
  intro_required: {
    title: 'Meet the market first',
    message:
      'Finish the short Meet the market tour, then place this order again. It takes about a minute, and nothing else is locked.',
    fix: 'Start Meet the market',
  },
  bad_quantity: {
    title: 'Check the number of shares',
    message: 'Enter a whole number of shares that is 1 or more, like 10 or 250.',
    fix: 'Clear',
  },
  amount_too_small: {
    title: 'Amount too small',
    message: 'That amount is less than 1 share of {ticker} at {price}. Enter at least {minAmount}, which includes the fee.',
    fix: 'Use {minAmount}',
  },
  unknown_company: {
    title: 'Company not found',
    message: "We couldn't find a company with that symbol. Pick one from the search list, like KRKN.",
    fix: 'Search companies',
  },
  no_team: {
    title: 'Crew account not found',
    message: "We couldn't find your crew's account. Sign out, sign back in, and try again; if it keeps happening, tell your host.",
    fix: 'Sign out',
  },
  network: {
    title: 'Order not sent',
    message:
      "Your order didn't reach the exchange. Check your connection and press Place order again; you won't be charged twice.",
    fix: 'Place order again',
  },
  unknown_error: {
    title: 'Something went wrong',
    message: 'Your order could not be placed. Press Place order to try again; if it keeps failing, tell your host.',
    fix: 'Try again',
  },
};

export function fillText(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, key: string) => (key in vars ? String(vars[key]) : m));
}
