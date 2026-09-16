/**
 * Host News (MOBILE §7.18, `/admin/news`): segmented Scheduled | Fired from `GET /api/admin/news/scheduled` (tick,
 * companies, type, headline) and "Fire news…" (sheet, also opened by `?compose=1` from Control's quick actions).
 * Empty: COPY §12 empty.hostNews.
 */
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Megaphone, Newspaper } from 'lucide-react';
import type { ScheduledNewsView } from '@deca/shared';
import { InsetGroupedList } from '../../components/ios/InsetGroupedList';
import { ListRow } from '../../components/ios/ListRow';
import { SegmentedControl } from '../../components/ios/SegmentedControl';
import { Button } from '../../components/ios/Button';
import { EmptyState } from '../../components/ios/EmptyState';
import { TagPill } from '../../components/ios/Pill';
import { useAdminPoll } from '../../hooks/useAdmin';
import { useGame } from '../../hooks/useGame';
import { useCompanies } from '../../hooks/useCompanies';
import { formatNumber } from '../../lib/format';
import { NEWS_BADGE, NEWS_EXTRA } from '../../lib/glossary';
import { fill } from '../../shell/copy';
import { useDocumentTitle } from '../../shell/StubPage';
import { HOST_EMPTY, HOST_PHONE } from '../../components/admin/hostCopy';
import { HostLoadError, HostLoading, HostNavBar, MetricLegend } from '../../components/admin/HostUi';
import { FireNewsSheet } from '../../components/admin/FireNewsSheet';

const N = HOST_PHONE.news;
const NEWS_POLL_MS = 15_000;

export default function NewsDeskPage() {
  useDocumentTitle('News desk');
  const [params, setParams] = useSearchParams();
  const composing = params.get('compose') === '1';
  const [view, setView] = useState<'scheduled' | 'fired'>('scheduled');
  const { game } = useGame();
  const { companies, byId } = useCompanies();
  const { data, error, refresh } = useAdminPoll<{ events: ScheduledNewsView[] }>('/api/admin/news/scheduled', NEWS_POLL_MS);

  const events = useMemo(() => {
    const all = data?.events ?? [];
    const list = all.filter((e) => (view === 'fired' ? e.fired : !e.fired));
    return view === 'fired' ? [...list].sort((a, b) => b.tick - a.tick) : [...list].sort((a, b) => a.tick - b.tick);
  }, [data, view]);

  const setComposing = (on: boolean) => {
    const next = new URLSearchParams(params);
    if (on) next.set('compose', '1');
    else next.delete('compose');
    setParams(next, { replace: !on });
    if (!on) refresh();
  };

  const tickers = (ids: string[]) => (ids.length > 3 ? fill(NEWS_EXTRA.companyCount, { n: ids.length }) : ids.map((id) => byId[id]?.ticker ?? id).join(' · '));

  return (
    <>
      <HostNavBar
        title="News desk"
        game={game}
        trailing={
          <Button variant="filled" size="small" icon={Megaphone} onClick={() => setComposing(true)}>
            {HOST_PHONE.fireNews}
          </Button>
        }
      />
      <div className="bx-page bx-host-page">
        <SegmentedControl
          ariaLabel="News"
          value={view}
          onChange={setView}
          options={[
            { value: 'scheduled', label: N.scheduled },
            { value: 'fired', label: N.fired },
          ]}
          className="bx-host-segment"
        />
        <MetricLegend label={N.hostOnly} items={[{ label: 'Tick', termId: 'tick' }, { label: 'News', termId: 'news' }]} />
        {!data && !error ? (
          <HostLoading />
        ) : !data ? (
          <HostLoadError message={error} onRetry={refresh} />
        ) : events.length === 0 ? (
          view === 'scheduled' ? (
            <EmptyState icon={Newspaper} title={HOST_EMPTY.hostNews.title} body={HOST_EMPTY.hostNews.body} />
          ) : (
            <EmptyState icon={Newspaper} title={N.noFired} body={N.noFiredBody} />
          )
        ) : (
          <InsetGroupedList aria-label={view === 'fired' ? N.fired : N.scheduled} footer={view === 'scheduled' ? N.hostOnly : undefined}>
            {events.map((e, i) => (
              <ListRow
                key={`${e.tick}-${i}`}
                stacked
                title={e.headline}
                subtitle={`${fill(N.tick, { tick: formatNumber(e.tick) })} · ${NEWS_BADGE[e.type]} · ${tickers(e.companyIds)}`}
                trailing={
                  <TagPill>
                    {NEWS_EXTRA.sentiment[e.sentiment].short}
                    {e.source !== 'scheduled' ? ` · ${N.source[e.source]}` : ''}
                  </TagPill>
                }
              />
            ))}
          </InsetGroupedList>
        )}
      </div>
      <FireNewsSheet open={composing} onClose={() => setComposing(false)} game={game} companies={companies} />
    </>
  );
}
