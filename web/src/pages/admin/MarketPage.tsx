/**
 * Host Market (MOBILE §7.18, `/admin/market`): the classified view from `GET /api/admin/market` every 5 s — last price,
 * session %, volume, net crew flow, and the hidden quality score, grade, fair value and deviation — under a
 * "Host only: never project this screen" banner. Phone: one row per company plus a "What these numbers mean"
 * legend; ≥744: a table whose column headers carry the "?".
 */
import { useMemo } from 'react';
import { EyeOff } from 'lucide-react';
import type { AdminMarketRow } from '@deca/shared';
import { Banner } from '../../components/ios/Banner';
import { InsetGroupedList } from '../../components/ios/InsetGroupedList';
import { ListRow } from '../../components/ios/ListRow';
import { Crest } from '../../components/ios/Crest';
import { ChangePill } from '../../components/ios/Pill';
import { useAdminPoll } from '../../hooks/useAdmin';
import { useGame } from '../../hooks/useGame';
import { formatMoney, formatNumber, formatPct } from '../../lib/format';
import { fill } from '../../shell/copy';
import { useDocumentTitle } from '../../shell/StubPage';
import { useShellLayout } from '../../shell/useShellLayout';
import { qualityScore, signedShares } from '../../components/admin/adminFormat';
import { HOST_PHONE } from '../../components/admin/hostCopy';
import { HostLoadError, HostLoading, HostNavBar, MetricLabel, MetricLegend } from '../../components/admin/HostUi';

const M = HOST_PHONE.market;
const MARKET_POLL_MS = 5_000;

const LEGEND = [
  { label: M.last, termId: 'price' },
  { label: M.session, termId: 'sessionChange' },
  { label: M.volume, termId: 'volume' },
  { label: M.netFlow, termId: 'netFlow' },
  { label: M.quality, termId: 'quality' },
  { label: M.grade, termId: 'researchGrade' },
  { label: M.fairValue, termId: 'fairValue' },
  { label: M.deviation, termId: 'deviation' },
];

export default function MarketPage() {
  useDocumentTitle('Market');
  const { game } = useGame();
  const { data, error, refresh } = useAdminPoll<{ rows: AdminMarketRow[] }>('/api/admin/market', MARKET_POLL_MS);
  const layout = useShellLayout();
  const rows = useMemo(() => data?.rows ?? [], [data]);
  const sym = game?.currency.symbol;
  const money = (c: number) => formatMoney(c, { symbol: sym });

  return (
    <>
      <HostNavBar title="Market" game={game} subtitle={rows.length ? fill(M.companies, { count: formatNumber(rows.length) }) : undefined} />
      <div className="bx-page bx-host-page">
        <Banner tone="tradingDisabled" icon={EyeOff} title={M.banner} body={M.bannerBody} className="bx-host-classified" />
        {!data && !error ? (
          <HostLoading rows={8} />
        ) : !data ? (
          <HostLoadError message={error} onRetry={refresh} />
        ) : layout === 'split' ? (
          <div className="bx-host-table-wrap">
            <table className="bx-host-table">
              <caption className="ios-sr-only">{M.banner}</caption>
              <thead>
                <tr>
                  <th scope="col">Company</th>
                  {LEGEND.map((l) => (
                    <th key={l.termId} scope="col" className="num-col">
                      <MetricLabel label={l.label} termId={l.termId} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.companyId}>
                    <th scope="row">
                      <span className="bx-host-crewcell">
                        <Crest ticker={r.ticker} sector={r.sector} size={28} />
                        <span>
                          <span className="t-headline">{r.ticker}</span>
                          <span className="t-footnote bx-host-muted bx-host-block">{r.name}</span>
                        </span>
                      </span>
                    </th>
                    <td className="num">{money(r.price)}</td>
                    <td className="num" data-sign={Math.sign(r.sessionChange)}>{formatPct(r.sessionChange, { signed: true })}</td>
                    <td className="num">{formatNumber(r.sessionVolume)}</td>
                    <td className="num">{signedShares(r.netFlow)}</td>
                    <td className="num">{qualityScore(r.q)}</td>
                    <td className="num">{r.grade}</td>
                    <td className="num">{money(r.fairValue)}</td>
                    <td className="num" data-sign={Math.sign(r.deviation)}>{formatPct(r.deviation, { signed: true })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <>
            <MetricLegend items={LEGEND} />
            <InsetGroupedList aria-label={M.banner}>
              {rows.map((r) => (
                <ListRow
                  key={r.companyId}
                  leading={<Crest ticker={r.ticker} sector={r.sector} size={36} />}
                  leadingWidth={36}
                  title={r.ticker}
                  subtitle={
                    <span className="bx-host-figs num">
                      <span className="bx-host-figs__name">{r.name}</span>
                      <span>{M.quality} {qualityScore(r.q)} · {M.grade} {r.grade}</span>
                      <span>{M.fairValue} {money(r.fairValue)} ({formatPct(r.deviation, { signed: true })})</span>
                      <span>{M.volume} {formatNumber(r.sessionVolume)} · {M.netFlow} {signedShares(r.netFlow)}</span>
                    </span>
                  }
                  detail={
                    <span className="bx-host-price">
                      <span className="t-body num">{money(r.price)}</span>
                      <ChangePill value={r.sessionChange} />
                    </span>
                  }
                />
              ))}
            </InsetGroupedList>
          </>
        )}
      </div>
    </>
  );
}
