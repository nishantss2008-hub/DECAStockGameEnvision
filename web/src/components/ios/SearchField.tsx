import { useEffect, useRef, useState, type FocusEvent, type KeyboardEvent, type Ref } from 'react';
import { Search, X } from 'lucide-react';
import { cx } from './iosCx';
import './iosShared.css';
import './SearchField.css';

export interface SearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  /** e.g. COPY-TBD mobile.searchCompanies "Search 25 companies". Also the accessible name unless `label` is set. */
  placeholder: string;
  label?: string;
  /** Enter / the keyboard's search key. */
  onSubmit?: (value: string) => void;
  /** Cancel button or Escape on an empty field. */
  onCancel?: () => void;
  /** Lets the page show recent searches while focused. */
  onFocusChange?: (focused: boolean) => void;
  /** 36px capsule on --fill-on-glass inside the collapsed glass bar (MOBILE §5.3). */
  pinned?: boolean;
  cancelLabel?: string;
  clearLabel?: string;
  /** Polite live text such as "3 results"; announced after 500ms without changes. */
  announcement?: string;
  inputRef?: Ref<HTMLInputElement>;
  id?: string;
  className?: string;
}

const ANNOUNCE_DELAY_MS = 500;

/**
 * SearchField (MOBILE §5.3): capsule field with a leading search glyph, a Clear
 * button once there is text, and Cancel while the search is active. Results
 * are rendered by the page as a normal list of links.
 */
export function SearchField({
  value,
  onChange,
  placeholder,
  label,
  onSubmit,
  onCancel,
  onFocusChange,
  pinned = false,
  cancelLabel = 'Cancel',
  clearLabel = 'Clear search',
  announcement,
  inputRef,
  id,
  className,
}: SearchFieldProps) {
  const [active, setActive] = useState(false);
  const [spoken, setSpoken] = useState('');
  const ownInput = useRef<HTMLInputElement | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setSpoken(announcement ?? ''), ANNOUNCE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [announcement]);

  const setInputRef = (node: HTMLInputElement | null) => {
    ownInput.current = node;
    if (typeof inputRef === 'function') inputRef(node);
    else if (inputRef) (inputRef as { current: HTMLInputElement | null }).current = node;
  };

  const cancel = () => {
    if (value) onChange('');
    setActive(false);
    ownInput.current?.blur();
    onCancel?.();
  };

  const clear = () => {
    onChange('');
    ownInput.current?.focus();
  };

  const onFocus = () => {
    setActive(true);
    onFocusChange?.(true);
  };

  const onBlur = (event: FocusEvent<HTMLInputElement>) => {
    onFocusChange?.(false);
    const next = event.relatedTarget as Node | null;
    // Stay active while focus moves to Clear or Cancel, or while results for typed text are listed.
    if (next && formRef.current?.contains(next)) return;
    if (!value) setActive(false);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    if (value) {
      event.stopPropagation();
      onChange('');
    } else {
      cancel();
    }
  };

  // Keep focus in the field when Clear or Cancel is pressed with a mouse or finger.
  const keepFocus = (event: { preventDefault(): void }) => event.preventDefault();

  return (
    <form
      ref={formRef}
      role="search"
      // Names the search landmark like its field, so two searches on one page stay distinguishable.
      aria-label={label ?? placeholder}
      className={cx('ios-search', pinned && 'ios-search--pinned', active && 'ios-search--active', className)}
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit?.(value);
      }}
    >
      {/* Tapping anywhere on the capsule (icon, padding, the 44px hit area) focuses the field. */}
      <div
        className="ios-search__field"
        onClick={(event) => {
          if (event.target === event.currentTarget) ownInput.current?.focus();
        }}
      >
        <Search className="ios-search__icon" size={17} strokeWidth={1.75} aria-hidden="true" />
        <input
          ref={setInputRef}
          id={id}
          className="ios-search__input"
          type="search"
          value={value}
          placeholder={placeholder}
          aria-label={label ?? placeholder}
          enterKeyHint="search"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          onChange={(event) => onChange(event.target.value)}
          onFocus={onFocus}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
        />
        {value && (
          <button type="button" className="ios-search__clear" aria-label={clearLabel} onMouseDown={keepFocus} onClick={clear}>
            <span className="ios-search__clear-circle" aria-hidden="true">
              <X size={11} strokeWidth={2.5} aria-hidden="true" />
            </span>
          </button>
        )}
      </div>
      {active && (
        <button type="button" className="ios-search__cancel" onMouseDown={keepFocus} onClick={cancel}>
          {cancelLabel}
        </button>
      )}
      <span className="ios-sr-only" role="status" aria-live="polite" aria-atomic="true">
        {spoken}
      </span>
    </form>
  );
}
