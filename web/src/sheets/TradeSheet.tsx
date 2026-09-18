/**
 * Trade sheet (MOBILE §5.16, §7.10) at `?sheet=trade&ticker=KRKN&side=buy`: Entry (keypad, Shares | Doubloons) →
 * Preview (Now → After) → Placing → Filled (brass WaxSeal + toast) | Needs attention (every POST /orders error).
 * State is the plan's `useTicketState` reducer; estimates are the shared `estimateOrder`. POST /orders sends
 * `{ companyId, side, quantity, clientOrderId, quotedPrice }`; the clientOrderId is kept through retries.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import type { OrderSide, Trade } from '@deca/shared';
import { Sheet, type SheetDismissReason } from '../components/ios/Sheet';
import { EmptyState } from '../components/ios/EmptyState';
import { Button } from '../components/ios/Button';
import { Banner } from '../components/ios/Banner';
import { ActionSheet } from '../components/ios/ActionSheet';
import { useToast } from '../components/ios/Toast';
import { SkeletonGroup, SkeletonList } from '../components/ios/Skeleton';
import { apiPost, ApiRequestError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { newClientOrderId } from '../lib/orderId';
import { useSheet, type RoutedSheetProps } from '../shell/useSheet';
import { useShellNow } from '../shell/ShellData';
import { shellBanner } from '../shell/marketStatus';
import { TICKET } from '../components/trade/ticketCopy';
import {
  apiProblem,
  entryProblem,
  estimateTicket,
  filledSummary,
  inputForShares,
  placeBlock,
  previewAllowed,
  priceMovedProblem,
  type TicketFix,
  type TicketProblem,
} from '../components/trade/ticketModel';
import { isStale, useTicketState } from '../components/trade/useTicketState';
import { useTicketData } from '../components/trade/useTicketContext';
import { AttentionStep, ChooseCompanyStep, EntryStep, FilledStep, PreviewStep } from '../components/trade/TicketSteps';
import '../components/trade/trade.css';

export interface TradeSheetProps extends RoutedSheetProps {
  ticker: string | null;
  side: OrderSide;
}

/** iPhone SE and other short screens get the compressed Entry (MOBILE §7.10 "SE 375×667"). */
function useShortScreen(): boolean {
  const query = '(max-height: 700px)';
  const [short, setShort] = useState(() => typeof window !== 'undefined' && window.matchMedia?.(query).matches);
  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return undefined;
    const on = () => setShort(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return Boolean(short);
}

export default function TradeSheet({ open, onClose, onClosed, ticker, side }: TradeSheetProps) {
  const data = useTicketData(ticker);
  const { ctx, company, game, team, online } = data;
  const navigate = useNavigate();
  const { replace } = useSheet();
  const { logout } = useAuth();
  const toast = useToast();
  const now = useShellNow();
  const compact = useShortScreen();
  const [state, dispatch] = useTicketState(newClientOrderId(), company?.id ?? null, side);
  const [attention, setAttention] = useState<TicketProblem | null>(null);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [estimatePrice, setEstimatePrice] = useState<number | null>(null);
  const [updatedTick, setUpdatedTick] = useState<number | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // A new ticker or side from the URL starts a fresh order.
  useEffect(() => {
    if (company && state.companyId !== company.id && state.stage !== 'placing') dispatch({ type: 'setCompany', companyId: company.id });
  }, [company, state.companyId, state.stage, dispatch]);
  useEffect(() => {
    dispatch({ type: 'setSide', side });
  }, [side, dispatch]);

  const block = placeBlock({ phase: game?.phase, online, tradingDisabled: Boolean(team?.tradingDisabled) });
  const banner = shellBanner({ game, online, tradingDisabled: Boolean(team?.tradingDisabled), now });
  const showBanner = banner && banner.tone !== 'finalSession' && banner.tone !== 'info' ? banner : null;

  const { quantity, estimate } = useMemo(() => (ctx ? estimateTicket(state, ctx) : { quantity: 0, estimate: null }), [state, ctx]);
  const problem = ctx ? entryProblem(state, ctx, quantity, estimate) : null;
  const canPreview = Boolean(estimate && estimate.valid && !problem && previewAllowed(block));

  // Preview: a new tick updates values in place; a move past the 2% band sends the order to Needs attention.
  const previewTick = state.previewTick;
  useEffect(() => {
    if (!ctx || state.stage !== 'preview') return;
    if (isStale(state, ctx.price)) {
      setAttention(priceMovedProblem(ctx, state.quotedPrice ?? ctx.price));
      dispatch({ type: 'rejected', code: 'price_moved', message: '' });
    } else if (previewTick !== null && ctx.tick !== previewTick) {
      setUpdatedTick(ctx.tick);
    }
  }, [ctx, state, previewTick, dispatch]);

  const preview = useCallback(() => {
    if (!ctx || !canPreview) return;
    setUpdatedTick(null);
    dispatch({ type: 'preview', price: ctx.price, tick: ctx.tick });
  }, [ctx, canPreview, dispatch]);

  const place = useCallback(async () => {
    if (!ctx || !estimate || block || state.stage === 'placing') return;
    const est = estimateTicket(state, ctx);
    if (!est.estimate || est.quantity <= 0) return;
    setEstimatePrice(est.estimate.price);
    dispatch({ type: 'placing' });
    try {
      const res = await apiPost<{ trade: Trade }>('/orders', {
        companyId: ctx.companyId,
        side: state.side,
        quantity: est.quantity,
        clientOrderId: state.clientOrderId,
        quotedPrice: state.quotedPrice ?? ctx.price,
      });
      const summary = filledSummary(res.trade, est.estimate.price, ctx);
      dispatch({ type: 'filled', trade: res.trade });
      toast.show({ title: summary.announcement, announce: 'order' });
    } catch (err) {
      const e = err instanceof ApiRequestError ? err : new ApiRequestError(0, { error: 'network', message: '' }, '');
      const p = apiProblem({ code: e.code, status: e.status, message: e.message }, state, ctx, game?.phase ?? null);
      setAttention(p);
      dispatch({ type: 'rejected', code: p.code, message: p.message });
    }
  }, [ctx, estimate, block, state, dispatch, toast, game?.phase]);

  // Focus the step heading on Filled and Needs attention.
  useEffect(() => {
    if (state.stage === 'filled' || state.stage === 'rejected') {
      const t = setTimeout(() => headingRef.current?.focus(), 80);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [state.stage]);

  const applyFix = (fix: TicketFix) => {
    if (!ctx) return;
    const a = fix.action;
    switch (a.kind) {
      case 'shares':
        dispatch({ type: 'setInput', input: inputForShares(state, ctx, a.shares) });
        break;
      case 'input':
        dispatch({ type: 'setInput', input: a.input });
        break;
      case 'clear':
        dispatch({ type: 'setInput', input: '' });
        break;
      case 'repreview':
        setUpdatedTick(ctx.tick);
        dispatch({ type: 'preview', price: ctx.price, tick: ctx.tick });
        break;
      case 'place':
        void place();
        break;
      case 'navigate':
        onClose();
        setTimeout(() => navigate(a.to), 0);
        break;
      case 'signOut':
        onClose();
        void logout();
        break;
    }
    if (a.kind === 'shares' || a.kind === 'input' || a.kind === 'clear') {
      setTimeout(() => document.getElementById('tk-amount-input')?.focus(), 0);
    }
  };

  const dirty = state.input !== '' && (state.stage === 'entry' || state.stage === 'preview' || state.stage === 'rejected');
  const onDismissRequest = (_reason: SheetDismissReason) => {
    if (state.stage === 'placing') return false;
    if (dirty) {
      setDiscardOpen(true);
      return false;
    }
    return true;
  };

  const tradeAgain = () => {
    setAttention(null);
    setEstimatePrice(null);
    dispatch({ type: 'reset', clientOrderId: newClientOrderId() });
  };

  const backButton = (onClick: () => void) => (
    <button type="button" className="ios-sheet__close" aria-label={TICKET.buttons.back} onClick={onClick}>
      <ChevronLeft size={20} strokeWidth={1.75} aria-hidden="true" />
    </button>
  );

  const bannerId = 'tk-block-reason';
  const bannerNode = showBanner ? (
    <div id={bannerId} className="tk-banner">
      <Banner tone={showBanner.tone} title={showBanner.title} flavor={showBanner.flavor} body={showBanner.body} headingLevel={3} />
    </div>
  ) : null;

  // ─── Choose a company / loading / not found ───
  let title: string = TICKET.labels.previewTitle;
  let body: ReactNode = null;
  let footer: ReactNode = null;
  let leading: ReactNode | undefined;
  let headerLayout: 'centered' | 'hidden' = 'centered';
  let showClose = true;

  if (!ticker) {
    title = 'Trade';
    body = (
      <ChooseCompanyStep
        companies={data.companies}
        holdings={data.holdings}
        currency={ctx?.currency ?? game?.currency ?? { symbol: 'Ð', name: 'Doubloons' }}
        onPick={(t) => replace({ kind: 'trade', ticker: t, side: state.side })}
      />
    );
  } else if (data.notFound) {
    title = 'Trade';
    body = <EmptyState title="Company not found" body="We couldn't find a company with that symbol. Pick one from the search list, like KRKN." />;
  } else if (!ctx || !company) {
    title = `${state.side === 'buy' ? TICKET.buttons.buy : TICKET.buttons.sell} ${ticker}`;
    body = (
      <SkeletonGroup label="Loading prices…">
        <SkeletonList rows={6} rowHeight={48} />
      </SkeletonGroup>
    );
  } else if (state.stage === 'entry') {
    title = `${state.side === 'buy' ? TICKET.buttons.buy : TICKET.buttons.sell} ${ctx.ticker}`;
    body = (
      <>
        {bannerNode}
        <EntryStep
          state={state}
          dispatch={dispatch}
          ctx={ctx}
          sessionChange={company.sessionChange}
          sector={company.sector}
          quantity={quantity}
          estimate={estimate}
          problem={problem}
          compact={compact}
          onFix={applyFix}
          onPreview={preview}
        />
      </>
    );
    footer = (
      <Button variant="filled" size="large" fullWidth disabled={!canPreview} aria-describedby={block === 'ended' ? bannerId : undefined} onClick={preview}>
        {TICKET.buttons.preview}
      </Button>
    );
  } else if ((state.stage === 'preview' || state.stage === 'placing') && estimate) {
    const placing = state.stage === 'placing';
    title = TICKET.labels.previewTitle;
    leading = placing ? <span aria-hidden="true" /> : backButton(() => dispatch({ type: 'edit' }));
    body = (
      <>
        {bannerNode}
        <PreviewStep state={state} ctx={ctx} quantity={quantity} estimate={estimate} updatedTick={updatedTick} />
      </>
    );
    footer = (
      <div className="tk-footer-stack">
        <Button
          variant="filled"
          tone={state.side === 'buy' ? 'buy' : 'sell'}
          size="large"
          fullWidth
          loading={placing}
          loadingLabel={TICKET.buttons.placing}
          aria-busy={placing || undefined}
          disabled={Boolean(block) && !placing}
          aria-describedby={block ? bannerId : undefined}
          onClick={() => void place()}
        >
          {placing ? TICKET.buttons.placing : TICKET.buttons.place}
        </Button>
        {!placing && (
          <Button variant="plain" size="large" fullWidth onClick={() => dispatch({ type: 'edit' })}>
            {TICKET.buttons.edit}
          </Button>
        )}
      </div>
    );
  } else if (state.stage === 'filled' && state.trade) {
    const summary = filledSummary(state.trade, estimatePrice, ctx);
    title = TICKET.stages.filled;
    headerLayout = 'hidden';
    showClose = false;
    body = (
      <FilledStep
        summary={summary}
        headingRef={headingRef}
        onActivity={() => {
          onClose();
          setTimeout(() => navigate('/portfolio/activity'), 0);
        }}
        onTradeAgain={tradeAgain}
      />
    );
    footer = (
      <Button variant="filled" size="large" fullWidth onClick={onClose}>
        {TICKET.buttons.done}
      </Button>
    );
  } else {
    const p = attention ?? { code: 'unknown_error', title: 'Something went wrong', message: '', fix: null };
    title = TICKET.stages.rejected;
    leading = backButton(() => {
      setAttention(null);
      dispatch({ type: 'edit' });
    });
    body = <AttentionStep problem={p} headingRef={headingRef} />;
    footer = (
      <div className="tk-footer-stack">
        {p.fix && (
          <Button variant="filled" size="large" fullWidth onClick={() => applyFix(p.fix!)}>
            {p.fix.label}
          </Button>
        )}
        <Button
          variant="gray"
          size="large"
          fullWidth
          onClick={() => {
            setAttention(null);
            if (p.fix?.action.kind === 'shares' || p.code === 'bad_quantity') dispatch({ type: 'edit' });
            else onClose();
          }}
        >
          {TICKET.buttons.close}
        </Button>
      </div>
    );
  }

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={(next) => !next && onClose()}
        onClosed={() => {
          tradeAgain();
          onClosed();
        }}
        onDismissRequest={onDismissRequest}
        dismissible={state.stage !== 'placing'}
        title={title}
        headerLayout={headerLayout}
        leading={leading}
        showClose={showClose}
        closeLabel={TICKET.buttons.close}
        detents="large"
        footer={footer}
        // "Choose a company" is the one sheet here with a text field (MOBILE §7.10, §9.4), so its results list
        // has to be sized with the keyboard inset. It is set for every step, not just that one: flipping it when
        // a company is picked would remount the drawer mid-flow. The keypad's field is `inputmode="none"`, so
        // nothing else in the ticket ever raises the software keyboard.
        keyboardAware
        className="tk-sheet"
      >
        <div className="tk-body" data-stage={state.stage}>
          {body}
        </div>
      </Sheet>
      <ActionSheet
        open={discardOpen}
        onOpenChange={setDiscardOpen}
        title={TICKET.discard.title}
        cancelLabel={TICKET.discard.keep}
        actions={[
          {
            id: 'discard',
            label: TICKET.discard.confirm,
            destructive: true,
            onSelect: () => {
              setDiscardOpen(false);
              onClose();
            },
          },
        ]}
      />
    </>
  );
}

