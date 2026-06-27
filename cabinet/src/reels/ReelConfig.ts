/**
 * ReelConfig
 * ----------
 * Single source of truth for the reel engine. Everything that affects layout,
 * physics or timing lives here so the engine stays data-driven and reusable:
 * spin up a 5x4 grid, a 3x3 grid or a 6x5 Megaways-style board by editing
 * config only — no engine code changes required.
 *
 * Notes on units:
 *  - All physics is expressed in "symbol units" (1 unit == 1 symbol pitch).
 *    This keeps the maths resolution-independent: a reel spinning at
 *    `maxSpeed = 30` advances 30 symbols every second regardless of symbol size.
 *  - All timing (stagger / delays) is expressed in milliseconds.
 */

/** Visual + win-line description of a single symbol on the reels. */
export interface SymbolDefinition {
    /** Stable identifier used by the math model and the texture registry. */
    readonly id: string;
    /** Base fill colour for the generated starter texture. */
    readonly color: number;
    /** Accent colour used for border + glyph (premium gold trim by default). */
    readonly accent: number;
    /** Glyph drawn onto the starter texture (replace with Spine/atlas later). */
    readonly label: string;
    /** Carved emblem key for the ornate tile art (see SymbolArt). */
    readonly emblem?: string;
    /** Visual tier 1..4 → frame metal (stone→bronze→silver→gold). */
    readonly tier?: number;
    /** Display name shown on the tile nameplate (high symbols only). */
    readonly name?: string;
}

/** Motion model for a single reel. Tuned for a premium, weighty feel. */
export interface ReelPhysicsConfig {
    /** Cruise velocity during the blur phase, in symbols / second. */
    readonly maxSpeed: number;
    /** Time (seconds) to ramp from rest to `maxSpeed` (ease-in acceleration). */
    readonly acceleration: number;
    /**
     * Minimum cruise time (seconds) a reel must spin before it is allowed to
     * settle, even if a stop is requested immediately. Guarantees the spin
     * always reads as deliberate rather than twitchy.
     */
    readonly minSpinTime: number;
    /**
     * Distance (in symbols) travelled during the settle phase. Larger values
     * give a longer, more cinematic glide into the final position.
     */
    readonly stopDistance: number;
    /**
     * Back-ease overshoot factor. Higher == more pronounced "bounce" when the
     * reel snaps onto the result. 1.70158 is the classic easeOutBack constant.
     */
    readonly overshoot: number;
}

/** Choreography of how the whole set of reels starts and stops. */
export interface ReelTimingConfig {
    /** Delay (ms) between each reel kicking into its spin-up. */
    readonly spinUpStagger: number;
    /** Delay (ms) between each reel beginning to settle (left-to-right cascade). */
    readonly stopStagger: number;
    /** Default time (ms) the reels cruise before an auto-stop is issued. */
    readonly spinDuration: number;
    /**
     * Anticipation: drag out the final reels for tension (near-win drama).
     * When enabled, every reel index >= `fromReel` receives `extraStagger` ms
     * of additional delay before settling.
     */
    readonly anticipation: {
        readonly enabled: boolean;
        readonly fromReel: number;
        readonly extraStagger: number;
    };
}

/** Complete, reusable description of a reel set. */
export interface ReelEngineConfig {
    readonly reelCount: number;
    readonly rowCount: number;
    /** Logical symbol cell size (px). Sprites are fitted to this box. */
    readonly symbolWidth: number;
    readonly symbolHeight: number;
    /** Gap (px) between reels horizontally and between symbols vertically. */
    readonly horizontalGap: number;
    readonly verticalGap: number;
    /**
     * Extra symbols rendered outside the visible window (one above + one below
     * by default) so recycled sprites slide in seamlessly during scrolling.
     */
    readonly bufferRows: number;
    /**
     * Length of the virtual reel band. The band is a fixed, pre-allocated ring
     * of symbol ids that the visible window reads from — this is what makes
     * recycling deterministic and forced-result placement trivial.
     */
    readonly bandLength: number;
    /** Vertical motion blur during the blur phase (premium, GPU-cheap). */
    readonly enableMotionBlur: boolean;
    readonly physics: ReelPhysicsConfig;
    readonly timing: ReelTimingConfig;
    readonly symbols: readonly SymbolDefinition[];
}

