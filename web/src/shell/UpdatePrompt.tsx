/**
 * Service worker registration with `registerType: 'prompt'` (MOBILE §9.5): never reloads mid-trade. When a new
 * version is waiting, shows the "Update ready · Reload" toast, but not while a sheet is open (between screens).
 */
import { useEffect, useRef } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { RefreshCw } from 'lucide-react';
import { useToast } from '../components/ios/Toast';
import { MOBILE } from './copy';

export function UpdatePrompt({ sheetOpen }: { sheetOpen: boolean }) {
  const toast = useToast();
  const shown = useRef(false);
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({ immediate: true });

  useEffect(() => {
    if (!needRefresh || sheetOpen || shown.current) return;
    shown.current = true;
    toast.show({
      id: 'bx-update',
      title: MOBILE.toasts.updateReady,
      icon: RefreshCw,
      timeoutMs: 0,
      action: { label: MOBILE.toasts.reload, onAction: () => void updateServiceWorker(true) },
    });
  }, [needRefresh, sheetOpen, toast, updateServiceWorker]);

  return null;
}
