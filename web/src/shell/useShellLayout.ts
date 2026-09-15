/** The §4.5 layout for the current viewport, following resizes and rotation. */
import { useEffect, useState } from 'react';
import { RAIL_QUERY, SPLIT_QUERY, type ShellLayout } from './device';

function current(): ShellLayout {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'phone';
  if (window.matchMedia(RAIL_QUERY).matches) return 'rail';
  if (window.matchMedia(SPLIT_QUERY).matches) return 'split';
  return 'phone';
}

export function useShellLayout(): ShellLayout {
  const [layout, setLayout] = useState<ShellLayout>(current);
  useEffect(() => {
    const update = () => setLayout(current());
    const lists = [RAIL_QUERY, SPLIT_QUERY].map((q) => window.matchMedia(q));
    lists.forEach((l) => l.addEventListener?.('change', update));
    window.addEventListener('resize', update);
    return () => {
      lists.forEach((l) => l.removeEventListener?.('change', update));
      window.removeEventListener('resize', update);
    };
  }, []);
  return layout;
}
