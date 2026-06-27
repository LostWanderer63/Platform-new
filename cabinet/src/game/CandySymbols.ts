/**
 * CandySymbols (Slot 15 — "Sugar Storm")
 * ---------------------------------------
 * Scatter-pays candy set. NO paylines: 8+ matching candies anywhere on the
 * 6×5 grid pay, winners explode and the grid tumbles. Pays are per TOTAL bet,
 * tiered by cluster size [8–9, 10–11, 12+].
 *
 * `c_pop` (lollipop) is the bonus scatter — 4+ trigger free spins.
 * `c_bomb` (rainbow bomb) exists only on the free-spin reels: it never pays,
 * it lands carrying a 2×–100× multiplier applied to the whole spin's win.
 */

export type CandyKind = 'candy' | 'scatter' | 'bomb';

export interface CandySymbol {
    readonly id: string;
    readonly name: string;
    readonly kind: CandyKind;
    /** Relative weight on the base-game roll (0 = never in base game). */
    readonly weight: number;
    /** Relative weight on the free-spin roll. */
    readonly bonusWeight: number;
    /** Pays × total bet for cluster sizes [8–9, 10–11, 12+]. */
    readonly pays: readonly [number, number, number];
    readonly color: number;
    readonly accent: number;
    readonly emblem: string;
}

export const CANDY_SYMBOLS: readonly CandySymbol[] = [
    { id: 'c_banana', name: 'Banana Gummy', kind: 'candy', weight: 50, bonusWeight: 50,
      pays: [0.3, 0.8, 2],  color: 0xffd23d, accent: 0xfff3a0, emblem: 'banana' },
    { id: 'c_grape',  name: 'Grape Drop',   kind: 'candy', weight: 42, bonusWeight: 42,
      pays: [0.4, 1, 3],    color: 0x9a4fd4, accent: 0xd9b3ff, emblem: 'grape' },
    { id: 'c_melon',  name: 'Melon Slice',  kind: 'candy', weight: 36, bonusWeight: 36,
      pays: [0.5, 1.2, 4],  color: 0xff5a78, accent: 0x7ade7a, emblem: 'watermelon' },
    { id: 'c_jelly',  name: 'Sour Jelly',   kind: 'candy', weight: 30, bonusWeight: 30,
      pays: [0.8, 1.6, 6],  color: 0x4ade6a, accent: 0xbdf7c8, emblem: 'jelly' },
    { id: 'c_ring',   name: 'Citrus Ring',  kind: 'candy', weight: 24, bonusWeight: 24,
      pays: [1, 2, 8],      color: 0xff9234, accent: 0xffd9a8, emblem: 'ring' },
    { id: 'c_star',   name: 'Star Fizz',    kind: 'candy', weight: 18, bonusWeight: 18,
      pays: [1.5, 3, 12],   color: 0x3aa8ff, accent: 0xb3e0ff, emblem: 'star' },
    { id: 'c_heart',  name: 'Heart Crush',  kind: 'candy', weight: 12, bonusWeight: 12,
      pays: [2.5, 8, 25],   color: 0xff2d55, accent: 0xffb3c4, emblem: 'heart' },

    // Bonus scatter — pays by count 4 / 5 / 6+ (see SCATTER_PAYS), triggers free spins.
    { id: 'c_pop',    name: 'Lolly Scatter', kind: 'scatter', weight: 5, bonusWeight: 3,
      pays: [0, 0, 0],      color: 0xff4fa0, accent: 0xfff3a0, emblem: 'lollipop' },

    // Free-spins only — never pays, carries a 2×–100× win multiplier.
    { id: 'c_bomb',   name: 'Rainbow Bomb',  kind: 'bomb', weight: 0, bonusWeight: 7,
      pays: [0, 0, 0],      color: 0xff3a6a, accent: 0xffffff, emblem: 'bomb' },
] as const;

/** Scatter pays × total bet for 4 / 5 / 6+ lollipops. */
export const SCATTER_PAYS: readonly [number, number, number] = [3, 5, 20];

/** Multiplier values a rainbow bomb can carry (weighted toward the low end). */
export const BOMB_VALUES: readonly number[] = [2, 2, 2, 3, 3, 4, 4, 5, 5, 6, 8, 10, 12, 15, 20, 25, 50, 100];

export const CANDY_IDS: readonly string[] = CANDY_SYMBOLS.map((s) => s.id);

const byId = new Map(CANDY_SYMBOLS.map((s) => [s.id, s]));
export function candy(id: string): CandySymbol {
    const s = byId.get(id);
    if (!s) throw new Error(`[CandySymbols] unknown id "${id}"`);
    return s;
}

/** Pay for `count` matching candies of `id` (0 below 8). */
export function clusterPay(id: string, count: number): number {
    if (count < 8) return 0;
    const tier = count >= 12 ? 2 : count >= 10 ? 1 : 0;
    return candy(id).pays[tier];
}

/** Weighted roll over the candy set. `bonus` switches to the free-spin weights. */
export function rollCandy(bonus: boolean): string {
    let total = 0;
    for (const s of CANDY_SYMBOLS) total += bonus ? s.bonusWeight : s.weight;
    let target = Math.random() * total;
    for (const s of CANDY_SYMBOLS) {
        target -= bonus ? s.bonusWeight : s.weight;
        if (target < 0) return s.id;
    }
    return CANDY_SYMBOLS[0].id;
}
