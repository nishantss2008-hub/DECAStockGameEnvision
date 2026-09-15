/**
 * ActionSheet (MOBILE §5.11): bottom-anchored confirmation on `@base-ui/react/dialog`.
 *
 * Opaque `--elevated` panel inset 8px over its own scrim (z 75, above a sheet): optional title
 * and message, 56px action rows (destructive first), then a separate Cancel capsule. Tap outside
 * and Escape are Cancel. Initial focus is Cancel, the least destructive option (§10).
 * Uses: "Discard this order?" (ticket), "Sign out of {crew}?" (Account).
 */
import { useRef, useState } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { useInertOutside, VISUALLY_HIDDEN } from './overlay';
import './ActionSheet.css';

export interface ActionSheetAction {
  id: string;
  label: string;
  destructive?: boolean;
  onSelect: () => void;
}

export interface ActionSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** One line, e.g. "Discard this order?". Also names the dialog. */
  title: string;
  /** Hide the title visually (it still names the dialog). */
  titleHidden?: boolean;
  message?: string;
  actions: ActionSheetAction[];
  cancelLabel: string;
  onCancel?: () => void;
  onClosed?: () => void;
}

export function ActionSheet({
  open,
  onOpenChange,
  title,
  titleHidden = false,
  message,
  actions,
  cancelLabel,
  onCancel,
  onClosed,
}: ActionSheetProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [popupEl, setPopupEl] = useState<HTMLDivElement | null>(null);
  useInertOutside(open, popupEl);

  // Destructive actions come first (§5.11).
  const ordered = [...actions.filter((a) => a.destructive), ...actions.filter((a) => !a.destructive)];

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel?.();
        onOpenChange(next);
      }}
      onOpenChangeComplete={(isOpen) => {
        if (!isOpen) onClosed?.();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="ios-action-sheet-scrim" />
        <Dialog.Viewport className="ios-action-sheet-viewport">
          <Dialog.Popup ref={setPopupEl} className="ios-action-sheet" aria-modal="true" initialFocus={cancelRef}>
            <div className="ios-action-sheet__group">
              <div
                className="ios-action-sheet__header"
                style={titleHidden && !message ? VISUALLY_HIDDEN : undefined}
              >
                <Dialog.Title className="ios-action-sheet__title" style={titleHidden ? VISUALLY_HIDDEN : undefined}>
                  {title}
                </Dialog.Title>
                {message ? <Dialog.Description className="ios-action-sheet__message">{message}</Dialog.Description> : null}
              </div>
              {ordered.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  className="ios-action-sheet__action"
                  data-destructive={action.destructive ? '' : undefined}
                  onClick={() => {
                    action.onSelect();
                    onOpenChange(false);
                  }}
                >
                  {action.label}
                </button>
              ))}
            </div>
            <Dialog.Close ref={cancelRef} className="ios-action-sheet__cancel">
              {cancelLabel}
            </Dialog.Close>
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
