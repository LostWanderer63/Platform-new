/**
 * SymbolRegistry
 * --------------
 * Authoritative description of every symbol in the game (math + presentation
 * hooks) plus the weighted RNG that produces realistic reel outcomes.
 *
 * The reel ENGINE only cares about ids + visuals; this registry owns the game
 * meaning (rarity, paytable, wild/scatter behaviour, animation/effect hooks).
 * It exports `reelSymbolDefinitions()` so the engine config can be derived from
 * a single source of truth — change a symbol here, the reels follow.
 */
import type { SymbolDefinition } from '../reels/ReelConfig';

/** Behavioural class of a symbol. (No enums — tsconfig `erasableSyntaxOnly`.) */
export type SymbolKind = 'normal' | 'wild' | 'scatter';
export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';

/** Which animator routine fires when this symbol takes part in a win. */
export type AnimationHook = 'pulse' | 'bounce' | 'glow' | 'anticipate';
/** Which effect routine fires (glow/particles/coins) on a win. */
export type EffectHook = 'softGlow' | 'burst' | 'lightning' | 'coins';

export interface GameSymbol {
    readonly id: string;
    readonly name: string;
    readonly kind: SymbolKind;
    readonly rarity: Rarity;
    /** Relative weight on the virtual reel (higher == more frequent). */
    readonly weight: number;
    /**
     * Payout multipliers for [3, 4, 5] of a kind, expressed as a multiple of the
     * per-line bet (per-total-bet for scatters). 0 == no pay at that count.
     */
    readonly payouts: readonly [number, number, number];
    // --- presentation ---
    readonly color: number;
    readonly accent: number;
    readonly label: string;
    /** Carved emblem key for the ornate tile art (see SymbolArt). */
    readonly emblem: string;
    /** Visual tier 1..4 → frame metal (stone→bronze→silver→gold). */
    readonly tier: number;
    // --- hooks (decoupled: registry names them, the win system resolves them) ---
    readonly animation: AnimationHook;
    readonly effect: EffectHook;
}

/**
 * Olympus symbol set. Weights are deliberately uneven to mimic a real slot:
 * low-value gems are common, legendaries are scarce, the scatter is rarest.
 */
const SYMBOLS: readonly GameSymbol[] = [
    // Low pays (common) — the bulk of the reel.
    { id: 'gems',  name: 'Gems',         kind: 'normal', rarity: 'common', weight: 50,
      payouts: [5, 15, 40],   color: 0x14624a, accent: 0xb9f6ca, label: '◆', emblem: 'gem',     tier: 1, animation: 'pulse',  effect: 'softGlow' },
    { id: 'sword', name: 'Sword',        kind: 'normal', rarity: 'common', weight: 38,
      payouts: [8, 22, 60],   color: 0x2f3a45, accent: 0xeceff1, label: '⚔', emblem: 'sword',   tier: 2, animation: 'pulse',  effect: 'softGlow' },

    // Mid pays (rare/epic).
    { id: 'crown', name: 'Crown',        kind: 'normal', rarity: 'rare',   weight: 26,
      payouts: [12, 40, 120], color: 0x5a4410, accent: 0xffd54f, label: '♛', emblem: 'crown',   tier: 2, animation: 'bounce', effect: 'softGlow' },
    { id: 'athena', name: 'Athena',      kind: 'normal', rarity: 'epic',   weight: 16,
      payouts: [20, 75, 220], color: 0x3a2f6e, accent: 0xd1c4ff, label: 'A', emblem: 'helmet',  tier: 3, animation: 'bounce', effect: 'burst' },
    { id: 'poseidon', name: 'Poseidon',  kind: 'normal', rarity: 'epic',   weight: 13,
      payouts: [30, 120, 400], color: 0x0b4654, accent: 0x80deea, label: 'P', emblem: 'trident', tier: 3, animation: 'bounce', effect: 'burst' },

    // Top pay (legendary).
    { id: 'zeus',  name: 'Zeus',         kind: 'normal', rarity: 'legendary', weight: 9,
      payouts: [50, 200, 750], color: 0x16224f, accent: 0xffe082, label: 'Z', emblem: 'lightning', tier: 4, animation: 'bounce', effect: 'lightning' },

    // Wild — substitutes for all normals and pays as the top symbol.
    { id: 'wild',  name: 'Olympus Wild', kind: 'wild', rarity: 'legendary', weight: 6,
      payouts: [50, 200, 750], color: 0x5a160f, accent: 0xffab40, label: 'W', emblem: 'laurel',  tier: 4, animation: 'glow', effect: 'lightning' },

    // Scatter — the Lightning Orb. Pays anywhere, triggers anticipation/bonus.
    { id: 'orb',   name: 'Lightning Orb', kind: 'scatter', rarity: 'legendary', weight: 5,
      payouts: [5, 15, 50],   color: 0x2c1540, accent: 0xe040fb, label: '⚡', emblem: 'orb',      tier: 4, animation: 'anticipate', effect: 'lightning' },
] as const;

