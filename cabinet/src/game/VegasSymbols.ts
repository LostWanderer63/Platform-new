/**
 * VegasSymbols (Slot 2)
 * ---------------------
 * Classic one-armed-bandit symbol set. Distinct ids (`v_*`) so its textures
 * never collide with Slot 1 in the shared texture cache. Uses the same
 * `GameSymbol` shape + `createRegistry` factory as Olympus, so all the win
 * systems work unchanged — only the art (SymbolArtVegas) and theme differ.
 */
import type { GameSymbol } from './SymbolRegistry';
import { createRegistry } from './SymbolRegistry';

const VEGAS: readonly GameSymbol[] = [
    // Low pays.
    { id: 'v_cherry', name: 'Cherry', kind: 'normal', rarity: 'common', weight: 50,
      payouts: [4, 12, 35], color: 0x2a0d12, accent: 0xff5a6e, label: '🍒', emblem: 'cherry', tier: 1, animation: 'pulse', effect: 'softGlow' },
    { id: 'v_bell',   name: 'Bell',   kind: 'normal', rarity: 'common', weight: 40,
      payouts: [6, 18, 50], color: 0x2a230d, accent: 0xffd54f, label: '🔔', emblem: 'bell', tier: 1, animation: 'pulse', effect: 'softGlow' },

    // Mid pays.
    { id: 'v_bar',    name: 'Bar',    kind: 'normal', rarity: 'rare', weight: 28,
      payouts: [10, 30, 90], color: 0x0d1f2a, accent: 0x4fd0ff, label: 'BAR', emblem: 'bar', tier: 2, animation: 'bounce', effect: 'softGlow' },
    { id: 'v_coin',   name: 'Coin',   kind: 'normal', rarity: 'rare', weight: 22,
      payouts: [14, 45, 130], color: 0x2a200a, accent: 0xffc83d, label: '$', emblem: 'coin', tier: 2, animation: 'bounce', effect: 'burst' },
    { id: 'v_diamond', name: 'Diamond', kind: 'normal', rarity: 'epic', weight: 14,
      payouts: [25, 90, 260], color: 0x0a2230, accent: 0x6fe9ff, label: '◆', emblem: 'diamond', tier: 3, animation: 'bounce', effect: 'burst' },

    // Top pay.
    { id: 'v_seven',  name: 'Seven',  kind: 'normal', rarity: 'legendary', weight: 9,
      payouts: [50, 200, 800], color: 0x2a0a10, accent: 0xff3b54, label: '7', emblem: 'seven', tier: 4, animation: 'bounce', effect: 'lightning' },

    // Wild + scatter.
    { id: 'v_wild',   name: 'Wild',   kind: 'wild', rarity: 'legendary', weight: 6,
      payouts: [50, 200, 800], color: 0x101430, accent: 0xffe25a, label: 'WILD', emblem: 'wild', tier: 4, animation: 'glow', effect: 'lightning' },
    { id: 'v_bonus',  name: 'Bonus',  kind: 'scatter', rarity: 'legendary', weight: 5,
      payouts: [5, 15, 50], color: 0x1a0a2a, accent: 0xc06bff, label: 'BONUS', emblem: 'bonus', tier: 4, animation: 'anticipate', effect: 'lightning' },
] as const;

/** The Vegas (Slot 2) registry. */
export const VegasRegistry = createRegistry(VEGAS);
export const VEGAS_SYMBOLS = VEGAS;
