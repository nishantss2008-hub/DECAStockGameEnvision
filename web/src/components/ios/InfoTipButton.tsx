/**
 * InfoTipButton (MOBILE §5.9): the "?" placed right after a metric label.
 *
 * - `sheet` mode (default) opens the InfoTip sheet: `aria-haspopup="dialog"`.
 * - `inline` mode is for rows inside a sheet (ticket preview), where "?" expands the row in
 *   place instead of opening a second sheet: `aria-expanded` + `aria-controls`.
 *
 * 22px glyph, 44×44 target, never nested inside a row or card link (§4.4).
 */
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { CircleQuestionMark } from 'lucide-react';
import { infoTipAriaLabel, type GlossaryEntry } from '../../lib/glossary';
import './InfoTipButton.css';

export interface InfoTipButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label' | 'aria-haspopup' | 'aria-expanded' | 'children'> {
  /** The glossary entry this "?" explains. Names the button "What is {label} ({term})?". */
  entry: GlossaryEntry;
  mode?: 'sheet' | 'inline';
  /** Inline mode: whether the explanation below the row is open. */
  expanded?: boolean;
  /** Inline mode: id of the expanding explanation. */
  controls?: string;
}

export const InfoTipButton = forwardRef<HTMLButtonElement, InfoTipButtonProps>(function InfoTipButton(
  { entry, mode = 'sheet', expanded = false, controls, className, type = 'button', ...rest },
  ref,
) {
  const inline = mode === 'inline';
  return (
    <button
      {...rest}
      ref={ref}
      type={type}
      className={['ios-infotip-button', className].filter(Boolean).join(' ')}
      aria-label={infoTipAriaLabel(entry)}
      aria-haspopup={inline ? undefined : 'dialog'}
      aria-expanded={inline ? expanded : undefined}
      aria-controls={inline ? controls : undefined}
      data-mode={mode}
      data-open={inline && expanded ? '' : undefined}
    >
      <CircleQuestionMark size={22} strokeWidth={1.75} aria-hidden="true" />
    </button>
  );
});
