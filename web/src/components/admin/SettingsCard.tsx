/**
 * Game settings (MOBILE §7.18 Settings, COPY §11): one row per setting with its "?"; in the lobby each row opens
 * an editor sheet with the COPY explanation, and Save posts `/api/admin/settings`. Locked with `lockedNote` otherwise.
 */
import { useEffect, useId, useState } from 'react';
import { ChevronRight, Lock } from 'lucide-react';
import { GAME_LENGTH_OPTIONS_MS, POSITION_LIMIT_OPTIONS, RESEARCH_EDGES, type GameState, type SettingsInput } from '@deca/shared';
import { InsetGroupedList } from '../ios/InsetGroupedList';
import { KeyValueRow } from '../ios/ListRow';
import { Sheet } from '../ios/Sheet';
import { Button } from '../ios/Button';
import { apiPost } from '../../lib/api';
import { formatMoney } from '../../lib/format';
import { derivedText, feePctText, lengthLabel, parseFeeBps, parseMoneyInput } from './adminFormat';
import { settingsSummary, type SettingId, type SettingRow } from './hostLogic';
import { HOST_PHONE, HOST_SETTINGS } from './hostCopy';
import { HostInfo } from './HostUi';
import { useHostAction } from './useHostData';

export function SettingsCard({ game, id }: { game: GameState; id?: string }) {
  const [editing, setEditing] = useState<SettingId | null>(null);
  const lobby = game.phase === 'lobby';
  const rows = settingsSummary(game);
  return (
    <>
      <InsetGroupedList id={id} header={HOST_SETTINGS.panelTitle} footer={lobby ? undefined : HOST_SETTINGS.lockedNote}>
        {rows.map((row) => (
          <SettingListRow key={row.id} row={row} locked={!lobby} onEdit={() => setEditing(row.id)} />
        ))}
      </InsetGroupedList>
      <SettingEditorSheet game={game} setting={lobby ? editing : null} onClose={() => setEditing(null)} />
    </>
  );
}

function SettingListRow({ row, locked, onEdit }: { row: SettingRow; locked: boolean; onEdit: () => void }) {
  return (
    <KeyValueRow
      label={row.label}
      info={<HostInfo termId={row.termId} />}
      value={
        locked ? (
          <span className="bx-host-locked">
            {row.value}
            <Lock size={13} aria-label="Locked" />
          </span>
        ) : (
          <button type="button" className="bx-host-edit" onClick={onEdit} aria-label={`${HOST_PHONE.editSettings}: ${row.label}, ${row.value}`}>
            {row.value}
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        )
      }
    />
  );
}

function RadioList<T extends string | number>({ name, value, options, onChange }: { name: string; value: T; options: Array<{ value: T; label: string; help?: string }>; onChange: (v: T) => void }) {
  const baseId = useId();
  return (
    <div role="radiogroup" aria-label={name} className="bx-host-radios">
      {options.map((o, i) => (
        <label key={String(o.value)} className="bx-host-radio">
          {/* Short name ("50%"), with the explanation read after it as the description. */}
          <input
            type="radio"
            name={name}
            checked={o.value === value}
            onChange={() => onChange(o.value)}
            aria-labelledby={`${baseId}-${i}`}
            aria-describedby={o.help ? `${baseId}-${i}-help` : undefined}
          />
          <span>
            <span className="t-body" id={`${baseId}-${i}`}>
              {o.label}
            </span>
            {o.help && (
              <span className="t-footnote bx-host-muted bx-host-radio__help" id={`${baseId}-${i}-help`}>
                {o.help}
              </span>
            )}
          </span>
        </label>
      ))}
    </div>
  );
}

