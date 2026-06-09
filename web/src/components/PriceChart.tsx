/**
 * PriceChart — a pirate-styled, responsive area/line chart of a company's
 * recorded price ticks (PricePoint[]).
 *
 * The y-axis is in whole currency units (Ð) — prices arrive as integer cents,
 * so we divide by 100 once, at the chart boundary, for display. The series is
 * colored green when it closed up over the window, red when down. The fill is a
 * soft gradient; the grid and axes use muted gold/ink to sit on either a navy
 * or parchment surface.
 */

import { useEffect, useMemo } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { PricePoint } from '@deca/shared';
import { CURRENCY } from '@deca/shared';
import { formatPrice } from '../lib/format';

const STYLE_ID = 'price-chart-styles';
const CSS = `
.chart-empty {
  display: grid;
  place-items: center;
  width: 100%;
  border-radius: var(--radius-md);
  border: 1px dashed rgba(201, 161, 59, 0.25);
  background: rgba(11, 22, 34, 0.3);
}
.chart-tooltip {
  background: var(--navy-800);
  border: 1px solid rgba(201, 161, 59, 0.45);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
  padding: var(--sp-2) var(--sp-3);
}
.chart-tooltip__price {
  font-size: var(--fs-md);
  font-weight: 600;
  color: var(--gold-200);
}
.chart-tooltip__meta { font-size: var(--fs-xs); }
.price-chart .recharts-surface { overflow: visible; }
`;

function useInjectedStyles() {
  useEffect(() => {
    if (document.getElementById(STYLE_ID)) return;
    const el = document.createElement('style');
    el.id = STYLE_ID;
    el.textContent = CSS;
    document.head.appendChild(el);
  }, []);
}

export interface PriceChartProps {
  history: PricePoint[];
  /** Chart height in px (responsive width). */
  height?: number;
  /** X axis: 'tick' (default) plots the engine tick; 'time' plots clock time. */
  xMode?: 'tick' | 'time';
  /** Show the x-axis tick labels. Defaults to true. */
  showXAxis?: boolean;
  className?: string;
}

interface ChartRow {
  tick: number;
  timestamp: number;
  /** Price in whole currency units for the axis/series. */
  value: number;
  /** Original integer cents, for tooltip formatting. */
  cents: number;
}

const GAIN = '#54bd86';
const LOSS = '#d96a62';
const AXIS = 'rgba(143, 166, 189, 0.7)';
const GRID = 'rgba(201, 161, 59, 0.15)';

function formatClock(ts: number): string {
  return new Date(ts).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface TooltipDatum {
  payload: ChartRow;
}

function ChartTooltip({
  active,
  payload,
  xMode,
}: {
  active?: boolean;
  payload?: TooltipDatum[];
  xMode: 'tick' | 'time';
}) {
  const first = payload?.[0];
  if (!active || !first) return null;
  const row = first.payload;
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip__price mono">{formatPrice(row.cents)}</div>
      <div className="chart-tooltip__meta muted">
        {xMode === 'time'
          ? new Date(row.timestamp).toLocaleString('en-US', {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })
          : `Tick ${row.tick}`}
      </div>
    </div>
  );
}

export default function PriceChart({
  history,
  height = 280,
  xMode = 'tick',
  showXAxis = true,
  className,
}: PriceChartProps) {
  useInjectedStyles();
  const data = useMemo<ChartRow[]>(
    () =>
      history.map((p) => ({
        tick: p.tick,
        timestamp: p.timestamp,
        value: p.price / 100,
        cents: p.price,
      })),
    [history],
  );

  const firstRow = data[0];
  const lastRow = data[data.length - 1];
  const up =
    firstRow && lastRow ? lastRow.value >= firstRow.value : true;
  const stroke = up ? GAIN : LOSS;
  const gradientId = up ? 'priceFillGain' : 'priceFillLoss';

  if (data.length === 0) {
    return (
      <div
        className={`chart-empty ${className ?? ''}`.trim()}
        style={{ height }}
      >
        <span className="muted">No soundings charted yet.</span>
      </div>
    );
  }

  // Pad the y-domain a touch so the line never hugs the frame.
  const values = data.map((d) => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = (max - min || max || 1) * 0.08;

  return (
    <div className={`price-chart ${className ?? ''}`.trim()} style={{ width: '100%' }}>
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
          <defs>
            <linearGradient id="priceFillGain" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={GAIN} stopOpacity={0.35} />
              <stop offset="100%" stopColor={GAIN} stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="priceFillLoss" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={LOSS} stopOpacity={0.35} />
              <stop offset="100%" stopColor={LOSS} stopOpacity={0.02} />
            </linearGradient>
          </defs>

          <CartesianGrid stroke={GRID} vertical={false} />

          <XAxis
            dataKey={xMode === 'time' ? 'timestamp' : 'tick'}
            hide={!showXAxis}
            tick={{ fill: AXIS, fontSize: 11, fontFamily: 'var(--font-mono)' }}
            tickLine={false}
            axisLine={{ stroke: GRID }}
            minTickGap={28}
            tickFormatter={(v: number) =>
              xMode === 'time' ? formatClock(v) : `#${v}`
            }
          />
          <YAxis
            width={64}
            tick={{ fill: AXIS, fontSize: 11, fontFamily: 'var(--font-mono)' }}
            tickLine={false}
            axisLine={false}
            domain={[min - pad, max + pad]}
            tickFormatter={(v: number) =>
              `${CURRENCY.symbol}${v.toLocaleString('en-US', {
                maximumFractionDigits: v >= 1000 ? 0 : 2,
              })}`
            }
          />
          <Tooltip
            content={<ChartTooltip xMode={xMode} />}
            cursor={{ stroke: 'rgba(201,161,59,0.5)', strokeDasharray: '4 4' }}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke={stroke}
            strokeWidth={2}
            fill={`url(#${gradientId})`}
            dot={false}
            activeDot={{ r: 3.5, fill: stroke, stroke: '#0b1622', strokeWidth: 1 }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
