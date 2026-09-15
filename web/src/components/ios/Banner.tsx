/**
 * Banner (MOBILE §5.12): an inline card under the large title / status line.
 *
 * 22px icon · Headline title (with optional " · flavor") · Subhead body · optional small button.
 * Phase banners use COPY §9 `banners` / §12 `phases` text, passed in by the caller. Never red.
 *
 * - `paused` → `--tint-soft` card, small Tinted button.
 * - `ended` → hull card with a gold title and "See final results".
 * - `lobby`, `offline`, `tradingDisabled`, `stale`, `finalSession`, `info` → `--cell` card.
 *
 * `announce="phase"` speaks the title and body politely when the banner appears or its title
 * changes (phase changes are one of the two announced events; mount the banner on the change).
 */
import { useEffect, type ComponentType, type ReactNode } from 'react';
import { Anchor, Clock, Flag, Info, Lock, Pause, WifiOff, type LucideProps } from 'lucide-react';
import { Button } from './Button';
import { useAnnounce } from './Toast';
import './Banner.css';

export type BannerTone = 'paused' | 'lobby' | 'ended' | 'offline' | 'tradingDisabled' | 'stale' | 'finalSession' | 'info';

const DEFAULT_ICON: Record<BannerTone, ComponentType<LucideProps> | null> = {
  paused: Pause,
  lobby: Anchor,
  ended: null,
  offline: WifiOff,
  tradingDisabled: Lock,
  stale: Clock,
  finalSession: Flag,
  info: Info,
};

export interface BannerProps {
  tone: BannerTone;
  title: string;
  /** Secondary pirate flavor after the title, e.g. "Becalmed" (COPY `flavor`). */
  flavor?: string;
  body?: string;
  /** Extra rich content under the body. Not announced. */
  children?: ReactNode;
  icon?: ComponentType<LucideProps> | null;
  action?: { label: string; onClick: () => void };
  /** Announce politely. Only phase changes are announced from banners. */
  announce?: 'phase';
  /** Heading level of the title; banners sit under the page h1. */
  headingLevel?: 2 | 3;
  id?: string;
  className?: string;
}

export function Banner({
  tone,
  title,
  flavor,
  body,
  children,
  icon,
  action,
  announce,
  headingLevel = 2,
  id,
  className,
}: BannerProps) {
  const speak = useAnnounce();
  useEffect(() => {
    if (announce) speak(body ? `${title}. ${body}` : title, announce);
    // Announce when the phase banner appears or its title changes, not on every body tweak.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [announce, title]);

  const Icon = icon === undefined ? DEFAULT_ICON[tone] : icon;
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  const hull = tone === 'ended';

  return (
    <div id={id} className={['ios-banner', hull ? 'hull' : null, className].filter(Boolean).join(' ')} data-tone={tone}>
      {Icon ? <Icon className="ios-banner__icon" size={22} strokeWidth={1.75} aria-hidden="true" /> : null}
      <div className="ios-banner__text">
        <Heading className="ios-banner__title">
          {title}
          {flavor ? ' · ' : null}
          {flavor ? <span className="ios-banner__flavor">{flavor}</span> : null}
        </Heading>
        {body ? <p className="ios-banner__body">{body}</p> : null}
        {children}
        {action ? (
          <div className="ios-banner__action">
            <Button
              variant={tone === 'ended' ? 'filled' : 'tinted'}
              size="small"
              onClick={action.onClick}
            >
              {action.label}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
