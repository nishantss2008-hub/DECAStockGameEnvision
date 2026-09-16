/**
 * The projector screen (MOBILE §7.19) — `/admin/projector`, host only, no chrome.
 *
 * The one screen in this app that is not phone-shaped. It is read from the back of a classroom, so
 * it holds four things and nothing else: the standings, the Pirate Composite, the clock, and the
 * newest dispatch — plus, above all of them, the phase in plain words whenever the game is not
 * simply running, because "why has nothing moved?" is the first thing a room asks.
 *
 * Nothing here is clickable: a projector is a surface people walk past, and a mis-tap mid-round
 * would take the scoreboard off the wall. Everything arrives on the SSE stream the rest of the app
 * already uses (hooks/liveState); there is no polling and no endpoint of its own. If that stream
 * drops, the board says so rather than showing frozen numbers that still look live.
 */
import { useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { buildProjector, designScale, type ProjectorRow } from '../../components/projector/projector';
import { PROJECTOR } from '../../components/projector/projectorCopy';
import { useGame } from '../../hooks/useGame';
import { useInstruments } from '../../hooks/useInstruments';
import { useLeaderboard } from '../../hooks/useLeaderboard';
import { useMarket } from '../../hooks/useMarket';
import { useNews } from '../../hooks/useNews';
import { serverNow } from '../../lib/gameTime';
import '../../components/projector/projector.css';

/** Repaints once a second while the clock is running; a stopped clock needs no timer. */
function useWallClock(running: boolean, lastTickAt: number | null | undefined): number {
  const [now, setNow] = useState(() => serverNow());
  useEffect(() => {
    setNow(serverNow());
    if (!running) return undefined;
    const id = setInterval(() => setNow(serverNow()), 1_000);
    return () => clearInterval(id);
  }, [running, lastTickAt]);
  return now;
}

/**
 * The rows column's real height, in design pixels. The board's row budget is written down in
 * projector.ts, but a phase line that wraps on an unfamiliar system font would make that budget a
 * row too generous and clip the last crew — so the screen measures the space it actually got.
 * Where ResizeObserver is missing (jsdom), the written budget stands.
 */
function useBoardHeight(): [RefObject<HTMLDivElement>, number | undefined] {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | undefined>(undefined);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const read = () => {
      const scale = designScale(window.innerWidth, window.innerHeight);
      const px = el.getBoundingClientRect().height;
      // The column is `flex: 1` and clipped, so its height never depends on the rows inside it.
      setHeight(scale > 0 && px > 0 ? px / scale : undefined);
    };
    read();
    const observer = new ResizeObserver(read);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, height];
}

/** Rank movement since this session began: a mark, not a motion (§7.19, reduced motion). */
function MoveMark({ move }: { move: ProjectorRow['move'] }) {
  if (move.dir === 'flat') return <span className="bx-proj__move" data-dir="flat" aria-hidden="true" />;
  return (
    <span className="bx-proj__move" data-dir={move.dir}>
      <svg viewBox="0 0 8 8" className="bx-proj__tri" aria-hidden="true" focusable="false">
        <path d={move.dir === 'up' ? 'M4 1 7.6 7H.4Z' : 'M4 7 .4 1h7.2Z'} fill="currentColor" />
      </svg>
      <span className="num">{move.by}</span>
    </span>
  );
}

