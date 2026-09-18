/** Trade sheet steps (MOBILE §5.16, §7.10): Entry, Preview (and Placing), Filled, Needs attention, Choose a company. */
import { useEffect, useId, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { TriangleAlert } from 'lucide-react';
import { isFund, type Holding, type Instrument, type OrderEstimate, type Sector } from '@deca/shared';
import { FUNDS_EXTRA } from '../../lib/fundCopy';
import { Button } from '../ios/Button';
import { Crest } from '../ios/Crest';
import { InfoTipButton } from '../ios/InfoTipButton';
import { InfoTipLines } from '../ios/InfoTipSheet';
import { Keypad, KeypadAmount } from '../ios/Keypad';
import { keypadReducer, type KeypadAction } from '../ios/keypadReducer';
import { SegmentedControl } from '../ios/SegmentedControl';
import { SignedChange } from '../ios/SignedChange';
import { Stepper } from '../ios/Stepper';
import { WaxSeal } from '../ios/WaxSeal';
import { SearchField } from '../ios/SearchField';
import { InsetGroupedList } from '../ios/InsetGroupedList';
import { StockRow } from '../ios/ListRow';
import { formatMoneyCents, spokenMoney } from '../ios/signedText';
import { GLOSSARY } from '../../lib/glossary';
import { TICKET, fillText } from './ticketCopy';
import {
  chipShares,
  helperLine,
  inputForShares,
  positionLimitExplain,
  previewRows,
  pricedAtLine,
  recapLine,
  shareOfAccountLine,
  summaryRows,
  type FilledSummary,
  type TicketContext,
  type TicketFix,
  type TicketProblem,
} from './ticketModel';
import { amountCents, type TicketAction, type TicketState } from './useTicketState';

/* ─── Inline "?" inside the sheet (MOBILE §5.9: expands under the row, never another sheet) ─── */

function useInlineTerm(termId: string, extra?: string) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const entry = GLOSSARY[termId];
  const button = entry ? <InfoTipButton entry={entry} mode="inline" expanded={open} controls={id} onClick={() => setOpen((o) => !o)} /> : null;
  const panel =
    entry && open ? (
      <div className="tk-inline-tip" id={id}>
        {extra && <p className="t-subhead tk-inline-tip__extra">{extra}</p>}
        <InfoTipLines entry={entry} density="inline" headingLevel={4} />
      </div>
    ) : null;
  return { button, panel };
}

/* ─── Entry ─────────────────────────────────────────────────────────────────── */

export interface EntryStepProps {
  state: TicketState;
  dispatch: (a: TicketAction) => void;
  ctx: TicketContext;
  sessionChange: number;
  /** Crest colour; absent on the broad fund, which tracks no one sector. */
  sector?: Sector;
  quantity: number;
  estimate: OrderEstimate | null;
  problem: TicketProblem | null;
  compact: boolean;
  onFix: (fix: TicketFix) => void;
  onPreview: () => void;
}

