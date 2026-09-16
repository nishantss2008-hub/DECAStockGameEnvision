/**
 * Inline component sections of the dev gallery. Every demo renders real components from
 * components/ios and components/charts with BRIEF §7 data and COPY words.
 */
import { useId, useMemo, useReducer, useState, type MouseEvent } from 'react';
import {
  Anchor,
  ArrowUpDown,
  BookOpen,
  Briefcase,
  ChartLine,
  CircleMinus,
  CirclePlus,
  Ellipsis,
  GraduationCap,
  ListChecks,
  Newspaper,
  Search,
  Star,
  TriangleAlert,
  Trophy,
  Type,
} from 'lucide-react';
import type { Sector } from '@deca/shared';
import { SECTORS } from '@deca/shared';
import { explainMetric, type PeerComparison } from '../lib/compare';
import { formatMoney, formatNumber, formatPct } from '../lib/format';
import { Button } from '../components/ios/Button';
import { Crest } from '../components/ios/Crest';
import { InfoTipButton } from '../components/ios/InfoTipButton';
import { InfoTipLines } from '../components/ios/InfoTipSheet';
import { InsetGroupedList } from '../components/ios/InsetGroupedList';
import { LargeTitleNavBar, NavBarButton, NavBarButtonGroup, StatusLine } from '../components/ios/LargeTitleNavBar';
import {
  ActionRow,
  DestructiveRow,
  DisclosureRow,
  ExplainRow,
  KeyValueRow,
  ListRow,
  StockRow,
  ToggleRow,
} from '../components/ios/ListRow';
import { ChangePill, ChangeTriangle, CountBadge, StatusDot, TagPill, YouPill } from '../components/ios/Pill';
import { changeParts } from '../components/ios/changeText';
import { SearchField } from '../components/ios/SearchField';
import { SegmentedControl } from '../components/ios/SegmentedControl';
import { MoneyText, SignedChange } from '../components/ios/SignedChange';
import { Stepper } from '../components/ios/Stepper';
import { TabBar, type TabBarItem } from '../components/ios/TabBar';
import { Toggle } from '../components/ios/Toggle';
import { StockBarSubtitle, StockHeader } from '../components/ios/StockHeader';
import { headerScrubFromChart, type StockHeaderScrub } from '../components/ios/stockHeaderText';
import { PositionSummary } from '../components/ios/PositionSummary';
import { Banner } from '../components/ios/Banner';
import { EmptyState } from '../components/ios/EmptyState';
import { Skeleton, SkeletonChart, SkeletonGroup, SkeletonHeader, SkeletonList } from '../components/ios/Skeleton';
import { Keypad, KeypadAmount } from '../components/ios/Keypad';
import { keypadReducer, keypadValue } from '../components/ios/keypadReducer';
import { SwipeActions } from '../components/ios/SwipeActions';
import { CompassLoader, CompassRose } from '../components/ios/CompassRose';
import { WaxSeal } from '../components/ios/WaxSeal';
import { Medallion } from '../components/ios/Medallion';
import { Podium } from '../components/ios/Podium';
import { ChartCard } from '../components/charts/ChartCard';
import { Sparkline } from '../components/charts/Sparkline';
import { RangeBar } from '../components/charts/RangeBar';
import { AllocationBar } from '../components/charts/AllocationBar';
import { ScatterChart } from '../components/charts/ScatterChart';
import { chartSummary, moneyFormatters, seriesStats } from '../components/charts/scrub';
import { DEFAULT_CURRENCY, formatMoneyCents, spokenMoney } from '../components/ios/signedText';
import {
  ACCOUNT,
  ACCOUNT_VALUE,
  ALLOCATION,
  AS_OF_TICK,
  AS_OF_TIME,
  COMPOSITE_REBASED,
  HOLDINGS,
  KRKN_SESSION,
  PODIUM,
  QUOTES,
  RANGE_TABS,
  SCATTER,
  STANDINGS,
  sessionSpark,
  tickTime,
} from './kitData';
import { KitDemo, KitSection, PhoneFrame, Tip, explainLabel, term } from './kitShared';

const KRKN = HOLDINGS.find((h) => h.ticker === 'KRKN')!;
const FDUT = HOLDINGS.find((h) => h.ticker === 'FDUT')!;
const MONEY = moneyFormatters(DEFAULT_CURRENCY);
const noop = () => {};

const TABS: TabBarItem[] = [
  { id: 'portfolio', label: 'Portfolio', to: '/portfolio', icon: Briefcase },
  { id: 'markets', label: 'Markets', to: '/markets', icon: ChartLine },
  { id: 'news', label: 'News', to: '/news', icon: Newspaper, badge: { count: 3, label: 'new news about your holdings' } },
  { id: 'standings', label: 'Standings', to: '/standings', icon: Trophy },
  { id: 'learn', label: 'Learn', to: '/learn', icon: GraduationCap },
];

const STATUS_LIVE = `Market open · 37:17:42 left · Session 2 of 8`;

/* ─── Foundations ───────────────────────────────────────────────────────────── */

const TYPE_STYLES: Array<[string, string, string]> = [
  ['t-large-title t-emph', 'Large Title', 'Portfolio'],
  ['t-title-1 t-emph', 'Title 1', 'Order filled'],
  ['t-title-2 t-emph', 'Title 2', 'Kraken Shipping Lines'],
  ['t-title-3 t-emph', 'Title 3', 'No positions yet'],
  ['t-headline', 'Headline', 'Your position'],
  ['t-body', 'Body', 'Buys right away at about the current price.'],
  ['t-callout', 'Callout', 'Update ready'],
  ['t-subhead', 'Subhead', 'Up 2.31% this session. Range Ð81.90 to Ð84.60.'],
  ['t-footnote', 'Footnote', 'Cash available to trade: Ð248,349.55'],
  ['t-caption-1', 'Caption 1', 'As of tick 1,284 · 14:02:30'],
  ['t-caption-2', 'Caption 2', 'Standings'],
  ['t-amount num', 'Amount', '500'],
];

const SWATCHES: Array<[string, string]> = [
  ['--bg-grouped', 'Grouped page'],
  ['--cell', 'Cell'],
  ['--elevated', 'Sheet'],
  ['--elevated-cell', 'Row in sheet'],
  ['--label', 'Label'],
  ['--label-2', 'Label 2'],
  ['--label-3', 'Label 3'],
  ['--separator', 'Separator'],
  ['--control-off', 'Control off'],
  ['--fill', 'Fill'],
  ['--tint', 'Tint'],
  ['--tint-soft', 'Tint soft'],
  ['--prominent', 'Prominent'],
  ['--accent', 'Accent'],
  ['--gain', 'Gain'],
  ['--gain-fill', 'Gain fill'],
  ['--loss', 'Loss'],
  ['--loss-fill', 'Loss fill'],
  ['--segment-thumb', 'Segment thumb'],
  ['--chart-baseline', 'Chart baseline'],
  ['--seal-crimson', 'Seal crimson'],
  ['--seal-brass', 'Seal brass'],
];