/** Olympus-themed starter symbol set (procedurally textured at runtime). */
const OLYMPUS_SYMBOLS: readonly SymbolDefinition[] = [
    { id: 'zeus',     color: 0x1b2a6b, accent: 0xffe082, label: 'Z' },
    { id: 'poseidon', color: 0x0e5b6b, accent: 0x80deea, label: 'P' },
    { id: 'hades',    color: 0x3a1c4d, accent: 0xb388ff, label: 'H' },
    { id: 'helm',     color: 0x6b1b1b, accent: 0xff8a65, label: '⚔' }, // crossed swords
    { id: 'ring',     color: 0x7a5b12, accent: 0xffd54f, label: '◈' }, // gem
    { id: 'ace',      color: 0x222831, accent: 0xeceff1, label: 'A' },
    { id: 'king',     color: 0x222831, accent: 0xeceff1, label: 'K' },
    { id: 'queen',    color: 0x222831, accent: 0xeceff1, label: 'Q' },
] as const;

/**
 * Default engine configuration: a 5x4 board sized for the 1920x1080 stage.
 * Treat this as a template — `createReelConfig(overrides)` clones it with patches.
 */
export const DEFAULT_REEL_CONFIG: ReelEngineConfig = {
    reelCount: 5,
    rowCount: 4,
    symbolWidth: 180,
    symbolHeight: 170,
    horizontalGap: 14,
    verticalGap: 10,
    bufferRows: 2,
    bandLength: 64,
    enableMotionBlur: true,
    physics: {
        maxSpeed: 40,
        acceleration: 0.5,
        minSpinTime: 0.4,
        stopDistance: 4,
        overshoot: 1.9,
    },
    timing: {
        spinUpStagger: 80,
        stopStagger: 180,
        spinDuration: 1100,
        anticipation: {
            enabled: true,
            fromReel: 3,
            extraStagger: 260,
        },
    },
    symbols: OLYMPUS_SYMBOLS,
};

/** Deep-partial override shape so nested physics/timing can be patched piecemeal. */
export type ReelConfigOverrides =
    Partial<Omit<ReelEngineConfig, 'physics' | 'timing'>> & {
        physics?: Partial<ReelPhysicsConfig>;
        timing?: Partial<Omit<ReelTimingConfig, 'anticipation'>> & {
            anticipation?: Partial<ReelTimingConfig['anticipation']>;
        };
    };

/** Build a config by deep-patching the default template. */
export function createReelConfig(overrides: ReelConfigOverrides = {}): ReelEngineConfig {
    return {
        ...DEFAULT_REEL_CONFIG,
        ...overrides,
        physics: { ...DEFAULT_REEL_CONFIG.physics, ...overrides.physics },
        timing: {
            ...DEFAULT_REEL_CONFIG.timing,
            ...overrides.timing,
            anticipation: {
                ...DEFAULT_REEL_CONFIG.timing.anticipation,
                ...overrides.timing?.anticipation,
            },
        },
        symbols: overrides.symbols ?? DEFAULT_REEL_CONFIG.symbols,
    };
}

/* ------------------------------------------------------------------------- *
 * Derived geometry helpers — keep the pixel maths in one place so every
 * class agrees on layout.
 * ------------------------------------------------------------------------- */

/** Vertical distance between two stacked symbols (one "symbol unit"). */
export const reelPitch = (cfg: ReelEngineConfig): number =>
    cfg.symbolHeight + cfg.verticalGap;

/** Horizontal distance between two adjacent reels. */
export const reelStride = (cfg: ReelEngineConfig): number =>
    cfg.symbolWidth + cfg.horizontalGap;

/** Total sprites instantiated per reel (visible rows + buffer above/below). */
export const symbolsPerReel = (cfg: ReelEngineConfig): number =>
    cfg.rowCount + cfg.bufferRows;

/** Width of the full reel viewport (the masked area). */
export const viewportWidth = (cfg: ReelEngineConfig): number =>
    cfg.reelCount * cfg.symbolWidth + (cfg.reelCount - 1) * cfg.horizontalGap;

/** Height of the full reel viewport (the masked area). */
export const viewportHeight = (cfg: ReelEngineConfig): number =>
    cfg.rowCount * cfg.symbolHeight + (cfg.rowCount - 1) * cfg.verticalGap;
