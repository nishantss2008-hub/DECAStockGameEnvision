/**
 * Shell words, verbatim from COPY.md (§5 walkthrough, §7 guide, §9 banners, §11 host settings, §12 states) and
 * the phone strings of MOBILE §7.0 (`COPY-TBD mobile.*`). Placeholders are filled with `fill()`.
 */

export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, key: string) => (key in values ? String(values[key]) : m));
}

export const PHASES = {
  lobby: { pill: 'In the lobby', flavor: 'Anchored in port', body: 'The market opens when the host starts the game. You can research companies now.' },
  live: { pill: 'Market open', flavor: 'Sails up', body: 'Trading is open. Prices update every {tickSeconds} seconds.' },
  paused: {
    pill: 'Trading paused',
    flavor: 'Becalmed',
    body: 'The host paused trading. The clock stops, and orders can be placed again when trading resumes.',
  },
  finalSession: { pill: 'Final session', flavor: 'Land in sight', body: 'This is the last of 8 sessions. The game ends in {timeLeft}.' },
  ended: {
    pill: 'Game ended',
    flavor: 'Anchors dropped',
    body: 'Trading is closed. Holdings were valued at closing prices, and the standings are final.',
  },
  countdown: '{timeLeft} left',
  countdownPaused: 'Clock stopped while paused',
} as const;

export const BANNERS = {
  paused: {
    title: 'Trading paused',
    flavor: 'Becalmed',
    body: "The host paused the market at tick {tick}. You can preview orders, but you can't place them until trading resumes.",
  },
  lobby: {
    title: 'Market not open yet',
    flavor: 'Anchored in port',
    body: 'Trading opens when the host starts the game. You can research companies and preview orders now.',
  },
  ended: { title: 'Game ended', flavor: 'Anchors dropped', body: 'Trading is closed for this game. See the final standings and the market reveal.' },
  tradingDisabled: {
    title: 'Trading turned off for your crew',
    body: 'The host has turned off trading for your crew. You can still research companies and view your account.',
  },
} as const;

export const ERRORS = {
  offline: { title: "You're offline", body: 'Prices and standings will update when you reconnect.' },
  stale: { title: 'Prices may be out of date' },
  pageLoad: { title: "Couldn't load this page", body: 'Check your connection and try again.', action: 'Try again', flavor: 'Lost the wind.' },
} as const;

export const LOADING = { generic: { title: 'Loading…', flavor: 'Charting the course' } } as const;

export const SIGN_IN = {
  error: 'Crew name or password is incorrect. Check the spelling with your host and try again.',
  help: 'Your host gives each crew its name and password.',
  disabled: 'Your crew can sign in, but trading is turned off. Ask your host to turn it back on.',
  footer: 'A market simulation. No real money.',
} as const;

/** COPY §5 walkthrough with the phone variants from MOBILE §7.0 `walkthroughMobile`. */
export const WALKTHROUGH = {
  eyebrow: 'Getting started',
  title: 'Your first trade in 3 steps',
  stepCounter: 'Step {n} of 3',
  steps: [
    {
      id: 'research',
      title: 'Research a company',
      body: 'Open Markets, pick a company, and compare its profit, sales growth and debt with its sector average.',
      action: 'Open Markets',
      route: '/markets',
    },
    {
      id: 'order',
      title: 'Place a small first order',
      body: 'On a company page, tap Buy, enter a few shares, preview the cost and fee, then place the order.',
      action: 'Pick a company',
      route: '/markets',
    },
    {
      id: 'track',
      title: 'Track it on Portfolio',
      body: 'Portfolio shows your account value, your cash and how each holding has changed since you bought it.',
      action: 'Open Portfolio',
      route: '/portfolio',
    },
  ],
  learnLink: 'Open the Learn guide',
  next: 'Next',
  back: 'Back',
  dismiss: 'Got it, hide this',
  reopen: 'How to play',
} as const;