export function FoundationsSection() {
  return (
    <KitSection id="foundations" title="Type, colour and glass" spec="MOBILE §2.6 tokens · §3.3 Dynamic Type · §2.4 glass">
      {() => (
        <div className="kit-grid">
          <KitDemo label="Dynamic Type scale">
            <div className="kit-type">
              {TYPE_STYLES.map(([cls, name, sample]) => (
                <div key={name} className="kit-type__row">
                  <span className="kit-type__name">{name}</span>
                  <span className={`kit-type__sample ${cls}`}>{sample}</span>
                </div>
              ))}
            </div>
          </KitDemo>
          <KitDemo label="Semantic colour tokens">
            <ul className="kit-swatches" role="list">
              {SWATCHES.map(([token, name]) => (
                <li key={token} className="kit-swatch">
                  <span className="kit-swatch__chip" style={{ background: `var(${token})` }} aria-hidden="true" />
                  <span className="kit-swatch__name">{name}</span>
                  <code className="kit-swatch__token">{token}</code>
                </li>
              ))}
            </ul>
          </KitDemo>
          <KitDemo label="Glass over busy content (text roles allowed on glass)">
            <div className="kit-glass-demo">
              <div className="kit-glass-demo__content" aria-hidden="true">
                {HOLDINGS.slice(0, 4).map((h) => (
                  <span key={h.ticker} className="kit-glass-demo__stripe">
                    {h.name} {formatMoneyCents(h.value)}
                  </span>
                ))}
              </div>
              <div className="kit-glass-demo__panel glass">
                <span className="t-headline">Label on glass</span>
                <span className="t-subhead" style={{ color: 'var(--label-2)' }}>
                  Label 2 on glass
                </span>
                <span className="t-subhead" style={{ color: 'var(--tint-strong)' }}>
                  Tint strong on glass
                </span>
                <span className="t-subhead" style={{ color: 'var(--destructive-strong)' }}>
                  Destructive strong on glass
                </span>
              </div>
            </div>
          </KitDemo>
        </div>
      )}
    </KitSection>
  );
}

/* ─── Navigation ────────────────────────────────────────────────────────────── */

/**
 * Filler rows under the chrome demos. Each preview names its list differently (landmark names must
 * be unique on the page) and a list under a large title (the preview's h1) is an h2.
 */
function FakeRows({ count = 4, header, headingLevel = 3 }: { count?: number; header: string; headingLevel?: 2 | 3 }) {
  return (
    <div className="kit-phone__content">
      <InsetGroupedList header={header} headingLevel={headingLevel}>
        {HOLDINGS.slice(0, count).map((h, i) => (
          <StockRow
            key={h.ticker}
            ticker={h.ticker}
            name={h.name}
            sector={h.sector}
            priceText={formatMoneyCents(h.last)}
            priceSpoken={spokenMoney(h.last)}
            change={h.sessionChange}
            changeContext="this session"
            sparkline={<Sparkline values={sessionSpark(h, i + 1)} reference={h.last - h.sessionChangePerShare} />}
            onClick={noop}
          />
        ))}
      </InsetGroupedList>
    </div>
  );
}

function TabBarDemo({ initial, label }: { initial: string; label?: string }) {
  const [path, setPath] = useState(initial);
  return (
    <TabBar
      items={TABS}
      label={label}
      pathname={path}
      onItemClick={(item, { event }) => {
        event.preventDefault();
        setPath(item.to);
      }}
    />
  );
}

export function NavigationSection() {
  return (
    <KitSection id="navigation" title="Tab bar and top bar" spec="MOBILE §5.1 TabBar · §5.2 LargeTitleNavBar">
      {() => (
        <div className="kit-grid">
          <KitDemo label="TabBar · Portfolio selected, News badge (tap to switch)">
            <PhoneFrame height={236} label="Tab bar preview">
              <FakeRows count={3} header="Your holdings" />
              <TabBarDemo initial="/portfolio" />
            </PhoneFrame>
          </KitDemo>
          <KitDemo label="TabBar · pushed screen keeps Markets selected">
            <PhoneFrame height={236} label="Tab bar on a pushed screen">
              <FakeRows count={3} header="Watchlist" />
              <TabBarDemo initial="/markets/company/KRKN" label="Main (pushed screen preview)" />
            </PhoneFrame>
          </KitDemo>
          <KitDemo label="LargeTitleNavBar · expanded tab root with status line and banner">
            <PhoneFrame height={330} label="Expanded top bar">
              <LargeTitleNavBar
                title="Portfolio"
                collapsed={false}
                subtitle="Open · 37:17:42"
                trailing={
                  <NavBarButton label="Account for Saltwind Traders" variant="avatar">
                    <Crest initials="SW" size={32} />
                  </NavBarButton>
                }
                statusLine={
                  <StatusLine tone="paused" onPress={noop}>
                    Trading paused · Clock stopped while paused
                  </StatusLine>
                }
                banner={
                  <Banner
                    tone="paused"
                    title="Trading paused"
                    flavor="Becalmed"
                    body={`The host paused the market at tick ${formatNumber(AS_OF_TICK)}. You can preview orders, but you can't place them until trading resumes.`}
                    headingLevel={2}
                  />
                }
              />
            </PhoneFrame>
          </KitDemo>
          <KitDemo label="LargeTitleNavBar · collapsed company page (glass bar, Back, Star + More)">
            <PhoneFrame height={250} label="Collapsed top bar" scrollTop={150}>
              <LargeTitleNavBar
                title="Kraken Shipping Lines"
                inlineTitle="KRKN"
                collapsed
                subtitle={<StockBarSubtitle price={KRKN.last} sessionChange={KRKN.sessionChange} />}
                back={{ label: 'Markets', onBack: noop }}
                trailing={
                  <NavBarButtonGroup>
                    <NavBarButton label="Add KRKN to watchlist" icon={Star} />
                    <NavBarButton label="More options" icon={Ellipsis} />
                  </NavBarButtonGroup>
                }
                statusLine={<StatusLine tone="open">{STATUS_LIVE}</StatusLine>}
              />
              <FakeRows count={4} header="All companies" headingLevel={2} />
            </PhoneFrame>
          </KitDemo>
          <KitDemo label="LargeTitleNavBar · collapsed Markets with pinned search">
            <PhoneFrame height={200} label="Collapsed top bar with pinned search" scrollTop={90}>
              <LargeTitleNavBar
                title="Markets"
                collapsed
                pinnedSearch={<SearchField pinned value="" onChange={noop} placeholder="Search companies and funds" />}
                statusLine={<StatusLine tone="open">{STATUS_LIVE}</StatusLine>}
              />
              <FakeRows count={3} header="Recent" headingLevel={2} />
            </PhoneFrame>
          </KitDemo>
          <KitDemo label="StatusLine · open, paused, lobby">
            <div className="kit-stack">
              <StatusLine tone="open" onPress={noop}>
                {STATUS_LIVE}
              </StatusLine>
              <StatusLine tone="paused">Trading paused · Clock stopped while paused</StatusLine>
              <StatusLine tone="idle">In the lobby · Anchored in port</StatusLine>
            </div>
          </KitDemo>
        </div>
      )}
    </KitSection>
  );
}

