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
  emoji: string;
}

export const ROSTER: RosterEntry[] = [
  { id: 'blackbeard', name: 'Blackbeard Incorporated', ticker: 'BBRD', sector: 'Naval Arms', emoji: '⚔️' },
  { id: 'davy-jones', name: 'Davy Jones Salvage Co.', ticker: 'DJON', sector: 'Shipping & Salvage', emoji: '🌊' },
  { id: 'kraken', name: 'Kraken Shipping Lines', ticker: 'KRKN', sector: 'Shipping & Salvage', emoji: '🦑' },
  { id: 'calico-jack', name: 'Calico Jack Rum Distillers', ticker: 'CJRD', sector: 'Rum & Provisions', emoji: '🥃' },
  { id: 'port-royal', name: 'Port Royal Banking', ticker: 'PRYL', sector: 'Treasure Banking', emoji: '🏦' },
  { id: 'flying-dutchman', name: 'Flying Dutchman Freight', ticker: 'FDUT', sector: 'Shipping & Salvage', emoji: '⛴️' },
  { id: 'anne-bonny', name: 'Anne Bonny Cartography', ticker: 'ABON', sector: 'Cartography & Navigation', emoji: '🗺️' },
  { id: 'tortuga-tavern', name: 'Tortuga Tavern Group', ticker: 'TRTG', sector: 'Tortuga Hospitality', emoji: '🍺' },
  { id: 'letters-marque', name: 'Letters of Marque Assurance', ticker: 'LMAQ', sector: 'Letters of Marque (Insurance)', emoji: '📜' },
  { id: 'mary-read', name: 'Mary Read Munitions', ticker: 'MRED', sector: 'Naval Arms', emoji: '💣' },
  { id: 'jolly-roger', name: 'Jolly Roger Holdings', ticker: 'JLLY', sector: 'Treasure Banking', emoji: '🏴‍☠️' },
  { id: 'kidd-trust', name: 'Kidd Treasure Trust', ticker: 'KIDD', sector: 'Treasure Banking', emoji: '💰' },
  { id: 'barbossa', name: 'Barbossa Provisions', ticker: 'BRBS', sector: 'Rum & Provisions', emoji: '🍖' },
  { id: 'spyglass', name: 'Spyglass Instruments', ticker: 'SPYG', sector: 'Maps & Instruments', emoji: '🔭' },
  { id: 'compass-rose', name: 'Compass Rose Navigation', ticker: 'CMPS', sector: 'Cartography & Navigation', emoji: '🧭' },
  { id: 'parrot-plume', name: 'Parrot & Plume Livestock', ticker: 'PRRT', sector: 'Parrot & Livestock', emoji: '🦜' },
  { id: 'cursed-doubloon', name: 'Cursed Doubloon Relics', ticker: 'CRSD', sector: 'Cursed Relics', emoji: '💀' },
  { id: 'siren-song', name: 'Siren Song Entertainment', ticker: 'SIRN', sector: 'Tortuga Hospitality', emoji: '🧜' },
  { id: 'cannonbright', name: 'Cannonbright Foundries', ticker: 'CNBR', sector: 'Naval Arms', emoji: '🧨' },
  { id: 'saltbeard', name: 'Saltbeard Shipping', ticker: 'SALT', sector: 'Shipping & Salvage', emoji: '🧂' },
  { id: 'grog-galleon', name: 'Grog & Galleon Brewing', ticker: 'GROG', sector: 'Rum & Provisions', emoji: '🍻' },
  { id: 'maelstrom', name: 'Maelstrom Maritime Insurance', ticker: 'MLSM', sector: 'Letters of Marque (Insurance)', emoji: '🌀' },
  { id: 'astrolabe', name: 'Astrolabe Analytics', ticker: 'ASTR', sector: 'Maps & Instruments', emoji: '⚙️' },
  { id: 'henry-morgan', name: 'Henry Morgan Capital', ticker: 'MRGN', sector: 'Treasure Banking', emoji: '🪙' },
  { id: 'leviathan', name: 'Leviathan Logistics', ticker: 'LVTH', sector: 'Shipping & Salvage', emoji: '🐋' },
];
