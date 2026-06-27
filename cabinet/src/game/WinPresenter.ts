/**
 * WinPresenter
 * ------------
 * Turns a `WinResult` into a cinematic celebration. Only piece that touches both
 * the win math and the reel view; every other system stays decoupled:
 *
 *   WinCalculator → WinResult → WinPresenter ─▶ SymbolAnimator (symbol motion)
 *                                            ├▶ SymbolEffects   (glow / coins)
 *                                            ├▶ pooled payline Graphics
 *                                            ├▶ spotlight dim   (non-winners)
 *                                            └▶ count-up WIN text + screen shake
 *
 * Choreography:
 *  1. Spotlight — every NON-winning symbol dims so the winners read instantly.
 *  2. Winners pop + glow simultaneously.
 *  3. Payline overlays CYCLE one-by-one on a looping timeline.
 *  4. A big central "WIN $N" counts up; big wins shake the board + spray coins.
 *
 * All Graphics/tweens are pooled or killed in `clear()`, so repeated spins never
 * leak objects or animations.
 */
import { Container, Graphics, Text } from 'pixi.js';
import { DropShadowFilter } from 'pixi-filters';
import { gsap } from 'gsap';
import type { ReelContainer } from '../reels/ReelContainer';
import { ReelSymbol } from '../reels/Symbol';
import type { ReelEngineConfig } from '../reels/ReelConfig';
import { viewportWidth, viewportHeight } from '../reels/ReelConfig';
import type { SymbolModel } from './SymbolRegistry';
import type { SymbolAnimator } from './SymbolAnimator';
import type { SymbolEffects } from './SymbolEffects';
import type { WinResult, Cell } from './WinCalculator';

const PAYLINE_COLOR = 0xffd54f;
const GLOW_COLOR = 0xffe082;
const DIM_ALPHA = 0.34;
const RAY_COLOR = 0xffe082;

/** Escalating win tiers, evaluated high→low against (totalWin / bet). */
interface WinTier {
    readonly name: string;
    readonly min: number;
    readonly color: number;
    readonly coins: number;
    readonly shake: number;
}
const WIN_TIERS: readonly WinTier[] = [
    { name: 'EPIC WIN',  min: 100, color: 0xff4d6d, coins: 44, shake: 30 },
    { name: 'MEGA WIN',  min: 40,  color: 0xff9d3a, coins: 28, shake: 22 },
    { name: 'BIG WIN',   min: 15,  color: 0xffd54f, coins: 18, shake: 16 },
];

export class WinPresenter {
    private readonly view: ReelContainer;
    private readonly cfg: ReelEngineConfig;
    private readonly model: SymbolModel;
    private readonly animator: SymbolAnimator;
    private readonly effects: SymbolEffects;

    private readonly linePool: Graphics[] = [];
    /** Pooled unmasked copies used to "pop out" winning tiles over the border. */
    private readonly liftPool: ReelSymbol[] = [];
    private readonly lifted: ReelSymbol[] = [];
    /** Original masked symbols hidden while their lifted copy is shown. */
    private readonly hiddenOriginals: ReelSymbol[] = [];
    private readonly dimmed: ReelSymbol[] = [];
    private timeline: gsap.core.Timeline | null = null;

    private readonly winText: Text;
    private readonly winLabel!: Text;
    private readonly winBanner!: Container;
    private readonly countTarget = { value: 0 };
    private readonly basePos: { x: number; y: number };
    /** Shared soft drop-shadow that lifts each winning tile off the board. */
    private readonly tileShadow = new DropShadowFilter({
        offset: { x: 0, y: 6 },
        blur: 5,
        alpha: 0.4,
        color: 0x000000,
        quality: 4,
    });

    /** Per-tile reveal stagger (seconds). */
    private static readonly STAGGER = 0.07;

    constructor(view: ReelContainer, cfg: ReelEngineConfig, model: SymbolModel, animator: SymbolAnimator, effects: SymbolEffects) {
        this.view = view;
        this.cfg = cfg;
        this.model = model;
        this.animator = animator;
        this.effects = effects;
        this.basePos = { x: view.position.x, y: view.position.y };

        // Central count-up banner: ornate plaque, label + amount.
        this.winBanner = new Container();
        this.winBanner.addChild(this.buildPlaque());

        this.winLabel = new Text({
            text: '',
            style: {
                fontFamily: 'Georgia, "Times New Roman", serif',
                fontSize: 52,
                fontWeight: '900',
                letterSpacing: 4,
                fill: 0xffd54f,
                stroke: { color: 0x3a1500, width: 7 },
            },
        });
        this.winLabel.anchor.set(0.5);
        this.winLabel.visible = false;
        this.winBanner.addChild(this.winLabel);

        this.winText = new Text({
            text: '',
            style: {
                fontFamily: 'Georgia, "Times New Roman", serif',
                fontSize: 88,
                fontWeight: '900',
                fill: GLOW_COLOR,
                stroke: { color: 0x3a1500, width: 9 },
                dropShadow: { color: 0x000000, blur: 8, distance: 4, alpha: 0.6 },
            },
        });
        this.winText.anchor.set(0.5);
        this.winBanner.addChild(this.winText);

        this.winBanner.position.set(viewportWidth(cfg) / 2, viewportHeight(cfg) / 2);
        this.winBanner.visible = false;
        this.view.addChild(this.winBanner);
    }

