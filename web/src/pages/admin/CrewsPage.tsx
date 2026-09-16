/**
 * Host Crews (MOBILE §7.18, `/admin/crews`): SearchField "Search crews" · "Add crew" · one row per crew (crest, name,
 * rank and value, "Trading off" tag) → Crew detail (`?crew=id`, pushed look): value/cash/return/trades/rank with "?",
 * ToggleRow "Trading allowed", holdings, "Reset password…", destructive "Remove crew…" (action sheet).
 * At ≥744 the list is a table (spec §8 crews table). Empty: COPY §12 empty.hostCrews.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Users } from 'lucide-react';
import type { GameState, Team } from '@deca/shared';
import { SearchField } from '../../components/ios/SearchField';
import { InsetGroupedList } from '../../components/ios/InsetGroupedList';
import { ActionRow, DestructiveRow, KeyValueRow, ListRow, ToggleRow } from '../../components/ios/ListRow';
import { Button } from '../../components/ios/Button';
import { Crest } from '../../components/ios/Crest';
import { TagPill } from '../../components/ios/Pill';
import { EmptyState } from '../../components/ios/EmptyState';
import { ActionSheet } from '../../components/ios/ActionSheet';
import { LargeTitleNavBar } from '../../components/ios/LargeTitleNavBar';
import { useGame } from '../../hooks/useGame';
import { useAdminHoldings, useAdminTeams } from '../../hooks/useAdmin';
import { useCompanies } from '../../hooks/useCompanies';
import { apiDelete, apiPost } from '../../lib/api';
import { formatMoney, formatNumber, formatPct } from '../../lib/format';
import { fill } from '../../shell/copy';
import { useDocumentTitle } from '../../shell/StubPage';
import { useShellLayout } from '../../shell/useShellLayout';
import { filterCrews, returnPct } from '../../components/admin/adminFormat';
import { crewInitials } from '../../components/admin/hostLogic';
import { HOST_EMPTY, HOST_PHONE } from '../../components/admin/hostCopy';
import { HostInfo, HostLoadError, HostLoading, HostNavBar, MetricLabel, MetricLegend } from '../../components/admin/HostUi';
import { AddCrewSheet, ResetPasswordSheet } from '../../components/admin/CrewSheets';
import { useHostAction } from '../../components/admin/useHostData';

const C = HOST_PHONE.crews;

export default function CrewsPage() {
  const [params, setParams] = useSearchParams();
  const crewId = params.get('crew');
  const { game } = useGame();
  const { teams, loading, error } = useAdminTeams();
  const team = crewId ? teams.find((t) => t.id === crewId) ?? null : null;
  useDocumentTitle(team ? team.name : 'Crews');

  if (crewId && team) {
    return <CrewDetail team={team} game={game} onBack={() => setParams({}, { replace: false })} />;
  }
  return <CrewList teams={teams} loading={loading} error={error} game={game} focusSearch={params.get('find') === '1'} onOpen={(id) => setParams({ crew: id })} />;
}

function CrewList({ teams, loading, error, game, focusSearch, onOpen }: { teams: Team[]; loading: boolean; error: string | null; game: GameState | null; focusSearch: boolean; onOpen: (id: string) => void }) {
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const layout = useShellLayout();
  const ranked = useMemo(() => [...teams].sort((a, b) => (a.rank || 9999) - (b.rank || 9999) || a.name.localeCompare(b.name)), [teams]);
  const shown = filterCrews(ranked, q);
  const start = game?.startingCapital ?? 0;
  const sym = game?.currency.symbol;

  useEffect(() => {
    if (focusSearch) searchRef.current?.focus();
  }, [focusSearch]);

  return (
    <>
      <HostNavBar
        title="Crews"
        game={game}
        subtitle={teams.length ? fill(C.count, { count: formatNumber(teams.length) }) : undefined}
        pinnedSearch={<SearchField value={q} onChange={setQ} placeholder={C.search} label={C.search} inputRef={searchRef} />}
      />
      <div className="bx-page bx-host-page">
        <div className="bx-host-toolbar">
          <Button variant="filled" size="medium" icon={Plus} onClick={() => setAdding(true)}>
            {C.add}
          </Button>
        </div>
        {loading ? (
          <HostLoading />
        ) : error && teams.length === 0 ? (
          <HostLoadError message={error} onRetry={() => window.location.reload()} />
        ) : teams.length === 0 ? (
          <EmptyState icon={Users} title={HOST_EMPTY.hostCrews.title} body={HOST_EMPTY.hostCrews.body} action={{ label: C.add, onClick: () => setAdding(true) }} />
        ) : layout === 'split' ? (
          <div className="bx-host-table-wrap">
            <table className="bx-host-table">
              <thead>
                <tr>
                  <th scope="col">Crew</th>
                  <th scope="col" className="num-col"><MetricLabel label={C.value} termId="accountValue" /></th>
                  <th scope="col" className="num-col"><MetricLabel label={C.cash} termId="cash" /></th>
                  <th scope="col" className="num-col"><MetricLabel label={C.returnPct} termId="returnPct" /></th>
                  <th scope="col" className="num-col"><MetricLabel label={C.trades} termId="tradeCount" /></th>
                  <th scope="col" className="num-col"><MetricLabel label={C.rank} termId="rank" /></th>
                  <th scope="col"><span className="ios-sr-only">Manage</span></th>
                </tr>
              </thead>
              <tbody>
                {shown.map((t) => (
                  <tr key={t.id}>
                    <th scope="row">
                      <span className="bx-host-crewcell">
                        <Crest initials={crewInitials(t.name)} size={28} />
                        <span>{t.name}</span>
                        {t.tradingDisabled && <TagPill>{C.tradingOff}</TagPill>}
                      </span>
                    </th>
                    <td className="num">{formatMoney(t.totalValue, { symbol: sym })}</td>
                    <td className="num">{formatMoney(t.cashBalance, { symbol: sym })}</td>
                    <td className="num">{formatPct(returnPct(t.totalValue, start), { signed: true })}</td>
                    <td className="num">{formatNumber(t.tradeCount)}</td>
                    <td className="num">{t.rank ? formatNumber(t.rank) : '—'}</td>
                    <td>
                      <Button variant="gray" size="small" onClick={() => onOpen(t.id)} aria-label={`Manage ${t.name}`}>
                        Manage
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <>
          <MetricLegend items={[{ label: C.value, termId: 'accountValue' }, { label: C.returnPct, termId: 'returnPct' }, { label: C.rank, termId: 'rank' }]} />
          <InsetGroupedList aria-label="Crews">
            {shown.map((t) => (
              <ListRow
                key={t.id}
                leading={<Crest initials={crewInitials(t.name)} size={36} />}
                leadingWidth={36}
                title={t.name}
                subtitle={`${C.rank} ${t.rank ? formatNumber(t.rank) : '—'} · ${formatPct(returnPct(t.totalValue, start), { signed: true })}`}
                detail={<span className="num">{formatMoney(t.totalValue, { symbol: sym })}</span>}
                trailing={t.tradingDisabled ? <TagPill>{C.tradingOff}</TagPill> : undefined}
                chevron
                onClick={() => onOpen(t.id)}
              />
            ))}
          </InsetGroupedList>
          </>
        )}
      </div>
      <AddCrewSheet game={game} open={adding} onClose={() => setAdding(false)} />
    </>
  );
}

function CrewDetail({ team, game, onBack }: { team: Team; game: GameState | null; onBack: () => void }) {
  const [resetOpen, setResetOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const { run } = useHostAction();
  const { holdings, loading } = useAdminHoldings(team.id);
  const { byId } = useCompanies();
  const sym = game?.currency.symbol;

  const setTrading = (enabled: boolean) =>
    void run('trading', () => apiPost(`/api/admin/teams/${encodeURIComponent(team.id)}/trading`, { enabled }), {
      success: `${team.name}: ${enabled ? C.tradingAllowed : C.tradingOff}`,
    });
  const remove = async () => {
    const result = await run('remove', () => apiDelete(`/api/admin/teams/${encodeURIComponent(team.id)}`), { success: fill(C.removed, { crew: team.name }) });
    if (result.ok) onBack();
  };

  return (
    <>
      <LargeTitleNavBar title={team.name} back={{ label: 'Crews', onBack }} />
      <div className="bx-page bx-host-page">
        <InsetGroupedList aria-label={team.name}>
          <KeyValueRow label={C.value} info={<HostInfo termId="accountValue" />} value={formatMoney(team.totalValue, { symbol: sym })} />
          <KeyValueRow label={C.cash} info={<HostInfo termId="cash" />} value={formatMoney(team.cashBalance, { symbol: sym })} />
          <KeyValueRow label={C.returnPct} info={<HostInfo termId="returnPct" />} value={formatPct(returnPct(team.totalValue, game?.startingCapital ?? 0), { signed: true })} />
          <KeyValueRow label={C.trades} info={<HostInfo termId="tradeCount" />} value={formatNumber(team.tradeCount)} />
          <KeyValueRow label={C.rank} info={<HostInfo termId="rank" />} value={team.rank ? formatNumber(team.rank) : '—'} />
        </InsetGroupedList>
        <InsetGroupedList aria-label={C.tradingAllowed}>
          <ToggleRow title={C.tradingAllowed} checked={!team.tradingDisabled} onChange={setTrading} />
        </InsetGroupedList>
        <InsetGroupedList header={C.holdings} headerAction={<HostInfo termId="invested" />}>
          {loading ? (
            <ListRow title="…" />
          ) : holdings.length === 0 ? (
            <ListRow title={<span className="bx-host-muted">{C.noHoldings}</span>} />
          ) : (
            holdings.map((h) => {
              const co = byId[h.companyId];
              return (
                <ListRow
                  key={h.companyId}
                  leading={<Crest ticker={co?.ticker ?? h.companyId} sector={co?.sector} size={32} />}
                  leadingWidth={32}
                  title={co?.ticker ?? h.companyId}
                  subtitle={fill(C.shares, { shares: formatNumber(h.shares) })}
                  detail={co ? <span className="num">{formatMoney(h.shares * co.currentPrice, { symbol: sym })}</span> : undefined}
                />
              );
            })
          )}
        </InsetGroupedList>
        <InsetGroupedList aria-label="Crew actions">
          <ActionRow onClick={() => setResetOpen(true)}>{C.resetPassword}</ActionRow>
          <DestructiveRow onClick={() => setRemoveOpen(true)}>{C.remove}</DestructiveRow>
        </InsetGroupedList>
      </div>
      <ResetPasswordSheet team={team} open={resetOpen} onClose={() => setResetOpen(false)} />
      <ActionSheet
        open={removeOpen}
        onOpenChange={setRemoveOpen}
        title={fill(C.removeTitle, { crew: team.name })}
        actions={[{ id: 'remove', label: C.removeButton, destructive: true, onSelect: () => void remove() }]}
        cancelLabel={HOST_PHONE.news.cancel}
      />
    </>
  );
}
