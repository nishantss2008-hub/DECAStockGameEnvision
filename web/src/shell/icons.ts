/** Tab icons (MOBILE §6.1, §6.6), kept out of nav.ts so the model stays pure. */
import type { LucideIcon } from 'lucide-react';
import { Briefcase, ChartCandlestick, ChartLine, Gauge, GraduationCap, Megaphone, Newspaper, ScrollText, Trophy, Users } from 'lucide-react';
import type { HostTabId, TabId } from './nav';

export const TAB_ICONS: Record<TabId, LucideIcon> = {
  portfolio: Briefcase,
  markets: ChartLine,
  news: Newspaper,
  standings: Trophy,
  learn: GraduationCap,
};

export const HOST_TAB_ICONS: Record<HostTabId, LucideIcon> = {
  control: Gauge,
  crews: Users,
  market: ChartCandlestick,
  news: Megaphone,
  tape: ScrollText,
};
