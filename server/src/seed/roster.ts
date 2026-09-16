/**
 * The fixed roster of 15 pirate-themed companies: five sectors of exactly three,
 * so every company has a real sector average (`MIN_SECTOR_COMPANIES = 3`).
 * Names, tickers, and sectors are stable; everything else (prices, fundamentals,
 * fate) is generated deterministically from the game seed.
 */

import type { Sector } from '@deca/shared';

export interface RosterEntry {
  id: string; // slug
  name: string;
  ticker: string;
  sector: Sector;
}

export const ROSTER: RosterEntry[] = [
  { id: 'blackbeard', name: 'Blackbeard Incorporated', ticker: 'BBRD', sector: 'Naval Arms' },
  { id: 'kraken', name: 'Kraken Shipping Lines', ticker: 'KRKN', sector: 'Shipping & Salvage' },
  { id: 'calico-jack', name: 'Calico Jack Spice Traders', ticker: 'CJST', sector: 'Provisions & Spice' },
  { id: 'port-royal', name: 'Port Royal Banking', ticker: 'PRYL', sector: 'Treasure Banking' },
  { id: 'flying-dutchman', name: 'Flying Dutchman Freight', ticker: 'FDUT', sector: 'Shipping & Salvage' },
  { id: 'anne-bonny', name: 'Anne Bonny Cartography', ticker: 'ABON', sector: 'Cartography & Navigation' },
  { id: 'mary-read', name: 'Mary Read Munitions', ticker: 'MRED', sector: 'Naval Arms' },
  { id: 'kidd-trust', name: 'Kidd Treasure Trust', ticker: 'KIDD', sector: 'Treasure Banking' },
  { id: 'bartholomew', name: 'Bartholomew Provisions', ticker: 'BRTH', sector: 'Provisions & Spice' },
  { id: 'spyglass', name: 'Spyglass Instruments', ticker: 'SPYG', sector: 'Cartography & Navigation' },
  { id: 'compass-rose', name: 'Compass Rose Navigation', ticker: 'CMPS', sector: 'Cartography & Navigation' },
  { id: 'cannonbright', name: 'Cannonbright Foundries', ticker: 'CNBR', sector: 'Naval Arms' },
  { id: 'galleon-goods', name: 'Galleon Goods Co.', ticker: 'GLGD', sector: 'Provisions & Spice' },
  { id: 'henry-morgan', name: 'Henry Morgan Capital', ticker: 'MRGN', sector: 'Treasure Banking' },
  { id: 'leviathan', name: 'Leviathan Logistics', ticker: 'LVTH', sector: 'Shipping & Salvage' },
];
