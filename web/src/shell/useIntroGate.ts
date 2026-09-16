/**
 * The "Meet the market" gate on the order ticket (design 2026-09-16 §6, requirement 3).
 *
 * `POST /orders` answers `intro_required` until a crew has finished the intro, so every Buy/Sell
 * entry point asks here first and opens the flow instead of letting a student fill in an order that
 * cannot be placed. The ticket still handles `intro_required` arriving on a submit (the host can
 * clear a crew mid-session) — this hook is the polite path, not the security boundary.
 *
 * Truth comes from `team.introCompletedAt` on the live store. While the crew document is still
 * loading we do NOT gate: the server is the real check, so an unknown answer opens the ticket and
 * lets the ticket say `intro_required` if it comes to that. Blocking on unknown state would lock a
 * crew out of trading whenever the stream is slow.
 */
import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { OrderSide } from '@deca/shared';
import { introComplete, INTRO_PATH } from '../components/learn/introFlow';
import { useShellGame } from './ShellData';
import { useSheet } from './useSheet';

export interface TradeRequest {
  ticker: string | null;
  side: OrderSide;
}

export interface IntroGate {
  /** The crew has finished the intro (or we cannot tell yet, so nothing is blocked). */
  allowed: boolean;
  /** True only when we KNOW the crew still has to finish it. */
  gated: boolean;
  /** Opens the trade sheet, or sends an un-introduced crew into "Meet the market" instead. */
  openTrade: (req: TradeRequest) => void;
  /** Goes to the flow (the ticket's `intro_required` fix and the Learn row use the path directly). */
  openIntro: () => void;
}

export function useIntroGate(): IntroGate {
  const { team } = useShellGame();
  const { open } = useSheet();
  const navigate = useNavigate();
  const gated = team ? !introComplete(team) : false;

  const openIntro = useCallback(() => navigate(INTRO_PATH), [navigate]);
  const openTrade = useCallback(
    (req: TradeRequest) => {
      if (gated) navigate(INTRO_PATH);
      else open({ kind: 'trade', ticker: req.ticker, side: req.side });
    },
    [gated, navigate, open],
  );

  return { allowed: !gated, gated, openTrade, openIntro };
}
