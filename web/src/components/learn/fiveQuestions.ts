/**
 * "Read a company in 5 questions" (COPY.md §6, verbatim; fiveQuestions.test.ts checks it against COPY.md).
 * `lookAt` = glossary ids. `where` is the COPY text; the phone renders it through `phoneWhere` (learnLogic.ts).
 * `compare` says which number to compare with which; `example` uses the BRIEF §7 sample numbers and is shown
 * under GUIDE_COPY.examplesNote. No verdicts about specific companies, no scoring weights.
 */

export interface Question {
  id: 'profit' | 'growth' | 'debt' | 'price' | 'news';
  question: string;
  lookAt: string[];
  where: string;
  compare: string;
  example: string;
  tip: string;
}

export const FIVE_QUESTIONS: Question[] = [
  {
    "id": "profit",
    "question": "Is it making money?",
    "lookAt": [
      "netIncome",
      "netMargin",
      "freeCashFlow",
      "operatingCashFlow"
    ],
    "where": "Research → Basics view (Profit margin column) · Trade → Financials → Income statement and Cash flow · Trade → Snapshot → Key facts",
    "compare": "Profit above zero means it made money. Compare its profit margin with the sector average to see how much of each sale it keeps.",
    "example": "KRKN made Ð1.14B of profit last year. It keeps Ð14 of every Ð100 of sales; the sector average is Ð10. Profit rose every year, from Ð0.94B to Ð1.14B.",
    "tip": "One year can mislead, so check whether profit held up across all 4 years."
  },
  {
    "id": "growth",
    "question": "Is it growing?",
    "lookAt": [
      "revenueGrowth",
      "revenue",
      "industryGrowth",
      "tam"
    ],
    "where": "Research → Basics view (Sales growth column) · Trade → Financials → Income statement and Industry",
    "compare": "Compare its sales growth with the sector average and with how fast its whole industry is growing.",
    "example": "KRKN's sales grew about 7% a year, from Ð6.61B to Ð8.14B. The sector average is 4.9% a year.",
    "tip": "Fast sales growth means less if the losses grow along with it."
  },
  {
    "id": "debt",
    "question": "Can it handle its debts?",
    "lookAt": [
      "debtToEquity",
      "currentRatio",
      "totalDebt",
      "cash"
    ],
    "where": "Research → Basics view (Debt vs. equity column) or Financial health view · Trade → Financials → Balance sheet · Trade → Snapshot → Key facts",
    "compare": "Compare debt vs. owner equity with the sector average; a lower number means less debt per Ð1 of equity. Short-term bill coverage above 1 means more short-term money than bills due soon.",
    "example": "KRKN's debt vs. owner equity is 0.62; the sector average is 0.95. Its short-term bill coverage is 1.84; the sector average is 1.35.",
    "tip": "Normal debt levels differ by industry, so compare with the sector average rather than with every company."
  },
  {
    "id": "price",
    "question": "Is the price reasonable for its profits?",
    "lookAt": [
      "peRatio",
      "forwardPe",
      "psRatio",
      "evToEbitda"
    ],
    "where": "Research → Basics view (Price vs. profit column) or Valuation view · Trade → Snapshot → Key statistics · Trade → Financials → Valuation",
    "compare": "Compare price vs. profit (P/E) with the sector average; a lower number means you pay less for each Ð1 of profit.",
    "example": "KRKN's price vs. profit (P/E) is 17.8, so you pay Ð17.80 for every Ð1 of yearly profit. The sector average is 22.1.",
    "tip": "A low price vs. profit can signal trouble ahead, so read it together with your answers about profit, growth and debt."
  },
  {
    "id": "news",
    "question": "What is the news saying?",
    "lookAt": [
      "news",
      "sessionChange",
      "analystRating",
      "priceTarget"
    ],
    "where": "Dispatches (read the What this means line) · Trade → Dispatches · Trade → Analysts",
    "compare": "Read the What this means line, then check how much the price has already moved since the news came out.",
    "example": "CNBR's dispatch says earnings beat forecasts: it made more profit than expected. Its price is up 6.12% since the news came out.",
    "tip": "News moves prices at once, so by the time you read it, the price has already moved."
  }
];
