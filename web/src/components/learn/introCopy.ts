/**
 * "Meet the market" words, verbatim from COPY.md §14 (design 2026-09-16 §6).
 *
 * The required-once intro flow: what you're doing · what a share is · the Pirate Composite · one
 * card per sector with its three companies · what a fund is · done. `introCopy.sync.test.ts`
 * re-reads COPY.md and `server/src/seed/roster.ts` and fails when any of the three drift — the
 * same contract `fundCopy.sync.test.ts` keeps for the fund strings.
 *
 * Nothing with a number lives here. Tickers, opening prices, fund names and each fund's holdings
 * line come from the live market; the shared fund wording comes from COPY §13 (`lib/fundCopy.ts`).
 */

/** COPY §14 `intro`: the flow chrome. */
export const INTRO = {
  title: 'Meet the market',
  flavor: 'A turn round the harbor before the bell.',
  progress: 'Step {n} of {total}',
  progressLabel: 'Meet the market progress',
  next: 'Next',
  back: 'Back',
  finish: 'Open Markets',
  finishing: 'Saving…',
  skip: 'Finish later',
  skipNote: 'You can stop here and come back. Your crew has to finish this before its first trade.',
  skipTitle: 'Finish Meet the market later?',
  skipBody: "Nothing else is locked. Your crew just can't place its first order until this is done.",
  skipConfirm: 'Finish later',
  skipKeep: 'Keep going',
  close: 'Close',
  replayNote: 'Your crew has already finished this. Reading it again changes nothing in your account.',
  openPrice: 'Opened at {price}',
  companiesHeader: 'The three companies',
  fundsHeader: 'The three funds',
  error: "We couldn't save that. Check your connection, then try again.",
  retry: 'Try again',
  learnRow: 'Meet the market',
  learnSubtitle: 'The 15 companies, the five sectors and the three funds, in about a minute.',
} as const;

/** COPY §14 `intro-host`: the host's Crews strings for the gate. */
export const INTRO_HOST = {
  label: 'Meet the market',
  done: 'Finished',
  pending: 'Not finished',
  pendingTag: 'Intro pending',
  note: 'A crew has to finish Meet the market before its first order. Mark it finished for a crew whose phone died.',
  markDone: 'Mark Meet the market finished',
  markDoneToast: '{crew}: Meet the market marked finished.',
  sendAgain: 'Send this crew through Meet the market again',
  sendAgainToast: '{crew} will see Meet the market again.',
  undo: 'Undo',
} as const;

export interface IntroStageCopy {
  id: string;
  title: string;
  body: string;
  points: readonly string[];
}

/** COPY §14 `intro-stage`: the five cards that are not a sector. `introFlow.ts` sets the order. */
export const INTRO_STAGES: readonly IntroStageCopy[] = [
  {
    id: 'goal',
    title: "What you're doing",
    body: 'Your crew starts with {startingCash}. You spend it buying shares of the companies in this market.',
    points: [
      'The crew whose shares and leftover cash are worth the most at the end wins.',
      'Cash you never spend still counts, so you are never forced to buy.',
    ],
  },
  {
    id: 'share',
    title: 'What a share is',
    body: 'A share is one small piece of a company. Buy a share and that piece is yours, so you gain when its price rises and lose when it falls.',
    points: [
      'Prices here update every {tickSeconds} seconds, for every company at once.',
      'Nothing is settled until you sell. A price that falls can come back, and a price that rises can give it back.',
    ],
  },
  {
    id: 'composite',
    title: 'The Pirate Composite',
    body: 'The Pirate Composite adds all 15 companies together into one number. It tells you whether the whole market is up or down.',
    points: [
      'You will see it at the top of Markets and beside your own return on Portfolio.',
      'One company can fall in a session when the Composite rises, and the other way round.',
    ],
  },
  {
    id: 'funds',
    title: 'What a fund is',
    body: 'Three funds trade beside the 15 companies. A fund is a basket: one share of it holds a slice of everything inside.',
    points: [
      'Buying a fund is one order, and it buys a slice of every company that fund holds.',
      "The weights were set when the game began, so a fund's price is its holdings added together.",
    ],
  },
  {
    id: 'done',
    title: "You're ready",
    body: 'That is the whole market: 15 companies in five sectors, plus three funds that hold them.',
    points: [
      "Nothing here tells you what to buy. Reading the companies is your crew's job.",
      'You can open Meet the market again any time from the Learn tab.',
    ],
  },
];