/**
 * The read interface every theme's symbol registry exposes. WinCalculator and
 * WinPresenter depend on THIS, not on a concrete symbol set, so a second slot
 * (Vegas) can supply its own registry without touching the win systems.
 */
export interface SymbolModel {
    all(): readonly GameSymbol[];
    get(id: string): GameSymbol;
    isWild(id: string): boolean;
    isScatter(id: string): boolean;
    wildId(): string;
    scatterId(): string;
    payout(id: string, count: number): number;
    reelSymbolDefinitions(): SymbolDefinition[];
}

/** Build a registry (SymbolModel) over any symbol set. One per theme. */
export function createRegistry(symbols: readonly GameSymbol[]): SymbolModel {
    const byId = new Map<string, GameSymbol>(symbols.map((s) => [s.id, s]));
    const wild = symbols.find((s) => s.kind === 'wild');
    const scatter = symbols.find((s) => s.kind === 'scatter');

    return {
        all: () => symbols,
        get(id) {
            const s = byId.get(id);
            if (!s) throw new Error(`[SymbolRegistry] unknown symbol "${id}"`);
            return s;
        },
        isWild: (id) => byId.get(id)?.kind === 'wild',
        isScatter: (id) => byId.get(id)?.kind === 'scatter',
        wildId: () => wild?.id ?? '',
        scatterId: () => scatter?.id ?? '',
        // Counts below 3 never pay; counts above 5 clamp to the 5-of-a-kind value.
        payout(id, count) {
            if (count < 3) return 0;
            const s = byId.get(id);
            return s ? s.payouts[Math.min(count, 5) - 3] : 0;
        },
        reelSymbolDefinitions: () =>
            symbols.map(({ id, color, accent, label, emblem, tier, name }) => ({ id, color, accent, label, emblem, tier, name })),
    };
}

/** The Olympus (Slot 1) registry. */
export const SymbolRegistry: SymbolModel = createRegistry(SYMBOLS);

/**
 * WeightedSymbolPicker
 * --------------------
 * Cumulative-weight table + O(log n) binary search. Equal random chance is
 * explicitly avoided — every draw respects `weight`. Scalable: pass any symbol
 * subset (e.g. per-reel strips) to build independent distributions.
 */
export class WeightedSymbolPicker {
    private readonly ids: string[] = [];
    private readonly cumulative: number[] = [];
    private readonly total: number;
    private readonly scatterId: string;

    constructor(symbols: readonly GameSymbol[] = SYMBOLS) {
        let running = 0;
        for (const s of symbols) {
            running += s.weight;
            this.ids.push(s.id);
            this.cumulative.push(running);
        }
        this.total = running;
        this.scatterId = symbols.find((s) => s.kind === 'scatter')?.id ?? '';
    }

    /** Draw a single symbol id respecting the weight distribution. */
    public pick(rng: () => number = Math.random): string {
        const target = rng() * this.total;
        let lo = 0;
        let hi = this.cumulative.length - 1;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (target < this.cumulative[mid]) hi = mid;
            else lo = mid + 1;
        }
        return this.ids[lo];
    }

    /**
     * Draw one reel column (top→bottom). Scatters are capped at one per column
     * to mirror physical reels, where a scatter occupies a single stop.
     */
    public pickColumn(rows: number, rng: () => number = Math.random): string[] {
        const column: string[] = [];
        let hasScatter = false;
        for (let r = 0; r < rows; r++) {
            let id = this.pick(rng);
            if (id === this.scatterId) {
                if (hasScatter) {
                    do { id = this.pick(rng); } while (id === this.scatterId);
                } else {
                    hasScatter = true;
                }
            }
            column.push(id);
        }
        return column;
    }

    /** Produce a full board as `board[reel][row]` (matches ReelManager.getBoard). */
    public spinBoard(reelCount: number, rowCount: number, rng: () => number = Math.random): string[][] {
        const board: string[][] = [];
        for (let reel = 0; reel < reelCount; reel++) board.push(this.pickColumn(rowCount, rng));
        return board;
    }
}