/* ─── Search ────────────────────────────────────────────────────────────────── */

/** Everything the sample search looks through: the crew's positions plus the other quotes (the whole roster). */
const SEARCHABLE = [...HOLDINGS, ...QUOTES];

function SearchDemo({ initial, pinned = false, label }: { initial: string; pinned?: boolean; label: string }) {
  const [q, setQ] = useState(initial);
  const matches = useMemo(
    () => (q ? SEARCHABLE.filter((c) => `${c.ticker} ${c.name}`.toLowerCase().includes(q.toLowerCase())) : []),
    [q],
  );
  return (
    <div className={pinned ? 'kit-glass-strip glass' : undefined}>
      <SearchField
        value={q}
        onChange={setQ}
        pinned={pinned}
        placeholder={`Search ${SEARCHABLE.length} companies`}
        label={label}
        announcement={q ? `${matches.length} ${matches.length === 1 ? 'result' : 'results'}` : ''}
      />
    </div>
  );
}

export function SearchSection() {
  return (
    <KitSection id="search" title="Search field" spec="MOBILE §5.3 SearchField">
      {() => (
        <div className="kit-grid">
          <KitDemo label="Idle (inline, --fill)">
            <SearchDemo initial="" label="Search companies (idle demo)" />
          </KitDemo>
          <KitDemo label="Typing (Clear button; focus shows Cancel)">
            <SearchDemo initial="kra" label="Search companies (typing demo)" />
          </KitDemo>
          <KitDemo label="Pinned in a glass bar (--fill-on-glass)">
            <SearchDemo initial="" pinned label="Search companies (pinned demo)" />
          </KitDemo>
          <KitDemo label="No results">
            <EmptyState title="No companies match “KRAKN”" body="Try a symbol like KRKN or part of a company name." icon={Search} headingLevel={3} />
          </KitDemo>
        </div>
      )}
    </KitSection>
  );
}

/* ─── Lists and rows ────────────────────────────────────────────────────────── */

const KRKN_AVG = (value: number | null, scope: PeerComparison['scope'] = 'sector'): PeerComparison => ({
  scope,
  sector: 'Shipping & Salvage',
  value,
  count: scope === 'sector' ? 2 : 14,
});

function ActivityIcon({ kind }: { kind: 'buy' | 'sell' | 'rejected' }) {
  const Icon = kind === 'buy' ? CirclePlus : kind === 'sell' ? CircleMinus : TriangleAlert;
  return (
    <span className="kit-icon-circle" aria-hidden="true">
      <Icon size={20} strokeWidth={1.75} />
    </span>
  );
}

function StandingLeading({ rank, initials }: { rank: number; initials: string }) {
  return (
    <span className="kit-standing-leading">
      <span className="kit-standing-leading__rank t-headline num">{rank}</span>
      <Crest initials={initials} size={32} />
    </span>
  );
}

