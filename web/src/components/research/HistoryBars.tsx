/**
 * 4-year sales bars with profit ticks (MOBILE §7.7 row 5 mini chart, §7.8 bar chart card).
 * Mini: decorative (the summary sentence above says the same). Full: each year is a button; the selected year
 * shows both values, and its name carries them for screen readers.
 */
import { useState } from 'react';
import { formatMoney } from '../../lib/format';
import type { HistoryBar } from './researchModel';
import { RESEARCH } from './researchCopy';

export interface HistoryBarsProps {
  bars: readonly HistoryBar[];
  symbol: string;
  height?: number;
  interactive?: boolean;
}

export function HistoryBars({ bars, symbol, height = 64, interactive = false }: HistoryBarsProps) {
  const [selected, setSelected] = useState(bars.length - 1);
  const max = Math.max(1, ...bars.map((b) => Math.max(b.revenue, b.netIncome, 0)));
  const money = (cents: number) => formatMoney(cents, { symbol, compact: true });
  const pick = bars[selected] ?? bars[bars.length - 1];

  const columns = bars.map((b, i) => {
    const salesPct = Math.max(2, (Math.max(0, b.revenue) / max) * 100);
    const profitPct = (Math.max(0, b.netIncome) / max) * 100;
    const body = (
      <>
        <span className="rs-bars__plot" style={{ height }}>
          <span className="rs-bars__bar" style={{ height: `${salesPct}%` }} />
          <span className="rs-bars__tick" style={{ bottom: `${profitPct}%` }} />
        </span>
        <span className="rs-bars__year t-caption-1 ios-num">{b.year}</span>
      </>
    );
    if (!interactive) {
      return (
        <span key={b.year} className="rs-bars__col">
          {body}
        </span>
      );
    }
    return (
      <button
        key={b.year}
        type="button"
        className="rs-bars__col rs-bars__col--button"
        aria-pressed={i === selected}
        aria-label={`${b.year}: ${RESEARCH.sales} ${money(b.revenue)}, ${RESEARCH.profit} ${money(b.netIncome)}`}
        onClick={() => setSelected(i)}
        data-selected={i === selected || undefined}
      >
        {body}
      </button>
    );
  });

  return (
    <div className="rs-bars" data-interactive={interactive || undefined}>
      {interactive && pick && (
        <p className="rs-bars__readout t-subhead ios-num" aria-live="polite">
          <span className="t-emph">{pick.year}</span> · {RESEARCH.sales} {money(pick.revenue)} · {RESEARCH.profit} {money(pick.netIncome)}
        </p>
      )}
      <div className="rs-bars__row" aria-hidden={interactive ? undefined : true}>
        {columns}
      </div>
      <p className="rs-bars__legend t-caption-1" aria-hidden="true">
        <span className="rs-bars__key rs-bars__key--sales" /> {RESEARCH.sales}
        <span className="rs-bars__key rs-bars__key--profit" /> {RESEARCH.profit}
      </p>
    </div>
  );
}
