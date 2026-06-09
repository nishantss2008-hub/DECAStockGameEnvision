/**
 * News — the dispatches feed.
 *
 * A reverse-chronological river of NewsEvent cards (useNews already returns
 * them newest-first). We pass a company lookup (from useCompanies) so each card
 * can render affected houses as linked, ticker'd chips.
 */

import { useMemo } from 'react';
import { useNews } from '../hooks/useNews';
import { useCompanies } from '../hooks/useCompanies';
import NewsItem from '../components/NewsItem';
import type { Company } from '@deca/shared';

export default function News() {
  const { news, loading } = useNews();
  const { companies } = useCompanies();

  const byId = useMemo(() => {
    const map: Record<string, Company> = {};
    companies.forEach((c) => (map[c.id] = c));
    return map;
  }, [companies]);

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">From the Crow’s Nest</p>
          <h1>Dispatches</h1>
        </div>
        {!loading && (
          <span className="muted" style={{ fontSize: 'var(--fs-sm)' }}>
            {news.length} {news.length === 1 ? 'dispatch' : 'dispatches'}
          </span>
        )}
      </header>

      {loading && news.length === 0 ? (
        <div className="loading-block" style={{ minHeight: '40vh' }}>
          <div className="spinner" aria-hidden="true" />
          <span>Reading the signals…</span>
        </div>
      ) : news.length === 0 ? (
        <div className="panel text-center">
          <p className="muted">
            The seas are calm. No dispatches have come in over the horizon yet.
          </p>
        </div>
      ) : (
        <div className="stack" style={{ gap: 'var(--sp-4)' }}>
          {news.map((item) => (
            <NewsItem key={item.id} news={item} companies={byId} />
          ))}
        </div>
      )}
    </div>
  );
}
