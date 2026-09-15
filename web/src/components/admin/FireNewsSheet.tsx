/**
 * Fire news sheet (MOBILE §7.17, large): Cancel / "Fire news" · company tokens + "Add company" · impact type menu ·
 * size segmented −50% −25% 0 +25% +50% with a joined ±1% Stepper · live price preview "KRKN Ð84.12 → Ð90.85" ·
 * headline with counter (announced at 80 and 90) · optional body · pinned "Publish at tick N" → POST /admin/news.
 */
import { useEffect, useId, useMemo, useState } from 'react';
import { ChevronDown, Plus, X } from 'lucide-react';
import { NEWS_TYPES, type Company, type GameState, type NewsType } from '@deca/shared';
import { Sheet } from '../ios/Sheet';
import { Button } from '../ios/Button';
import { Menu } from '../ios/Menu';
import { SegmentedControl } from '../ios/SegmentedControl';
import { Stepper } from '../ios/Stepper';
import { SearchField } from '../ios/SearchField';
import { useAnnounce } from '../ios/Toast';
import { apiPost } from '../../lib/api';
import { formatMoney } from '../../lib/format';
import { NEWS_BADGE } from '../../lib/glossary';
import { fill } from '../../shell/copy';
import { headlineAnnouncement, magnitudeLabel, previewPrice, publishLabel } from './adminFormat';
import { BODY_MAX, fireNewsProblem, HEADLINE_MAX, SIZE_SEGMENTS, sizeSegmentValue, stepMagnitude } from './hostLogic';
import { HOST_PHONE } from './hostCopy';
import { HostInfo } from './HostUi';
import { useHostAction } from './useHostData';

const N = HOST_PHONE.news;

