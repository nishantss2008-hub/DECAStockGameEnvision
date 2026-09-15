import { useId, type CSSProperties, type MouseEvent, type ReactNode } from 'react';
import { Link, type To } from 'react-router-dom';
import { ChevronRight, type LucideIcon } from 'lucide-react';
import type { Sector } from '@deca/shared';
import type { Explained } from '../../lib/compare';
import { changeParts } from './changeText';
import { splitLastWord } from './labelText';
import { Crest } from './Crest';
import { ChangePill } from './Pill';
import { Toggle } from './Toggle';
import { cx } from './iosCx';
import './iosShared.css';
import './ListRow.css';

/* ─── Shared frame ─────────────────────────────────────────────────────────── */

interface RowAction {
  /** Navigates (rendered as a link). Rows with nested controls never take `to` (MOBILE §4.4). */
  to?: To;
  /** Acts without navigating (rendered as a button), e.g. opens a sheet. */
  onClick?: (event: MouseEvent<HTMLElement>) => void;
}

interface RowFrameProps extends RowAction {
  className?: string;
  ariaLabel?: string;
  /** Separator start inset in px: 16, or aligned to the text after a leading element (16 + width + 12). */
  separatorInset?: number;
  /** Width of the leading element, so stacked (large-text) trailing content aligns with the text. */
  leadingWidth?: number;
  /** Force the stacked large-text layout; otherwise it follows html[data-large-text]. */
  stacked?: boolean;
  highlighted?: boolean;
  id?: string;
  dataAttributes?: Record<string, string | undefined>;
  children: ReactNode;
}

function RowFrame({
  to,
  onClick,
  className,
  ariaLabel,
  separatorInset,
  leadingWidth,
  stacked,
  highlighted,
  id,
  dataAttributes,
  children,
}: RowFrameProps) {
  const interactive = to !== undefined || onClick !== undefined;
  const classes = cx(
    'ios-row',
    interactive && 'ios-row--interactive',
    stacked && 'ios-row--stacked',
    highlighted && 'ios-row--highlighted',
    className,
  );
  const itemStyle = {
    ...(separatorInset !== undefined ? { '--row-separator-inset': `${separatorInset}px` } : {}),
    ...(leadingWidth !== undefined ? { '--row-leading-width': `${leadingWidth}px` } : {}),
  } as CSSProperties;

  let body: ReactNode;
  if (to !== undefined) {
    body = (
      <Link to={to} className={classes} aria-label={ariaLabel} onClick={onClick} {...dataAttributes}>
        {children}
      </Link>
    );
  } else if (onClick) {
    body = (
      <button type="button" className={classes} aria-label={ariaLabel} onClick={onClick} {...dataAttributes}>
        {children}
      </button>
    );
  } else {
    body = (
      <div className={classes} {...dataAttributes}>
        {children}
      </div>
    );
  }
  return (
    <li id={id} className="ios-row-item" style={itemStyle}>
      {body}
    </li>
  );
}

/** Label text followed by its InfoTip "?", glued to the last word (labelText.ts). */
function LabelWithInfo({ label, info, className }: { label: ReactNode; info?: ReactNode; className: string }) {
  if (!info) return <span className={className}>{label}</span>;
  if (typeof label !== 'string') {
    return (
      <>
        <span className={className}>{label}</span>
        <span className="ios-row__info">{info}</span>
      </>
    );
  }
  const [head, last] = splitLastWord(label);
  return (
    <span className={className}>
      {head}
      <span className="ios-row__label-end">
        {last}
        <span className="ios-row__info">{info}</span>
      </span>
    </span>
  );
}

function Chevron() {
  return <ChevronRight className="ios-row__chevron" size={14} strokeWidth={2.5} aria-hidden="true" />;
}

/* ─── ListRow (generic) ────────────────────────────────────────────────────── */

export interface ListRowProps extends RowAction {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Trailing secondary text (Body --label-2). */
  detail?: ReactNode;
  /** Leading visual (crest, icon circle). Decorative visuals must set aria-hidden themselves. */
  leading?: ReactNode;
  leadingWidth?: number;
  /** Trailing content (values, pills). Never an interactive control inside a link row. */
  trailing?: ReactNode;
  /** Defaults to true for rows that navigate with `to`. */
  chevron?: boolean;
  'aria-label'?: string;
  separatorInset?: number;
  stacked?: boolean;
  highlighted?: boolean;
  id?: string;
  className?: string;
}

