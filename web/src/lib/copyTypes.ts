/**
 * Types for the data generated from docs/design/COPY.md into glossary.data.ts
 * (see web/scripts/build-glossary.mjs). If COPY.md changes shape, the generated file
 * stops type-checking here, which is the point: update these types with it.
 */

import type { NewsType } from '@deca/shared';

export type GlossaryGroup = 'basics' | 'profit' | 'growth' | 'debt' | 'value' | 'trading' | 'game';

/** COPY §2 glossary block. `usuallyGoodWhen` is stored without its "Usually a good sign when " lead-in. */
export interface GlossaryEntry {
  id: string;
  label: string;
  term: string;
  whatItIs: string;
  whyItMatters: string;
  usuallyGoodWhen: string;
  related: string[];
  group: GlossaryGroup;
}

/** COPY §4 news block. */
export interface NewsCopy {
  type: NewsType;
  badge: string;
  bullish: string;
  bearish: string;
}

/** COPY §3 number-format tokens used by explain templates. */
export type ExplainFormat =
  | 'money2'
  | 'moneyCompact'
  | 'per100'
  | 'ratioMoney'
  | 'pct1'
  | 'pctWhole'
  | 'ratio1'
  | 'ratio2'
  | 'betaPct';

export interface ExplainExample {
  /** Whole currency units for money metrics (COPY examples are written in Ð, not cents). */
  value: number | null;
  valueText: string;
  sentence: string;
  averageText?: string;
}

/** COPY §3.1 explain block (one per MetricId). */
export interface ExplainTemplate {
  id: string;
  label: string;
  valueFormat: ExplainFormat;
  money?: ExplainFormat;
  pct?: ExplainFormat;
  flatBelow?: number;
  sentence: string;
  compareNote?: string;
  whenZero?: string;
  whenFlat?: string;
  whenNegative?: string;
  whenNull?: string;
  nullWhen?: string;
  example?: ExplainExample;
  lossExample?: ExplainExample;
  nullExample?: ExplainExample;
  zeroExample?: ExplainExample;
}

/** COPY §3.2 explain-extra block. */
export interface ExplainExtraCopy {
  averageLine: {
    sector: string;
    market: string;
    missingAvg: string;
    formatRule: string;
    marketNote: string;
    whatAverageMeans: string;
    unitsNote: string;
    examples: string[];
  };
  analystCard: {
    title: string;
    summaryAbove: string;
    summaryBelow: string;
    summaryNone: string;
    caution: string;
    example: string;
  };
  statementSummaries: {
    note: string;
    salesUp: string;
    salesDown: string;
    salesFlat: string;
    profitUp: string;
    profitUpSalesDown: string;
    profitDown: string;
    profitFlat: string;
    lossYears: string;
    balance: string;
    cashFlow: string;
    flatBelow: number;
    example: string;
  };
  research: {
    helper: string;
    fiveQuestionsPanel: string;
    fiveQuestionsNote: string;
    flavor: string;
    views: Record<string, { label: string; help: string }>;
  };
}

/** COPY §4 news-extra block. */
export interface NewsExtraCopy {
  whatThisMeans: string;
  sentiment: {
    bullish: { label: string; short: string };
    bearish: { label: string; short: string };
  };
  sinceReport: string;
  sinceReportHelp: string;
  companyCount: string;
  sourceHost: string;
  filters: { all: string; holdings: string; watchlist: string };
  tradeLink: string;
  readMore: string;
  readLess: string;
  flavor: string;
}

/** COPY §3 example-company block (BRIEF §7 KRKN worked example). */
export interface ExampleCompanyCopy {
  ticker: string;
  name: string;
  sector: string;
  averageScope: string;
  values: Record<string, { value: number | string | number[]; source: string; note?: string }>;
  sectorAverages: Record<string, number>;
}

export interface CopyData {
  glossary: GlossaryEntry[];
  news: NewsCopy[];
  newsExtra: NewsExtraCopy;
  explain: ExplainTemplate[];
  explainExtra: ExplainExtraCopy;
  formats: Record<ExplainFormat | 'nullValueText', string>;
  exampleCompany: ExampleCompanyCopy;
}