export function EntryStep({ state, dispatch, ctx, sessionChange, sector, quantity, estimate, problem, compact, onFix, onPreview }: EntryStepProps) {
  const helperId = useId();
  const problemId = useId();
  const cashTip = useInlineTerm('cashAvailable');
  const shareTip = useInlineTerm('positionLimit', positionLimitExplain(ctx));
  const keypadState = { mode: state.mode, text: state.input };
  const onKey = (action: KeypadAction) => {
    const next = keypadReducer(keypadState, action);
    if (next.text !== state.input) dispatch({ type: 'setInput', input: next.text });
  };
  const helper = helperLine(state, ctx, quantity, estimate);
  const chips = state.side === 'buy' ? TICKET.chips.buy : TICKET.chips.sell;
  const stepValue = state.mode === 'shares' ? quantity : (amountCents(state.input) ?? 0);
  const setStep = (v: number) => {
    const text = v <= 0 ? '' : state.mode === 'shares' ? String(v) : inputForCents(v);
    dispatch({ type: 'setInput', input: text });
  };

  // Announce a new problem politely after 500ms idle (MOBILE §7.10).
  const [spokenProblem, setSpokenProblem] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setSpokenProblem(problem ? `${problem.title}. ${problem.message}` : ''), 500);
    return () => clearTimeout(t);
  }, [problem]);

  return (
    <div className="tk-entry" data-compact={compact || undefined}>
      <div className="tk-quote">
        <Crest ticker={ctx.ticker} sector={sector} size={32} />
        <div className="tk-quote__price">
          <span className="t-headline ios-num">{formatMoneyCents(ctx.price, ctx.currency)}</span>
          <SignedChange className="t-footnote" value={sessionChange} kind="pct" suffix={TICKET.labels.thisSession} caretSize={8} />
        </div>
        <div className="tk-quote__cash">
          <span className="t-footnote tk-secondary tk-label-tip">
            {TICKET.labels.cashAvailable}
            {cashTip.button}
          </span>
          <span className="t-subhead t-emph ios-num">{formatMoneyCents(ctx.cash, ctx.currency)}</span>
        </div>
      </div>
      {cashTip.panel}

      {/* A fund order is an order in every company it holds: say so before the keypad, not after. */}
      {ctx.isFund && <p className="t-footnote tk-secondary tk-fund-note">{state.side === 'buy' ? TICKET.lines.fundBuy : TICKET.lines.fundSell}</p>}

      <SegmentedControl
        className="tk-side"
        size="large"
        ariaLabel={TICKET.labels.sideLabel}
        value={state.side}
        onChange={(side) => dispatch({ type: 'setSide', side })}
        options={[
          { value: 'buy', label: TICKET.buttons.buy },
          { value: 'sell', label: TICKET.buttons.sell },
        ]}
      />
      <SegmentedControl
        className="tk-mode"
        ariaLabel={TICKET.labels.modeLabel}
        value={state.mode}
        onChange={(mode) => dispatch({ type: 'setMode', mode })}
        options={[
          { value: 'shares', label: TICKET.buttons.shares },
          { value: 'amount', label: TICKET.buttons.amount },
        ]}
      />

      <Stepper
        className="tk-amount"
        variant="split"
        value={stepValue}
        onChange={setStep}
        min={0}
        step={state.mode === 'shares' ? 1 : 10_000}
        decrementLabel={state.mode === 'shares' ? TICKET.labels.decreaseShares : fillText(TICKET.labels.decreaseAmount, { symbol: ctx.currency.symbol })}
        incrementLabel={state.mode === 'shares' ? TICKET.labels.increaseShares : fillText(TICKET.labels.increaseAmount, { symbol: ctx.currency.symbol })}
        controls="tk-amount-input"
      >
        <KeypadAmount
          id="tk-amount-input"
          state={keypadState}
          onKey={onKey}
          label={state.mode === 'shares' ? TICKET.labels.amountShares : fillText(TICKET.labels.amountDoubloons, { currency: ctx.currency.name.toLowerCase() })}
          symbol={ctx.currency.symbol}
          currencyWord={ctx.currency.name.toLowerCase()}
          describedBy={helper ? helperId : undefined}
          onSubmit={onPreview}
        />
      </Stepper>

      <div className="tk-chips-row">
        {!compact && (
          <p id={helperId} className="t-subhead tk-secondary tk-helper ios-num">
            {helper ?? ' '}
          </p>
        )}
        <div className="tk-chips" role="group" aria-label={TICKET.labels.quickAmounts}>
          {compact && helper && (
            <span id={helperId} className="t-footnote tk-secondary tk-helper--inline ios-num">
              {helper}
            </span>
          )}
          {chips.map((chip) => {
            const shares = chipShares(chip, state.side, ctx);
            return (
              <button
                key={chip}
                type="button"
                className="tk-chip t-subhead"
                disabled={shares <= 0}
                onClick={() => dispatch({ type: 'setInput', input: inputForShares(state, ctx, shares) })}
              >
                {chip}
              </button>
            );
          })}
        </div>
      </div>

      <div className="tk-box-slot">
        {problem ? (
          <div className="tk-box tk-problem" id={problemId}>
            <TriangleAlert className="tk-problem__icon" size={20} strokeWidth={1.75} aria-hidden="true" />
            <div className="tk-problem__text">
              <p className="t-subhead t-emph">{problem.title}</p>
              <p className="t-subhead">{problem.message}</p>
              {problem.fix && (
                <Button variant="tinted" size="small" onClick={() => onFix(problem.fix!)}>
                  {problem.fix.label}
                </Button>
              )}
            </div>
          </div>
        ) : estimate ? (
          <div className="tk-box">
            {summaryRows(state, ctx, estimate)
              .filter((_, i) => !compact || i === 0)
              .map((row) => (
                <div key={row.label} className="tk-box__row">
                  <span className="t-subhead tk-secondary">{row.label}</span>
                  <span className="t-subhead t-emph ios-num">{row.value}</span>
                </div>
              ))}
            <p className="t-footnote tk-secondary tk-label-tip">
              <span>{shareOfAccountLine(ctx, estimate)}</span>
              {shareTip.button}
            </p>
            {shareTip.panel}
          </div>
        ) : null}
        <span className="sr-only" role="status" aria-live="polite">
          {spokenProblem}
        </span>
      </div>

      <Keypad mode={state.mode} onKey={onKey} compact={compact} />
    </div>
  );
}

