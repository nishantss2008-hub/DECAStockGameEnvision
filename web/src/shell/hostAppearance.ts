import { useEffect } from 'react';

/** The host phone is always dark (MOBILE §7.17–§7.18). On the root element, so portalled sheets and menus match. */
export function useHostAppearance() {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add('dark');
    return () => root.classList.remove('dark');
  }, []);
}
