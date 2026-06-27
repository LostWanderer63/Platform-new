/**
 * Symbol
 * ------
 * `ReelSymbol` is the reusable, pooled display object for a single cell on a
 * reel. It is created ONCE and lives for the lifetime of the reel — the engine
 * never destroys/recreates it. Instead it swaps the underlying texture as the
 * symbol recycles, which is the key to zero per-frame garbage collection.
 *
 * The class is intentionally a thin wrapper over a Sprite so it can later be
 * upgraded to a Spine skeleton (for animated win states) without touching the
 * reel logic: the reel only ever calls `setSymbolId`, `setCellSize`,
 * `playWin` and `reset`.
 */
import { Container, Sprite, RenderTexture, Texture } from 'pixi.js';
import type { Renderer } from 'pixi.js';
import type { SymbolDefinition } from './ReelConfig';
import { drawTile } from './SymbolArt';

/** Draws one tile's art into `node`. Themes provide their own. */
export type TileArtist = (node: Container, def: SymbolDefinition, w: number, h: number) => void;

/**
 * SymbolTextureRegistry
 * ---------------------
 * Builds the starter textures procedurally (rounded panel + accent border +
 * glyph) and caches them by id. Generating them once into RenderTextures means
 * the GPU keeps a single texture per symbol and every sprite just references it.
 *
 * Swap `build()` for `Assets.loadBundle()` of a real atlas later — the rest of
 * the engine only depends on `get(id)`.
 */
export class SymbolTextureRegistry {
    private static readonly cache = new Map<string, Texture>();

    /**
     * Procedurally render one starter texture per symbol definition. Pass a
     * theme-specific `artist` to draw a different tile style (default = Olympus).
     */
    public static build(
        renderer: Renderer,
        defs: readonly SymbolDefinition[],
        width: number,
        height: number,
        artist: TileArtist = drawTile,
        resolution: number = Math.max(2, renderer.resolution),
    ): void {
        for (const def of defs) {
            if (this.cache.has(def.id)) continue;

            const node = new Container();
            artist(node, def, width, height);

            const texture = RenderTexture.create({ width, height, resolution });
            renderer.render({ container: node, target: texture });
            node.destroy({ children: true });

            this.cache.set(def.id, texture);
        }
    }

    /**
     * Register a pre-loaded texture (real art) for an id. Call before `build()`
     * — build skips any id already in the cache, so registered art wins and the
     * rest fall back to procedural tiles.
     */
    public static register(id: string, texture: Texture): void {
        this.cache.set(id, texture);
    }

    public static get(id: string): Texture {
        const texture = this.cache.get(id);
        if (!texture) throw new Error(`[SymbolTextureRegistry] unknown symbol id "${id}". Did you call build()?`);
        return texture;
    }

    public static has(id: string): boolean {
        return this.cache.has(id);
    }
}

/**
 * Fraction of the cell the symbol art occupies. The remaining margin is the
 * headroom a win-pop scales into, so highlighted tiles never touch their
 * neighbours or the reel border. Keep `SYMBOL_FILL * maxWinScale <= 1`.
 */
const SYMBOL_FILL = 0.88;

export class ReelSymbol extends Container {
    /** Single sprite swapped via texture changes — animation-ready surface. */
    private readonly sprite: Sprite;
    private _symbolId = '';

    constructor(cellWidth: number, cellHeight: number) {
        super();

        this.sprite = new Sprite(Texture.EMPTY);
        this.sprite.anchor.set(0.5);
        this.addChild(this.sprite);

        this.setCellSize(cellWidth, cellHeight);
    }

    public get symbolId(): string {
        return this._symbolId;
    }

    /**
     * Swap the displayed symbol. No-ops when the id is unchanged so a reel can
     * call this every frame for every cell without churning the GPU or the GC.
     */
    public setSymbolId(id: string): void {
        if (id === this._symbolId) return;
        this._symbolId = id;
        this.sprite.texture = SymbolTextureRegistry.get(id);
    }

    /**
     * Fit the sprite INSIDE its cell with margin, preserving centre anchor.
     * The padding (`SYMBOL_FILL`) leaves room for a win-pop to scale up without
     * the art touching neighbouring tiles or the reel border.
     */
    public setCellSize(cellWidth: number, cellHeight: number): void {
        this.sprite.width = cellWidth * SYMBOL_FILL;
        this.sprite.height = cellHeight * SYMBOL_FILL;
    }

    /* --- Animation hooks (stubs today, Spine-ready tomorrow) --------------- *
     * The reel never blocks on these; they are fire-and-forget so they can be
     * upgraded to skeletal animations / particle bursts without API changes.   */

    /** Highlight this symbol as part of a winning line. */
    public playWin(): void {
        // Placeholder premium pop. Replace with Spine "win" track when available.
        this.scale.set(1.08);
    }

    /** Return the symbol to its neutral resting state after a win/idle. */
    public reset(): void {
        this.scale.set(1);
        this.alpha = 1;
    }
}
