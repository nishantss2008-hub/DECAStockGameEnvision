/**
 * Live screen for the dev gallery (kit.html?screen=positions). The gallery's phone frames force the
 * top bar's collapsed state; this page uses the app's real layout instead: the document scrolls
 * (MOBILE §8.3), the top bar and tab bar are fixed siblings of the content, the large title collapses
 * when it passes under the bar (§5.2) and the trailing buttons share one glass capsule until then.
 * e2e/kit.spec.ts drives it in WebKit at 393×852.
 */
import { useState } from 'react';
import { ArrowUpDown, Briefcase, ChartLine, CircleHelp, GraduationCap, Newspaper, Trophy } from 'lucide-react';
import { InsetGroupedList } from '../components/ios/InsetGroupedList';
import { LargeTitleNavBar, NavBarButton, NavBarButtonGroup, StatusLine } from '../components/ios/LargeTitleNavBar';
import { StockRow } from '../components/ios/ListRow';
import { TabBar, type TabBarItem } from '../components/ios/TabBar';
import { Sparkline } from '../components/charts/Sparkline';
import { formatMoneyCents, spokenMoney } from '../components/ios/signedText';
import { HOLDINGS, QUOTES, sessionSpark } from './kitData';
import './kitScreen.css';

const TABS: TabBarItem[] = [
  { id: 'portfolio', label: 'Portfolio', to: '/portfolio', icon: Briefcase },
  { id: 'markets', label: 'Markets', to: '/markets', icon: ChartLine },
  { id: 'news', label: 'News', to: '/news', icon: Newspaper, badge: { count: 3, label: 'new news about your holdings' } },
  { id: 'standings', label: 'Standings', to: '/standings', icon: Trophy },
  { id: 'learn', label: 'Learn', to: '/learn', icon: GraduationCap },
];

const noop = () => {};

export function KitScreen() {
  const [path, setPath] = useState('/portfolio/positions');
  return (
    <div className="kit-screen">
      <LargeTitleNavBar
        title="Positions"
        back={{ label: 'Portfolio', onBack: noop }}
        trailing={
          <NavBarButtonGroup>
            <NavBarButton label="Sort positions" icon={ArrowUpDown} />
            <NavBarButton label="What these numbers mean" icon={CircleHelp} aria-haspopup="dialog" />
          </NavBarButtonGroup>
        }
        statusLine={<StatusLine tone="open">Market open · 37:17:42 left · Session 2 of 8</StatusLine>}
      />
      <main className="kit-screen__content">
        <InsetGroupedList header="Your holdings">
          {HOLDINGS.map((h, i) => (
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
        <InsetGroupedList header="Biggest moves this session">
          {QUOTES.map((q) => (
            <StockRow
              key={q.ticker}
              ticker={q.ticker}
              name={q.name}
              sector={q.sector}
              priceText={formatMoneyCents(q.price)}
              priceSpoken={spokenMoney(q.price)}
              change={q.change}
              changeContext="this session"
              onClick={noop}
            />
          ))}
        </InsetGroupedList>
      </main>
      <TabBar
        items={TABS}
        pathname={path}
        onItemClick={(item, { event }) => {
          event.preventDefault();
          setPath(item.to);
        }}
      />
    </div>
  );
}
