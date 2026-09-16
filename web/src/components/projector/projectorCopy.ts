/**
 * The projector scoreboard's words, verbatim from COPY.md §15 (`projectorCopy.sync.test.ts`
 * checks it against COPY.md). Placeholders are filled with `fill()` from shell/copy.
 */
export const PROJECTOR = {
  eyebrow: 'Buccaneer Exchange',
  title: 'Standings',
  columns: {
    rank: '#',
    crew: 'Crew',
    totalValue: 'Account value',
    returnPct: 'Total return',
  },
  clock: {
    live: '{timeLeft} left',
    paused: 'Clock stopped',
    lobby: '{timeLeft} on the clock',
    ended: 'Final',
  },
  session: 'Session {session} of 8',
  composite: {
    label: 'Pirate Composite',
    change: '{pct} this session',
  },
  news: {
    label: 'Latest dispatch',
    empty: 'No news yet.',
  },
  movers: {
    label: 'Biggest movers this session',
    empty: 'Nothing has moved yet.',
  },
  phases: {
    lobby: {
      title: 'Not started yet',
      flavor: 'Anchored in port',
      body: 'The market opens when the host starts the game.',
    },
    paused: {
      title: 'Trading paused',
      flavor: 'Becalmed',
      body: 'The clock is stopped. Prices hold until the host starts trading again.',
    },
    ended: {
      title: 'Game ended',
      flavor: 'Anchors dropped',
      body: 'Trading is closed. Holdings were valued at closing prices, and these standings are final.',
    },
  },
  winner: 'Winner: {crew}',
  overflow: 'Showing the top {n} of {total} crews',
  connection: {
    title: 'Live updates stopped',
    body: 'These numbers may be out of date. They catch up on their own when the connection returns.',
  },
  waiting: {
    title: 'Waiting for the market',
    body: "The scoreboard fills in as soon as the host's game is set up.",
  },
  empty: 'No crews in the standings yet.',
} as const;