    /** Dark ornate plaque drawn behind the win count-up. */
    private buildPlaque(): Graphics {
        const w = 560;
        const h = 170;
        const r = 26;
        const g = new Graphics()
            .roundRect(-w / 2, -h / 2, w, h, r)
            .fill({ color: 0x0a0a18, alpha: 0.92 })
            .roundRect(-w / 2, -h / 2, w, h, r)
            .stroke({ width: 6, color: 0xd4af37, alpha: 0.95 })
            .roundRect(-w / 2 + 12, -h / 2 + 12, w - 24, h - 24, r * 0.6)
            .stroke({ width: 2, color: 0xffe9a8, alpha: 0.5 });
        // Corner studs.
        for (const sx of [-w / 2 + 20, w / 2 - 20]) {
            for (const sy of [-h / 2 + 20, h / 2 - 20]) {
                g.circle(sx, sy, 6).fill({ color: 0xffe9a8 });
            }
        }
        return g;
    }

    /** Present a win. Safe to call with a zero-win result (no-op). */
    public present(result: WinResult): void {
        this.clear();
        if (result.totalWin <= 0) return;

        // 1) Collect unique winning cells (preserve discovery order for stagger).
        const seen = new Set<string>();
        const cells: Cell[] = [];
        const collect = (cell: Cell): void => {
            const key = `${cell.reel}:${cell.row}`;
            if (seen.has(key)) return;
            seen.add(key);
            cells.push(cell);
        };
        for (const line of result.lineWins) for (const cell of line.cells) collect(cell);
        if (result.scatter) for (const cell of result.scatter.cells) collect(cell);

        // 2) Spotlight: dim everything that did not win.
        this.dimNonWinners(seen);

        // 3) Lift + animate each winner, staggered so they reveal in sequence.
        cells.forEach((cell, i) => this.highlightCell(cell, i * WinPresenter.STAGGER));

        // 4) Cycle the payline overlays on a loop (drawn above the lifted tiles).
        this.timeline = gsap.timeline({ repeat: -1 });
        for (const line of result.lineWins) {
            const g = this.acquireLine();
            this.drawPath(g, line.cells);
            g.alpha = 0;
            this.timeline
                .to(g, { alpha: 1, duration: 0.22, ease: 'power2.out' })
                .to(g, { alpha: 0.1, duration: 0.22, ease: 'power2.in' }, '+=0.45');
        }

        // 5) Headline count-up, tiered for BIG / MEGA / EPIC wins.
        const tier = WIN_TIERS.find((t) => result.totalWin >= result.bet * t.min) ?? null;
        this.showWinBanner(result.totalWin, tier);

        if (tier) {
            const c = this.boardCenter();
            this.effects.coinBurst(c.x, c.y, RAY_COLOR, tier.coins);
            this.shake(tier.shake);
        }
    }

    /** Stop and recycle everything; restore the neutral board. */
    public clear(): void {
        if (this.timeline) {
            this.timeline.kill();
            this.timeline = null;
        }

        // Park lifted copies and un-hide their originals.
        for (const lift of this.lifted) {
            this.animator.reset(lift);
            lift.visible = false;
        }
        this.lifted.length = 0;
        for (const original of this.hiddenOriginals) {
            gsap.killTweensOf(original);
            original.alpha = 1;
        }
        this.hiddenOriginals.length = 0;

        for (const symbol of this.dimmed) {
            gsap.killTweensOf(symbol);
            symbol.alpha = 1;
        }
        this.dimmed.length = 0;

        for (const g of this.linePool) {
            gsap.killTweensOf(g);
            g.visible = false;
            g.clear();
        }

        // Banner + shake reset.
        gsap.killTweensOf(this.winBanner);
        gsap.killTweensOf(this.winBanner.scale);
        gsap.killTweensOf(this.winLabel.scale);
        gsap.killTweensOf(this.countTarget);
        this.winBanner.visible = false;
        gsap.killTweensOf(this.view.position);
        this.view.position.set(this.basePos.x, this.basePos.y);

        this.effects.clearAll();
    }

    // ----------------------------------------------------------------------

    private highlightCell(cell: Cell, delay: number): void {
        const original = this.view.getCellSymbol(cell.reel, cell.row);
        const id = original.symbolId;
        const def = this.model.get(id);
        const center = this.view.getCellCenter(cell.reel, cell.row);

        // Hide the MASKED original; animate an unmasked copy on the overlay so it
        // can scale beyond the cell without clipping or overlapping neighbours.
        gsap.killTweensOf(original);
        original.alpha = 0;
        this.hiddenOriginals.push(original);

        const lift = this.acquireLift();
        lift.setSymbolId(id);
        lift.position.set(center.x, center.y);
        lift.scale.set(1);
        lift.alpha = 1;
        lift.rotation = 0;
        lift.visible = true;
        this.animator.winHighlight(lift, def.animation, delay);
        this.lifted.push(lift);

        // Single soft gold halo behind the tile. Nothing busy.
        this.effects.showGlow(center.x, center.y, GLOW_COLOR, delay);
    }