function inputForCents(cents: number): string {
  const whole = Math.floor(cents / 100);
  const frac = cents % 100;
  return frac === 0 ? String(whole) : `${whole}.${String(frac).padStart(2, '0')}`;
}

/* ─── Preview / Placing ─────────────────────────────────────────────────────── */

function PreviewRowItem({ label, value, termId, note, emphasized }: { label: string; value: string; termId: string; note?: string; emphasized?: boolean }) {
  const tip = useInlineTerm(termId);
  return (
    <>
      <li className="ios-row tk-row" data-emphasized={emphasized || undefined}>
        <div className="tk-row__head">
          <span className="t-body tk-label-tip">
            {label}
            {tip.button}
          </span>
          <span className={`t-body ios-num${emphasized ? ' t-emph' : ''}`}>{value}</span>
        </div>
        {note && <p className="t-footnote tk-secondary tk-row__note">{note}</p>}
      </li>
      {tip.panel && <li className="tk-inline-tip-row">{tip.panel}</li>}
    </>
  );
}

export function PreviewStep({ state, ctx, quantity, estimate, updatedTick }: { state: TicketState; ctx: TicketContext; quantity: number; estimate: OrderEstimate; updatedTick: number | null }) {
  return (
    <div className="tk-preview">
      <p className="t-body tk-recap">{recapLine(state, ctx, quantity)}</p>
      <ul className="tk-card" aria-label={TICKET.labels.previewTitle}>
        {previewRows(state, ctx, estimate).map((row) => (
          <PreviewRowItem key={row.label} {...row} />
        ))}
      </ul>
      {updatedTick !== null && (
        <p className="t-footnote tk-accent" role="status">
          {fillText(TICKET.lines.updatedForTick, { tick: updatedTick.toLocaleString('en-US') })}
        </p>
      )}
      <p className="t-footnote tk-secondary tk-note ios-num">{pricedAtLine(ctx.tick, ctx.timeText)}</p>
      <p className="t-footnote tk-secondary tk-note">{TICKET.lines.estimatedNote}</p>
    </div>
  );
}

/* ─── Filled ────────────────────────────────────────────────────────────────── */

