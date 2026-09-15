/**
 * Toast (MOBILE §5.12) on `@base-ui/react/toast`, plus the app's single polite announcer.
 *
 * Toasts are transient glass capsules just below the top bar row: 22px icon, Callout text,
 * optional plain action, 44px Close. Info toasts stay ≥6s and pause while touched, hovered or
 * focused; toasts with an action stay until dismissed (their action is reachable by Tab/F6).
 * Swipe up or Close dismisses. Uses: "Update ready · Reload", "Back online", "Walkthrough hidden · Undo".
 * Order results never rely on a toast; they live in the ticket and Activity.
 *
 * Live announcements (Global Constraints): `aria-live="polite"` is used only for order results
 * and phase changes. Toasts are therefore silent by default (the Base UI viewport's live region
 * is switched off) and speak only when `announce` names one of those two kinds. The same
 * announcer serves Banner and the ticket via `useAnnounce()`.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { Toast as BaseToast } from '@base-ui/react/toast';
import { X, type LucideProps } from 'lucide-react';
import { INERT_EXEMPT_ATTR, VISUALLY_HIDDEN } from './overlay';
import './Toast.css';

/** The only things the app announces politely. */
export type AnnounceKind = 'order' | 'phase';

export const TOAST_MIN_TIMEOUT_MS = 6000;

/** Info toasts stay at least 6s; toasts with an action stay until dismissed (`0`). */
export function toastTimeout({ hasAction, timeoutMs }: { hasAction: boolean; timeoutMs?: number }): number {
  if (hasAction) return 0;
  if (timeoutMs === 0) return 0;
  return Math.max(TOAST_MIN_TIMEOUT_MS, timeoutMs ?? TOAST_MIN_TIMEOUT_MS);
}

type Announce = (message: string, kind: AnnounceKind) => void;

const AnnounceContext = createContext<Announce | null>(null);

/**
 * One visually hidden `role="status"` region for the whole app, portalled to `<body>` and marked
 * exempt from the `inert` applied behind sheets, so an order result is still heard while the
 * Trade sheet is open.
 */
export function AnnouncerProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const announce = useCallback<Announce>((text) => {
    if (timer.current) clearTimeout(timer.current);
    // Clear first so repeating the same sentence is announced again.
    setMessage('');
    timer.current = setTimeout(() => setMessage(text), 50);
  }, []);

  const region = (
    <div role="status" aria-live="polite" aria-atomic="true" style={VISUALLY_HIDDEN} {...{ [INERT_EXEMPT_ATTR]: '' }}>
      {message}
    </div>
  );

  return (
    <AnnounceContext.Provider value={announce}>
      {children}
      {typeof document === 'undefined' ? region : createPortal(region, document.body)}
    </AnnounceContext.Provider>
  );
}

const noopAnnounce: Announce = () => {};

/** Polite announcement for order results and phase changes only. No-op outside a provider. */
export function useAnnounce(): Announce {
  return useContext(AnnounceContext) ?? noopAnnounce;
}

interface ToastData {
  icon?: ComponentType<LucideProps>;
}

export interface ToastOptions {
  title: string;
  icon?: ComponentType<LucideProps>;
  action?: { label: string; onAction: () => void };
  /** Defaults to 6s (minimum); ignored when there is an action. */
  timeoutMs?: number;
  /** Speak the title politely. Only order results and phase changes may be announced. */
  announce?: AnnounceKind;
  /** Re-using an id updates the toast in place (e.g. one "Update ready" toast). */
  id?: string;
}

export interface ToastApi {
  show: (options: ToastOptions) => string;
  dismiss: (id?: string) => void;
}

export function useToast(): ToastApi {
  const manager = BaseToast.useToastManager<ToastData>();
  const announce = useAnnounce();
  const { add, close } = manager;
  return useMemo<ToastApi>(
    () => ({
      show: ({ title, icon, action, timeoutMs, announce: kind, id }) => {
        const toastId = add({
          id,
          title,
          timeout: toastTimeout({ hasAction: Boolean(action), timeoutMs }),
          priority: 'low',
          data: { icon },
          actionProps: action
            ? {
                children: action.label,
                onClick: () => {
                  action.onAction();
                  close(toastId);
                },
              }
            : undefined,
        });
        if (kind) announce(title, kind);
        return toastId;
      },
      dismiss: (toastId) => close(toastId),
    }),
    [add, close, announce],
  );
}

function ToastList({ closeLabel }: { closeLabel: string }) {
  const { toasts } = BaseToast.useToastManager<ToastData>();
  return (
    <BaseToast.Portal>
      {/* The Base UI viewport is a polite live region by default; announcements go through useAnnounce instead. */}
      <BaseToast.Viewport className="ios-toast-viewport" aria-live="off">
        {toasts.map((toast) => {
          const Icon = toast.data?.icon;
          return (
            <BaseToast.Root key={toast.id} toast={toast} swipeDirection="up" className="ios-toast glass">
              <BaseToast.Content className="ios-toast__content">
                {Icon ? <Icon className="ios-toast__icon" size={22} strokeWidth={1.75} aria-hidden="true" /> : null}
                <BaseToast.Title className="ios-toast__title" render={<p />}>
                  {toast.title}
                </BaseToast.Title>
                {toast.actionProps ? <BaseToast.Action className="ios-toast__action" /> : null}
                {/* Base UI hides Close from assistive tech until the stack expands; MOBILE §5.12 needs it reachable. */}
                <BaseToast.Close className="ios-toast__close" aria-label={closeLabel} aria-hidden={false}>
                  <X size={17} strokeWidth={1.75} aria-hidden="true" />
                </BaseToast.Close>
              </BaseToast.Content>
            </BaseToast.Root>
          );
        })}
      </BaseToast.Viewport>
    </BaseToast.Portal>
  );
}

export interface ToastProviderProps {
  children: ReactNode;
  closeLabel?: string;
}

/** Mount once near the app root (sibling of the route outlet, never inside a transformed element). */
export function ToastProvider({ children, closeLabel = 'Close' }: ToastProviderProps) {
  return (
    <BaseToast.Provider limit={2} timeout={TOAST_MIN_TIMEOUT_MS}>
      <AnnouncerProvider>
        {children}
        <ToastList closeLabel={closeLabel} />
      </AnnouncerProvider>
    </BaseToast.Provider>
  );
}
