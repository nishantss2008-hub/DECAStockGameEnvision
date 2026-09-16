/**
 * "Meet the market" — the required-once intro flow (design 2026-09-16 §6, COPY §14).
 *
 * Full screen at `/learn/meet-the-market?step=n`. Paging is route-based, the way Final results
 * pages (MOBILE §7.13): one card per step, normal document scroll, Back and Next as real buttons,
 * so the flow is finishable with a keyboard or VoiceOver and never needs a swipe. Each step moves
 * focus to the card's heading and announces "Step n of 10" politely.
 *
 * Completion is server state. The last card posts `POST /api/intro/complete` once and then lands on
 * Markets; whether the crew has ALREADY finished is read from `team.introCompletedAt` on the live
 * store every render, never from local state, because the host can clear it mid-session and a
 * student may be on a second device.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '../../components/ios/Button';
import { ActionSheet } from '../../components/ios/ActionSheet';
import { Crest } from '../../components/ios/Crest';
import { InsetGroupedList } from '../../components/ios/InsetGroupedList';
import { ListRow } from '../../components/ios/ListRow';
import { TagPill } from '../../components/ios/Pill';
import { useCompanies } from '../../hooks/useCompanies';
import { useFunds } from '../../hooks/useInstruments';
import { FUNDS_EXTRA } from '../../lib/fundCopy';
import { formatMoney } from '../../lib/format';
import { apiPost } from '../../lib/api';
import { useShellGame } from '../../shell/ShellData';
import { useDocumentTitle } from '../../shell/StubPage';
import { fill } from '../../shell/copy';
import { INTRO } from '../../components/learn/introCopy';
import { buildIntroStages, introComplete, introSearch, stepFromSearch, type IntroStage } from '../../components/learn/introFlow';
import '../../components/learn/intro.css';

const HEADING_ID = 'bx-intro-heading';
const STEP_ID = 'bx-intro-step';

export default function MeetTheMarketPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { game, team } = useShellGame();
  const { companies } = useCompanies();
  const { funds } = useFunds();

  const stages = useMemo(() => buildIntroStages({ companies, funds }), [companies, funds]);
  const total = stages.length;
  const step = stepFromSearch(location.search, total);
  const stage = stages[step - 1]!;
  const last = step === total;
  // Server truth, re-read every render: the host can mark this crew done (or send it back) mid-flow.
  const finished = introComplete(team);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [skipOpen, setSkipOpen] = useState(false);
  const inFlight = useRef(false);

  useDocumentTitle(INTRO.title);

  // Full-screen view: the tab bar and sidebar step aside while the flow is open.
  useEffect(() => {
    document.documentElement.setAttribute('data-intro', '');
    return () => document.documentElement.removeAttribute('data-intro');
  }, []);

  // Every step change returns to the top and puts focus on the new card's heading.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    window.scrollTo({ top: 0 });
    document.getElementById(HEADING_ID)?.focus({ preventScroll: true });
  }, [step]);

  const go = (n: number) =>
    navigate({ pathname: location.pathname, search: introSearch(n, total) }, { replace: true, preventScrollReset: true });

  const leave = (to: string) => navigate(to, { replace: true });

  const finish = async () => {
    if (inFlight.current) return;
    // Already done (a replay from Learn, or the host marked it): read, don't write.
    if (finished) {
      leave('/markets');
      return;
    }
    inFlight.current = true;
    setSaving(true);
    setError(null);
    try {
      await apiPost('/api/intro/complete');
      leave('/markets');
    } catch {
      setError(INTRO.error);
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  };

  const symbol = game?.currency.symbol;
  const money = (cents: number) => formatMoney(cents, { symbol });
  const price = (cents: number | null) => (cents === null ? '—' : fill(INTRO.openPrice, { price: money(cents) }));
  const values = {
    startingCash: game ? money(game.startingCapital) : '—',
    tickSeconds: game ? Math.round(game.tickIntervalMs / 1000) : 30,
  };
  const progress = fill(INTRO.progress, { n: step, total });

  return (
    <div className="bx-intro" data-step={step}>
      <header className="bx-intro__top">
        <p className="t-footnote bx-intro__counter" id={STEP_ID}>
          {progress}
        </p>
        <Button
          variant="plain"
          size="small"
          aria-haspopup={finished ? undefined : 'dialog'}
          onClick={() => (finished ? leave('/learn') : setSkipOpen(true))}
        >
          {finished ? INTRO.close : INTRO.skip}
        </Button>
      </header>
      {/* The bar is decoration; "Step n of 10" above carries the meaning (MOBILE §7.2 dots rule). */}
      <div className="bx-intro__track" aria-hidden="true" style={{ '--bx-intro-pct': `${Math.round((step / total) * 100)}%` } as CSSProperties}>
        <span className="bx-intro__fill" />
      </div>
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {progress}
      </p>

      <div className="bx-intro__card" key={step}>
        <h1 className="t-title-1 t-emph bx-intro__title" id={HEADING_ID} tabIndex={-1}>
          {stage.title}
        </h1>
        <p className="t-body bx-intro__body">{fill(stage.body, values)}</p>
        <StageDetail stage={stage} values={values} price={price} />
      </div>

      {error && (
        <p className="t-subhead bx-intro__error" role="alert">
          {error}
        </p>
      )}

      <nav className="bx-intro__pager" aria-label={INTRO.title}>
        <p className="t-caption-1 bx-intro__note">{finished ? INTRO.replayNote : INTRO.skipNote}</p>
        <div className="bx-intro__buttons">
          <Button variant="gray" size="large" disabled={step === 1} aria-describedby={STEP_ID} onClick={() => go(step - 1)}>
            {INTRO.back}
          </Button>
          {last ? (
            <Button
              variant="filled"
              size="large"
              loading={saving}
              loadingLabel={INTRO.finishing}
              onClick={() => void finish()}
            >
              {error ? INTRO.retry : INTRO.finish}
            </Button>
          ) : (
            <Button variant="filled" size="large" aria-describedby={STEP_ID} onClick={() => go(step + 1)}>
              {INTRO.next}
            </Button>
          )}
        </div>
      </nav>

      <ActionSheet
        open={skipOpen}
        onOpenChange={setSkipOpen}
        title={INTRO.skipTitle}
        message={INTRO.skipBody}
        cancelLabel={INTRO.skipKeep}
        actions={[
          {
            id: 'later',
            label: INTRO.skipConfirm,
            onSelect: () => {
              setSkipOpen(false);
              leave('/markets');
            },
          },
        ]}
      />
    </div>
  );
}

