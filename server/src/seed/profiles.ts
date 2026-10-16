/**
 * The business behind each ticker — what a student reads before the numbers.
 *
 * Two layers:
 *   1. PROFILES — fixed per company (the same every game): what it does, what it sells, who buys,
 *      how it makes money, why customers pick it, and its edge over rivals. Descriptive only: none of
 *      it says whether the company is doing well this game.
 *   2. companyStory() — generated per game from the company's PUBLIC numbers only (how its profitability,
 *      growth and balance sheet rank against the other companies). The management team's track record, the
 *      strategy and the recent developments put in words what the statements already show, so a
 *      careful reader finds the story and the numbers agree. It never reads the hidden quality result
 *      or the surprise (crews may not see either before the end), and it never says buy or sell.
 */

import type { CompanyProfile, ManagementMember } from '@deca/shared';
import type { Prng } from '../lib/prng';

export const PROFILES: Record<string, CompanyProfile> = {
  // ── Naval Arms ──────────────────────────────────────────────────────────────
  blackbeard: {
    whatTheyDo: 'Builds and refits armed escort ships, then rents them out with trained crews to merchants who need protection on dangerous routes.',
    products: ['Escort frigates for hire', 'Ship refits and armor plating', 'Convoy protection contracts'],
    customers: 'Merchant fleets and trading houses that move valuable cargo through pirate waters.',
    businessModel: 'Recurring contracts: merchants pay a fee for every voyage an escort ship joins, plus one-off fees for refits.',
    valueProposition: 'Cargo arrives safely. A merchant pays a small fee per trip instead of risking the whole ship.',
    competitiveEdge: 'The best-known name in escort work. Long contracts with the biggest merchant fleets make customers slow to switch.',
  },
  'mary-read': {
    whatTheyDo: 'Makes gunpowder, shot and small arms and sells them in bulk to navies, privateers and port garrisons.',
    products: ['Gunpowder by the barrel', 'Cannon shot', 'Muskets and pistols'],
    customers: 'Colonial navies, licensed privateers and harbor forts.',
    businessModel: 'Sells products by the order. Revenue rises when conflict rises and falls in peaceful years, so it is uneven.',
    valueProposition: 'Reliable powder that fires every time, delivered in large amounts on short notice.',
    competitiveEdge: 'Owns its own saltpeter supply, so it is less exposed when raw-material prices jump.',
  },
  cannonbright: {
    whatTheyDo: 'Casts iron and bronze cannons in large foundries and sells them to shipyards and forts.',
    products: ['Ship cannons', 'Fort artillery', 'Repair and recasting service'],
    customers: 'Shipyards building new warships, and colonial governments arming their forts.',
    businessModel: 'Big, infrequent orders. It needs expensive foundries, so profits depend on keeping them busy.',
    valueProposition: 'Cannons that last decades without cracking, with repairs available at many ports.',
    competitiveEdge: 'Few rivals can afford foundries this size, which keeps new competitors out.',
  },

  // ── Shipping & Salvage ──────────────────────────────────────────────────────
  kraken: {
    whatTheyDo: 'Runs a large fleet of cargo ships on scheduled routes between the main Caribbean ports.',
    products: ['Scheduled cargo routes', 'Warehouse storage at ports', 'Express delivery for valuable goods'],
    customers: 'Merchants, plantations and trading houses that need goods moved on a timetable.',
    businessModel: 'Charges per ton of cargo carried. Ships cost the same to sail full or half empty, so filling them is everything.',
    valueProposition: 'Ships leave on schedule, so customers can plan around them.',
    competitiveEdge: 'The biggest route network: more ports and more departures than any rival.',
  },
  'flying-dutchman': {
    whatTheyDo: 'Fast long-distance freight between the Caribbean and Europe, using quick, lightly loaded ships.',
    products: ['Transatlantic express freight', 'Mail and documents', 'Luxury goods shipping'],
    customers: 'Customers who will pay more for speed: banks, governments and luxury traders.',
    businessModel: 'Premium prices on a small amount of cargo. High price per ton, but fewer tons.',
    valueProposition: 'The fastest crossing on the ocean. Time-sensitive cargo arrives weeks earlier.',
    competitiveEdge: 'Its ship designs and experienced captains are hard to copy quickly.',
  },
  leviathan: {
    whatTheyDo: 'Raises sunken ships and recovers lost cargo, and runs harbor tugs and repair docks.',
    products: ['Shipwreck salvage', 'Harbor towing', 'Dry-dock repairs'],
    customers: 'Insurers who want lost cargo back, ship owners needing repairs, and port authorities.',
    businessModel: 'Steady fees from towing and docks, plus big but unpredictable payouts from salvage finds.',
    valueProposition: 'Turns a total loss into a partial recovery for insurers and owners.',
    competitiveEdge: 'Owns specialist diving bells and heavy cranes that few rivals have.',
  },

  // ── Provisions & Spice ──────────────────────────────────────────────────────
  'calico-jack': {
    whatTheyDo: 'Buys pepper, nutmeg and cinnamon from distant islands and sells them to merchants across the colonies.',
    products: ['Pepper', 'Nutmeg and cloves', 'Cinnamon and mixed spice'],
    customers: 'Grocers and merchants who resell spice in towns and cities.',
    businessModel: 'Buys low at the source and sells high at port. Profit is the gap, so supply prices matter a lot.',
    valueProposition: 'A steady supply of rare spices that are hard to get anywhere else.',
    competitiveEdge: 'Long-standing deals with island growers give it first pick of each harvest.',
  },
  bartholomew: {
    whatTheyDo: 'Supplies ships with food, fresh water and everyday goods before every voyage.',
    products: ['Salted meat and biscuit', 'Fresh water and fruit', 'Rope, canvas and lamp oil'],
    customers: 'Every ship leaving port: merchants, navies and fishing fleets.',
    businessModel: 'Sells everyday necessities in large volume at small margins. Repeat customers on every voyage.',
    valueProposition: 'One stop to fully stock a ship, fast, at a fair price.',
    competitiveEdge: 'Depots in most major harbors, so ships can restock wherever they dock.',
  },
  'galleon-goods': {
    whatTheyDo: 'Sells fine cloth, tea, sugar and household goods through its own shops in colonial towns.',
    products: ['Fine cloth and silk', 'Tea and sugar', 'Household goods'],
    customers: 'Families and wealthy households in colonial towns.',
    businessModel: 'Runs its own shops, so it keeps the shop profit but also pays all the rent and staff.',
    valueProposition: 'Quality imported goods on the high street, without dealing with a merchant.',
    competitiveEdge: 'A trusted brand name. Shoppers pay a little more for the Galleon Goods label.',
  },

  // ── Treasure Banking ────────────────────────────────────────────────────────
  'port-royal': {
    whatTheyDo: 'Takes deposits from merchants and lends money to ship owners and traders.',
    products: ['Deposit accounts', 'Ship loans', 'Trade credit for merchants'],
    customers: 'Merchants, ship owners and plantation owners across the colonies.',
    businessModel: 'Pays a little interest on deposits and charges more interest on loans. Profit is the gap — if borrowers do not repay, it loses.',
    valueProposition: 'A safe place for money and a lender who understands shipping.',
    competitiveEdge: 'The oldest bank in the colonies. Depositors trust it, which keeps its funding cheap.',
  },
  'kidd-trust': {
    whatTheyDo: 'Guards gold, silver and valuables in fortified vaults and moves them safely between ports.',
    products: ['Vault storage', 'Armored transport of coin', 'Letters of credit'],
    customers: 'Wealthy families, governments and other banks.',
    businessModel: 'Charges a yearly fee for every chest it guards. Steady income that does not depend on lending.',
    valueProposition: 'Valuables are safe, insured and available at any of its vaults.',
    competitiveEdge: 'Its vaults have never been successfully robbed — a reputation rivals cannot buy.',
  },
  'henry-morgan': {
    whatTheyDo: 'Invests money for clients in voyages, plantations and new ventures, and advises on deals.',
    products: ['Investment funds', 'Deal advice', 'Funding for new voyages'],
    customers: 'Rich investors and companies raising money for expansion.',
    businessModel: 'Takes a fee on the money it manages plus a share of the profits when investments do well. Good years pay a lot; bad years pay little.',
    valueProposition: 'Access to deals ordinary investors cannot reach, picked by experienced dealmakers.',
    competitiveEdge: 'A wide network of contacts that brings it the best deals first.',
  },

  // ── Cartography & Navigation ────────────────────────────────────────────────
  'anne-bonny': {
    whatTheyDo: 'Surveys coastlines and sells detailed sea charts, updated every season.',
    products: ['Sea charts', 'Harbor maps', 'Seasonal chart updates'],
    customers: 'Ship captains, navies and shipping companies.',
    businessModel: 'Creates each chart once and sells copies many times, so every extra copy sold is mostly profit. Update subscriptions repeat yearly.',
    valueProposition: 'Accurate charts that keep ships off reefs and on the fastest routes.',
    competitiveEdge: 'Decades of surveys that a new rival would take years to redo.',
  },
  spyglass: {
    whatTheyDo: 'Makes telescopes, compasses and clocks for navigation at sea.',
    products: ['Telescopes', 'Marine compasses', 'Ship clocks for finding longitude'],
    customers: 'Ship captains, navies and chandlers’ shops.',
    businessModel: 'Sells precision navigation tools at high prices. Needs skilled craftsmen and keeps inventing better models.',
    valueProposition: 'Tools accurate enough to find a ship’s position in open ocean.',
    competitiveEdge: 'Secret lens-grinding methods that give clearer, longer views than rivals.',
  },
  'compass-rose': {
    whatTheyDo: 'Provides harbor pilots who guide ships safely into busy ports, and trains navigators.',
    products: ['Harbor pilot service', 'Navigator training school', 'Route planning for fleets'],
    customers: 'Every large ship entering a major port, and shipping companies training crews.',
    businessModel: 'Charges a fee each time a pilot guides a ship in or out. Busy ports mean steady fees.',
    valueProposition: 'Ships avoid running aground in crowded, shallow harbors.',
    competitiveEdge: 'Holds the official pilot license in several major ports, so rivals cannot work there.',
  },
};