export function ListsSection() {
  const [solidBars, setSolidBars] = useState(false);
  const [homeTip, setHomeTip] = useState(true);
  return (
    <KitSection id="lists" title="Inset grouped lists and rows" spec="MOBILE §5.4 InsetGroupedList · §5.5 ListRow variants">
      {() => (
        <div className="kit-grid">
          <KitDemo label="StockRow · up, down, flat (Markets movers)">
            <InsetGroupedList header="Biggest moves this session" headingLevel={3} headerAction={<button type="button">See all</button>}>
              {[QUOTES[0]!, FDUT, { ...QUOTES[6]!, change: 0 }].map((c, i) => {
                const price = 'price' in c ? c.price : c.last;
                const change = 'change' in c ? c.change : c.sessionChange;
                return (
                  <StockRow
                    key={c.ticker}
                    ticker={c.ticker}
                    name={c.name}
                    sector={c.sector}
                    priceText={formatMoneyCents(price)}
                    priceSpoken={spokenMoney(price)}
                    change={change}
                    changeContext="this session"
                    sparkline={<Sparkline values={sessionSpark({ last: price, sessionChangePerShare: Math.round(price * change) }, i + 7)} tone={change === 0 ? 'neutral' : 'auto'} />}
                    to={`/markets/company/${c.ticker}`}
                  />
                );
              })}
            </InsetGroupedList>
          </KitDemo>

          <KitDemo label="HoldingRow composition · value over change (Portfolio top 5)">
            <InsetGroupedList header="Positions" headingLevel={3} headerAction={<button type="button">See all 7</button>}>
              {HOLDINGS.slice(0, 5).map((h) => (
                <ListRow
                  key={h.ticker}
                  to={`/markets/company/${h.ticker}`}
                  leading={<Crest ticker={h.ticker} sector={h.sector} size={36} />}
                  leadingWidth={36}
                  title={<span className="kit-mono-ticker">{h.ticker}</span>}
                  subtitle={`${formatNumber(h.shares)} shares`}
                  trailing={
                    <span className="kit-trailing-stack">
                      <MoneyText cents={h.value} className="t-body t-emph" />
                      <SignedChange value={h.totalGainPct} kind="pct" strong className="t-footnote" decorative />
                    </span>
                  }
                  aria-label={`${h.name}, ${h.ticker}, ${spokenMoney(h.value)}, ${changeParts(h.totalGainPct).spoken} since you bought`}
                />
              ))}
            </InsetGroupedList>
          </KitDemo>

          <KitDemo label="KeyValueRow with InfoTip · plain header, footer">
            <InsetGroupedList header="Balances" headerVariant="plain" headingLevel={3} footer="Starting cash was Ð250,000.00.">
              <KeyValueRow label="Account value" info={<Tip id="accountValue" />} value={formatMoneyCents(ACCOUNT.value)} />
              <KeyValueRow label="Cash available to trade" info={<Tip id="cashAvailable" />} value={formatMoneyCents(ACCOUNT.cash)} />
              <KeyValueRow label="Fees paid" info={<Tip id="feesPaid" />} value="Ð1,240.33" valueTone="secondary" />
              <KeyValueRow label="Trades made" value="23" valueTone="secondary" />
            </InsetGroupedList>
          </KitDemo>

          <KitDemo label="ExplainRow · sector average, market average, not meaningful, highlighted">
            <InsetGroupedList header="Key stats" headingLevel={3}>
              <ExplainRow label={explainLabel('peRatio')} info={<Tip id="peRatio" />} explained={explainMetric('peRatio', 17.8, KRKN_AVG(22.1), 'Ð')} />
              <ExplainRow label={explainLabel('netMargin')} info={<Tip id="netMargin" />} explained={explainMetric('netMargin', 0.14, KRKN_AVG(0.1), 'Ð')} highlighted />
              <ExplainRow label={explainLabel('debtToEquity')} info={<Tip id="debtToEquity" />} explained={explainMetric('debtToEquity', 0.62, KRKN_AVG(0.95), 'Ð')} />
              <ExplainRow label={explainLabel('dividendYield')} info={<Tip id="dividendYield" />} explained={explainMetric('dividendYield', 0.019, KRKN_AVG(0.012, 'market'), 'Ð')} />
              <ExplainRow label={explainLabel('forwardPe')} info={<Tip id="forwardPe" />} explained={explainMetric('forwardPe', null, KRKN_AVG(21.3), 'Ð')} />
            </InsetGroupedList>
          </KitDemo>

          <KitDemo label="ActivityRow composition · bought, sold, not placed">
            <InsetGroupedList header="Recent activity" headingLevel={3}>
              <ListRow
                to="/portfolio/activity/BX-7Q2F9K"
                leading={<ActivityIcon kind="buy" />}
                leadingWidth={32}
                title="Bought 500 KRKN"
                subtitle={<span className="num">Tick 1,284 · 14:02:30</span>}
                trailing={
                  <span className="kit-trailing-stack">
                    <span className="t-body num">−Ð42,102.06</span>
                    <span className="t-footnote kit-secondary">Filled</span>
                  </span>
                }
              />
              <ListRow
                to="/portfolio/activity/BX-3M8D1Q"
                leading={<ActivityIcon kind="sell" />}
                leadingWidth={32}
                title="Sold 400 FDUT"
                subtitle={<span className="num">Tick 1,201 · 13:21:00</span>}
                trailing={
                  <span className="kit-trailing-stack">
                    <span className="t-body num">+Ð7,289.71</span>
                    <span className="t-footnote kit-secondary">Filled</span>
                  </span>
                }
              />
              <ListRow
                to="/portfolio/activity/BX-9K2L4T"
                leading={<ActivityIcon kind="rejected" />}
                leadingWidth={32}
                title="Buy 4,000 KRKN"
                subtitle={<span className="num">Tick 1,180 · 13:10:30</span>}
                trailing={
                  <span className="kit-trailing-stack">
                    <span className="t-body num">Ð0.00</span>
                    <span className="t-footnote kit-secondary">Not enough cash</span>
                  </span>
                }
              />
            </InsetGroupedList>
          </KitDemo>

          <KitDemo label="StandingRow composition · your crew highlighted with YouPill">
            <InsetGroupedList header="Standings" headingLevel={3} footer="Ranked by account value.">
              {STANDINGS.map((s) => (
                <ListRow
                  key={s.rank}
                  onClick={noop}
                  highlighted={s.you}
                  leading={<StandingLeading rank={s.rank} initials={s.initials} />}
                  leadingWidth={72}
                  title={
                    <span className="kit-inline">
                      {s.crew}
                      {s.you ? <YouPill>You</YouPill> : null}
                    </span>
                  }
                  subtitle={<span className="num">{formatMoneyCents(s.value)}</span>}
                  trailing={
                    <span className="kit-trailing-row">
                      <ChangePill value={s.totalReturn} />
                      <span className="kit-move t-caption-1 num">
                        {s.move === 0 ? (
                          <span className="ios-sr-only">No change in place</span>
                        ) : (
                          <>
                            <ChangeTriangle direction={s.move > 0 ? 'up' : 'down'} />
                            <span aria-hidden="true">{Math.abs(s.move)}</span>
                            <span className="ios-sr-only">{`${s.move > 0 ? 'up' : 'down'} ${Math.abs(s.move)} ${Math.abs(s.move) === 1 ? 'place' : 'places'}`}</span>
                          </>
                        )}
                      </span>
                    </span>
                  }
                />
              ))}
            </InsetGroupedList>
          </KitDemo>

          <KitDemo label="DisclosureRow · icon tile, subtitle, detail · ActionRow · ToggleRow">
            <div className="kit-stack kit-stack--lists">
              <InsetGroupedList header="Learn" headingLevel={3}>
                <DisclosureRow icon={BookOpen} title="How the game works" subtitle="Cash, ticks, sessions, news and fees" to="/learn/guide" />
                <DisclosureRow icon={ListChecks} title="Read a company in 5 questions" to="/learn/five-questions" />
                <DisclosureRow icon={Type} title="Text size" detail="Follows iPhone" onClick={noop} />
              </InsetGroupedList>
              <InsetGroupedList
                header="Display"
                headerVariant="plain"
                headingLevel={3}
                footer="Turns off see-through bars. Use it if text on the bars is hard to read."
              >
                <ToggleRow title="Solid bars" checked={solidBars} onChange={setSolidBars} />
                <ToggleRow
                  title="Keep crews and passwords"
                  subtitle="Crews keep their names and passwords, and each starts again with Ð250,000.00."
                  checked={homeTip}
                  onChange={setHomeTip}
                />
                <ToggleRow title="Keep crews and passwords" subtitle="Settings stay locked until you start a new game." checked onChange={noop} disabled />
              </InsetGroupedList>
              <InsetGroupedList aria-label="Account actions">
                <ActionRow onClick={noop}>Clear recent searches</ActionRow>
                <DestructiveRow onClick={noop}>Sign out</DestructiveRow>
              </InsetGroupedList>
            </div>
          </KitDemo>

          <KitDemo label="Stacked (large-text) rows · forced with the stacked prop">
            <InsetGroupedList header="Order" headingLevel={3}>
              <KeyValueRow label="Cash available to trade" info={<Tip id="cashAvailable" />} value={formatMoneyCents(ACCOUNT.cash)} stacked />
              <ExplainRow label={explainLabel('currentRatio')} info={<Tip id="currentRatio" />} explained={explainMetric('currentRatio', 1.84, KRKN_AVG(1.35), 'Ð')} stacked />
              <DisclosureRow title="Order number" detail={<span className="font-mono">BX-7Q2F9K</span>} stacked />
            </InsetGroupedList>
          </KitDemo>

          <KitDemo label="Rows inside a sheet surface (--elevated-cell)">
            <div className="kit-sheet-surface">
              <InsetGroupedList header="Estimated cost" headerVariant="plain" headingLevel={3} surface="sheet">
                <KeyValueRow label="Order value" value="Ð42,060.00" />
                <KeyValueRow label="Fee (0.10%)" info={<Tip id="fee" />} value="Ð42.06" />
                <KeyValueRow label="Total cost" value={<strong>Ð42,102.06</strong>} />
                <KeyValueRow label="Cash after" value="Ð206,247.49" valueTone="secondary" />
              </InsetGroupedList>
            </div>
          </KitDemo>
        </div>
      )}
    </KitSection>
  );
}

/* ─── Controls ──────────────────────────────────────────────────────────────── */

function Seg<T extends string>({ initial, ...props }: { initial: T; options: Array<{ value: T; label: string; disabled?: boolean }>; ariaLabel: string; size?: 'regular' | 'large'; menuLabel?: string }) {
  const [value, setValue] = useState<T>(initial);
  return <SegmentedControl {...props} value={value} onChange={setValue} />;
}

/** Disabled button described by its reason. useId: the Both appearance renders every demo twice. */
function DisabledWithReason() {
  const reasonId = useId();
  return (
    <>
      <Button fullWidth disabled aria-describedby={reasonId}>
        Preview order
      </Button>
      <p id={reasonId} className="t-footnote kit-secondary">
        You&apos;re offline
      </p>
    </>
  );
}

