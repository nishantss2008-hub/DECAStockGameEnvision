/**
 * Alert (MOBILE §5.11) on `@base-ui/react/alert-dialog`.
 *
 * Centred 300px opaque card: Headline title and Subhead message (left-aligned), then 44px
 * capsules: Cancel (gray, leading) and the default action (trailing), stacked when either label
 * is longer than 12 characters. Initial focus is Cancel. The student app uses no alerts in normal
 * play; the host's End game uses the typed-confirmation variant (`confirmWord="END"`), which
 * focuses its text field and keeps the action disabled until the field matches.
 */
import { useEffect, useId, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { AlertDialog } from '@base-ui/react/alert-dialog';
import { useInertOutside } from './overlay';
import './Alert.css';

export const ALERT_STACK_AFTER_CHARS = 12;

export function alertButtonsStacked(cancelLabel: string, confirmLabel: string): boolean {
  return cancelLabel.length > ALERT_STACK_AFTER_CHARS || confirmLabel.length > ALERT_STACK_AFTER_CHARS;
}

export interface AlertProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  message?: ReactNode;
  cancelLabel: string;
  confirmLabel: string;
  /** Runs the action. The caller closes the alert (or keeps it open while busy). */
  onConfirm: () => void;
  /** Destructive tinted action (never the prominent style, MOBILE §5.7). */
  destructive?: boolean;
  /** Keep the action focusable but inactive, e.g. while a request runs. */
  confirmDisabled?: boolean;
  /** Typed confirmation: the action stays disabled until the field equals this word. */
  confirmWord?: string;
  /** Visible label of the typed-confirmation field, e.g. "Type END to confirm". */
  confirmWordLabel?: string;
  /** Extra content between the message and the buttons. */
  children?: ReactNode;
  onClosed?: () => void;
}

export function Alert({
  open,
  onOpenChange,
  title,
  message,
  cancelLabel,
  confirmLabel,
  onConfirm,
  destructive = false,
  confirmDisabled = false,
  confirmWord,
  confirmWordLabel,
  children,
  onClosed,
}: AlertProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const fieldRef = useRef<HTMLInputElement>(null);
  const fieldId = useId();
  const [typed, setTyped] = useState('');
  const [popupEl, setPopupEl] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    if (open) setTyped('');
  }, [open]);

  useInertOutside(open, popupEl);

  const wordOk = confirmWord === undefined || typed === confirmWord;
  const inactive = confirmDisabled || !wordOk;
  const stacked = alertButtonsStacked(cancelLabel, confirmLabel);

  const handleConfirm = (event: MouseEvent<HTMLButtonElement>) => {
    if (inactive) {
      event.preventDefault();
      return;
    }
    onConfirm();
  };

  return (
    <AlertDialog.Root
      open={open}
      onOpenChange={(next) => onOpenChange(next)}
      onOpenChangeComplete={(isOpen) => {
        if (!isOpen) onClosed?.();
      }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="ios-alert-scrim" />
        <AlertDialog.Viewport className="ios-alert-viewport">
          <AlertDialog.Popup
            ref={setPopupEl}
            className="ios-alert"
            aria-modal="true"
            initialFocus={confirmWord !== undefined ? fieldRef : cancelRef}
          >
            <AlertDialog.Title className="ios-alert__title">{title}</AlertDialog.Title>
            {message ? <AlertDialog.Description className="ios-alert__message">{message}</AlertDialog.Description> : null}
            {confirmWord !== undefined ? (
              <div className="ios-alert__field">
                <label className="ios-alert__label" htmlFor={fieldId}>
                  {confirmWordLabel ?? confirmWord}
                </label>
                <input
                  ref={fieldRef}
                  id={fieldId}
                  className="ios-alert__input"
                  type="text"
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  enterKeyHint="done"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !inactive) onConfirm();
                  }}
                />
              </div>
            ) : null}
            {children}
            <div className="ios-alert__buttons" data-stacked={stacked ? '' : undefined}>
              <AlertDialog.Close ref={cancelRef} className="ios-alert__button" data-kind="cancel">
                {cancelLabel}
              </AlertDialog.Close>
              <button
                type="button"
                className="ios-alert__button"
                data-kind={destructive ? 'destructive' : 'default'}
                aria-disabled={inactive || undefined}
                onClick={handleConfirm}
              >
                {confirmLabel}
              </button>
            </div>
          </AlertDialog.Popup>
        </AlertDialog.Viewport>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
