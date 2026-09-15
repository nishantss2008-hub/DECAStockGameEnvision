/**
 * Host Tape (MOBILE §7.18, `/admin/tape`): live trade rows from a Firestore listener (every crew, newest first,
 * 100 rows): tick, crew, Bought/Sold, qty, ticker, fill price, fee; filter menu by crew and company. No live-region
 * announcements per trade. ≥744: a table with "?" in the headers.
 */
import { useMemo, useState } from 'react';
import { ListFilter, ScrollText } from 'lucide-react';
import { InsetGroupedList } from '../../components/ios/InsetGroupedList';
import { ListRow } from '../../components/ios/ListRow';
import { NavBarButton } from '../../components/ios/LargeTitleNavBar';
import { Menu } from '../../components/ios/Menu';
import { EmptyState } from '../../components/ios/EmptyState';
import { useGame } from '../../hooks/useGame';
import { useAdminTape, useAdminTeams } from '../../hooks/useAdmin';
import { useCompanies } from '../../hooks/useCompanies';
import { formatMoney, formatNumber, formatTickTime } from '../../lib/format';
import { fill } from '../../shell/copy';
import { useDocumentTitle } from '../../shell/StubPage';
import { useShellLayout } from '../../shell/useShellLayout';
import { filterTape } from '../../components/admin/adminFormat';
import { tapeLine } from '../../components/admin/hostLogic';
import { HOST_PHONE } from '../../components/admin/hostCopy';
import { HostLoadError, HostLoading, HostNavBar, MetricLabel, MetricLegend } from '../../components/admin/HostUi';

const T = HOST_PHONE.tape;
const ALL = '__all';

export default function TapePage() {
  useDocumentTitle('Tape');
  const { game } = useGame();
  const { trades, loading, error } = useAdminTape();
  const { teams } = useAdminTeams();
  const { companies, byId } = useCompanies();
  const layout = useShellLayout();
  const [teamId, setTeamId] = useState(ALL);
  const [companyId, setCompanyId] = useState(ALL);
  const names = useMemo(() => Object.fromEntries(teams.map((t) => [t.id, t.name])), [teams]);
  const shown = filterTape(trades, { teamId: teamId === ALL ? undefined : teamId, companyId: companyId === ALL ? undefined : companyId });
  const filtered = teamId !== ALL || companyId !== ALL;
  const sym = game?.currency.symbol;
  const money = (c: number) => formatMoney(c, { symbol: sym });

  const filterMenu = (
    <Menu
      label={T.filter}
      trigger={<NavBarButton label={T.filter} icon={ListFilter} data-active={filtered ? '' : undefined} />}
      groups={[
        { label: T.byCrew, value: teamId, onValueChange: setTeamId, items: [{ id: ALL, label: T.allCrews, onSelect: () => setTeamId(ALL) }, ...teams.map((t) => ({ id: t.id, label: t.name, onSelect: () => setTeamId(t.id) }))] },
        { label: T.byCompany, value: companyId, onValueChange: setCompanyId, items: [{ id: ALL, label: T.allCompanies, onSelect: () => setCompanyId(ALL) }, ...companies.map((c) => ({ id: c.id, label: c.ticker, onSelect: () => setCompanyId(c.id) }))] },
      ]}
    />
  );

  return (
    <>
      <HostNavBar title="Tape" game={game} subtitle={trades.length ? fill(T.latest, { count: formatNumber(shown.length) }) : undefined} trailing={filterMenu} />
      <div className="bx-page bx-host-page">
        {loading ? (
          <HostLoading />
        ) : error && trades.length === 0 ? (
          <HostLoadError message={error} onRetry={() => window.location.reload()} />
        ) : shown.length === 0 ? (
          filtered ? (
            <EmptyState icon={ScrollText} title={T.emptyFiltered} body={T.emptyFilteredBody} action={{ label: T.allCrews, onClick: () => (setTeamId(ALL), setCompanyId(ALL)) }} />
          ) : (
            <EmptyState icon={ScrollText} title={T.empty} body={T.emptyBody} />
          )
        ) : layout === 'split' ? (
          <div className="bx-host-table-wrap">
            <table className="bx-host-table">
              <caption className="ios-sr-only">{T.title}</caption>
              <thead>
                <tr>
                  <th scope="col">{T.time}</th>
                  <th scope="col" className="num-col"><MetricLabel label={T.tick} termId="tick" /></th>
                  <th scope="col">{T.crew}</th>
                  <th scope="col">{T.action}</th>
                  <th scope="col">{T.ticker}</th>
                  <th scope="col" className="num-col">{T.qty}</th>
                  <th scope="col" className="num-col"><MetricLabel label={T.price} termId="price" /></th>
                  <th scope="col" className="num-col"><MetricLabel label={T.fee} termId="fee" /></th>
                </tr>
              </thead>
              <tbody>
                {shown.map((t) => (
                  <tr key={t.id}>
                    <td className="num">{formatTickTime(t.executedAt)}</td>
                    <td className="num">{formatNumber(t.tick)}</td>
                    <th scope="row">{names[t.teamId] ?? t.teamId}</th>
                    <td data-side={t.side}>{t.side === 'buy' ? T.bought : T.sold}</td>
                    <td>{byId[t.companyId]?.ticker ?? t.companyId}</td>
                    <td className="num">{formatNumber(t.quantity)}</td>
                    <td className="num">{money(t.price)}</td>
                    <td className="num">{money(t.fee)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <>
            <MetricLegend items={[{ label: T.price, termId: 'price' }, { label: T.fee, termId: 'fee' }, { label: T.tick, termId: 'tick' }]} />
            <InsetGroupedList aria-label={T.title}>
              {shown.map((t) => {
                const line = tapeLine(t, byId[t.companyId]?.ticker ?? t.companyId);
                return (
                  <ListRow
                    key={t.id}
                    title={
                      <span>
                        <span className="bx-host-side" data-side={t.side}>{line.action}</span> {line.text.slice(line.action.length + 1)}
                      </span>
                    }
                    subtitle={`${names[t.teamId] ?? t.teamId} · ${T.tick} ${formatNumber(t.tick)} · ${formatTickTime(t.executedAt)}`}
                    detail={
                      <span className="bx-host-price">
                        <span className="t-body num">{money(t.price)}</span>
                        <span className="t-footnote num bx-host-muted">
                          {T.fee} {money(t.fee)}
                        </span>
                      </span>
                    }
                  />
                );
              })}
            </InsetGroupedList>
          </>
        )}
      </div>
    </>
  );
}
