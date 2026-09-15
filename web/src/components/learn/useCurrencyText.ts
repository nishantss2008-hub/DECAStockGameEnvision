import { useCallback } from 'react';
import { CURRENCY } from '@deca/shared';
import { withCurrency } from '../../lib/glossary';
import { useShellGame } from '../../shell/ShellData';

/** COPY §0.3: swaps Ð and "doubloons" when the host renamed the currency. */
export function useCurrencyText(): (text: string) => string {
  const { game } = useShellGame();
  const name = game?.currency?.name ?? CURRENCY.name;
  const symbol = game?.currency?.symbol ?? CURRENCY.symbol;
  return useCallback((text: string) => withCurrency(text, { name, symbol }), [name, symbol]);
}
