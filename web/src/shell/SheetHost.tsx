/**
 * Renders the sheet named by the URL (`?sheet=…`, MOBILE §6.5). Keeps the last sheet mounted while it animates
 * out, so Back and swipe-dismiss both play the exit. `?sheet=help` and `?sheet=stat` are rendered by the page
 * that owns the data (PAGE_OWNED_SHEETS).
 */
import { lazy, Suspense, useEffect, useState } from 'react';
import { useSheet, type RoutedSheetProps } from './useSheet';
import { PAGE_OWNED_SHEETS, type SheetRequest } from './sheetParams';

// Every sheet is its own chunk, so the first view does not pay for sheet code (MOBILE §9.7).
const AccountSheet = lazy(() => import('../sheets/AccountSheet'));
const StatusSheet = lazy(() => import('../sheets/StatusSheet'));
const WelcomeSheet = lazy(() => import('../sheets/WelcomeSheet'));
const InfoTipRoute = lazy(() => import('../sheets/InfoTipRoute'));
const TradeSheet = lazy(() => import('../sheets/TradeSheet'));
const CrewSheet = lazy(() => import('../sheets/CrewSheet'));

const sameSheet = (a: SheetRequest | null, b: SheetRequest | null) => Boolean(a && b && a.kind === b.kind);

export function SheetHost() {
  const { sheet, close } = useSheet();
  const [shown, setShown] = useState<SheetRequest | null>(sheet);

  useEffect(() => {
    if (sheet && !PAGE_OWNED_SHEETS.has(sheet.kind)) setShown(sheet);
  }, [sheet]);

  if (!shown) return null;
  const props: RoutedSheetProps = {
    open: sameSheet(sheet, shown),
    onClose: close,
    onClosed: () => setShown((cur) => (cur === shown && !sameSheet(sheet, cur) ? null : cur)),
  };
  const current = sheet && sheet.kind === shown.kind ? sheet : shown;

  return <Suspense fallback={null}>{renderSheet(current, props)}</Suspense>;
}

function renderSheet(current: SheetRequest, props: RoutedSheetProps) {
  switch (current.kind) {
    case 'account':
      return <AccountSheet {...props} />;
    case 'status':
      return <StatusSheet {...props} />;
    case 'welcome':
      return <WelcomeSheet {...props} />;
    case 'term':
      return <InfoTipRoute {...props} termId={current.id} />;
    case 'trade':
      return <TradeSheet {...props} ticker={current.ticker} side={current.side} />;
    case 'crew':
      return <CrewSheet {...props} crewId={current.id} />;
    default:
      return null;
  }
}
