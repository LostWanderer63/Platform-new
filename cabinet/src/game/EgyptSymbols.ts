/**
 * EgyptSymbols (Slot 4 — "Pharaoh's Fortune")
 * -------------------------------------------
 * Ancient-Egypt symbol set for the 5×3 payline slot. Distinct ids (`p_*`) so
 * its textures never collide with the other slots in the shared texture cache.
 * Same GameSymbol shape + factory, so all win systems work unchanged — only
 * the art (SymbolArtEgypt) and theme differ.
 */
import type { GameSymbol } from './SymbolRegistry';
import { createRegistry } from './SymbolRegistry';

const EGYPT: readonly GameSymbol[] = [
    // Low pays (common) — the bulk of the reel.
    { id: 'p_ankh',    name: 'Ankh',          kind: 'normal', rarity: 'common', weight: 48,
      payouts: [5, 15, 40],    color: 0x6d4c1e, accent: 0xffd54f, label: '☥', emblem: 'ankh',    tier: 1, animation: 'pulse',  effect: 'softGlow' },
    { id: 'p_lotus',   name: 'Lotus',         kind: 'normal', rarity: 'common', weight: 38,
      payouts: [7, 20, 55],    color: 0x1e5a52, accent: 0x80cbc4, label: '✿', emblem: 'lotus',   tier: 1, animation: 'pulse',  effect: 'softGlow' },

    // Mid pays (rare/epic).
    { id: 'p_scarab',  name: 'Scarab',        kind: 'normal', rarity: 'rare',   weight: 26,
      payouts: [12, 38, 110],  color: 0x0f4c5c, accent: 0x4dd0e1, label: '⛛', emblem: 'scarab',  tier: 2, animation: 'bounce', effect: 'softGlow' },
    { id: 'p_horus',   name: 'Eye of Horus',  kind: 'normal', rarity: 'epic',   weight: 16,
      payouts: [20, 70, 210],  color: 0x283593, accent: 0x82b1ff, label: '👁', emblem: 'horus',   tier: 3, animation: 'bounce', effect: 'burst' },
    { id: 'p_anubis',  name: 'Anubis',        kind: 'normal', rarity: 'epic',   weight: 12,
      payouts: [30, 110, 380], color: 0x1a1a2e, accent: 0xb39ddb, label: 'A', emblem: 'anubis',  tier: 3, animation: 'bounce', effect: 'burst' },

    // Top pay (legendary).
    { id: 'p_pharaoh', name: 'Pharaoh',       kind: 'normal', rarity: 'legendary', weight: 9,
      payouts: [50, 200, 750], color: 0x4a3208, accent: 0xffe082, label: 'P', emblem: 'pharaoh', tier: 4, animation: 'bounce', effect: 'lightning' },

    // Wild — the winged sun disc; substitutes and pays as the top symbol.
    { id: 'p_wild',    name: 'Sun Wild',      kind: 'wild', rarity: 'legendary', weight: 6,
      payouts: [50, 200, 750], color: 0x7a3b06, accent: 0xffcc66, label: 'W', emblem: 'sundisc', tier: 4, animation: 'glow', effect: 'coins' },

    // Scatter — the Great Pyramid. Pays anywhere, triggers anticipation.
    { id: 'p_pyramid', name: 'Pyramid',       kind: 'scatter', rarity: 'legendary', weight: 5,
      payouts: [5, 15, 50],    color: 0x33260c, accent: 0xffb300, label: '△', emblem: 'pyramid', tier: 4, animation: 'anticipate', effect: 'lightning' },
] as const;

/** The Egypt (Slot 4) registry. */
export const EgyptRegistry = createRegistry(EGYPT);
export const EGYPT_SYMBOLS = EGYPT;