/** COPY §7 guide paragraphs used by Account › Game rules. */
export const GUIDE = {
  title: 'How the game works',
  start: 'Every crew starts with {startingCash} in cash and no shares; {symbol} stands for doubloons, the game\'s money. The crew with the highest account value (cash plus shares) at the end wins.',
  ticks: 'Prices update every {tickSeconds} seconds, and each update is a tick. The game has 8 sessions, and the whole game stands for about one year of business.',
  fees: 'Every buy and sell pays a fee of {feePct} of the order value. Fees are charged even on losing trades, so trading back and forth adds up.',
  limit: 'A buy cannot put more than {limitPct} of your account value into one company. If an order would pass that line, the ticket shows the most you can buy.',
  limitOff: 'This game has no position limit, so you can put as much of your account into one company as your cash allows.',
} as const;

/** COPY §11 host settings labels. */
export const SETTINGS = {
  gameLength: 'Game length',
  startingCash: 'Starting cash',
  tradingFee: 'Trading fee',
  positionLimit: 'Position limit',
  derived: '{length} game · updates every {tickSeconds} seconds · {totalTicks} ticks',
  limitOff: 'Off',
} as const;

/** MOBILE §7.0 proposed phone copy. */
export const MOBILE = {
  statusLine: '{pill} · {timeLeft} left · Session {session} of 8',
  statusLineCollapsed: 'Open · {timeLeft}',
  trade: 'Trade',
  signInFlavor: 'Trade the Spanish Main',
  signInFields: { crew: 'Crew name', password: 'Password', show: 'Show password', hide: 'Hide password' },
  signInButton: { idle: 'Sign in', loading: 'Signing in…' },
  helpHost: 'Trouble? Ask your host.',
  toasts: { updateReady: 'Update ready', reload: 'Reload', backOnline: 'Back online', walkthroughHidden: 'Walkthrough hidden', undo: 'Undo' },
  staleBody: 'The last price update was {ago} ago. Wait a moment, or tap Reload.',
  offlineReason: "You're offline",
  done: 'Done',
  signOut: { row: 'Sign out', title: 'Sign out of {crew}?', confirm: 'Sign out' },
  welcome: {
    title: 'Welcome aboard, {crew}',
    rows: [
      'You start with {startingCash} in cash.',
      'Prices update every {tickSeconds} seconds for the whole game.',
      'Healthier companies tend to do better over time, but news and luck matter.',
    ],
    start: 'Start the walkthrough',
    skip: 'Skip for now',
  },
  homeScreen: {
    row: 'Add to Home Screen',
    tipIos: "Tap Share, then Add to Home Screen. You'll sign in once more there.",
    tipAndroid: 'Open the browser menu, then tap Install app.',
    tipChromebook: 'Select the install icon at the right end of the address bar.',
  },
  solidBars: { row: 'Solid bars', footer: 'Turns off see-through bars. Use it if text on the bars is hard to read.' },
  textSize: {
    row: 'Text size',
    footerIos: "The app follows your iPhone's Text Size in Settings › Display & Brightness.",
    footerOther: 'Use your browser\'s zoom to make text bigger. On a Chromebook, press Ctrl and +.',
  },
} as const;

/** Shell-only labels that COPY does not cover yet (MOBILE §7.9, §7.15 wording). */
export const SHELL = {
  account: 'Account',
  gameRules: 'Game rules',
  display: 'Display',
  reloadApp: 'Reload app',
  rankLine: 'Rank {rank} of {count} · {value}',
  sessionEnds: 'Session {session} of 8 · ends in {time}',
  sessionOnly: 'Session {session} of 8',
  tickLine: 'Tick {tick} of {totalTicks} · {pct} · as of {time}',
  howGameWorks: 'How the game works',
  crewTab: 'Crew',
  hostTab: 'Host',
  signInAs: 'Sign in as',
  hostPassword: 'Host password',
  cancel: 'Cancel',
  comingSoon: 'Coming soon',
  mainNav: 'Main',
  hostNav: 'Host',
  skipToContent: 'Skip to content',
  moreInfo: 'What is {term}?',
} as const;
