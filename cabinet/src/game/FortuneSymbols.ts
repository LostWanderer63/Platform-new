/**
 * FortuneSymbols (Slot 14 — "Fortune Coins")
 * ------------------------------------------
 * Lunar-festival symbol set for the 5×3 HOLD & WIN slot. Distinct ids (`f_*`)
 * so its textures never collide with the other slots in the shared texture
 * cache. Same GameSymbol shape + factory, so all win systems work unchanged —
 * only the art (SymbolArtFortune) and theme differ.
 *
 * The fortune coin is the star: it lands with a cash value attached. Six or
 * more on one spin trigger the HOLD & WIN respin feature (see GameScene14) —
 * the coin itself pays nothing through the line/scatter math (payouts all 0).
 *
 * `f_blank` is feature-only filler for the respin reels: weight 0 keeps it off
 * the base-game picker, but it still gets a texture via reelSymbolDefinitions.
 */
import type { GameSymbol } from './SymbolRegistry';
import { createRegistry } from './SymbolRegistry';

const FORTUNE: readonly GameSymbol[] = [
    // Low pays (common) — the bulk of the reel.
    { id: 'f_envelope', name: 'Red Envelope', kind: 'normal', rarity: 'common', weight: 48,
      payouts: [5, 15, 40],    color: 0x8a1414, accent: 0xffd54f, label: '✉', emblem: 'envelope', tier: 1, animation: 'pulse',  effect: 'softGlow' },
    { id: 'f_lantern',  name: 'Lantern',      kind: 'normal', rarity: 'common', weight: 38,
      payouts: [7, 20, 55],    color: 0xa12a10, accent: 0xffb74d, label: '◍', emblem: 'lantern',  tier: 1, animation: 'pulse',  effect: 'softGlow' },

    // Mid pays (rare/epic).
    { id: 'f_koi',      name: 'Koi',          kind: 'normal', rarity: 'rare',   weight: 26,
      payouts: [12, 38, 110],  color: 0x0e4a5c, accent: 0xff8a65, label: '≋', emblem: 'koi',      tier: 2, animation: 'bounce', effect: 'softGlow' },
    { id: 'f_ingot',    name: 'Gold Ingot',   kind: 'normal', rarity: 'epic',   weight: 16,
      payouts: [20, 70, 210],  color: 0x6b4a10, accent: 0xffe082, label: '⛁', emblem: 'ingot',    tier: 3, animation: 'bounce', effect: 'burst' },
    { id: 'f_phoenix',  name: 'Phoenix',      kind: 'normal', rarity: 'epic',   weight: 12,
      payouts: [30, 110, 380], color: 0x7a1e2e, accent: 0xffab40, label: 'P', emblem: 'phoenix',  tier: 3, animation: 'bounce', effect: 'burst' },

    // Top pay (legendary).
    { id: 'f_cat',      name: 'Lucky Cat',    kind: 'normal', rarity: 'legendary', weight: 9,
      payouts: [50, 200, 750], color: 0x3a1040, accent: 0xffe082, label: 'C', emblem: 'cat',      tier: 4, animation: 'bounce', effect: 'lightning' },

    // Wild — the endless knot; substitutes and pays as the top symbol.
    { id: 'f_wild',     name: 'Knot Wild',    kind: 'wild', rarity: 'legendary', weight: 6,
      payouts: [50, 200, 750], color: 0x26060e, accent: 0xff5a4e, label: 'W', emblem: 'knot',     tier: 4, animation: 'glow', effect: 'coins' },

    // The fortune coin. Pays NOTHING through line/scatter math — it carries a
    // cash value and 6+ trigger the HOLD & WIN respins (scene-level feature).
    { id: 'f_coin',     name: 'Fortune Coin', kind: 'scatter', rarity: 'legendary', weight: 7,
      payouts: [0, 0, 0],      color: 0x7a1414, accent: 0xffd54f, label: '◉', emblem: 'coin',     tier: 4, animation: 'anticipate', effect: 'coins' },

    // Feature-only filler for the respin reels (never on the base picker).
    { id: 'f_blank',    name: '',             kind: 'normal', rarity: 'common', weight: 0,
      payouts: [0, 0, 0],      color: 0x201018, accent: 0x4a2a38, label: '', emblem: 'blank',    tier: 1, animation: 'pulse', effect: 'softGlow' },
] as const;

/** The Fortune (Slot 14) registry. */
export const FortuneRegistry = createRegistry(FORTUNE);
export const FORTUNE_SYMBOLS = FORTUNE;
