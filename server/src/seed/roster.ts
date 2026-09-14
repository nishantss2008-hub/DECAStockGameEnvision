/**
 * The fixed roster of 25 pirate-themed companies, spread across the ten sectors.
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
  { id: 'davy-jones', name: 'Davy Jones Salvage Co.', ticker: 'DJON', sector: 'Shipping & Salvage' },
  { id: 'kraken', name: 'Kraken Shipping Lines', ticker: 'KRKN', sector: 'Shipping & Salvage' },
  { id: 'calico-jack', name: 'Calico Jack Rum Distillers', ticker: 'CJRD', sector: 'Rum & Provisions' },
  { id: 'port-royal', name: 'Port Royal Banking', ticker: 'PRYL', sector: 'Treasure Banking' },
  { id: 'flying-dutchman', name: 'Flying Dutchman Freight', ticker: 'FDUT', sector: 'Shipping & Salvage' },
  { id: 'anne-bonny', name: 'Anne Bonny Cartography', ticker: 'ABON', sector: 'Cartography & Navigation' },
  { id: 'tortuga-tavern', name: 'Tortuga Tavern Group', ticker: 'TRTG', sector: 'Tortuga Hospitality' },
  { id: 'letters-marque', name: 'Letters of Marque Assurance', ticker: 'LMAQ', sector: 'Letters of Marque (Insurance)' },
  { id: 'mary-read', name: 'Mary Read Munitions', ticker: 'MRED', sector: 'Naval Arms' },
  { id: 'jolly-roger', name: 'Jolly Roger Holdings', ticker: 'JLLY', sector: 'Treasure Banking' },
  { id: 'kidd-trust', name: 'Kidd Treasure Trust', ticker: 'KIDD', sector: 'Treasure Banking' },
  { id: 'bartholomew', name: 'Bartholomew Provisions', ticker: 'BRTH', sector: 'Rum & Provisions' },
  { id: 'spyglass', name: 'Spyglass Instruments', ticker: 'SPYG', sector: 'Maps & Instruments' },
  { id: 'compass-rose', name: 'Compass Rose Navigation', ticker: 'CMPS', sector: 'Cartography & Navigation' },
  { id: 'parrot-plume', name: 'Parrot & Plume Livestock', ticker: 'PRRT', sector: 'Parrot & Livestock' },
  { id: 'cursed-doubloon', name: 'Cursed Doubloon Relics', ticker: 'CRSD', sector: 'Cursed Relics' },
  { id: 'siren-song', name: 'Siren Song Entertainment', ticker: 'SIRN', sector: 'Tortuga Hospitality' },
  { id: 'cannonbright', name: 'Cannonbright Foundries', ticker: 'CNBR', sector: 'Naval Arms' },
  { id: 'saltbeard', name: 'Saltbeard Shipping', ticker: 'SALT', sector: 'Shipping & Salvage' },
  { id: 'grog-galleon', name: 'Grog & Galleon Brewing', ticker: 'GROG', sector: 'Rum & Provisions' },
  { id: 'maelstrom', name: 'Maelstrom Maritime Insurance', ticker: 'MLSM', sector: 'Letters of Marque (Insurance)' },
  { id: 'astrolabe', name: 'Astrolabe Analytics', ticker: 'ASTR', sector: 'Maps & Instruments' },
  { id: 'henry-morgan', name: 'Henry Morgan Capital', ticker: 'MRGN', sector: 'Treasure Banking' },
  { id: 'leviathan', name: 'Leviathan Logistics', ticker: 'LVTH', sector: 'Shipping & Salvage' },
];