export function FireNewsSheet({ open, onClose, game, companies }: { open: boolean; onClose: () => void; game: GameState | null; companies: Company[] }) {
  const id = useId();
  const announce = useAnnounce();
  const { run, pending } = useHostAction();
  const [ids, setIds] = useState<string[]>([]);
  const [type, setType] = useState<NewsType>('earnings');
  const [magnitude, setMagnitude] = useState(0.08);
  const [headline, setHeadline] = useState('');
  const [body, setBody] = useState('');
  const [picking, setPicking] = useState(false);
  const [q, setQ] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setIds([]);
    setType('earnings');
    setMagnitude(0.08);
    setHeadline('');
    setBody('');
    setPicking(false);
    setError(null);
  }, [open]);

  const byId = useMemo(() => Object.fromEntries(companies.map((c) => [c.id, c])), [companies]);
  const sym = game?.currency.symbol;
  const problem = fireNewsProblem({ phase: game?.phase, companyIds: ids, magnitude, headline });
  const matches = companies.filter((c) => !ids.includes(c.id) && `${c.ticker} ${c.name}`.toLowerCase().includes(q.trim().toLowerCase()));

  const onHeadline = (text: string) => {
    const next = text.slice(0, HEADLINE_MAX);
    setHeadline(next);
    const say = headlineAnnouncement(next.length, HEADLINE_MAX);
    if (say) announce(say, 'order');
  };

  const publish = async () => {
    if (problem) return;
    const result = await run('fire', () => apiPost<{ tick: number }>('/admin/news', { companyIds: ids, type, magnitude, headline: headline.trim(), body: body.trim() }), { quiet: true });
    if (result.ok) {
      announce(fill(N.queued, { tick: (result.value.tick ?? game?.currentTick ?? 0) + 1 }), 'order');
      onClose();
    } else setError(result.message ? `${result.title}. ${result.message}` : result.title);
  };

  const hint = problem === 'phase' ? N.notRunning : problem === 'zero' ? N.zeroHint : null;
  const segment = sizeSegmentValue(magnitude);

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title={N.fireTitle}
      leading={
        <Button variant="plain" size="medium" onClick={onClose}>
          {N.cancel}
        </Button>
      }
      showClose={false}
      detents="large"
      keyboardAware
      footer={
        <div className="bx-host-footer">
          {hint && <p className="t-footnote bx-host-muted">{hint}</p>}
          <Button variant="filled" size="large" fullWidth disabled={problem !== null} loading={pending === 'fire'} onClick={() => void publish()}>
            {publishLabel(game?.currentTick ?? 0)}
          </Button>
        </div>
      }
    >
      <div className="bx-sheet-body bx-host-form">
        <fieldset className="bx-host-fieldset">
          <legend className="t-footnote">{N.companies}</legend>
          <ul className="bx-host-tokens" aria-label={N.companies}>
            {ids.map((cid) => (
              <li key={cid} className="bx-host-token">
                <span className="t-subhead">{byId[cid]?.ticker ?? cid}</span>
                <button type="button" aria-label={fill(N.removeCompany, { ticker: byId[cid]?.ticker ?? cid })} onClick={() => setIds((xs) => xs.filter((x) => x !== cid))}>
                  <X size={14} aria-hidden="true" />
                </button>
              </li>
            ))}
            <li>
              <Button variant="gray" size="small" icon={Plus} aria-expanded={picking} onClick={() => setPicking((p) => !p)}>
                {N.addCompany}
              </Button>
            </li>
          </ul>
          {picking && (
            <div className="bx-host-picker">
              <SearchField value={q} onChange={setQ} placeholder={N.searchCompanies} label={N.searchCompanies} />
              <ul className="bx-host-picker__list">
                {matches.slice(0, 25).map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      className="bx-host-picker__item"
                      onClick={() => {
                        setIds((xs) => [...xs, c.id]);
                        setQ('');
                        setPicking(false);
                      }}
                    >
                      <span className="t-headline">{c.ticker}</span> <span className="t-subhead bx-host-muted">{c.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </fieldset>

        <div className="bx-host-kv">
          <span className="t-subhead">{N.impactType}</span>
          <Menu
            label={N.impactType}
            trigger={
              <button type="button" className="bx-host-edit" aria-label={`${N.impactType}: ${NEWS_BADGE[type]}`}>
                {NEWS_BADGE[type]}
                <ChevronDown size={16} aria-hidden="true" />
              </button>
            }
            groups={[{ label: N.impactType, value: type, onValueChange: (v) => setType(v as NewsType), items: NEWS_TYPES.map((t) => ({ id: t, label: NEWS_BADGE[t], onSelect: () => setType(t) })) }]}
          />
        </div>

        <fieldset className="bx-host-fieldset">
          <legend className="t-footnote">
            {N.direction} · <strong className="num">{magnitudeLabel(magnitude)}</strong>
          </legend>
          <SegmentedControl
            ariaLabel={N.direction}
            value={segment ?? ''}
            onChange={(v) => v !== '' && setMagnitude(Number(v))}
            options={SIZE_SEGMENTS.map((s) => ({ value: String(s), label: s === 0 ? '0' : magnitudeLabel(s) }))}
          />
          <Stepper
            value={Math.round(magnitude * 100)}
            onChange={(pct) => setMagnitude(stepMagnitude(pct / 100, 0))}
            min={-50}
            max={50}
            decrementLabel={N.lower}
            incrementLabel={N.raise}
            groupLabel={N.direction}
          >
            <span className="num">{magnitudeLabel(magnitude)}</span>
          </Stepper>
        </fieldset>

        {ids.length > 0 && (
          <section aria-label={N.preview} className="bx-host-preview">
            <h3 className="t-footnote">
              {N.preview} <HostInfo termId="price" />
            </h3>
            <ul>
              {ids.map((cid) => {
                const c = byId[cid];
                if (!c) return null;
                return (
                  <li key={cid} className="t-body num">
                    {c.ticker} {formatMoney(c.currentPrice, { symbol: sym })} → {formatMoney(previewPrice(c.currentPrice, magnitude), { symbol: sym })}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <label className="bx-host-field" htmlFor={`${id}-headline`}>
          <span className="t-footnote bx-host-field__top">
            {N.headline}
            <span id={`${id}-count`} className="num bx-host-muted">
              {fill(N.counter, { count: headline.length, max: HEADLINE_MAX })}
            </span>
          </span>
          <input id={`${id}-headline`} value={headline} maxLength={HEADLINE_MAX} onChange={(e) => onHeadline(e.target.value)} aria-describedby={`${id}-count`} />
        </label>
        <label className="bx-host-field" htmlFor={`${id}-body`}>
          <span className="t-footnote">{N.body}</span>
          <textarea id={`${id}-body`} rows={3} maxLength={BODY_MAX} value={body} onChange={(e) => setBody(e.target.value)} />
        </label>
        {error && (
          <p role="alert" className="t-footnote bx-host-error">
            {error}
          </p>
        )}
      </div>
    </Sheet>
  );
}