    private dimNonWinners(seen: Set<string>): void {
        for (let reel = 0; reel < this.cfg.reelCount; reel++) {
            for (let row = 0; row < this.cfg.rowCount; row++) {
                if (seen.has(`${reel}:${row}`)) continue;
                const symbol = this.view.getCellSymbol(reel, row);
                gsap.killTweensOf(symbol);
                gsap.to(symbol, { alpha: DIM_ALPHA, duration: 0.3, ease: 'power2.out' });
                this.dimmed.push(symbol);
            }
        }
    }

    private showWinBanner(total: number, tier: WinTier | null): void {
        const t = this.winText;
        const banner = this.winBanner;
        const rounded = Math.round(total);

        this.countTarget.value = 0;
        gsap.killTweensOf(this.countTarget);
        gsap.killTweensOf(banner);
        gsap.killTweensOf(banner.scale);

        // Tier label (BIG/MEGA/EPIC) sits above the amount; small wins show amount only.
        if (tier) {
            this.winLabel.text = tier.name;
            this.winLabel.style.fill = tier.color;
            this.winLabel.position.set(0, -40);
            this.winLabel.visible = true;
            t.style.fill = tier.color;
            t.position.set(0, 32);
        } else {
            this.winLabel.visible = false;
            t.style.fill = GLOW_COLOR;
            t.position.set(0, 0);
        }

        t.text = 'WIN $0';
        banner.visible = true;
        banner.alpha = 1;
        banner.scale.set(0.2);
        gsap.to(banner.scale, { x: 1, y: 1, duration: 0.5, ease: 'back.out(2.2)' });
        // A small "kick" on the label for punch.
        if (tier) {
            gsap.fromTo(this.winLabel.scale, { x: 1.3, y: 1.3 }, { x: 1, y: 1, duration: 0.45, ease: 'back.out(3)', delay: 0.15 });
        }
        gsap.to(this.countTarget, {
            value: rounded,
            duration: Math.min(0.5 + rounded / 400, 2.4),
            ease: 'power1.out',
            onUpdate: () => { t.text = `WIN $${Math.floor(this.countTarget.value)}`; },
            onComplete: () => { t.text = `WIN $${rounded}`; },
        });
    }

    /** Quick positional shake of the whole reel set for big-win impact. */
    private shake(amplitude: number): void {
        const { x, y } = this.basePos;
        gsap.killTweensOf(this.view.position);
        const tl = gsap.timeline({
            onComplete: () => this.view.position.set(x, y),
        });
        for (let i = 0; i < 7; i++) {
            const falloff = 1 - i / 8; // decay toward rest
            tl.to(this.view.position, {
                x: x + (Math.random() - 0.5) * 2 * amplitude * falloff,
                y: y + (Math.random() - 0.5) * 2 * amplitude * falloff,
                duration: 0.05,
                ease: 'sine.inOut',
            });
        }
        tl.to(this.view.position, { x, y, duration: 0.06 });
    }

    private boardCenter(): { x: number; y: number } {
        return { x: viewportWidth(this.cfg) / 2, y: viewportHeight(this.cfg) / 2 };
    }

    private drawPath(g: Graphics, cells: readonly Cell[]): void {
        // Re-append so the line sits ABOVE the lifted tiles every present.
        this.view.overlayLayer.addChild(g);
        g.clear();
        const pts = cells.map((c) => this.view.getCellCenter(c.reel, c.row));

        const trace = (): void => {
            g.moveTo(pts[0].x, pts[0].y);
            for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
        };

        // Dark outline for contrast, then the gold core line.
        trace();
        g.stroke({ width: 12, color: 0x000000, alpha: 0.55, join: 'round', cap: 'round' });
        trace();
        g.stroke({ width: 6, color: PAYLINE_COLOR, alpha: 1, join: 'round', cap: 'round' });

        // Node dots on each winning cell.
        for (const p of pts) {
            g.circle(p.x, p.y, 11).fill({ color: 0x000000, alpha: 0.55 });
            g.circle(p.x, p.y, 8).fill({ color: PAYLINE_COLOR, alpha: 1 });
        }

        g.visible = true;
    }

    private acquireLift(): ReelSymbol {
        let s = this.liftPool.find((l) => !l.visible);
        if (!s) {
            s = new ReelSymbol(this.cfg.symbolWidth, this.cfg.symbolHeight);
            s.visible = false;
            s.filters = [this.tileShadow]; // soft drop-shadow separates it from the board
            this.view.overlayLayer.addChild(s);
            this.liftPool.push(s);
        }
        return s;
    }

    private acquireLine(): Graphics {
        let g = this.linePool.find((line) => !line.visible);
        if (!g) {
            g = new Graphics();
            g.visible = false;
            this.view.overlayLayer.addChild(g); // re-appended above tiles in drawPath
            this.linePool.push(g);
        }
        return g;
    }
}
