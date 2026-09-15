/**
 * Router side of URL sheets (MOBILE §6.5): opening pushes one history entry so Back closes the sheet; steps
 * inside a sheet use `replace`; closing pops the entry we pushed, or strips the params of a deep link.
 */
import { useCallback, useMemo, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { parseSheet, withSheet, withoutSheet, type SheetRequest } from './sheetParams';

/** Marks history entries the app pushed for a sheet, so close() can go back instead of replacing. */
export const SHEET_STATE_KEY = 'bxSheet';

type SheetState = Record<string, unknown> | null;

export interface SheetControls {
  sheet: SheetRequest | null;
  open: (req: SheetRequest) => void;
  /** Swaps the open sheet's params without a new history entry (steps inside a sheet). */
  replace: (req: SheetRequest) => void;
  close: () => void;
}

export function useSheet(): SheetControls {
  const location = useLocation();
  const navigate = useNavigate();
  const sheet = useMemo(() => parseSheet(location.search), [location.search]);
  const closedKey = useRef<string | null>(null);
  const state = (location.state as SheetState) ?? null;

  const go = useCallback(
    (req: SheetRequest, replace: boolean) => {
      const pushed = replace ? Boolean(state?.[SHEET_STATE_KEY]) : true;
      navigate(
        { pathname: location.pathname, search: withSheet(location.search, req), hash: location.hash },
        { replace, preventScrollReset: true, state: { ...(state ?? {}), [SHEET_STATE_KEY]: pushed } },
      );
    },
    [navigate, location.pathname, location.search, location.hash, state],
  );

  const open = useCallback((req: SheetRequest) => go(req, false), [go]);
  const replace = useCallback((req: SheetRequest) => go(req, true), [go]);

  const close = useCallback(() => {
    if (!parseSheet(location.search) || closedKey.current === location.key) return;
    closedKey.current = location.key;
    if (state?.[SHEET_STATE_KEY]) {
      navigate(-1);
    } else {
      const { [SHEET_STATE_KEY]: _drop, ...rest } = state ?? {};
      navigate({ pathname: location.pathname, search: withoutSheet(location.search), hash: location.hash }, { replace: true, preventScrollReset: true, state: rest });
    }
  }, [navigate, location.key, location.pathname, location.search, location.hash, state]);

  return { sheet, open, replace, close };
}

/** Props every URL-driven sheet receives from SheetHost. */
export interface RoutedSheetProps {
  open: boolean;
  onClose: () => void;
  /** Fires after the exit animation, so the host can unmount the sheet. */
  onClosed: () => void;
}