/** Base row (MOBILE §5.5): min 44px, 11px 16px padding (44 for one Body line), pressed --fill-2, inset focus ring. */
export function ListRow({
  title,
  subtitle,
  detail,
  leading,
  leadingWidth,
  trailing,
  chevron,
  'aria-label': ariaLabel,
  separatorInset,
  ...frame
}: ListRowProps) {
  const showChevron = chevron ?? frame.to !== undefined;
  const inset = separatorInset ?? (leading && leadingWidth ? 16 + leadingWidth + 12 : 16);
  return (
    <RowFrame {...frame} ariaLabel={ariaLabel} separatorInset={inset} leadingWidth={leading ? leadingWidth : undefined}>
      {leading && <span className="ios-row__leading">{leading}</span>}
      <span className="ios-row__text">
        <span className="ios-row__title">{title}</span>
        {subtitle && <span className="ios-row__subtitle">{subtitle}</span>}
      </span>
      {(detail || trailing) && (
        <span className="ios-row__trailing">
          {detail && <span className="ios-row__detail">{detail}</span>}
          {trailing}
        </span>
      )}
      {showChevron && <Chevron />}
    </RowFrame>
  );
}

/* ─── StockRow ─────────────────────────────────────────────────────────────── */

export interface StockRowProps extends RowAction {
  ticker: string;
  name: string;
  sector?: Sector;
  /** Visible price, e.g. "Ð84.12". */
  priceText: string;
  /** Spoken price with the currency spelled out, e.g. "84.12 doubloons" (MOBILE §10). */
  priceSpoken: string;
  /** Change as a fraction for the ChangePill. */
  change: number;
  /** Words after the spoken change, e.g. "this session". */
  changeContext?: string;
  /** 48×20 session sparkline (decorative). */
  sparkline?: ReactNode;
  /** Replaces the combined spoken label. */
  'aria-label'?: string;
  stacked?: boolean;
  id?: string;
  className?: string;
}

/** StockRow (MOBILE §5.5): crest · ticker over name · sparkline · price over ChangePill. One link, one label. */
export function StockRow({
  ticker,
  name,
  sector,
  priceText,
  priceSpoken,
  change,
  changeContext,
  sparkline,
  'aria-label': ariaLabel,
  className,
  ...frame
}: StockRowProps) {
  const spokenChange = changeParts(change).spoken;
  const label = ariaLabel ?? [name, ticker, priceSpoken, changeContext ? `${spokenChange} ${changeContext}` : spokenChange].join(', ');
  return (
    <RowFrame {...frame} className={cx('ios-row--stock', className)} ariaLabel={label} separatorInset={64} leadingWidth={36}>
      <span className="ios-row__leading">
        <Crest ticker={ticker} sector={sector} size={36} />
      </span>
      <span className="ios-row__text">
        <span className="ios-row__title ios-row__title--ticker">{ticker}</span>
        <span className="ios-row__subtitle">{name}</span>
      </span>
      {sparkline && (
        <span className="ios-row__spark" aria-hidden="true">
          {sparkline}
        </span>
      )}
      <span className="ios-row__trailing">
        <span className="ios-row__value ios-num">{priceText}</span>
        <ChangePill value={change} />
      </span>
    </RowFrame>
  );
}

/* ─── KeyValueRow ──────────────────────────────────────────────────────────── */

export interface KeyValueRowProps {
  label: ReactNode;
  /** InfoTip trigger placed right after the label (never inside a link). */
  info?: ReactNode;
  value: ReactNode;
  valueTone?: 'primary' | 'secondary';
  stacked?: boolean;
  id?: string;
  className?: string;
}

/** KeyValueRow (MOBILE §5.5): label + optional "?" … tabular value. Static, so the "?" is never nested. */
export function KeyValueRow({ label, info, value, valueTone = 'primary', stacked, id, className }: KeyValueRowProps) {
  return (
    <RowFrame className={cx('ios-row--kv', className)} stacked={stacked} id={id}>
      <span className="ios-row__text ios-row__text--inline">
        <LabelWithInfo className="ios-row__label" label={label} info={info} />
      </span>
      <span className="ios-row__trailing">
        <span className="ios-row__kv-value ios-num" data-tone={valueTone}>
          {value}
        </span>
      </span>
    </RowFrame>
  );
}

/* ─── ExplainRow ───────────────────────────────────────────────────────────── */

export interface ExplainRowProps {
  /** Plain label with the short finance term, e.g. "Price vs. profit (P/E)" (COPY §1). */
  label: string;
  /** InfoTip trigger for the metric's glossary term. */
  info?: ReactNode;
  /** From `explainMetric()` in lib/compare: value text, everyday sentence, average line and note. */
  explained: Explained;
  /** Learn deep link: "See it on a company" highlights the row. */
  highlighted?: boolean;
  stacked?: boolean;
  id?: string;
  className?: string;
}