export function ControlsSection() {
  const [joined, setJoined] = useState(50);
  const [low, setLow] = useState(10);
  const [checked, setChecked] = useState(true);
  return (
    <KitSection id="controls" title="Segmented controls, buttons, toggles, steppers" spec="MOBILE §5.6 · §5.7 · §5.24 · §5.25">
      {() => (
        <div className="kit-grid">
          <KitDemo label="SegmentedControl · chart range, disabled segment">
            <div className="kit-stack">
              <Seg ariaLabel="Chart range" initial="all" options={RANGE_TABS.map((t) => ({ value: t.key, label: t.label, disabled: t.key === '15m' }))} />
              <Seg ariaLabel="Standings order" initial="total" options={[{ value: 'total', label: 'Total return' }, { value: 'session', label: 'This session' }]} />
              <Seg ariaLabel="News filter" initial="all" options={[{ value: 'all', label: 'All' }, { value: 'holdings', label: 'My holdings' }, { value: 'watchlist', label: 'Watchlist' }]} />
            </div>
          </KitDemo>
          <KitDemo label="SegmentedControl · Buy | Sell (36px), Shares | Doubloons, 5 views">
            <div className="kit-stack">
              <Seg ariaLabel="Order side" size="large" initial="buy" options={[{ value: 'buy', label: 'Buy' }, { value: 'sell', label: 'Sell' }]} />
              <Seg ariaLabel="Order by" initial="shares" options={[{ value: 'shares', label: 'Shares' }, { value: 'amount', label: 'Doubloons' }]} />
              <Seg
                ariaLabel="Company list view"
                menuLabel="View"
                initial="basics"
                options={[
                  { value: 'basics', label: 'Basics' },
                  { value: 'price', label: 'Price' },
                  { value: 'value', label: 'Value' },
                  { value: 'health', label: 'Health' },
                  { value: 'analysts', label: 'Analysts' },
                ]}
              />
            </div>
          </KitDemo>

          <KitDemo label="Buttons · every style at large, medium and small" wide>
            <div className="kit-button-grid">
              {(
                [
                  ['Prominent', 'filled', 'default', 'Preview order'],
                  ['Buy', 'filled', 'buy', 'Buy'],
                  ['Sell', 'filled', 'sell', 'Sell'],
                  ['Tinted', 'tinted', 'default', 'Use max (2,949 shares)'],
                  ['Tinted Sell', 'tinted', 'sell', 'Sell'],
                  ['Gray', 'gray', 'default', 'Trade again'],
                  ['Plain', 'plain', 'default', 'Edit order'],
                  ['Destructive plain', 'plain', 'destructive', 'Discard order'],
                  ['Destructive tinted', 'tinted', 'destructive', 'End game…'],
                ] as const
              ).map(([name, variant, btnTone, label]) => (
                <div key={name} className="kit-button-row">
                  <span className="kit-button-row__name">{name}</span>
                  <Button variant={variant} tone={btnTone} size="large">
                    {label}
                  </Button>
                  <Button variant={variant} tone={btnTone} size="medium">
                    {label}
                  </Button>
                  <Button variant={variant} tone={btnTone} size="small">
                    {label}
                  </Button>
                </div>
              ))}
            </div>
          </KitDemo>
          <KitDemo label="Button states · disabled with reason, loading, icon, full width, glass">
            <div className="kit-stack">
              <DisabledWithReason />
              <Button fullWidth tone="buy" loading loadingLabel="Placing order…">
                Place order
              </Button>
              <div className="kit-inline">
                <Button variant="gray" size="medium" icon={ArrowUpDown}>
                  Sort
                </Button>
                <Button variant="tinted" size="medium" icon={BookOpen}>
                  Open in Learn
                </Button>
              </div>
              <div className="kit-glass-backdrop">
                <Button variant="glass" size="medium" icon={Star}>
                  Watchlist
                </Button>
              </div>
            </div>
          </KitDemo>

          <KitDemo label="Toggle · on, off, disabled">
            <div className="kit-inline">
              <Toggle checked={checked} onChange={setChecked} aria-label="Solid bars" />
              <Toggle checked={!checked} onChange={(v) => setChecked(!v)} aria-label="Show the install tip" />
              <Toggle checked disabled onChange={noop} aria-label="Keep crews and passwords (locked)" />
              <Toggle checked={false} disabled onChange={noop} aria-label="Solid bars (locked)" />
            </div>
          </KitDemo>
          <KitDemo label="Stepper · joined (host setting), at minimum, split (ticket)">
            <div className="kit-stack">
              <div className="kit-inline">
                <Stepper value={joined} onChange={setJoined} min={10} max={100} step={5} decrementLabel="Decrease position limit" incrementLabel="Increase position limit" groupLabel="Position limit" />
                <span className="t-body num">{joined}%</span>
              </div>
              <div className="kit-inline">
                <Stepper value={low} onChange={setLow} min={10} max={100} step={5} decrementLabel="Decrease fee" incrementLabel="Increase fee" groupLabel="Fee" />
                <span className="t-body num">{low} bps</span>
              </div>
              <Stepper value={500} onChange={noop} variant="split" decrementLabel="Decrease shares" incrementLabel="Increase shares" groupLabel="Number of shares">
                <span className="t-title-2 t-emph num">500</span>
              </Stepper>
            </div>
          </KitDemo>
        </div>
      )}
    </KitSection>
  );
}

/* ─── Pills, crests, signed values ──────────────────────────────────────────── */