export default function ProjectorPage() {
  const { game, loading, fromCache } = useGame();
  const { leaderboard } = useLeaderboard();
  const { market } = useMarket();
  const { news } = useNews();
  const { instruments } = useInstruments();
  const now = useWallClock(game?.phase === 'live', game?.lastTickAt);
  const [stageRef, boardHeight] = useBoardHeight();

  const model = buildProjector({ game, leaderboard, market, news, instruments, now, stale: fromCache, ready: !loading, boardHeight });
  const band = model.phaseNote;
  const boardStyle = { '--row-h': model.fit.rowHeight } as CSSProperties;

  return (
    <div className="bx-proj" data-phase={model.phase}>
      <header className="bx-proj__head">
        <div className="bx-proj__mark">
          <p className="bx-proj__eyebrow">{PROJECTOR.eyebrow}</p>
          <h1 className="bx-proj__title">{PROJECTOR.title}</h1>
        </div>
        <div className="bx-proj__clock">
          <p className="bx-proj__time num">{model.clock}</p>
          {model.session && <p className="bx-proj__session">{model.session}</p>}
        </div>
      </header>

      {model.connection && (
        <p className="bx-proj__alert" role="status">
          <strong>{model.connection.title}</strong>
          <span>{model.connection.body}</span>
        </p>
      )}

      {(band || model.winner) && (
        <section className="bx-proj__band" aria-label={band?.title ?? PROJECTOR.title}>
          {model.winner && <p className="bx-proj__winner">{model.winner}</p>}
          {band && (
            <p className="bx-proj__phase">
              <strong className="bx-proj__phase-title">{band.title}</strong>
              <span className="bx-proj__phase-flavor">{band.flavor}</span>
              <span className="bx-proj__phase-body">{band.body}</span>
            </p>
          )}
        </section>
      )}

      <main className="bx-proj__body">
        <section className="bx-proj__board" style={boardStyle}>
          {/* Column headings over an empty board read as a broken table, so they wait for rows. */}
          {!model.notice && (
            <div className="bx-proj__cols" aria-hidden="true">
              <span className="bx-proj__col-rank">{PROJECTOR.columns.rank}</span>
              <span>{PROJECTOR.columns.crew}</span>
              <span className="bx-proj__col-num">{PROJECTOR.columns.totalValue}</span>
              <span className="bx-proj__col-num">{PROJECTOR.columns.returnPct}</span>
              <span />
            </div>
          )}

          <div className="bx-proj__stage" ref={stageRef}>
            {model.notice ? (
              <div className="bx-proj__notice">
                <p className="bx-proj__notice-title">{model.notice.title}</p>
                {model.notice.body && <p className="bx-proj__notice-body">{model.notice.body}</p>}
              </div>
            ) : (
              <ol className="bx-proj__rows">
                {model.rows.map((row) => (
                  <li key={row.teamId} className="bx-proj__row">
                    <span className="bx-proj__rank num">{row.rank}</span>
                    <span className="bx-proj__name">{row.name}</span>
                    <span className="bx-proj__value num">{row.value}</span>
                    <span className="bx-proj__change num" data-dir={row.dir}>
                      {row.change}
                    </span>
                    <MoveMark move={row.move} />
                  </li>
                ))}
              </ol>
            )}
          </div>

          <p className="bx-proj__overflow">{model.overflowNote}</p>
        </section>

        <aside className="bx-proj__rail">
          <section className="bx-proj__card bx-proj__index">
            <p className="bx-proj__label">{model.composite?.label ?? PROJECTOR.composite.label}</p>
            <p className="bx-proj__index-value num">{model.composite?.value ?? '—'}</p>
            <p className="bx-proj__index-change num" data-dir={model.composite?.dir ?? 'flat'}>
              {model.composite?.change ?? ''}
            </p>
          </section>

          <section className="bx-proj__card bx-proj__news">
            <p className="bx-proj__label">{PROJECTOR.news.label}</p>
            {model.headline ? (
              <>
                <p className="bx-proj__headline">{model.headline.text}</p>
                <p className="bx-proj__stamp num">{model.headline.time}</p>
              </>
            ) : (
              <p className="bx-proj__headline bx-proj__headline--none">{PROJECTOR.news.empty}</p>
            )}
          </section>

          {/* Public quote data only: the same session changes every crew reads on its own phone.
              Gone once the game ends — there is no session left to rank, and the rail is shorter
              then anyway, with the winner band above it. */}
          {model.movers && (
            <section className="bx-proj__card bx-proj__movers">
              <p className="bx-proj__label">{PROJECTOR.movers.label}</p>
              {model.movers.length > 0 ? (
                <ul className="bx-proj__mover-list">
                  {model.movers.map((mover) => (
                    <li key={mover.id} className="bx-proj__mover">
                      <span className="bx-proj__mover-id">
                        <span className="bx-proj__mover-ticker num">{mover.ticker}</span>
                        <span className="bx-proj__mover-name">{mover.name}</span>
                      </span>
                      <span className="bx-proj__mover-price num">{mover.price}</span>
                      <span className="bx-proj__mover-change num" data-dir={mover.dir}>
                        {mover.change}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="bx-proj__movers-none">{PROJECTOR.movers.empty}</p>
              )}
            </section>
          )}
        </aside>
      </main>
    </div>
  );
}
