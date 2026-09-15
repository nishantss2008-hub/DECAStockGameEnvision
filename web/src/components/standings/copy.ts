/**
 * Standings and Final results words, verbatim from COPY.md (§1.5 `standings.*`, §10 reveal, §12 loading/empty) and
 * the phone strings of MOBILE §7.0 (`mobile.standings*`) and §7.12–§7.13. Placeholders are filled with `fill()`.
 */

/** COPY §1.5 standings labels (display + short). */
export const STANDINGS_LABELS = {
  rank: { display: 'Rank', short: 'Rank', glossary: 'accountValue' },
  movement: { display: 'Rank change', short: 'Move' },
  crew: { display: 'Crew', short: 'Crew' },
  totalValue: { display: 'Account value', short: 'Value', glossary: 'accountValue' },
  returnPct: { display: 'Total return (%)', short: 'Return', glossary: 'totalGain' },
  sessionChangePct: { display: 'Change this session (%)', short: 'Session', glossary: 'sessionChange' },
  cashPct: { display: 'Share of account in cash (% cash)', short: '% cash', glossary: 'pctOfAccount' },
  holdings: { display: 'Companies held', short: 'Holdings', glossary: 'diversification' },
  spark: { display: 'Recent trend', short: 'Trend' },
} as const;

/** MOBILE §7.0 phone copy and §7.12 / §7.13 screen words. */
export const STANDINGS = {
  title: 'Standings',
  place: "You're {ordinal} of {n}",
  behind: '{gap} behind {crew}',
  lead: "You're in the lead by {gap}",
  footer: 'Ranked by account value.',
  crewsCount: '{n} crews',
  you: 'You',
  views: { total: 'Total return', session: 'This session' },
  viewLabel: 'Standings view',
  yourPlace: 'Your place',
  listLabel: 'Standings',
  seeResults: 'See final results',
  rankOf: 'Rank {rank} of {n}',
  movement: { up: 'up {n} {places}', down: 'down {n} {places}', flat: 'no change' },
  loading: { title: 'Loading standings…', flavor: 'Counting the treasure' },
  empty: { title: 'No standings yet', body: 'Standings appear after the game starts and the first prices update.' },
  error: { title: "Couldn't load this page", body: 'Check your connection and try again.', action: 'Try again', flavor: 'Lost the wind.' },
  crewNotFound: 'This crew is not in the standings.',
} as const;

export const RESULTS = {
  title: 'Final results',
  pages: ['Voyage complete', 'Your crew', 'Market reveal', 'Luck vs. research', 'Final standings'],
  pageOf: 'Page {n} of {total}',
  back: 'Back',
  next: 'Next',
  close: 'Close',
  done: 'Done',
  finished: 'Your crew finished {ordinal} of {n}',
  podiumLabel: 'Top 3 crews',
  finalValue: 'Account value',
  totalReturn: 'Total return',
  rank: 'Rank',
  viewAsList: 'View as list',
  health: 'Health score',
  grade: 'Grade {grade}',
  detailsFor: 'Details for {ticker}',
  whatTheseMean: 'What these numbers mean',
  line: 'Expected {expected} · Actual {actual} · Luck {luck} points',
  empty: { title: "The market reveal isn't open yet", body: 'It opens when the game ends. Until then, the health scores stay hidden.', flavor: "The fog hasn't lifted." },
} as const;