export function BadgesSection() {
  return (
    <KitSection id="badges" title="Pills, crests and signed values" spec="MOBILE §5.20 Badge/Pill · §5.21 Crest · §3.4 numbers">
      {() => (
        <div className="kit-grid">
          <KitDemo label="ChangePill · up, down, flat · TagPill · YouPill · CountBadge · StatusDot">
            <div className="kit-stack">
              <div className="kit-inline">
                <ChangePill value={0.0231} />
                <ChangePill value={-0.0346} />
                <ChangePill value={0} />
                <ChangePill value={0.0079} text="+Ð8,510.00" spoken="up 8,510.00 doubloons" />
              </div>
              <div className="kit-inline">
                <TagPill>You own this</TagPill>
                <TagPill icon={Newspaper}>Earnings</TagPill>
                <TagPill icon={Anchor}>Whole market</TagPill>
                <YouPill>You</YouPill>
                <CountBadge count={3} label="3 new news items about your holdings" />
                <CountBadge count={120} label="120 new news items" />
              </div>
              <div className="kit-inline">
                <span className="kit-inline t-subhead">
                  <StatusDot tone="open" /> Market open
                </span>
                <span className="kit-inline t-subhead">
                  <StatusDot tone="paused" /> Trading paused
                </span>
                <span className="kit-inline t-subhead">
                  <StatusDot tone="idle" /> Game ended
                </span>
              </div>
            </div>
          </KitDemo>
          <KitDemo label="Crest · sizes 28–64 · every sector fill · crew (hull)">
            <div className="kit-stack">
              <div className="kit-inline kit-inline--end">
                {([28, 32, 36, 44, 64] as const).map((size) => (
                  <Crest key={size} ticker="KRKN" sector="Shipping & Salvage" size={size} />
                ))}
                <Crest initials="SW" size={44} />
              </div>
              <ul className="kit-crest-list" role="list">
                {SECTORS.map((sector: Sector) => (
                  <li key={sector} className="kit-crest-list__item">
                    <Crest ticker={sector.replace(/[^A-Za-z]/g, '').slice(0, 2)} sector={sector} size={36} />
                    <span className="t-footnote">{sector}</span>
                  </li>
                ))}
              </ul>
            </div>
          </KitDemo>
          <KitDemo label="SignedChange and MoneyText">
            <dl className="kit-dl">
              <dt>Total gain, strong</dt>
              <dd>
                <SignedChange value={KRKN.totalGain} kind="money" pct={KRKN.totalGainPct} strong />
              </dd>
              <dt>Loss with percent</dt>
              <dd>
                <SignedChange value={FDUT.totalGain} kind="money" pct={FDUT.totalGainPct} />
              </dd>
              <dt>Session line, 10px caret, suffix</dt>
              <dd className="t-body">
                <SignedChange value={190} kind="money" pct={0.0231} suffix="this session" caretSize={10} strong />
              </dd>
              <dt>Flat</dt>
              <dd>
                <SignedChange value={0} kind="pct" />
              </dd>
              <dt>Index points</dt>
              <dd>
                <SignedChange value={8.71} kind="number" pct={0.0084} />
              </dd>
              <dt>Plain tone (on glass)</dt>
              <dd className="kit-glass-strip glass">
                <SignedChange value={-0.0346} kind="pct" tone="plain" />
              </dd>
              <dt>MoneyText</dt>
              <dd>
                <MoneyText cents={ACCOUNT.value} className="t-title-2 t-emph" />
              </dd>
            </dl>
          </KitDemo>
        </div>
      )}
    </KitSection>
  );
}

/* ─── Quote and position ────────────────────────────────────────────────────── */

const renderTip = (id: string) => <Tip id={id} />;

function LinkedQuote() {
  const [scrub, setScrub] = useState<StockHeaderScrub | null>(null);
  const [range, setRange] = useState('all');
  const stats = seriesStats(KRKN_SESSION, 8222);
  return (
    <div className="kit-stack">
      <StockHeader
        name={KRKN.name}
        ticker={KRKN.ticker}
        sector={KRKN.sector}
        price={KRKN.last}
        sessionOpen={8222}
        sessionChange={KRKN.sessionChange}
        tick={AS_OF_TICK}
        timeText={AS_OF_TIME}
        scrub={scrub}
        renderInfoTip={renderTip}
        headingLevel={2}
      />
      <ChartCard
        label="KRKN price"
        points={KRKN_SESSION}
        summary={stats ? chartSummary('session', stats, MONEY) : ''}
        formatters={{ ...MONEY, formatX: tickTime }}
        reference={{ y: 8222, label: 'Session open' }}
        ranges={RANGE_TABS}
        range={range}
        onRangeChange={setRange}
        onScrub={(p) => setScrub(headerScrubFromChart(p))}
      />
    </div>
  );
}

export function QuoteSection() {
  return (
    <KitSection id="quote" title="Stock header, position summary" spec="MOBILE §5.14 StockHeader · §5.15 PositionSummary">
      {() => (
        <div className="kit-grid">
          <KitDemo label="StockHeader + ChartCard wired (scrub the chart: header shows the scrubbed tick)">
            <LinkedQuote />
          </KitDemo>
          <KitDemo label="StockHeader · scrubbing state · loss">
            <div className="kit-stack">
              <StockHeader
                name={KRKN.name}
                ticker={KRKN.ticker}
                sector={KRKN.sector}
                price={KRKN.last}
                sessionOpen={8222}
                sessionChange={KRKN.sessionChange}
                tick={AS_OF_TICK}
                timeText={AS_OF_TIME}
                scrub={{ price: 8406, timeText: '14:01:30', tick: 1282 }}
                headingLevel={2}
              />
              <StockHeader
                name={FDUT.name}
                ticker={FDUT.ticker}
                sector={FDUT.sector}
                price={FDUT.last}
                sessionOpen={FDUT.last - FDUT.sessionChangePerShare}
                sessionChange={FDUT.sessionChange}
                tick={AS_OF_TICK}
                timeText={AS_OF_TIME}
                renderInfoTip={renderTip}
                headingLevel={2}
              />
            </div>
          </KitDemo>
          <KitDemo label="PositionSummary · owned">
            <PositionSummary
              ticker="KRKN"
              holding={{ shares: KRKN.shares, avgCost: KRKN.avgCost }}
              quote={{ price: KRKN.last, sessionOpen: 8222 }}
              accountValue={ACCOUNT.value}
              cash={ACCOUNT.cash}
              renderInfoTip={renderTip}
              headingLevel={3}
            />
          </KitDemo>
          <KitDemo label="PositionSummary · not owned">
            <PositionSummary
              ticker="LVTH"
              holding={null}
              quote={{ price: 5703, sessionOpen: 5458 }}
              accountValue={ACCOUNT.value}
              cash={ACCOUNT.cash}
              renderInfoTip={renderTip}
              title="Your position in LVTH"
              headingLevel={3}
            />
          </KitDemo>
        </div>
      )}
    </KitSection>
  );
}

/* ─── Charts ────────────────────────────────────────────────────────────────── */

function PortfolioChart() {
  const [range, setRange] = useState('all');
  const stats = seriesStats(ACCOUNT_VALUE, ACCOUNT.startingCash);
  return (
    <ChartCard
      label="Account value"
      points={ACCOUNT_VALUE}
      plotHeight={180}
      summary={stats ? chartSummary('total', stats, MONEY) : ''}
      formatters={{ ...MONEY, formatX: tickTime }}
      formatAxis={(cents) => formatMoney(cents, { compact: true })}
      reference={{ y: ACCOUNT.startingCash, label: 'Starting cash' }}
      compare={{ points: COMPOSITE_REBASED, label: 'Pirate Composite' }}
      ranges={RANGE_TABS}
      range={range}
      onRangeChange={setRange}
    />
  );
}