// ── Per-game story from public numbers ────────────────────────────────────────

/**
 * The company's standing against the other 14 on three measures computed ONLY from its published
 * statements (rank-z, ~N(0,1)): profitability, growth and balance-sheet safety. Valuation is left out
 * (it depends on price), and the hidden surprise never enters.
 */
export interface StoryFacts {
  prof: number;
  grow: number;
  safe: number;
  netIncome: number;
}

type Tier = 'strong' | 'mixed' | 'weak';

function tierOf(x: number, hi: number, lo: number): Tier {
  return x >= hi ? 'strong' : x <= lo ? 'weak' : 'mixed';
}

const CEO_BIOS: Record<Tier, readonly string[]> = {
  strong: [
    'Has led the company for years and kept costs tighter than rivals; its profit on every doubloon of revenue is among the best in the sector.',
    'Built the company’s best routes and is known for walking away from deals that do not pay.',
  ],
  mixed: [
    'Steady leader with a mixed record: some new routes paid off, others did not.',
    'Kept the company afloat through rough seasons but has not pulled ahead of rivals.',
  ],
  weak: [
    'Under this leader, costs have grown faster than revenue and profit margins trail the sector.',
    'Promised a turnaround several seasons ago; results have not caught up with the promises yet.',
  ],
};

const CEO_NEW = 'Joined last year to fix a company that is losing money. The plan is to cut costs and close weak routes.';

