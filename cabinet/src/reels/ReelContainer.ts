/**
 * ReelContainer
 * -------------
 * Owns the visual composition of the reel set and the all-important viewport
 * mask. It builds the reels and arranges the scene graph into clean layers so
 * effects and UI can slot in later without reshuffling z-order:
 *
 *   ReelContainer
 *   ├─ backgroundLayer   (static backing panel)
 *   ├─ reelsLayer        (the scrolling reels) ── masked by `viewportMask`
 *   ├─ effectsLayer      (empty; win lines / particle bursts go here, on top)
 *   └─ frameLayer        (ornamental frame + column separators, front-most)
 *
 * The mask clips every reel to the visible window so buffer symbols scrolling
 * in/out are hidden — this is what sells the "window onto an endless reel" look.
 * Local origin (0,0) is the top-left of the viewport; the parent scene is
 * responsible for centring the whole container on stage.
 */
import { Container, Graphics, FillGradient } from 'pixi.js';
import type { ReelEngineConfig } from './ReelConfig';
import { reelStride, reelPitch, viewportWidth, viewportHeight } from './ReelConfig';
import { Reel } from './Reel';

export class ReelContainer extends Container {
    public readonly reels: Reel[] = [];

    /** Front-most layer reserved for win lines, glows and symbol VFX. */
    public readonly effectsLayer: Container;
    /**
     * UNMASKED layer above the frame. Winning tiles are lifted here so they can
     * scale up and "pop out" over the reel borders and neighbouring symbols
     * without being clipped by the viewport mask.
     */
    public readonly overlayLayer: Container;

    private readonly cfg: ReelEngineConfig;
    private readonly reelsLayer: Container;
    private readonly viewportMask: Graphics;

    constructor(cfg: ReelEngineConfig) {
        super();
        this.cfg = cfg;

        const vw = viewportWidth(cfg);
        const vh = viewportHeight(cfg);
        const bow = reelPitch(cfg) * 0.18; // barrel-window curvature

        // --- background (extended to cover the barrel bow) ------------------
        const backgroundLayer = new Graphics()
            .roundRect(-18, -bow - 14, vw + 36, vh + 2 * bow + 28, 28)
            .fill({ color: 0x05060d })
            .roundRect(-6, -6, vw + 12, vh + 12, 20)
            .fill({ color: 0x0d1126 });
        this.addChild(backgroundLayer);

        // --- reels (masked) -------------------------------------------------
        this.reelsLayer = new Container();
        this.addChild(this.reelsLayer);

        const stride = reelStride(cfg);
        for (let i = 0; i < cfg.reelCount; i++) {
            const reel = new Reel(cfg, i);
            reel.view.x = i * stride;
            this.reels.push(reel);
            this.reelsLayer.addChild(reel.view);
        }

        // Clip the reels to a BARREL window — the top/bottom edges bow outward so
        // symbols arc off the cylinder's curve. The mask Graphics must live in the
        // scene graph for its transform to resolve, so it is added as a child.
        this.viewportMask = new Graphics()
            .moveTo(0, 0)
            .quadraticCurveTo(vw / 2, -bow, vw, 0)
            .lineTo(vw, vh)
            .quadraticCurveTo(vw / 2, vh + bow, 0, vh)
            .closePath()
            .fill(0xffffff);
        this.addChild(this.viewportMask);
        this.reelsLayer.mask = this.viewportMask;

        // --- drum shading: inner top/bottom shadows for a cylindrical look ----
        this.addChild(this.buildDrumShade(vw, vh, reelPitch(cfg)));

        // --- effects (above reels, below frame) -----------------------------
        this.effectsLayer = new Container();
        this.addChild(this.effectsLayer);

        // --- frame + column separators (front) ------------------------------
        this.addChild(this.buildFrame(vw, vh, stride));

        // --- overlay (top, UNMASKED) for lifted winning tiles ---------------
        this.overlayLayer = new Container();
        this.addChild(this.overlayLayer);
    }

    public getReel(index: number): Reel {
        return this.reels[index];
    }

    /** The pooled symbol sprite sitting on cell (reel, row) while at rest. */
    public getCellSymbol(reel: number, row: number) {
        return this.reels[reel].getSymbolAt(row);
    }

    /**
     * Centre of cell (reel, row) in this container's local space — the same
     * space as `effectsLayer`, so win glows / paylines align without transforms.
     */
    public getCellCenter(reel: number, row: number): { x: number; y: number } {
        const symbol = this.reels[reel].getSymbolAt(row);
        return { x: this.reels[reel].view.x + symbol.x, y: symbol.y };
    }

    /**
     * Cylinder shading — the dominant "it's a drum" cue. A full-height vertical
     * gradient that is strongly dark at the very top/bottom and clears toward the
     * centre (curved-surface light falloff), plus an additive specular band down
     * the middle (the drum catching the light).
     */
    private buildDrumShade(vw: number, vh: number, _pitch: number): Container {
        const shade = new Container();

        const falloff = new FillGradient({
            type: 'linear', start: { x: 0, y: 0 }, end: { x: 0, y: 1 }, textureSpace: 'local',
            colorStops: [
                { offset: 0.0, color: 'rgba(0,0,0,0.92)' },
                { offset: 0.16, color: 'rgba(0,0,0,0.45)' },
                { offset: 0.34, color: 'rgba(0,0,0,0.0)' },
                { offset: 0.5, color: 'rgba(0,0,0,0.0)' },
                { offset: 0.66, color: 'rgba(0,0,0,0.0)' },
                { offset: 0.84, color: 'rgba(0,0,0,0.45)' },
                { offset: 1.0, color: 'rgba(0,0,0,0.92)' },
            ],
        });
        shade.addChild(new Graphics().rect(0, 0, vw, vh).fill(falloff));

        const sheen = new FillGradient({
            type: 'linear', start: { x: 0, y: 0 }, end: { x: 0, y: 1 }, textureSpace: 'local',
            colorStops: [
                { offset: 0.36, color: 'rgba(255,255,255,0)' },
                { offset: 0.5, color: 'rgba(255,255,255,0.22)' },
                { offset: 0.64, color: 'rgba(255,255,255,0)' },
            ],
        });
        const band = new Graphics().rect(0, 0, vw, vh).fill(sheen);
        band.blendMode = 'add';
        shade.addChild(band);

        return shade;
    }

    /** Decorative frame drawn on top so reels appear to spin "behind glass". */
    private buildFrame(vw: number, vh: number, stride: number): Graphics {
        const frame = new Graphics();

        // Subtle vertical separators between reels.
        for (let i = 1; i < this.cfg.reelCount; i++) {
            const x = i * stride - this.cfg.horizontalGap / 2;
            frame.rect(x - 1, 0, 2, vh).fill({ color: 0x000000, alpha: 0.35 });
        }

        // Outer gold trim.
        frame
            .roundRect(-6, -6, vw + 12, vh + 12, 20)
            .stroke({ width: 6, color: 0xffd54f, alpha: 0.85 });

        return frame;
    }
}