/** COPY §10 REVEAL COPY. */
export const REVEAL = {
  eyebrow: 'Market reveal',
  title: 'What was behind the prices',
  flavor: 'The fog lifts.',
  intro:
    'Each company had a hidden health score built from its financial numbers. Healthier companies had better odds, but news, luck and hidden surprises still mattered.',
  hiddenDuringPlay: 'Scores were hidden during trading.',
  closingPrice: 'Every holding was valued at its closing price, which leaves out the last price nudges from orders.',
  scatter: {
    title: 'Health score vs. return',
    xLabel: 'Health score (0–100)',
    yLabel: 'Actual return',
    trendLabel: 'Typical return',
    yourHoldings: "Your crew's holdings",
    others: 'Other companies',
    caption:
      'Each dot is one company. The dashed line shows the typical return for each health score; dots above it did better, and dots below did worse.',
    luckiest: 'Luckiest: {ticker}',
    unluckiest: 'Unluckiest: {ticker}',
  },
  table: {
    title: 'Company scorecard',
    caption: '{n} companies · returns from the first tick to the last',
    columns: {
      company: 'Company',
      quality: 'Health score (quality score)',
      grade: 'Grade',
      drivers: 'What drove the score',
      expected: 'Expected return',
      actual: 'Actual return',
      luck: 'Luck (actual − expected)',
      label: 'Result',
    },
    help: {
      quality: "A score from 0 to 100 built from each company's financial numbers, including its starting price vs. profit. Higher means healthier.",
      grade: 'A to F, from the healthiest fifth of companies to the least healthy fifth.',
      expected: "What the company's odds pointed to: its health, its hidden surprise and how much it usually rises with the market.",
      actual: 'How much the price really changed from the first tick to the last.',
      luck: 'The part of the move its odds did not explain, such as news, market swings and chance.',
    },
    sortBy: 'Sort by',
    sortOptions: { quality: 'Health score', luck: 'Luck', actual: 'Actual return' },
  },
  labels: {
    compounder: { name: 'Compounder', meaning: 'Above-average health, and the price did at least as well as expected.' },
    unlucky_gem: { name: 'Unlucky gem', meaning: 'Above-average health, but news or chance left the price below what was expected.' },
    lucky_turnaround: { name: 'Lucky turnaround', meaning: 'Below-average health, but news or chance pushed the price above what was expected.' },
    decliner: { name: 'Decliner', meaning: 'Below-average health, and the price did worse than expected.' },
  },
  pillars: {
    prof: { name: 'Profits', high: 'Strong profits', low: 'Weak profits' },
    grow: { name: 'Growth', high: 'Growing business', low: 'Slow or shrinking business' },
    safe: { name: 'Safety', high: 'Safer finances', low: 'Riskier finances' },
    val: { name: 'Price', high: 'Low starting price for its profits', low: 'High starting price for its profits' },
  },
  hiddenSurprise: {
    title: 'Hidden surprises',
    body: 'Each company also had a hidden surprise: a random push, set at the start, that helped or hurt its odds. No amount of research could see it.',
    note: 'The expected return already includes the surprise, so it is not counted as luck.',
  },
  researchGrade: {
    title: "Your crew's research grade",
    body: 'How healthy your holdings were, averaged over the whole game and weighted by how much you held in each.',
    rankNote: 'Your grade does not change your rank. Rank comes only from account value.',
    noHoldings: 'Your crew held no shares, so there is no research grade this game.',
    marketAverage: 'Market average',
    winner: 'Winner',
    holdingsTable: { holding: 'Holding', weight: 'Share of invested value', quality: 'Health score', total: 'Weighted average' },
    gradeBOrBetter: '{pct} of your invested value sat in companies graded B or better.',
    grades: {
      A: { meaning: 'Most of your money sat in the healthiest companies.', flavor: 'Sharp eyes on the charts.' },
      B: { meaning: 'Much of your money sat in healthier-than-average companies.', flavor: 'Steady navigation.' },
      C: { meaning: 'Your holdings were about as healthy as the average company.', flavor: 'A middle course.' },
      D: { meaning: 'Much of your money sat in less healthy companies.', flavor: 'Rough waters this time.' },
      F: { meaning: 'Most of your money sat in the least healthy companies.', flavor: 'Every captain learns from a storm.' },
    },
    nextTime: 'Next game, try reading each company with the 5 questions in the Learn guide.',
  },
} as const;