function SettingEditorSheet({ game, setting, onClose }: { game: GameState; setting: SettingId | null; onClose: () => void }) {
  const { run, pending } = useHostAction();
  const fieldId = useId();
  const [length, setLength] = useState(game.gameLengthMs);
  const [cash, setCash] = useState('');
  const [fee, setFee] = useState('');
  const [edge, setEdge] = useState(game.researchEdge);
  const [limitPct, setLimitPct] = useState(game.maxPositionPct);
  const [currencyName, setCurrencyName] = useState(game.currency.name);
  const [currencySymbol, setCurrencySymbol] = useState(game.currency.symbol);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!setting) return;
    setLength(game.gameLengthMs);
    setCash(String(game.startingCapital / 100));
    setFee(String(game.feeBps));
    setEdge(game.researchEdge);
    setLimitPct(game.maxPositionPct);
    setCurrencyName(game.currency.name);
    setCurrencySymbol(game.currency.symbol);
    setError(null);
  }, [setting, game]);

  const cashCents = parseMoneyInput(cash);
  const feeBps = parseFeeBps(fee);
  let body: SettingsInput | null = null;
  let title = '';
  let content = null;
  switch (setting) {
    case 'gameLength':
      title = HOST_SETTINGS.gameLength.label;
      body = { gameLengthMs: length };
      content = (
        <>
          <p className="t-subhead bx-host-help">{HOST_SETTINGS.gameLength.help}</p>
          <RadioList name={title} value={length} options={GAME_LENGTH_OPTIONS_MS.map((ms) => ({ value: ms, label: lengthLabel(ms) }))} onChange={setLength} />
          <p className="t-footnote bx-host-muted" aria-live="polite">
            {derivedText(length)}
          </p>
        </>
      );
      break;
    case 'startingCash':
      title = HOST_SETTINGS.startingCash.label;
      body = cashCents === null ? null : { startingCapital: cashCents };
      content = (
        <>
          <p className="t-subhead bx-host-help">{HOST_SETTINGS.startingCash.help}</p>
          <label className="bx-host-field" htmlFor={fieldId}>
            <span className="t-footnote">{title}</span>
            <input id={fieldId} inputMode="decimal" autoComplete="off" value={cash} onChange={(e) => setCash(e.target.value)} aria-describedby={`${fieldId}-hint`} aria-invalid={cashCents === null} />
          </label>
          <p id={`${fieldId}-hint`} className="t-footnote bx-host-muted">
            {cashCents === null ? `${formatMoney(1_000_00, { symbol: game.currency.symbol })} – ${formatMoney(1_000_000_000_00, { symbol: game.currency.symbol })}` : `${formatMoney(cashCents, { symbol: game.currency.symbol })} · ${HOST_SETTINGS.startingCash.flavor}`}
          </p>
        </>
      );
      break;
    case 'tradingFee':
      title = HOST_SETTINGS.tradingFee.label;
      body = feeBps === null ? null : { feeBps };
      content = (
        <>
          <p className="t-subhead bx-host-help">{HOST_SETTINGS.tradingFee.help}</p>
          <label className="bx-host-field" htmlFor={fieldId}>
            <span className="t-footnote">{title}</span>
            <input id={fieldId} inputMode="numeric" autoComplete="off" value={fee} onChange={(e) => setFee(e.target.value)} aria-describedby={`${fieldId}-hint`} aria-invalid={feeBps === null} />
          </label>
          <p id={`${fieldId}-hint`} className="t-footnote bx-host-muted">
            {HOST_SETTINGS.tradingFee.unitNote}
            {feeBps !== null && ` = ${feePctText(feeBps)}`}
          </p>
        </>
      );
      break;
    case 'researchEdge':
      title = HOST_SETTINGS.researchEdge.label;
      body = { researchEdge: edge };
      content = (
        <>
          <p className="t-subhead bx-host-help">{HOST_SETTINGS.researchEdge.help}</p>
          <RadioList name={title} value={edge} options={RESEARCH_EDGES.map((e) => ({ value: e, ...HOST_SETTINGS.researchEdge.options[e] }))} onChange={setEdge} />
          <p className="t-footnote bx-host-muted">{HOST_SETTINGS.researchEdge.caution}</p>
        </>
      );
      break;
    case 'positionLimit':
      title = HOST_SETTINGS.positionLimit.label;
      body = { maxPositionPct: limitPct };
      content = (
        <>
          <p className="t-subhead bx-host-help">{HOST_SETTINGS.positionLimit.help}</p>
          <RadioList name={title} value={limitPct} options={POSITION_LIMIT_OPTIONS.map((p) => ({ value: p as number, ...HOST_SETTINGS.positionLimit.options[p]! }))} onChange={setLimitPct} />
        </>
      );
      break;
    case 'currency':
      title = HOST_SETTINGS.currency.label;
      body = currencyName.trim() && currencySymbol.trim() ? { currencyName: currencyName.trim(), currencySymbol: currencySymbol.trim() } : null;
      content = (
        <>
          <p className="t-subhead bx-host-help">{HOST_SETTINGS.currency.help}</p>
          <label className="bx-host-field" htmlFor={`${fieldId}-name`}>
            <span className="t-footnote">Name</span>
            <input id={`${fieldId}-name`} maxLength={40} value={currencyName} onChange={(e) => setCurrencyName(e.target.value)} />
          </label>
          <label className="bx-host-field" htmlFor={`${fieldId}-symbol`}>
            <span className="t-footnote">Symbol</span>
            <input id={`${fieldId}-symbol`} maxLength={8} value={currencySymbol} onChange={(e) => setCurrencySymbol(e.target.value)} />
          </label>
        </>
      );
      break;
    default:
      break;
  }

  const save = async () => {
    if (!body) return;
    const result = await run('settings', () => apiPost('/api/admin/settings', body), { success: HOST_SETTINGS.saved, quiet: true });
    if (result.ok) onClose();
    else setError(result.message ? `${result.title}. ${result.message}` : result.title);
  };

  return (
    <Sheet
      open={setting !== null}
      onOpenChange={(open) => !open && onClose()}
      title={title || HOST_SETTINGS.panelTitle}
      detents="large"
      keyboardAware
      footer={
        <Button variant="filled" size="large" fullWidth disabled={!body} loading={pending === 'settings'} onClick={() => void save()}>
          Save
        </Button>
      }
    >
      <div className="bx-sheet-body bx-host-form">
        {content}
        {error && (
          <p role="alert" className="t-footnote bx-host-error">
            {error}
          </p>
        )}
      </div>
    </Sheet>
  );
}