export function FilledStep({ summary, headingRef, onActivity, onTradeAgain }: { summary: FilledSummary; headingRef: RefObject<HTMLHeadingElement>; onActivity: () => void; onTradeAgain: () => void }) {
  return (
    <div className="tk-filled">
      <WaxSeal tone="brass" size={64} className="tk-seal" />
      <h2 ref={headingRef} tabIndex={-1} className="t-title-1 t-emph tk-filled__title">
        {TICKET.labels.orderFilled}
      </h2>
      <p className="t-title-3 ios-num tk-filled__headline">{summary.headline}</p>
      <ul className="tk-card">
        {summary.rows.map((r) => (
          <li key={r.label} className="ios-row tk-row">
            <div className="tk-row__head">
              <span className="t-body">{r.label}</span>
              <span className="t-body ios-num">{r.value}</span>
            </div>
          </li>
        ))}
      </ul>
      <p className="t-footnote tk-secondary tk-note">{summary.vsPreview}</p>
      <p className="t-footnote tk-secondary tk-note tk-mono">{summary.orderLine}</p>
      <p className="t-footnote tk-secondary tk-note tk-flavor">{TICKET.lines.filledFlavor}</p>
      <div className="tk-filled__actions">
        <Button variant="gray" size="medium" onClick={onActivity}>
          {TICKET.buttons.viewActivity}
        </Button>
        <Button variant="gray" size="medium" onClick={onTradeAgain}>
          {TICKET.buttons.tradeAgain}
        </Button>
      </div>
    </div>
  );
}

/* ─── Needs attention ───────────────────────────────────────────────────────── */

export function AttentionStep({ problem, headingRef }: { problem: TicketProblem; headingRef: RefObject<HTMLHeadingElement> }) {
  return (
    <div className="tk-attention" role="alert">
      <span className="tk-attention__icon" aria-hidden="true">
        <TriangleAlert size={36} strokeWidth={1.75} />
      </span>
      <h2 ref={headingRef} tabIndex={-1} className="t-title-2 t-emph tk-attention__title">
        {problem.title}
      </h2>
      <p className="t-body tk-attention__message">{problem.message}</p>
    </div>
  );
}

/* ─── Choose a company (opened from Portfolio's Trade button) ───────────────── */

/** Pick something to trade: funds and companies in one list, funds first (spec §4 order). */
export function ChooseCompanyStep({ companies, holdings, currency, onPick }: { companies: Instrument[]; holdings: Holding[]; currency: TicketContext['currency']; onPick: (ticker: string) => void }) {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const match = (c: Instrument) => !q || c.ticker.toLowerCase().includes(q) || c.name.toLowerCase().includes(q);
  const held = useMemo(() => new Set(holdings.map((h) => h.companyId)), [holdings]);
  const matched = companies.filter(match);
  const funds = matched.filter(isFund).sort((a, b) => a.name.localeCompare(b.name));
  const all = matched.filter((c) => !isFund(c)).sort((a, b) => a.name.localeCompare(b.name));
  const yours = [...funds, ...all].filter((c) => held.has(c.id));
  const row = (c: Instrument) => (
    <StockRow
      key={c.id}
      ticker={c.ticker}
      name={c.name}
      sector={c.sector}
      priceText={formatMoneyCents(c.currentPrice, currency)}
      priceSpoken={spokenMoney(c.currentPrice, currency)}
      change={c.sessionChange}
      changeContext={TICKET.labels.thisSession}
      onClick={() => onPick(c.ticker)}
    />
  );
  return (
    <div className="tk-choose">
      <SearchField value={query} onChange={setQuery} placeholder={`Search ${companies.length} companies and funds`} />
      {yours.length > 0 && (
        <InsetGroupedList header="Your holdings" surface="sheet" className="tk-section">
          {yours.map(row)}
        </InsetGroupedList>
      )}
      {funds.length > 0 && (
        <InsetGroupedList header={FUNDS_EXTRA.fund.sectionTitle} surface="sheet" className="tk-section">
          {funds.map(row)}
        </InsetGroupedList>
      )}
      <InsetGroupedList header="All companies" surface="sheet" className="tk-section">
        {all.map(row)}
      </InsetGroupedList>
    </div>
  );
}

export function Pinned({ children }: { children: ReactNode }) {
  return <div className="tk-footer">{children}</div>;
}

export function useFocusOnMount(ref: RefObject<HTMLElement | null>, key: unknown) {
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
    }
    const t = setTimeout(() => ref.current?.focus(), 60);
    return () => clearTimeout(t);
  }, [ref, key]);
}
