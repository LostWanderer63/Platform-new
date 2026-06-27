/**
 * JewelSymbols (Slot 3 — "Gemstorm")
 * ----------------------------------
 * A jewel set for the tumble/cascade slot. Distinct ids (`j_*`). Same GameSymbol
 * shape + factory, so the win math is reused; only the art (SymbolArtJewel) and
 * the tumble grid differ from the reel slots.
 */
import type { GameSymbol } from './SymbolRegistry';
import { createRegistry } from './SymbolRegistry';

const JEWELS: readonly GameSymbol[] = [
    { id: 'j_red',    name: 'Ruby',    kind: 'normal', rarity: 'common', weight: 48,
      payouts: [4, 12, 35], color: 0xe53935, accent: 0xff8a80, label: '', emblem: 'jewel', tier: 1, animation: 'pulse', effect: 'softGlow' },
    { id: 'j_orange', name: 'Amber',   kind: 'normal', rarity: 'common', weight: 42,
      payouts: [5, 15, 45], color: 0xfb8c00, accent: 0xffcc80, label: '', emblem: 'jewel', tier: 1, animation: 'pulse', effect: 'softGlow' },
    { id: 'j_yellow', name: 'Topaz',   kind: 'normal', rarity: 'rare', weight: 30,
      payouts: [7, 20, 60], color: 0xfdd835, accent: 0xfff59d, label: '', emblem: 'jewel', tier: 2, animation: 'bounce', effect: 'softGlow' },
    { id: 'j_green',  name: 'Emerald', kind: 'normal', rarity: 'rare', weight: 24,
      payouts: [10, 30, 90], color: 0x43a047, accent: 0xa5d6a7, label: '', emblem: 'jewel', tier: 2, animation: 'bounce', effect: 'burst' },
    { id: 'j_blue',   name: 'Sapphire', kind: 'normal', rarity: 'epic', weight: 16,
      payouts: [16, 50, 150], color: 0x1e88e5, accent: 0x90caf9, label: '', emblem: 'jewel', tier: 3, animation: 'bounce', effect: 'burst' },
    { id: 'j_purple', name: 'Amethyst', kind: 'normal', rarity: 'epic', weight: 12,
      payouts: [22, 70, 220], color: 0x8e24aa, accent: 0xce93d8, label: '', emblem: 'jewel', tier: 3, animation: 'bounce', effect: 'lightning' },
    { id: 'j_wild',   name: 'Wild',    kind: 'wild', rarity: 'legendary', weight: 6,
      payouts: [40, 150, 600], color: 0xffffff, accent: 0xfff176, label: 'W', emblem: 'wildgem', tier: 4, animation: 'glow', effect: 'lightning' },
    { id: 'j_star',   name: 'Scatter', kind: 'scatter', rarity: 'legendary', weight: 5,
      payouts: [5, 15, 50], color: 0xffd54f, accent: 0xfff9c4, label: '', emblem: 'star', tier: 4, animation: 'anticipate', effect: 'lightning' },
] as const;

export const JewelRegistry = createRegistry(JEWELS);
export const JEWEL_SYMBOLS = JEWELS;