/** COPY §14 `intro-sectors`, keyed by `sectorSlug()`. */
export const INTRO_SECTORS: Record<string, { sector: string; body: string }> = {
  'shipping-salvage': {
    sector: 'Shipping & Salvage',
    body: "These companies move other people's cargo across the sea and raise what sinks. They are busiest when trade is busy.",
  },
  'provisions-spice': {
    sector: 'Provisions & Spice',
    body: 'Food, spices and the everyday supplies a ship loads before it sails. People buy these whatever the year is like.',
  },
  'naval-arms': {
    sector: 'Naval Arms',
    body: 'Cannons, powder and armour, sold mostly to navies on contracts agreed years in advance.',
  },
  'cartography-navigation': {
    sector: 'Cartography & Navigation',
    body: 'Charts, instruments and signal towers that tell a captain where the ship is and which way to steer.',
  },
  'treasure-banking': {
    sector: 'Treasure Banking',
    body: 'Money itself: deposits, loans and guarded vaults. These companies earn from interest and fees rather than from selling goods.',
  },
};

/** COPY §14 `intro-companies`, keyed by ticker. Written for COPY.md: the seed has no description. */
export const INTRO_COMPANIES: Record<string, { name: string; sector: string; description: string }> = {
  KRKN: {
    name: 'Kraken Shipping Lines',
    sector: 'Shipping & Salvage',
    description: "Runs cargo ships that carry other companies' goods across the ocean for a fee.",
  },
  FDUT: {
    name: 'Flying Dutchman Freight',
    sector: 'Shipping & Salvage',
    description: 'Hauls freight on long ocean routes and charges shippers by the crate.',
  },
  LVTH: {
    name: 'Leviathan Logistics',
    sector: 'Shipping & Salvage',
    description: 'Runs the docks and warehouses where cargo is unloaded, stored and sent on.',
  },
  CJST: {
    name: 'Calico Jack Spice Traders',
    sector: 'Provisions & Spice',
    description: 'Buys pepper, cinnamon and other spices where they grow and sells them at market.',
  },
  BRTH: {
    name: 'Bartholomew Provisions',
    sector: 'Provisions & Spice',
    description: 'Packs the salted food, biscuit and water that ships load before a long voyage.',
  },
  GLGD: {
    name: 'Galleon Goods Co.',
    sector: 'Provisions & Spice',
    description: 'Sells everyday supplies like rope, cloth and lamp oil in shops around the harbor.',
  },
  BBRD: {
    name: 'Blackbeard Incorporated',
    sector: 'Naval Arms',
    description: 'Builds cannons and ship armour, and sells them to navies under long contracts.',
  },
  MRED: {
    name: 'Mary Read Munitions',
    sector: 'Naval Arms',
    description: 'Makes gunpowder and cannonballs, which fleets use up and order again.',
  },
  CNBR: {
    name: 'Cannonbright Foundries',
    sector: 'Naval Arms',
    description: 'Casts the iron that cannons and warship fittings are made from.',
  },
  ABON: {
    name: 'Anne Bonny Cartography',
    sector: 'Cartography & Navigation',
    description: 'Surveys coastlines and sells the printed charts that captains steer by.',
  },
  CMPS: {
    name: 'Compass Rose Navigation',
    sector: 'Cartography & Navigation',
    description: 'Runs the signal towers and charts that ships pay a yearly fee to use.',
  },
  SPYG: {
    name: 'Spyglass Instruments',
    sector: 'Cartography & Navigation',
    description: 'Makes spyglasses, compasses and the other instruments a crew needs to find its way.',
  },
  PRYL: {
    name: 'Port Royal Banking',
    sector: 'Treasure Banking',
    description: 'Takes deposits from traders and lends the money out, earning interest on the loans.',
  },
  KIDD: {
    name: 'Kidd Treasure Trust',
    sector: 'Treasure Banking',
    description: "Guards other people's treasure in vaults and charges a fee to look after it.",
  },
  MRGN: {
    name: 'Henry Morgan Capital',
    sector: 'Treasure Banking',
    description: 'Lends money to voyages and shipowners, and takes a share of what they bring back.',
  },
};
