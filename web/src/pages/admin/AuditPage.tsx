/**
 * Host Audit (MOBILE §7.18, Control › More › Audit, `/admin/audit`): `GET /api/admin/logs` rows as a plain list with
 * a Refresh button; ≥744 a table. Pushed from Control, so it has a back button.
 */
import { useMemo } from 'react';
import { RotateCw, ShieldCheck } from 'lucide-react';
import { InsetGroupedList } from '../../components/ios/InsetGroupedList';
import { ListRow } from '../../components/ios/ListRow';
import { NavBarButton } from '../../components/ios/LargeTitleNavBar';
import { EmptyState } from '../../components/ios/EmptyState';
import { useAdminPoll, useAdminTeams } from '../../hooks/useAdmin';
import { useGame } from '../../hooks/useGame';
import { formatTickTime } from '../../lib/format';
import { useDocumentTitle, useStackBack } from '../../shell/StubPage';
import { useShellLayout } from '../../shell/useShellLayout';
import { auditActionLabel, auditDetails } from '../../components/admin/hostLogic';
import { HOST_PHONE } from '../../components/admin/hostCopy';
import { HostLoadError, HostLoading, HostNavBar } from '../../components/admin/HostUi';

const A = HOST_PHONE.audit;

interface LogEntry {
  action: string;
  actor: string;
  payload: Record<string, unknown>;
  timestamp: number;
}

export default function AuditPage() {
  useDocumentTitle(A.title);
  const back = useStackBack('/admin');
  const { game } = useGame();
  const { teams } = useAdminTeams();
  const layout = useShellLayout();
  const { data, error, refresh } = useAdminPoll<{ logs: LogEntry[] }>('/api/admin/logs', 60_000);
  const names = useMemo(() => Object.fromEntries(teams.map((t) => [t.id, t.name])), [teams]);
  const logs = data?.logs ?? [];
  const actor = (a: string) => (a === 'admin' || a === 'engine' ? a : names[a] ?? 'Host');

  return (
    <>
      <HostNavBar title={A.title} game={game} back={{ label: 'Control', onBack: back.onBack }} trailing={<NavBarButton label={A.refresh} icon={RotateCw} onClick={refresh} />} />
      <div className="bx-page bx-host-page">
        {!data && !error ? (
          <HostLoading />
        ) : !data ? (
          <HostLoadError message={error} onRetry={refresh} />
        ) : logs.length === 0 ? (
          <EmptyState icon={ShieldCheck} title={A.empty} body={A.emptyBody} />
        ) : layout === 'split' ? (
          <div className="bx-host-table-wrap">
            <table className="bx-host-table">
              <caption className="ios-sr-only">{A.title}</caption>
              <thead>
                <tr>
                  <th scope="col">{A.time}</th>
                  <th scope="col">{A.action}</th>
                  <th scope="col">{A.actor}</th>
                  <th scope="col">{A.details}</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l, i) => (
                  <tr key={`${l.timestamp}-${i}`}>
                    <td className="num">{formatTickTime(l.timestamp)}</td>
                    <th scope="row">{auditActionLabel(l.action)}</th>
                    <td>{actor(l.actor)}</td>
                    <td>{auditDetails(l, names)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <InsetGroupedList aria-label={A.title}>
            {logs.map((l, i) => (
              <ListRow key={`${l.timestamp}-${i}`} stacked title={auditActionLabel(l.action)} subtitle={auditDetails(l, names) || actor(l.actor)} detail={<span className="num">{formatTickTime(l.timestamp)}</span>} />
            ))}
          </InsetGroupedList>
        )}
      </div>
    </>
  );
}