const CFO_BIOS: Record<Tier, readonly string[]> = {
  strong: [
    'Keeps borrowing low and a healthy cash reserve, so the company can ride out a bad season.',
    'Careful with money: pays for new ships mostly from profits rather than loans.',
  ],
  mixed: ['Uses a moderate amount of borrowing to fund growth.', 'Balances paying dividends against saving for new ships.'],
  weak: [
    'Has borrowed heavily to fund expansion; interest payments now take a big bite out of profits.',
    'Cash is thin. A bad season could force the company to borrow more or sell ships.',
  ],
};

const COO_BIOS: Record<Tier, readonly string[]> = {
  strong: ['Runs one of the most efficient operations in the sector: fast turnarounds and little waste.'],
  mixed: ['Runs operations about as efficiently as the average rival.'],
  weak: ['Operations have struggled with delays and waste, which is part of why margins are low.'],
};

const CSO_BIOS: Record<Tier, readonly string[]> = {
  strong: ['Has added new ports and customers year after year; revenue has grown strongly.'],
  mixed: ['Looking for new routes while revenue holds roughly steady.'],
  weak: ['Revenue has been shrinking; the job now is to stop losing customers to rivals.'],
};

const STRATEGY: Record<Tier, readonly string[]> = {
  strong: [
    'Expanding: adding ships and opening new trading posts while demand is strong.',
    'Growing into new waters and using its profits to pay for it.',
  ],
  mixed: ['Holding course: protecting its current customers and adding new routes slowly.'],
  weak: [
    'Shrinking to survive: closing unprofitable routes and selling older ships.',
    'Trying to win back customers with lower prices, which squeezes profit further.',
  ],
};