export function ChartsSection() {
  return (
    <KitSection id="charts" title="Charts" spec="MOBILE §5.13 ChartCard, Sparkline, RangeBar, AllocationBar · §7.13 ScatterChart">
      {() => (
        <div className="kit-grid">
          <KitDemo label="ChartCard · portfolio with starting-cash line and composite compare">
            <PortfolioChart />
          </KitDemo>
          <KitDemo label="ChartCard · loading, not enough history, paused">
            <div className="kit-stack">
              <ChartCard label="KRKN price" points={[]} summary="" formatters={{ ...MONEY, formatX: tickTime }} plotHeight={160} loading ranges={RANGE_TABS} range="all" onRangeChange={noop} />
              <ChartCard label="LVTH price" points={KRKN_SESSION.slice(0, 1)} summary="" formatters={{ ...MONEY, formatX: tickTime }} plotHeight={160} />
              <ChartCard
                label="KRKN price"
                points={KRKN_SESSION.slice(-12)}
                summary={chartSummary('session', seriesStats(KRKN_SESSION.slice(-12), KRKN_SESSION.at(-12)?.y)!, MONEY)}
                formatters={{ ...MONEY, formatX: tickTime }}
                plotHeight={160}
                paused
              />
            </div>
          </KitDemo>
          <KitDemo label="Sparkline · gain, loss, neutral, with session-open line, fill width">
            <div className="kit-stack">
              <div className="kit-inline">
                <Sparkline values={sessionSpark(KRKN, 1)} reference={8222} />
                <Sparkline values={sessionSpark(FDUT, 2)} reference={FDUT.last - FDUT.sessionChangePerShare} />
                <Sparkline values={sessionSpark({ last: 5000, sessionChangePerShare: 0 }, 3)} tone="neutral" />
                <Sparkline values={sessionSpark(KRKN, 4)} width={96} height={32} />
              </div>
              <div className="kit-spark-fill">
                <Sparkline values={ACCOUNT_VALUE.map((p) => p.y)} fill height={64} />
              </div>
            </div>
          </KitDemo>
          <KitDemo label="RangeBar · session range and game range">
            <div className="kit-stack">
              <RangeBar low={8190} high={8460} value={8412} formatter={formatMoneyCents} spokenFormatter={spokenMoney} label="Session range" valueLabel="Price" />
              <RangeBar low={5840} high={9120} value={8412} formatter={formatMoneyCents} spokenFormatter={spokenMoney} label="Game range" valueLabel="Price" />
            </div>
          </KitDemo>
          <KitDemo label="AllocationBar · holdings and cash">
            <AllocationBar items={ALLOCATION} legendLabel="Where your money is" />
          </KitDemo>
          <KitDemo label="ScatterChart · health score vs. return (market reveal)" wide>
            <ScatterChart
              points={SCATTER}
              xLabel="Health score (0–100)"
              yLabel="Actual return"
              xDomain={[0, 100]}
              formatX={(x) => formatNumber(x)}
              formatY={(y) => formatPct(y, { signed: true, digits: 0 })}
              trend={{ label: 'Typical return' }}
              callouts={[
                { pointId: 'lvth', text: 'Luckiest: LVTH' },
                { pointId: 'bbrd', text: 'Unluckiest: BBRD' },
              ]}
              legend={{ highlighted: "Your crew's holdings", others: 'Other companies' }}
              summary={`Health score against actual return for ${SCATTER.length} companies. Healthier companies tended to return more. LVTH did much better than its score, and BBRD did much worse.`}
              caption="Each dot is one company. The dashed line shows the typical return for each health score; dots above it did better, and dots below did worse."
              footer={
                <Button variant="plain" size="small">
                  View as list
                </Button>
              }
            />
          </KitDemo>
        </div>
      )}
    </KitSection>
  );
}

/* ─── Feedback ──────────────────────────────────────────────────────────────── */

export function FeedbackSection() {
  return (
    <KitSection id="feedback" title="Banners, empty states and loading" spec="MOBILE §5.12 Banner · §5.18 EmptyState · §5.19 Skeleton">
      {() => (
        <div className="kit-grid">
          <KitDemo label="Banner · every tone">
            <div className="kit-stack">
              <Banner
                tone="paused"
                title="Trading paused"
                flavor="Becalmed"
                body={`The host paused the market at tick ${formatNumber(AS_OF_TICK)}. You can preview orders, but you can't place them until trading resumes.`}
                headingLevel={3}
              />
              <Banner tone="lobby" title="Market not open yet" flavor="Anchored in port" body="Trading opens when the host starts the game. You can research companies and preview orders now." headingLevel={3} />
              <Banner
                tone="ended"
                title="Game ended"
                flavor="Anchors dropped"
                body="Trading is closed for this game. See the final standings and the market reveal."
                action={{ label: 'See final results', onClick: noop }}
                headingLevel={3}
              />
              <Banner tone="offline" title="You're offline" body="Prices and standings will update when you reconnect." headingLevel={3} />
              <Banner tone="tradingDisabled" title="Trading turned off for your crew" body="The host has turned off trading for your crew. You can still research companies and view your account." headingLevel={3} />
              <Banner
                tone="stale"
                title="Prices may be out of date"
                body="The last price update was 2 minutes ago. Wait a moment, or tap Reload."
                action={{ label: 'Reload', onClick: noop }}
                headingLevel={3}
              />
              <Banner tone="finalSession" title="Final session" flavor="Land in sight" body="This is the last of 8 sessions. The game ends in 5:59:42." headingLevel={3} />
              <Banner tone="info" title="Swipe a row for Buy and Sell, or open the company." headingLevel={3} />
            </div>
          </KitDemo>
          <KitDemo label="EmptyState · with action, without, hull variant">
            <div className="kit-stack">
              <div className="kit-card">
                <EmptyState
                  icon={Briefcase}
                  title="No positions yet"
                  body="You haven't bought any shares. Research a company, then place a small order to get started."
                  action={{ label: 'Open Markets', onClick: noop }}
                  flavor="The hold is empty."
                  headingLevel={3}
                />
              </div>
              <div className="kit-card">
                <EmptyState icon={Newspaper} title="No news yet" body="News appears here as it happens during the game." flavor="Quiet seas so far." headingLevel={3} />
              </div>
              <EmptyState
                variant="hull"
                art={<CompassRose size={44} />}
                title="The market reveal isn't open yet"
                body="It opens when the game ends. Until then, the health scores stay hidden."
                flavor="The fog hasn't lifted."
                headingLevel={3}
              />
            </div>
          </KitDemo>
          <KitDemo label="Skeleton · header, chart, rows (shown at once here; 150ms delay in the app)">
            <SkeletonGroup label="Loading prices…" delayMs={0}>
              <div className="kit-stack">
                <SkeletonHeader />
                <SkeletonChart plotHeight={160} />
                <SkeletonList rows={3} />
                <div className="kit-inline">
                  <Skeleton width={120} height={16} />
                  <Skeleton width={64} height={26} radius="capsule" />
                  <Skeleton width={36} height={36} radius="circle" />
                </div>
              </div>
            </SkeletonGroup>
          </KitDemo>
        </div>
      )}
    </KitSection>
  );
}

/* ─── Ticket input ──────────────────────────────────────────────────────────── */

const FEE_RATE = 0.001;

