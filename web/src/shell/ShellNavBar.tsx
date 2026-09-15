/**
 * Top bar for the five tab roots (MOBILE §7.0): trailing crew avatar (opens Account) → large title → status line
 * (opens Market status) → the state banner when not live. Pushed screens use LargeTitleNavBar with `back`
 * (see useStackBack) and may pass `statusLine={false}`.
 */
import type { ReactNode } from 'react';
import { LargeTitleNavBar, NavBarButton, StatusLine, type LargeTitleNavBarProps } from '../components/ios/LargeTitleNavBar';
import { Crest } from '../components/ios/Crest';
import { Banner } from '../components/ios/Banner';
import { useSheet } from './useSheet';
import { useShellGame, useShellNow } from './ShellData';
import { shellBanner, statusLine } from './marketStatus';
import { crewInitials } from './device';
import { MOBILE } from './copy';

export interface ShellNavBarProps extends Omit<LargeTitleNavBarProps, 'statusLine' | 'banner' | 'trailing'> {
  /** Extra trailing buttons placed before the crew avatar. */
  actions?: ReactNode;
  /** Hide the avatar (pushed screens). */
  avatar?: boolean;
}

export function ShellStatusLine() {
  const { game } = useShellGame();
  const now = useShellNow();
  const { open } = useSheet();
  const line = statusLine(game, now);
  return (
    <StatusLine tone={line.tone} onPress={() => open({ kind: 'status' })}>
      {line.text}
    </StatusLine>
  );
}

export function ShellBanner() {
  const { game, team, online } = useShellGame();
  const now = useShellNow();
  const banner = shellBanner({ game, online, tradingDisabled: Boolean(team?.tradingDisabled), now });
  if (!banner) return null;
  return (
    <Banner
      tone={banner.tone}
      title={banner.title}
      flavor={banner.flavor}
      body={banner.body}
      announce={banner.tone === 'paused' || banner.tone === 'lobby' || banner.tone === 'ended' ? 'phase' : undefined}
      action={banner.action === 'reload' ? { label: MOBILE.toasts.reload, onClick: () => window.location.reload() } : undefined}
    />
  );
}

export function CrewAvatarButton() {
  const { team } = useShellGame();
  const { open } = useSheet();
  const name = team?.name ?? '';
  return (
    <NavBarButton variant="avatar" label={name ? `Account, ${name}` : 'Account'} aria-haspopup="dialog" onClick={() => open({ kind: 'account' })}>
      <Crest initials={crewInitials(name)} size={32} />
    </NavBarButton>
  );
}

export function ShellNavBar({ actions, avatar = true, subtitle, ...rest }: ShellNavBarProps) {
  const { game } = useShellGame();
  const now = useShellNow();
  const trailing =
    actions || avatar ? (
      <span className="bx-navbar-trailing">
        {actions}
        {avatar && <CrewAvatarButton />}
      </span>
    ) : undefined;
  return (
    <LargeTitleNavBar
      {...rest}
      subtitle={subtitle ?? statusLine(game, now).collapsed}
      trailing={trailing}
      statusLine={<ShellStatusLine />}
      banner={<ShellBanner />}
    />
  );
}