const DEVELOPMENTS: Record<Tier, readonly string[]> = {
  strong: [
    'Commissioned two new ships to keep up with demand',
    'Opened a new trading post on the Spanish Main',
    'Won a multi-season contract with a large merchant fleet',
    'Raised its dividend after a record year',
  ],
  mixed: [
    'Refit its flagship to cut repair costs',
    'Renewed its main contracts on similar terms',
    'Hired a new fleet captain from a rival',
  ],
  weak: [
    'Closed two routes that were losing money',
    'Sold an older ship to raise cash',
    'Lost a major customer to a cheaper rival',
    'Cut its dividend to save cash',
  ],
};

export interface CompanyStory {
  management: ManagementMember[];
  strategy: string;
  recentDevelopments: string[];
}

/**
 * Leadership, strategy and recent news that match the public statements. `pickName` supplies unique
 * names; `rng` is the company's own text stream, so a seed always tells the same story.
 */
export function companyStory(rng: Prng, facts: StoryFacts, pickName: () => string): CompanyStory {
  const execution = tierOf(facts.prof, 0.5, -0.5);
  const growth = tierOf(facts.grow, 0.5, -0.5);
  const balance = tierOf(facts.safe, 0.5, -0.5);
  const losing = facts.netIncome <= 0;

  const ceoTenure = losing ? 1 : execution === 'strong' ? rng.int(8, 18) : rng.int(3, 10);
  const management: ManagementMember[] = [
    { name: pickName(), role: 'Chief Executive Officer', bio: losing ? CEO_NEW : rng.pick(CEO_BIOS[execution]), tenureYears: ceoTenure },
    { name: pickName(), role: 'Chief Financial Officer', bio: rng.pick(CFO_BIOS[balance]), tenureYears: rng.int(2, 12) },
    { name: pickName(), role: 'Chief Operating Officer', bio: rng.pick(COO_BIOS[execution]), tenureYears: rng.int(2, 14) },
    { name: pickName(), role: 'Chief Strategy Officer', bio: rng.pick(CSO_BIOS[growth]), tenureYears: rng.int(1, 9) },
  ];

  // Two developments that follow the growth story, one that follows execution.
  const devs = [...rng.shuffle(DEVELOPMENTS[growth]).slice(0, 2), rng.pick(DEVELOPMENTS[execution])];
  return { management, strategy: rng.pick(STRATEGY[losing ? 'weak' : growth]), recentDevelopments: [...new Set(devs)] };
}