function TicketEntry({ mode }: { mode: 'shares' | 'amount' }) {
  // Starts at BRIEF §7 samples: buy 500 KRKN, or spend Ð5,000.
  const [state, dispatch] = useReducer(keypadReducer, { mode, text: mode === 'shares' ? '500' : '5000' });
  const helperId = useId();
  const value = keypadValue(state);
  let helper: string;
  if (mode === 'shares') {
    helper = `≈ ${formatMoney(Math.round(value * KRKN.last * (1 + FEE_RATE)))} with fee`;
  } else {
    const shares = Math.floor(value / (KRKN.last * (1 + FEE_RATE)));
    const cost = shares * KRKN.last;
    const leftover = value - cost - Math.round(cost * FEE_RATE);
    helper = `≈ ${formatNumber(shares)} shares · ${formatMoney(leftover)} stays as cash`;
  }
  const chips = mode === 'shares' ? ['10', '50', '100', 'Max'] : ['25%', '50%', 'All'];
  return (
    <div className="kit-ticket">
      <Stepper
        value={value}
        onChange={(v) => dispatch(mode === 'shares' ? { type: 'setShares', shares: v } : { type: 'setCents', cents: v })}
        min={0}
        step={mode === 'shares' ? 1 : 10_000}
        variant="split"
        decrementLabel={mode === 'shares' ? 'Decrease shares' : 'Decrease amount'}
        incrementLabel={mode === 'shares' ? 'Increase shares' : 'Increase amount'}
        groupLabel={mode === 'shares' ? 'Number of shares' : 'Amount to spend'}
      >
        <KeypadAmount
          state={state}
          onKey={dispatch}
          label={mode === 'shares' ? 'Number of shares' : 'Amount to spend in doubloons'}
          describedBy={helperId}
          announce={false}
        />
      </Stepper>
      <p id={helperId} className="t-subhead kit-secondary kit-center num">
        {helper}
      </p>
      <div className="kit-inline kit-center">
        {chips.map((chip) => (
          <Button
            key={chip}
            variant="gray"
            size="medium"
            onClick={() => {
              if (/^\d+$/.test(chip)) dispatch({ type: 'setShares', shares: Number(chip) });
            }}
          >
            {chip}
          </Button>
        ))}
      </div>
      <Keypad mode={mode} onKey={dispatch} />
    </div>
  );
}

export function TicketSection() {
  return (
    <KitSection id="ticket" title="Keypad, amount and swipe rows" spec="MOBILE §5.16 TradeTicket input · §5.17 SwipeActions">
      {() => (
        <div className="kit-grid">
          <KitDemo label="Keypad · Shares mode (no decimal key), split stepper, quick chips">
            <TicketEntry mode="shares" />
          </KitDemo>
          <KitDemo label="Keypad · Doubloons mode (decimal key)">
            <TicketEntry mode="amount" />
          </KitDemo>
          <KitDemo label="Keypad · disabled (Placing), compact keys (iPhone SE)">
            <div className="kit-stack">
              <Keypad mode="shares" onKey={noop} disabled />
              <Keypad mode="amount" onKey={noop} compact />
            </div>
          </KitDemo>
          <KitDemo label="SwipeActions · Positions rows (drag left, long-press or right-click for the menu)">
            {/* The Positions screen's card has no header of its own (MOBILE §7.4: the large title names it). */}
            <InsetGroupedList footer="Swipe a row for Buy and Sell, or open the company.">
              {HOLDINGS.slice(0, 3).map((h) => (
                <li key={h.ticker} className="kit-swipe-item">
                  <SwipeActions
                    menuLabel={`Actions for ${h.ticker}`}
                    actions={[
                      { id: 'sell', label: 'Sell', icon: CircleMinus, tone: 'sell', onSelect: noop },
                      { id: 'buy', label: 'Buy', icon: CirclePlus, tone: 'buy', onSelect: noop },
                    ]}
                  >
                    <a
                      className="kit-swipe-row"
                      href={`#company-${h.ticker}`}
                      onClick={(e: MouseEvent) => e.preventDefault()}
                      aria-label={`${h.name}, ${h.ticker}, ${spokenMoney(h.value)}`}
                    >
                      <Crest ticker={h.ticker} sector={h.sector} size={36} />
                      <span className="kit-swipe-row__text">
                        <span className="t-headline">{h.ticker}</span>
                        <span className="t-footnote kit-secondary">{formatNumber(h.shares)} shares</span>
                      </span>
                      <span className="kit-trailing-stack">
                        <span className="t-body t-emph num">{formatMoneyCents(h.value)}</span>
                        <SignedChange value={h.totalGainPct} kind="pct" className="t-footnote" decorative />
                      </span>
                    </a>
                  </SwipeActions>
                </li>
              ))}
            </InsetGroupedList>
          </KitDemo>
          <KitDemo label="InfoTipButton · sheet mode and inline (inside a sheet)">
            <InlineTipDemo />
          </KitDemo>
        </div>
      )}
    </KitSection>
  );
}

function InlineTipDemo() {
  const [open, setOpen] = useState(true);
  const linesId = useId();
  return (
    <div className="kit-sheet-surface">
      <InsetGroupedList header="Preview" headerVariant="plain" headingLevel={3} surface="sheet">
        <KeyValueRow
          label="Fee (0.10%)"
          info={<InfoTipButton entry={termFee} mode="inline" expanded={open} controls={linesId} onClick={() => setOpen((o) => !o)} />}
          value="Ð42.06"
        />
        {open ? (
          <li className="kit-inline-lines">
            <InfoTipLines entry={termFee} density="inline" id={linesId} headingLevel={4} />
          </li>
        ) : null}
        <KeyValueRow label="Price nudge from your order" info={<Tip id="priceImpact" />} value="under 0.01%" />
      </InsetGroupedList>
    </div>
  );
}

const termFee = term('fee');

/* ─── Ornaments ─────────────────────────────────────────────────────────────── */

export function OrnamentsSection() {
  return (
    <KitSection id="ornaments" title="Ornaments" spec="MOBILE §5.22 Medallion/Podium · §5.23 WaxSeal · §5.19 compass loader">
      {() => (
        <div className="kit-grid">
          <KitDemo label="WaxSeal · brass 64 (order filled), crimson 120 (voyage complete), monogram">
            <div className="kit-inline kit-inline--end">
              <WaxSeal tone="brass" size={64} />
              <WaxSeal tone="crimson" size={120} />
              <WaxSeal tone="brass" size={64} monogram="BX" />
            </div>
          </KitDemo>
          <KitDemo label="CompassRose · brass, current colour, loader">
            <div className="kit-inline kit-inline--end">
              <CompassRose size={56} />
              <CompassRose size={44} tone="current" />
              <div className="hull kit-hull-card">
                <CompassLoader label="Loading…" flavor="Charting the course" size={48} />
              </div>
            </div>
          </KitDemo>
          <KitDemo label="Medallion · gold, silver, bronze, 4th">
            <div className="kit-inline kit-inline--end">
              <Medallion rank={1} initials="QA" />
              <Medallion rank={2} initials="TC" />
              <Medallion rank={3} initials="SW" />
              <Medallion rank={4} initials="SL" size={64} />
            </div>
          </KitDemo>
          <KitDemo label="Podium on a hull card (drawn 2-1-3, read 1-2-3)" wide>
            <div className="hull kit-hull-card">
              <p className="kit-voyage font-brand">Voyage complete</p>
              <Podium entries={PODIUM} label="Top three crews" />
              <p className="t-subhead kit-center" style={{ color: 'var(--label-2)' }}>
                Your crew finished 3rd of 14
              </p>
            </div>
          </KitDemo>
        </div>
      )}
    </KitSection>
  );
}