/**
 * ExplainRow (MOBILE §5.5, BRIEF §9.3): label + "?" … value, then the everyday
 * sentence and the sector (or market) average. No colour judgement, ever.
 */
export function ExplainRow({ label, info, explained, highlighted, stacked, id, className }: ExplainRowProps) {
  return (
    <RowFrame className={cx('ios-row--explain', className)} highlighted={highlighted} stacked={stacked} id={id}>
      <span className="ios-explain">
        <span className="ios-explain__head">
          <span className="ios-explain__label-wrap">
            <LabelWithInfo className="ios-explain__label" label={label} info={info} />
          </span>
          <span className="ios-explain__value ios-num">{explained.valueText}</span>
        </span>
        <span className="ios-explain__sentence">{explained.sentence}</span>
        <span className="ios-explain__average ios-num">{explained.averageText}</span>
        {explained.note && <span className="ios-explain__note">{explained.note}</span>}
      </span>
    </RowFrame>
  );
}

/* ─── DisclosureRow ────────────────────────────────────────────────────────── */

export interface DisclosureRowProps extends RowAction {
  title: ReactNode;
  subtitle?: ReactNode;
  detail?: ReactNode;
  /** 29px tile icon (decorative). */
  icon?: LucideIcon;
  'aria-label'?: string;
  stacked?: boolean;
  id?: string;
  className?: string;
}

/** DisclosureRow (MOBILE §5.5): optional icon tile · title over subtitle · detail · chevron when it opens something. */
export function DisclosureRow({ title, subtitle, detail, icon: Icon, 'aria-label': ariaLabel, className, ...frame }: DisclosureRowProps) {
  const opens = frame.to !== undefined || frame.onClick !== undefined;
  return (
    <RowFrame
      {...frame}
      className={cx('ios-row--disclosure', subtitle !== undefined && 'ios-row--two-line', className)}
      ariaLabel={ariaLabel}
      separatorInset={Icon ? 57 : 16}
      leadingWidth={Icon ? 29 : undefined}
    >
      {Icon && (
        <span className="ios-row__leading ios-row__tile" aria-hidden="true">
          <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
        </span>
      )}
      <span className="ios-row__text">
        <span className="ios-row__title">{title}</span>
        {subtitle && <span className="ios-row__subtitle">{subtitle}</span>}
      </span>
      {detail && (
        <span className="ios-row__trailing">
          <span className="ios-row__detail">{detail}</span>
        </span>
      )}
      {opens && <Chevron />}
    </RowFrame>
  );
}

/* ─── ActionRow / DestructiveRow ───────────────────────────────────────────── */

export interface ActionRowProps {
  children: ReactNode;
  onClick: (event: MouseEvent<HTMLElement>) => void;
  /** tint for ordinary actions ("Clear recent searches"), destructive for "Sign out". */
  tone?: 'tint' | 'destructive';
  id?: string;
  className?: string;
}

/** ActionRow (MOBILE §5.5): a leading-aligned text button filling the row. */
export function ActionRow({ children, onClick, tone = 'tint', id, className }: ActionRowProps) {
  return (
    <RowFrame className={cx('ios-row--action', className)} onClick={onClick} id={id} dataAttributes={{ 'data-tone': tone }}>
      <span className="ios-row__title">{children}</span>
    </RowFrame>
  );
}

/** Destructive ActionRow (Sign out, Discard). The confirmation action sheet is the caller's job. */
export function DestructiveRow(props: Omit<ActionRowProps, 'tone'>) {
  return <ActionRow {...props} tone="destructive" />;
}

/* ─── ToggleRow ────────────────────────────────────────────────────────────── */

export interface ToggleRowProps {
  title: ReactNode;
  /** Footnote under the title; becomes the switch's description. */
  subtitle?: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
  className?: string;
}

/** ToggleRow (MOBILE §5.5, §5.25): title · native switch. Tapping the title toggles too. */
export function ToggleRow({ title, subtitle, checked, onChange, disabled, id, className }: ToggleRowProps) {
  const uid = useId();
  const inputId = `${uid}-switch`;
  const subtitleId = `${uid}-subtitle`;
  return (
    <RowFrame className={cx('ios-row--toggle', className)} id={id}>
      <span className="ios-row__text">
        <label htmlFor={inputId} className="ios-row__title ios-row__toggle-label">
          {title}
        </label>
        {subtitle && (
          <span id={subtitleId} className="ios-row__subtitle">
            {subtitle}
          </span>
        )}
      </span>
      <Toggle
        id={inputId}
        checked={checked}
        disabled={disabled}
        aria-describedby={subtitle ? subtitleId : undefined}
        onChange={(next) => onChange(next)}
      />
    </RowFrame>
  );
}
