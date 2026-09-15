/**
 * Learn copy from COPY.md, verbatim (learnCopy.test.ts checks it against COPY.md):
 * §7 guide ("How the game works"), §8 trading basics, §12 empty.glossarySearch.
 * Phone-only strings come from MOBILE §7.0 / §7.14.
 */

export interface GuideParagraph {
  id: string;
  heading: string;
  body: string;
  bodyWhenOff?: string;
}

export interface GuideCopy {
  title: string;
  flavor: string;
  examplesNote: string;
  paragraphs: GuideParagraph[];
}

export interface TradingBasic {
  id: string;
  title: string;
  glossary: string;
  explain: string;
  example: string[];
  caution: string;
}

export const GUIDE_COPY: GuideCopy = {
  "title": "How the game works",
  "flavor": "The rules of the voyage, in plain words.",
  "examplesNote": "Examples in this guide use sample numbers, so they will not match the prices and figures in your game.",
  "paragraphs": [
    {
      "id": "start",
      "heading": "Starting cash",
      "body": "Every crew starts with {startingCash} in cash and no shares; {symbol} stands for doubloons, the game's money. The crew with the highest account value (cash plus shares) at the end wins."
    },
    {
      "id": "ticks",
      "heading": "Ticks and sessions",
      "body": "Prices update every {tickSeconds} seconds, and each update is a tick. The game has 8 sessions, and the whole game stands for about one year of business."
    },
    {
      "id": "prices",
      "heading": "Prices and news",
      "body": "Prices move every tick. Part of each move follows the whole market, part is random, and part comes from news about the company, shown in Dispatches."
    },
    {
      "id": "fees",
      "heading": "Fees",
      "body": "Every buy and sell pays a fee of {feePct} of the order value. Fees are charged even on losing trades, so trading back and forth adds up."
    },
    {
      "id": "impact",
      "heading": "Price impact",
      "body": "Big orders nudge the price against you: you pay a bit more when buying and get a bit less when selling. The ticket shows this before you place an order."
    },
    {
      "id": "limit",
      "heading": "Position limit",
      "body": "A buy cannot put more than {limitPct} of your account value into one company. If an order would pass that line, the ticket shows the most you can buy.",
      "bodyWhenOff": "This game has no position limit, so you can put as much of your account into one company as your cash allows."
    },
    {
      "id": "health",
      "heading": "What moves prices over time",
      "body": "Companies with healthy finances and sensible prices for their profits tend to do better over the game. News, luck and hidden surprises still move prices. Nothing is certain, so spread your bets."
    },
    {
      "id": "end",
      "heading": "When the game ends",
      "body": "Holdings are valued at closing prices and the standings lock. The market reveal then shows each company's hidden health score and gives your crew a research grade."
    }
  ]
};

export const TRADING_BASICS: TradingBasic[] = [
  {
    "id": "marketOrder",
    "title": "Market orders",
    "glossary": "marketOrder",
    "explain": "A market order buys or sells right away at about the current price. It is the only order type in this game.",
    "example": [
      "KRKN's price is Ð84.12, and you place a market order to buy 10 shares.",
      "The ticket shows an estimate. When you place the order, it goes through right away at about Ð84.12 a share.",
      "If the price moves more than 2% before you place it, the ticket asks you to review a new estimate."
    ],
    "caution": "The final price can differ a little from the preview, because prices update every tick."
  },
  {
    "id": "fee",
    "title": "Fees",
    "glossary": "fee",
    "explain": "Every buy and every sell pays a fee, a percent of the order value. The default fee is 0.10%.",
    "example": [
      "Buy 10 KRKN at Ð84.12: order value Ð841.20 + fee Ð0.84 = total cost Ð842.04.",
      "Sell 10 KRKN at Ð84.12: order value Ð841.20 − fee Ð0.84 = you receive Ð840.36."
    ],
    "caution": "A quick buy and sell at the same price still loses both fees."
  },
  {
    "id": "priceImpact",
    "title": "Price impact",
    "glossary": "priceImpact",
    "explain": "Large orders nudge the price against you as they go through. The nudge is bigger for companies with fewer shares, and the ticket shows it before you place an order.",
    "example": [
      "Buy 500 KRKN at Ð84.12: KRKN has 242 million shares, so the nudge is under 0.01% and the estimate stays Ð84.12.",
      "A smaller company has 70 million shares at Ð50.00. You buy 8,000 shares, and the ticket shows a price impact of 0.02%.",
      "You pay about Ð50.01 a share: order value Ð400,083.13 + fee Ð400.08 = total cost Ð400,483.21.",
      "Without the nudge, 8,000 shares would cost Ð400,000.00, so the nudge added Ð83.13."
    ],
    "caution": "Other crews' orders in the same price update also move the price, and the nudge fades, so quickly selling back usually loses money."
  },
  {
    "id": "avgCost",
    "title": "Average cost",
    "glossary": "avgCost",
    "explain": "Average cost is the average price you paid per share across all your buys of one company. Fees are not included, and selling does not change it.",
    "example": [
      "You own 3,000 KRKN at an average cost of Ð73.50 and buy 500 more at Ð84.12.",
      "Cost basis: 3,000 × Ð73.50 + 500 × Ð84.12 = Ð262,560.00, what you paid for all 3,500 shares.",
      "New average cost: Ð262,560.00 ÷ 3,500 = Ð75.02."
    ],
    "caution": "A higher average cost means the price must climb further before the holding shows a gain."
  },
  {
    "id": "gains",
    "title": "Gains and losses",
    "glossary": "totalGain",
    "explain": "Unrealized gain is profit or loss on shares you still own. Realized gain is profit or loss you locked in by selling, after the sale's fee.",
    "example": [
      "You own 3,000 KRKN at an average cost of Ð73.50, and the price is now Ð84.12.",
      "Unrealized gain: 3,000 × (Ð84.12 − Ð73.50) = Ð31,860.00.",
      "You sell 1,000 at Ð84.12, a sale of Ð84,120.00 with a fee of Ð84.12.",
      "Realized gain: Ð84,120.00 − (1,000 × Ð73.50) − Ð84.12 = Ð10,535.88.",
      "The 2,000 shares you keep still show Ð21,240.00 of unrealized gain, and your average cost stays Ð73.50."
    ],
    "caution": "An unrealized gain can shrink or vanish if the price falls before you sell."
  },
  {
    "id": "diversification",
    "title": "Diversification",
    "glossary": "diversification",
    "explain": "Diversification means spreading your money across several companies and sectors, so one bad surprise hurts your account less.",
    "example": [
      "Put Ð400,000 into one company and it drops 20%: you lose Ð80,000.",
      "Split Ð400,000 across four companies at Ð100,000 each. If one drops 20% and the rest hold steady, you lose Ð20,000."
    ],
    "caution": "Spreading out lowers the damage from one company, but it cannot stop losses when the whole market falls."
  }
];

export const GLOSSARY_SEARCH_EMPTY = {
  "title": "No terms match “{query}”",
  "body": "Try a simpler word, like profit or debt."
} as const;

/** COPY §6 section title and §3.2 research helper wording used as the chapter name. */
export const FIVE_QUESTIONS_TITLE = 'Read a company in 5 questions';
/** COPY §8 section name. */
export const TRADING_BASICS_TITLE = 'Trading basics';
