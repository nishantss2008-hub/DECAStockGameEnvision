/**
 * Host Control (MOBILE §7.17, host tab root `/admin`): title + "LIVE · Market open · Sails up", hero card with
 * time left, tick progress, session and engine heartbeat, the phase's actions, Quick actions, and Game settings
 * (editable in the lobby). More menu: Audit, New game…, Sign out. At ≥744 the cards sit in two columns.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Ellipsis, Megaphone, ScrollText, Search, ShieldCheck } from 'lucide-react';
import { InsetGroupedList } from '../../components/ios/InsetGroupedList';
import { DisclosureRow } from '../../components/ios/ListRow';
import { NavBarButton } from '../../components/ios/LargeTitleNavBar';
import { Menu } from '../../components/ios/Menu';
import { useGame } from '../../hooks/useGame';
import { useAuth } from '../../lib/auth';
import { EmptyState } from '../../components/ios/EmptyState';
import { useDocumentTitle } from '../../shell/StubPage';
import { GameControlCard } from '../../components/admin/GameControlCard';
import { SettingsCard } from '../../components/admin/SettingsCard';
import { NewGameSheet } from '../../components/admin/NewGameSheet';
import { HostLoadError, HostLoading, HostNavBar } from '../../components/admin/HostUi';
import { HOST_PHONE } from '../../components/admin/hostCopy';

export default function ControlPage() {
  useDocumentTitle('Control');
  const { game, loading, error } = useGame();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [newGameOpen, setNewGameOpen] = useState(false);

  const more = (
    <Menu
      label={HOST_PHONE.more}
      trigger={<NavBarButton label={HOST_PHONE.more} icon={Ellipsis} />}
      groups={[
        {
          items: [
            { id: 'audit', label: HOST_PHONE.auditLink, icon: ShieldCheck, onSelect: () => navigate('/admin/audit') },
            { id: 'tape', label: HOST_PHONE.tradeTape, icon: ScrollText, onSelect: () => navigate('/admin/tape') },
          ],
        },
        {
          items: [
            { id: 'new', label: HOST_PHONE.newGame, onSelect: () => setNewGameOpen(true), disabled: !game },
            { id: 'signout', label: 'Sign out', destructive: true, onSelect: () => void logout() },
          ],
        },
      ]}
    />
  );

  return (
    <>
      <HostNavBar title="Control" game={game} trailing={more} />
      <div className="bx-page bx-host-page">
        {loading && !game ? (
          <HostLoading rows={4} />
        ) : error ? (
          <HostLoadError message={error} onRetry={() => window.location.reload()} />
        ) : !game ? (
          <div className="bx-host-console">
            <EmptyState
              title="No market created yet"
              body="Create a new game to build the stock market and start trading."
              action={{ label: "Start new game", onClick: () => setNewGameOpen(true) }}
            />
            <NewGameSheet game={game} open={newGameOpen} onClose={() => setNewGameOpen(false)} />
          </div>
        ) : (
          <div className="bx-host-console">
            <div className="bx-host-console__main">
              <GameControlCard game={game} onNewGame={() => setNewGameOpen(true)} />
              <InsetGroupedList header={HOST_PHONE.quickActions}>
                <DisclosureRow title={HOST_PHONE.fireNews} icon={Megaphone} to="/admin/news?compose=1" />
                <DisclosureRow title={HOST_PHONE.findCrew} icon={Search} to="/admin/crews?find=1" />
                <DisclosureRow title={HOST_PHONE.tradeTape} icon={ScrollText} to="/admin/tape" />
                <DisclosureRow title={HOST_PHONE.auditLink} icon={ShieldCheck} to="/admin/audit" />
              </InsetGroupedList>
            </div>
            <div className="bx-host-console__side">
              <SettingsCard game={game} id="settings" />
            </div>
            <NewGameSheet game={game} open={newGameOpen} onClose={() => setNewGameOpen(false)} />
          </div>
        )}
      </div>
    </>
  );
}