interface StageDetailProps {
  stage: IntroStage;
  values: Record<string, string | number>;
  price: (cents: number | null) => string;
}

/** The part of a card that is not the heading and lead paragraph: points, companies or funds. */
function StageDetail({ stage, values, price }: StageDetailProps) {
  if (stage.kind === 'sector') {
    return (
      <InsetGroupedList header={INTRO.companiesHeader} headingLevel={2} className="bx-intro__list">
        {stage.companies.map((c) => (
          <ListRow
            key={c.ticker}
            leading={<Crest ticker={c.ticker} sector={stage.sector} size={36} />}
            leadingWidth={36}
            title={
              <>
                <span className="ios-num bx-intro__ticker">{c.ticker}</span> {c.name}
              </>
            }
            subtitle={c.description}
            detail={<span className="ios-num">{price(c.openPrice)}</span>}
          />
        ))}
      </InsetGroupedList>
    );
  }

  const points = (
    <ul className="bx-intro__points" role="list">
      {stage.points.map((p) => (
        <li key={p} className="t-subhead">
          {fill(p, values)}
        </li>
      ))}
    </ul>
  );

  if (stage.kind !== 'funds') return points;

  return (
    <>
      {points}
      <InsetGroupedList header={INTRO.fundsHeader} headingLevel={2} footer={FUNDS_EXTRA.fund.noNews} className="bx-intro__list">
        {stage.funds.map((f) => (
          <ListRow
            key={f.ticker}
            leading={<Crest ticker={f.ticker} size={36} />}
            leadingWidth={36}
            title={
              <>
                <span className="ios-num bx-intro__ticker">{f.ticker}</span> {f.name}
              </>
            }
            subtitle={f.holds}
            detail={<span className="ios-num">{price(f.openPrice)}</span>}
            trailing={<TagPill>{FUNDS_EXTRA.fund.sectionTitle}</TagPill>}
          />
        ))}
      </InsetGroupedList>
    </>
  );
}
