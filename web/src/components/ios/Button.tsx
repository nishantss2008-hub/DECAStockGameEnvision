import { forwardRef, useLayoutEffect, useRef, type ButtonHTMLAttributes, type MouseEvent, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { buttonStyle, type ButtonSize, type ButtonTone, type ButtonVariant } from './buttonClass';
import { cx } from './iosCx';
import './Button.css';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** filled = Prominent/Buy/Sell · tinted · gray · plain · glass (MOBILE §5.7). */
  variant?: ButtonVariant;
  tone?: ButtonTone;
  /** large 50px · medium 34px · small 28px (all min-heights; hit area ≥44px). */
  size?: ButtonSize;
  /** Fill the width inside the margins (large buttons in sheets and footers). */
  fullWidth?: boolean;
  /** Shows a spinner and `loadingLabel`, sets aria-busy, locks width and ignores activation. */
  loading?: boolean;
  /** e.g. COPY §9 buttons.placing "Placing order…". Falls back to the normal label. */
  loadingLabel?: ReactNode;
  icon?: LucideIcon;
  iconPosition?: 'start' | 'end';
}

const ICON_SIZE: Record<ButtonSize, number> = { large: 20, medium: 17, small: 15 };

/**
 * Capsule button (MOBILE §5.7). Disabled and loading buttons stay focusable
 * (`aria-disabled`) so keyboard and VoiceOver users can still find them and
 * read the nearby reason; activation is swallowed instead.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'filled',
    tone = 'default',
    size = 'large',
    fullWidth = false,
    loading = false,
    loadingLabel,
    icon: Icon,
    iconPosition = 'start',
    disabled = false,
    type = 'button',
    className,
    style,
    onClick,
    children,
    ...rest
  },
  forwardedRef,
) {
  const innerRef = useRef<HTMLButtonElement | null>(null);
  const idleWidth = useRef<number | null>(null);
  const inactive = disabled || loading;

  // Remember the idle width so the button does not jump when the label changes to "Placing order…".
  // Measured only when the label, size or loading state changes, never on every price tick.
  useLayoutEffect(() => {
    if (!loading && innerRef.current) idleWidth.current = innerRef.current.offsetWidth || null;
  }, [loading, children, size, fullWidth]);

  const setRef = (node: HTMLButtonElement | null) => {
    innerRef.current = node;
    if (typeof forwardedRef === 'function') forwardedRef(node);
    else if (forwardedRef) forwardedRef.current = node;
  };

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (inactive) {
      event.preventDefault();
      return;
    }
    onClick?.(event);
  };

  const iconNode = Icon ? <Icon size={ICON_SIZE[size]} strokeWidth={1.75} aria-hidden="true" className="ios-button__icon" /> : null;
  const lockedStyle = loading && idleWidth.current ? { minWidth: idleWidth.current, ...style } : style;

  return (
    <button
      {...rest}
      ref={setRef}
      type={type}
      className={cx('ios-button', variant === 'glass' && 'glass', fullWidth && 'ios-button--full', className)}
      data-style={buttonStyle(variant, tone)}
      data-size={size}
      aria-disabled={inactive || undefined}
      aria-busy={loading || undefined}
      style={lockedStyle}
      onClick={handleClick}
    >
      {loading ? (
        <>
          <span className="ios-button__spinner" aria-hidden="true" />
          <span className="ios-button__label">{loadingLabel ?? children}</span>
        </>
      ) : (
        <>
          {iconPosition === 'start' && iconNode}
          {children !== undefined && children !== null && <span className="ios-button__label">{children}</span>}
          {iconPosition === 'end' && iconNode}
        </>
      )}
    </button>
  );
});
