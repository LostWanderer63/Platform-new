import { Text, Container, Graphics, FillGradient } from 'pixi.js';
import { GodrayFilter } from 'pixi-filters';
import { gsap } from 'gsap';
import { BaseScene } from './BaseScene';
import { GameConfig } from '../config/GameConfig';
import { gameStore } from '../state/GameState';
import { SceneManager } from '../managers/SceneManager';
import { AssetManager } from '../managers/AssetManager';
import { ReelManager } from '../reels/ReelManager';
import { createReelConfig, viewportWidth, viewportHeight } from '../reels/ReelConfig';
import type { ReelEngineConfig } from '../reels/ReelConfig';
import { SymbolTextureRegistry } from '../reels/Symbol';
import { drawFortuneTile } from '../reels/SymbolArtFortune';
import { FortuneRegistry } from '../game/FortuneSymbols';
import { WeightedSymbolPicker } from '../game/SymbolRegistry';
import { PaylineManager } from '../game/PaylineManager';
import { WinCalculator } from '../game/WinCalculator';
import { SymbolAnimator } from '../game/SymbolAnimator';
import { SymbolEffects } from '../game/SymbolEffects';
import { WinPresenter } from '../game/WinPresenter';
import { MenuScene } from './MenuScene';

/**
 * GameScene14 — Slot 14: "Fortune Coins"
 * ---------------------------------------
 * Lunar-festival 5×3 slot with a HOLD & WIN respin feature — the lock-and-
 * respin machine class (none of the other slots have it). Base game runs the
 * shared reel engine + payline math; fortune coins land carrying a cash value
 * (some are MINI/MINOR jackpots).
 *
 * HOLD & WIN: six or more coins on one spin lock in place and award 3 respins
 * on coin-only reels. Every new coin locks and resets the count to 3. The
 * feature ends when the respins run dry — or the grid fills for the GRAND
 * jackpot (500× bet) on top of every coin's value.
 *
 * Premium presentation layer:
 *  - drifting ember motes + flickering lantern flames + festival skyline
 *  - frame pulse while the reels spin, anticipation strobe on the last reels
 *  - red feature glow + respin counter during HOLD & WIN
 *  - god-ray sweep + golden coin rain on tiered wins
 */

/** Cash values a fortune coin can land with (× bet), plus jackpot rolls. */
const COIN_VALUES = [1, 1, 2, 2, 3, 3, 5, 5, 8, 10, 15] as const;
const MINI_MULT = 10;
const MINOR_MULT = 25;
const GRAND_MULT = 500;
const FEATURE_RESPINS = 3;
/** Chance each open cell turns up a coin on a respin reel. */
const RESPIN_COIN_CHANCE = 0.12;

interface LockedCoin {
    reel: number;
    row: number;
    value: number;
    label: string | null;
    tile: Container;
}

export class GameScene14 extends BaseScene {
    private readonly reelsContainer = new Container();
    private readonly uiContainer = new Container();

    private cfg!: ReelEngineConfig;
    private reelManager!: ReelManager;
    private picker!: WeightedSymbolPicker;
    private paylines!: PaylineManager;
    private winCalculator!: WinCalculator;
    private winPresenter!: WinPresenter;

    // --- hold & win state ---
    private featureActive = false;
    private respins = FEATURE_RESPINS;
    private locked: LockedCoin[] = [];
    private baseCoinTiles: Container[] = [];
    private readonly tilePool: { node: Container; gfx: Graphics; txt: Text; sub: Text }[] = [];
    private featureCall: gsap.core.Tween | null = null;
    private respinText!: Text;
    private featureBanner!: Text;
    private featureGlow!: Graphics;

    // --- premium FX state ---
    private env!: Container;
    private readonly fxLayer = new Container();
    private embers!: Graphics;
    private readonly motes: { x: number; y: number; r: number; vy: number; vx: number; phase: number }[] = [];
    private framePulse!: Graphics;
    private anticipationStrobe!: Graphics;
    private strobeCall: gsap.core.Tween | null = null;
    private godray: GodrayFilter | null = null;
    private readonly coinPool: Graphics[] = [];
    private frameBox = { x: 0, y: 0, w: 0, h: 0 };
    private elapsed = 0;

    private readonly onKeyDown = (e: KeyboardEvent): void => {
        if (e.code === 'Space') { e.preventDefault(); this.spin(); }
        // (back-to-menu removed) if (e.code === 'Escape') SceneManager.switchScene(new MenuScene());
    };

    constructor() {
        super();
        this.addChild(this.reelsContainer);
        this.addChild(this.uiContainer);
    }

    public async init(): Promise<void> {
        const renderer = SceneManager.application.renderer;
        this.cfg = createReelConfig({
            reelCount: 5,
            rowCount: 3,
            symbolWidth: 200,
            symbolHeight: 190,
            horizontalGap: 14,
            verticalGap: 12,
            symbols: FortuneRegistry.reelSymbolDefinitions(),
            timing: { stopStagger: 200, spinDuration: 1200, anticipation: { enabled: true, fromReel: 3, extraStagger: 300 } },
            physics: { maxSpeed: 38, overshoot: 1.8 },
        });

        // Real art was preloaded by the LoaderScene; register it (procedural otherwise).
        for (const [id, texture] of AssetManager.preloadedSymbols) SymbolTextureRegistry.register(id, texture);

        const vw = viewportWidth(this.cfg);
        const vh = viewportHeight(this.cfg);
        const reelX = (GameConfig.width - vw) / 2;
        const reelY = (GameConfig.height - vh) / 2 + 10;
        this.frameBox = { x: reelX - 46, y: reelY - 46, w: vw + 92, h: vh + 92 };

        this.env = this.buildEnvironment(reelX, reelY, vw, vh);
        this.addChildAt(this.env, 0);

        // Red-lacquer tiles via the pluggable artist.
        this.reelManager = new ReelManager(this.cfg, renderer, drawFortuneTile);
        this.reelManager.view.position.set(reelX, reelY);
        this.reelsContainer.addChild(this.reelManager.view);
        this.reelManager.onSpinComplete = (board) =>
            this.featureActive ? this.featureLand(board) : this.baseLand(board);

        // Base picker excludes the feature-only blank filler.
        this.picker = new WeightedSymbolPicker(FortuneRegistry.all().filter((s) => s.weight > 0));
        this.paylines = new PaylineManager(this.cfg.reelCount, this.cfg.rowCount);
        // Coins pay zero through scatter math; min 6 keeps them out of small results.
        this.winCalculator = new WinCalculator(FortuneRegistry, { scatterMin: 6 });
        const animator = new SymbolAnimator();
        const effects = new SymbolEffects(this.reelManager.view.overlayLayer, this.cfg.symbolWidth, this.cfg.symbolHeight);
        this.winPresenter = new WinPresenter(this.reelManager.view, this.cfg, FortuneRegistry, animator, effects);

        this.createUI(reelX, reelY, vw, vh);
        this.buildFx();
        this.addChild(this.fxLayer);
        window.addEventListener('keydown', this.onKeyDown);
    }

    public async start(): Promise<void> {}

    public update(delta: number): void {
        if (!this.reelManager) return;
        const dt = Math.min(delta / 60, 0.05);
        this.reelManager.update(dt);
        this.elapsed += dt;
        this.updateEmbers(dt);
        if (this.godray) this.godray.time += dt * 1.2;
    }

    public resize(_width: number, _height: number): void {}

    public override async destroyScene(): Promise<void> {
        window.removeEventListener('keydown', this.onKeyDown);
        this.strobeCall?.kill();
        this.featureCall?.kill();
        gsap.killTweensOf(this.framePulse);
        gsap.killTweensOf(this.anticipationStrobe);
        gsap.killTweensOf(this.featureGlow);
        gsap.killTweensOf(this.featureBanner);
        gsap.killTweensOf(this.featureBanner.scale);
        for (const c of this.coinPool) gsap.killTweensOf(c);
        for (const t of this.tilePool) { gsap.killTweensOf(t.node); gsap.killTweensOf(t.node.scale); }
        this.env.filters = [];
        this.winPresenter?.clear();
        await super.destroyScene();
    }

    // --- base game flow ------------------------------------------------------

    private spin(): void {
        const state = gameStore.getState();
        if (this.featureActive || this.reelManager.isSpinning || state.balance < state.bet) return;
        this.winPresenter.clear();
        this.clearCoinTiles();
        state.setBalance(state.balance - state.bet);
        state.setSpinning(true);
        state.setWinAmount(0);
        const board = this.picker.spinBoard(this.cfg.reelCount, this.cfg.rowCount);
        this.plantDemoWin(board); // DEMO ONLY: lift the hit-rate so wins show often
        this.reelManager.spin(board);
        this.startSpinFx();
    }

    private plantDemoWin(board: string[][]): void {
        const coinId = FortuneRegistry.scatterId();
        // DEMO ONLY: showcase the HOLD & WIN trigger every few spins.
        if (Math.random() < 0.22) {
            const cells: number[] = [];
            while (cells.length < 6 + ((Math.random() * 3) | 0)) {
                const c = (Math.random() * this.cfg.reelCount * this.cfg.rowCount) | 0;
                if (!cells.includes(c)) cells.push(c);
            }
            for (const c of cells) board[(c / this.cfg.rowCount) | 0][c % this.cfg.rowCount] = coinId;
            return;
        }
        // Sprinkle a couple of teaser coins so values show between triggers.
        if (Math.random() < 0.35) {
            for (let i = 0, n = 1 + ((Math.random() * 2) | 0); i < n; i++) {
                board[(Math.random() * this.cfg.reelCount) | 0][(Math.random() * this.cfg.rowCount) | 0] = coinId;
            }
        }
        if (Math.random() > 0.6) return;
        const line = this.paylines.get((Math.random() * this.paylines.count) | 0);
        const normals = FortuneRegistry.all().filter((s) => s.kind === 'normal' && s.weight > 0);
        const id = normals[(Math.random() * normals.length) | 0].id;
        const len = 3 + ((Math.random() * 3) | 0);
        for (let reel = 0; reel < len && reel < this.cfg.reelCount; reel++) board[reel][line[reel]] = id;
    }

    private baseLand(board: string[][]): void {
        const state = gameStore.getState();
        state.setSpinning(false);
        this.stopSpinFx();
        this.thump();

        // Every landed coin shows its cash value on an overlay tile.
        const coinId = FortuneRegistry.scatterId();
        const coinCells: { reel: number; row: number }[] = [];
        for (let reel = 0; reel < this.cfg.reelCount; reel++) {
            for (let row = 0; row < this.cfg.rowCount; row++) {
                if (board[reel][row] === coinId) coinCells.push({ reel, row });
            }
        }
        coinCells.forEach((cell, i) => {
            const award = this.rollCoinValue(state.bet);
            const tile = this.showCoinTile(cell.reel, cell.row, award.value, award.label, i * 0.1);
            this.baseCoinTiles.push(tile.node);
            if (this.featureActive) return; // safety; feature starts below
            this.lockedCandidate(cell, award, tile.node);
        });

        const result = this.winCalculator.evaluate(board, this.paylines, state.bet);
        if (result.totalWin > 0) {
            const win = Math.round(result.totalWin);
            state.setWinAmount(win);
            state.setBalance(state.balance + win);
            this.winPresenter.present(result);
            if (result.totalWin >= state.bet * 15) this.bigWinFx(result.totalWin >= state.bet * 40);
        }

        if (coinCells.length >= 6) {
            this.featureCall?.kill();
            this.featureCall = gsap.delayedCall(result.totalWin > 0 ? 1.5 : 0.7, () => this.startFeature());
        }
    }

    /** Base-spin coins become the locked set if the feature triggers. */
    private pendingCoins: LockedCoin[] = [];
    private lockedCandidate(cell: { reel: number; row: number }, award: { value: number; label: string | null }, tile: Container): void {
        this.pendingCoins.push({ reel: cell.reel, row: cell.row, value: award.value, label: award.label, tile });
    }

    // --- hold & win feature ----------------------------------------------------

    private startFeature(): void {
        this.featureActive = true;
        this.winPresenter.clear();
        this.locked = [...this.pendingCoins];
        this.pendingCoins = [];
        this.baseCoinTiles = []; // locked tiles now owned by the feature
        this.respins = FEATURE_RESPINS;
        this.updateRespinText();
        this.respinText.visible = true;

        this.showFeatureBanner('HOLD & WIN!', 0xffd54f);
        for (const lc of this.locked) {
            gsap.fromTo(lc.tile.scale, { x: 1.2, y: 1.2 }, { x: 1, y: 1, duration: 0.35, ease: 'back.out(2)' });
        }

        // Red glow breathes around the frame for the whole feature.
        this.featureGlow.visible = true;
        gsap.killTweensOf(this.featureGlow);
        this.featureGlow.alpha = 0;
        gsap.to(this.featureGlow, { alpha: 0.55, duration: 0.7, ease: 'sine.inOut', yoyo: true, repeat: -1 });

        this.featureCall = gsap.delayedCall(1.3, () => this.featureSpin());
    }

    private featureSpin(): void {
        const coinId = FortuneRegistry.scatterId();
        const blankId = 'f_blank';
        const isLocked = (reel: number, row: number): boolean =>
            this.locked.some((c) => c.reel === reel && c.row === row);

        // Coin-only reels: open cells roll blank/coin, locked cells stay covered.
        const board: string[][] = [];
        for (let reel = 0; reel < this.cfg.reelCount; reel++) {
            const col: string[] = [];
            for (let row = 0; row < this.cfg.rowCount; row++) {
                col.push(!isLocked(reel, row) && Math.random() < RESPIN_COIN_CHANCE ? coinId : blankId);
            }
            board.push(col);
        }
        this.reelManager.spin(board, 450);
        this.startSpinFx();
    }

    private featureLand(board: string[][]): void {
        this.stopSpinFx();
        this.thump();
        const state = gameStore.getState();
        const coinId = FortuneRegistry.scatterId();
        const isLocked = (reel: number, row: number): boolean =>
            this.locked.some((c) => c.reel === reel && c.row === row);

        let newCoins = 0;
        for (let reel = 0; reel < this.cfg.reelCount; reel++) {
            for (let row = 0; row < this.cfg.rowCount; row++) {
                if (board[reel][row] !== coinId || isLocked(reel, row)) continue;
                const award = this.rollCoinValue(state.bet);
                const tile = this.showCoinTile(reel, row, award.value, award.label, newCoins * 0.12);
                this.locked.push({ reel, row, value: award.value, label: award.label, tile: tile.node });
                newCoins++;
            }
        }

        this.respins = newCoins > 0 ? FEATURE_RESPINS : this.respins - 1;
        this.updateRespinText();

        const full = this.locked.length >= this.cfg.reelCount * this.cfg.rowCount;
        if (full || this.respins <= 0) {
            this.featureCall = gsap.delayedCall(0.8, () => this.endFeature(full));
        } else {
            this.featureCall = gsap.delayedCall(0.85, () => this.featureSpin());
        }
    }

    private endFeature(grand: boolean): void {
        const state = gameStore.getState();
        let total = this.locked.reduce((sum, c) => sum + c.value, 0);
        if (grand) total += GRAND_MULT * state.bet;
        total = Math.round(total);

        state.setBalance(state.balance + total);
        state.setWinAmount(total);

        this.showFeatureBanner(grand ? `GRAND JACKPOT!  +$${total}` : `FEATURE WIN  +$${total}`, grand ? 0xff4d6d : 0xffd54f);
        this.bigWinFx(true);
        for (const lc of this.locked) {
            gsap.fromTo(lc.tile.scale, { x: 1.15, y: 1.15 }, { x: 1, y: 1, duration: 0.4, ease: 'back.out(2)', delay: Math.random() * 0.3 });
        }

        this.featureCall = gsap.delayedCall(3.0, () => {
            for (const lc of this.locked) this.releaseTile(lc.tile);
            this.locked = [];
            this.respinText.visible = false;
            gsap.killTweensOf(this.featureGlow);
            gsap.to(this.featureGlow, { alpha: 0, duration: 0.4, onComplete: () => { this.featureGlow.visible = false; } });
            this.featureActive = false;
        });
    }

    private updateRespinText(): void {
        this.respinText.text = `RESPINS  ${'◆'.repeat(this.respins)}${'◇'.repeat(FEATURE_RESPINS - this.respins)}`;
        gsap.fromTo(this.respinText.scale, { x: 1.15, y: 1.15 }, { x: 1, y: 1, duration: 0.25, ease: 'back.out(2)' });
    }

    // --- coin value tiles -------------------------------------------------------

    private rollCoinValue(bet: number): { value: number; label: string | null } {
        const r = Math.random();
        if (r < 0.04) return { value: MINOR_MULT * bet, label: 'MINOR' };
        if (r < 0.12) return { value: MINI_MULT * bet, label: 'MINI' };
        return { value: COIN_VALUES[(Math.random() * COIN_VALUES.length) | 0] * bet, label: null };
    }

    /** Gold value medallion over a landed coin, on the unmasked overlay. */
    private showCoinTile(reel: number, row: number, value: number, label: string | null, delay: number): { node: Container } {
        let t = this.tilePool.find((p) => !p.node.visible);
        if (!t) {
            const node = new Container();
            const gfx = new Graphics();
            const txt = new Text({ text: '', style: {
                fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 38, fontWeight: '900',
                fill: 0x4a2404, stroke: { color: 0xffe9a8, width: 2 },
            } });
            txt.anchor.set(0.5);
            const sub = new Text({ text: '', style: {
                fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 20, fontWeight: '900', letterSpacing: 1,
                fill: 0x7a1414,
            } });
            sub.anchor.set(0.5);
            sub.position.set(0, 34);
            node.addChild(gfx, txt, sub);
            node.visible = false;
            this.reelManager.view.overlayLayer.addChild(node);
            this.tilePool.push({ node, gfx, txt, sub });
            t = this.tilePool[this.tilePool.length - 1];
        }

        const R = Math.min(this.cfg.symbolWidth, this.cfg.symbolHeight) * 0.44;
        t.gfx.clear()
            .circle(0, 5, R).fill({ color: 0x000000, alpha: 0.45 })
            .circle(0, 0, R).fill(new FillGradient({
                type: 'radial', center: { x: 0.4, y: 0.35 }, innerRadius: 0.05, outerCenter: { x: 0.5, y: 0.5 }, outerRadius: 0.6, textureSpace: 'local',
                colorStops: [{ offset: 0, color: 0xffe9a8 }, { offset: 0.6, color: 0xf0b428 }, { offset: 1, color: 0x9a6a10 }],
            }))
            .circle(0, 0, R).stroke({ width: 5, color: 0x7a5210 })
            .circle(0, 0, R * 0.82).stroke({ width: 2.5, color: 0xfff3d0, alpha: 0.8 });
        t.txt.text = `$${value}`;
        t.txt.position.set(0, label ? -10 : 0);
        if (t.txt.width > R * 1.5) t.txt.scale.set((R * 1.5) / t.txt.width); else t.txt.scale.set(1);
        t.sub.text = label ?? '';
        t.sub.visible = label !== null;

        const center = this.reelManager.view.getCellCenter(reel, row);
        t.node.position.set(center.x, center.y);
        t.node.alpha = 0;
        t.node.visible = true;
        gsap.killTweensOf(t.node);
        gsap.killTweensOf(t.node.scale);
        gsap.to(t.node, { alpha: 1, duration: 0.2, delay });
        gsap.fromTo(t.node.scale, { x: 0.3, y: 0.3 }, { x: 1, y: 1, duration: 0.4, delay, ease: 'back.out(2.2)' });
        return { node: t.node };
    }

    private releaseTile(node: Container): void {
        gsap.killTweensOf(node);
        gsap.killTweensOf(node.scale);
        node.visible = false;
    }

    private clearCoinTiles(): void {
        for (const node of this.baseCoinTiles) this.releaseTile(node);
        this.baseCoinTiles = [];
        this.pendingCoins = [];
    }

    private showFeatureBanner(msg: string, tint: number): void {
        const b = this.featureBanner;
        b.text = msg;
        b.style.fill = tint;
        b.style.dropShadow = { color: tint, blur: 26, distance: 0, alpha: 0.85, angle: Math.PI / 6 };
        b.alpha = 1;
        b.visible = true;
        gsap.killTweensOf(b);
        gsap.killTweensOf(b.scale);
        gsap.fromTo(b.scale, { x: 0.3, y: 0.3 }, { x: 1, y: 1, duration: 0.45, ease: 'back.out(2.2)' });
        gsap.to(b, { alpha: 0, duration: 0.5, delay: 1.8, onComplete: () => { b.visible = false; } });
    }

    // --- premium FX ----------------------------------------------------------

    /** Ambient + reactive FX objects, built once after the environment/UI. */
    private buildFx(): void {
        const fb = this.frameBox;

        // Rising festival embers (updated every frame in updateEmbers).
        this.embers = new Graphics();
        this.embers.blendMode = 'add';
        this.fxLayer.addChild(this.embers);
        for (let i = 0; i < 46; i++) {
            this.motes.push({
                x: Math.random() * GameConfig.width,
                y: Math.random() * GameConfig.height,
                r: Math.random() * 2.4 + 0.8,
                vy: 10 + Math.random() * 20,
                vx: 5 + Math.random() * 12,
                phase: Math.random() * Math.PI * 2,
            });
        }

        // Flickering lantern flames over the static glows in the environment.
        for (const tx of [fb.x - 44, fb.x + fb.w + 44]) {
            const flame = new Graphics()
                .ellipse(0, 0, 16, 26).fill({ color: 0xffb74d, alpha: 0.85 })
                .ellipse(0, 5, 9, 14).fill({ color: 0xfff3d0, alpha: 0.95 });
            flame.blendMode = 'add';
            flame.position.set(tx, fb.y + fb.h * 0.22);
            this.fxLayer.addChild(flame);
            const flick = (): void => {
                gsap.to(flame, {
                    alpha: 0.55 + Math.random() * 0.45,
                    duration: 0.08 + Math.random() * 0.16,
                    onComplete: flick,
                });
                gsap.to(flame.scale, {
                    x: 0.85 + Math.random() * 0.3,
                    y: 0.8 + Math.random() * 0.45,
                    duration: 0.08 + Math.random() * 0.16,
                });
            };
            flick();
        }

        // Gold pulse ring around the frame while reels spin.
        this.framePulse = new Graphics()
            .roundRect(fb.x - 6, fb.y - 6, fb.w + 12, fb.h + 12, 34)
            .stroke({ width: 10, color: 0xffd54f });
        this.framePulse.blendMode = 'add';
        this.framePulse.alpha = 0;
        this.fxLayer.addChild(this.framePulse);

        // Red breathing glow for the HOLD & WIN feature.
        this.featureGlow = new Graphics()
            .roundRect(fb.x - 14, fb.y - 14, fb.w + 28, fb.h + 28, 38)
            .stroke({ width: 16, color: 0xff3a30 });
        this.featureGlow.blendMode = 'add';
        this.featureGlow.alpha = 0;
        this.featureGlow.visible = false;
        this.fxLayer.addChild(this.featureGlow);

        // Anticipation strobe over the last two reels.
        const stride = this.cfg.symbolWidth + this.cfg.horizontalGap;
        const sx = fb.x + 46 + stride * (this.cfg.reelCount - 2);
        this.anticipationStrobe = new Graphics()
            .roundRect(sx - 6, fb.y + 40, stride * 2, fb.h - 80, 14)
            .fill({ color: 0xffb300, alpha: 0.16 })
            .roundRect(sx - 6, fb.y + 40, stride * 2, fb.h - 80, 14)
            .stroke({ width: 6, color: 0xffd54f, alpha: 0.9 });
        this.anticipationStrobe.blendMode = 'add';
        this.anticipationStrobe.alpha = 0;
        this.fxLayer.addChild(this.anticipationStrobe);
    }

    private updateEmbers(dt: number): void {
        this.embers.clear();
        const H = GameConfig.height;
        const W = GameConfig.width;
        for (const m of this.motes) {
            m.y -= m.vy * dt;
            m.x += Math.sin(this.elapsed * 0.7 + m.phase) * m.vx * dt;
            if (m.y < -8) { m.y = H + 8; m.x = Math.random() * W; }
            const tw = 0.25 + 0.2 * Math.sin(this.elapsed * 2 + m.phase * 3);
            this.embers.circle(m.x, m.y, m.r).fill({ color: 0xffc46a, alpha: tw });
        }
    }

    /** Frame pulse for the whole spin + a strobe on the final reels for tension. */
    private startSpinFx(): void {
        gsap.killTweensOf(this.framePulse);
        this.framePulse.alpha = 0;
        gsap.to(this.framePulse, { alpha: 0.5, duration: 0.45, ease: 'sine.inOut', yoyo: true, repeat: -1 });

        // Strobe kicks in once the first reels have landed (anticipation window).
        const t = this.cfg.timing;
        const leadIn = (t.spinDuration + t.stopStagger * (this.cfg.reelCount - 2)) / 1000;
        this.strobeCall?.kill();
        this.strobeCall = gsap.delayedCall(leadIn, () => {
            if (!this.reelManager.isSpinning) return;
            gsap.killTweensOf(this.anticipationStrobe);
            gsap.to(this.anticipationStrobe, { alpha: 1, duration: 0.16, ease: 'sine.inOut', yoyo: true, repeat: -1 });
        });
    }

    private stopSpinFx(): void {
        this.strobeCall?.kill();
        this.strobeCall = null;
        gsap.killTweensOf(this.framePulse);
        gsap.to(this.framePulse, { alpha: 0, duration: 0.25 });
        gsap.killTweensOf(this.anticipationStrobe);
        gsap.to(this.anticipationStrobe, { alpha: 0, duration: 0.2 });
    }

    /** Physical landing thump: the reel block + frame dip and settle. */
    private thump(): void {
        for (const target of [this.reelsContainer.position, this.env.position]) {
            gsap.killTweensOf(target);
            gsap.timeline()
                .to(target, { y: 9, duration: 0.07, ease: 'power2.out' })
                .to(target, { y: 0, duration: 0.34, ease: 'elastic.out(1.2, 0.45)' });
        }
    }

    /** God-ray sweep over the festival + golden coin rain. `epic` doubles it. */
    private bigWinFx(epic: boolean): void {
        if (!this.godray) {
            this.godray = new GodrayFilter({ angle: 24, gain: 0.45, lacunarity: 2.6, parallel: true, alpha: 0 });
        }
        const ray = this.godray;
        this.env.filters = [ray];
        gsap.killTweensOf(ray);
        gsap.timeline({ onComplete: () => { this.env.filters = []; } })
            .to(ray, { alpha: epic ? 0.85 : 0.6, duration: 0.5, ease: 'power2.out' })
            .to(ray, { alpha: 0, duration: 1.2, ease: 'power2.in' }, '+=2.2');

        // Coin rain across the frame.
        const fb = this.frameBox;
        const count = epic ? 36 : 22;
        for (let i = 0; i < count; i++) {
            const coin = this.acquireCoin();
            const size = 9 + Math.random() * 8;
            coin.clear()
                .ellipse(0, 0, size, size * 0.78).fill({ color: 0xffd54f })
                .ellipse(0, 0, size, size * 0.78).stroke({ width: 2.5, color: 0x8a6512 })
                .ellipse(-size * 0.3, -size * 0.25, size * 0.3, size * 0.18).fill({ color: 0xfff6cf, alpha: 0.9 });
            const x = fb.x + 20 + Math.random() * (fb.w - 40);
            coin.position.set(x, fb.y - 30 - Math.random() * 120);
            coin.rotation = Math.random() * Math.PI;
            coin.alpha = 1;
            coin.visible = true;
            gsap.to(coin, {
                y: fb.y + fb.h + 60,
                x: x + (Math.random() - 0.5) * 130,
                rotation: coin.rotation + (Math.random() - 0.5) * 9,
                duration: 1.3 + Math.random() * 1.1,
                delay: Math.random() * 0.7,
                ease: 'power1.in',
                onComplete: () => { coin.visible = false; },
            });
            // Spin glint: oscillate the horizontal scale so the coin "tumbles".
            gsap.to(coin.scale, {
                x: 0.25, duration: 0.22 + Math.random() * 0.1,
                yoyo: true, repeat: 11, ease: 'sine.inOut',
            });
        }
    }

    private acquireCoin(): Graphics {
        let c = this.coinPool.find((g) => !g.visible);
        if (!c) {
            c = new Graphics();
            c.visible = false;
            this.fxLayer.addChild(c);
            this.coinPool.push(c);
        }
        gsap.killTweensOf(c);
        gsap.killTweensOf(c.scale);
        c.scale.set(1);
        return c;
    }

    // --- presentation ------------------------------------------------------

    private vgrad(stops: { offset: number; color: number }[]): FillGradient {
        return new FillGradient({ type: 'linear', start: { x: 0, y: 0 }, end: { x: 0, y: 1 }, textureSpace: 'local', colorStops: stops });
    }

    /** Festival night: lantern strings, pagoda skyline, red-gold temple frame. */
    private buildEnvironment(reelX: number, reelY: number, vw: number, vh: number): Container {
        const env = new Container();
        const W = GameConfig.width;
        const H = GameConfig.height;
        const cx = W / 2;
        const horizon = H * 0.72;

        // Night gradient (deep plum → warm festival red at the ground).
        env.addChild(new Graphics().rect(0, 0, W, H).fill(this.vgrad([
            { offset: 0, color: 0x14081c }, { offset: 0.55, color: 0x2e0e1a }, { offset: 1, color: 0x4a1410 },
        ])));

        // Stars.
        const stars = new Graphics();
        for (let i = 0; i < 80; i++) {
            stars.circle(Math.random() * W, Math.random() * horizon * 0.8, Math.random() * 1.6 + 0.4)
                .fill({ color: 0xffe9c4, alpha: Math.random() * 0.45 + 0.15 });
        }
        env.addChild(stars);

        // Warm glow pool behind the reels.
        env.addChild(new Graphics().ellipse(cx, reelY + vh / 2, vw * 0.85, vh * 1.1).fill(new FillGradient({
            type: 'radial', center: { x: 0.5, y: 0.5 }, innerRadius: 0, outerCenter: { x: 0.5, y: 0.5 }, outerRadius: 0.5, textureSpace: 'local',
            colorStops: [{ offset: 0, color: 'rgba(255,140,40,0.35)' }, { offset: 1, color: 'rgba(120,30,10,0)' }],
        })));

        // Pagoda skyline silhouettes.
        const pagoda = (px: number, scale: number): void => {
            const p = new Graphics();
            for (let i = 0; i < 3; i++) {
                const tw = (170 - i * 40) * scale;
                const ty = horizon - (60 + i * 64) * scale;
                p.poly([px - tw / 2, ty, px + tw / 2, ty, px + tw * 0.3, ty - 36 * scale, px - tw * 0.3, ty - 36 * scale]).fill({ color: 0x1c0a14 });
                p.moveTo(px - tw / 2, ty).lineTo(px - tw / 2 - 18 * scale, ty - 12 * scale)
                    .moveTo(px + tw / 2, ty).lineTo(px + tw / 2 + 18 * scale, ty - 12 * scale)
                    .stroke({ width: 4 * scale, color: 0x1c0a14 });                       // upturned eaves
                p.rect(px - tw * 0.26, ty - 36 * scale, tw * 0.52, 36 * scale).fill({ color: 0x140710 });
            }
            p.rect(px - 4 * scale, horizon - 220 * scale, 8 * scale, 30 * scale).fill({ color: 0x1c0a14 }); // finial
            env.addChild(p);
        };
        pagoda(W * 0.1, 1.1);
        pagoda(W * 0.9, 1.3);
        pagoda(W * 0.78, 0.7);

        // Ground wash.
        env.addChild(new Graphics().rect(0, horizon, W, H - horizon).fill(this.vgrad([
            { offset: 0, color: 0x3a100c }, { offset: 1, color: 0x140404 },
        ])));

        // Strings of hanging lanterns across the top.
        const lanternString = (y0: number, sag: number, n: number): void => {
            const str = new Graphics();
            str.moveTo(0, y0).quadraticCurveTo(cx, y0 + sag, W, y0).stroke({ width: 3, color: 0x4a2418, alpha: 0.8 });
            env.addChild(str);
            for (let i = 1; i < n; i++) {
                const t = i / n;
                const lx = t * W;
                const ly = y0 + 2 * sag * t * (1 - t) + 18;
                const r = 16 + ((i * 7) % 3) * 4;
                const glow = new Graphics().circle(lx, ly, r * 2.2).fill({ color: 0xff7a30, alpha: 0.1 });
                glow.blendMode = 'add';
                env.addChild(glow);
                env.addChild(new Graphics()
                    .moveTo(lx, ly - r - 12).lineTo(lx, ly - r).stroke({ width: 2, color: 0x4a2418 })
                    .ellipse(lx, ly, r * 0.85, r).fill(this.vgrad([
                        { offset: 0, color: 0xff8a40 }, { offset: 0.5, color: 0xe03818 }, { offset: 1, color: 0x8a1808 },
                    ]))
                    .rect(lx - r * 0.4, ly - r - 4, r * 0.8, 5).fill({ color: 0xd4af37 })
                    .rect(lx - r * 0.4, ly + r - 1, r * 0.8, 5).fill({ color: 0xd4af37 })
                    .moveTo(lx, ly + r + 4).lineTo(lx, ly + r + 14).stroke({ width: 2, color: 0xd4af37 }));
            }
        };
        lanternString(26, 70, 9);
        lanternString(-10, 110, 7);

        // Red-lacquer temple frame around the reels with gold trim.
        const LACQUER = [{ offset: 0, color: 0x8a1c14 }, { offset: 0.5, color: 0x5e100c }, { offset: 1, color: 0x2e0806 }];
        const GOLD = [{ offset: 0, color: 0xffe9a8 }, { offset: 0.5, color: 0xd4af37 }, { offset: 1, color: 0x7a5f12 }];
        env.addChild(new Graphics()
            .roundRect(reelX - 46, reelY - 46, vw + 92, vh + 92, 30).fill(this.vgrad(LACQUER))
            .roundRect(reelX - 46, reelY - 46, vw + 92, vh + 92, 30).stroke({ width: 6, color: 0x1c0604 })
            .roundRect(reelX - 20, reelY - 20, vw + 40, vh + 40, 18).fill(0x120508)
            .roundRect(reelX - 20, reelY - 20, vw + 40, vh + 40, 18).stroke({ width: 4, color: 0xffd54f, alpha: 0.6 }));

        // Gold cloud-scroll studs along the frame.
        const studs = new Graphics();
        for (let gx = reelX - 10; gx < reelX + vw + 10; gx += 60) {
            studs.circle(gx, reelY - 33, 5).fill({ color: 0xd4af37, alpha: 0.9 })
                .circle(gx, reelY + vh + 33, 5).fill({ color: 0xd4af37, alpha: 0.9 });
        }
        env.addChild(studs);

        // Pediment: gold plaque with upturned roof corners.
        const pedW = vw + 200;
        const pedH = 92;
        const pedY = reelY - 46 - pedH - 6;
        env.addChild(new Graphics()
            .roundRect(cx - pedW / 2, pedY, pedW, pedH, 20).fill(this.vgrad(GOLD))
            .roundRect(cx - pedW / 2, pedY, pedW, pedH, 20).stroke({ width: 5, color: 0x4a3a14 })
            .poly([cx - pedW / 2 + 24, pedY, cx - pedW / 2 - 26, pedY - 30, cx - pedW / 2 + 120, pedY - 18]).fill(this.vgrad(LACQUER))
            .poly([cx + pedW / 2 - 24, pedY, cx + pedW / 2 + 26, pedY - 30, cx + pedW / 2 - 120, pedY - 18]).fill(this.vgrad(LACQUER)));
        const title = new Text({
            text: 'FORTUNE COINS',
            style: {
                fontFamily: 'Georgia, "Times New Roman", serif', fontSize: 46, fontWeight: '900',
                letterSpacing: 6, fill: 0x7a1010, stroke: { color: 0xffe082, width: 2 },
            },
        });
        title.anchor.set(0.5);
        title.position.set(cx, pedY + pedH / 2);
        env.addChild(title);

        // Lantern glows flanking the frame (flames flicker in buildFx).
        const sides = new Graphics();
        sides.blendMode = 'add';
        for (const tx of [reelX - 90, reelX + vw + 90]) {
            sides.circle(tx, reelY + vh * 0.18, 26).fill({ color: 0xff7a30, alpha: 0.3 })
                .circle(tx, reelY + vh * 0.18, 10).fill({ color: 0xffd180, alpha: 0.8 });
        }
        env.addChild(sides);

        return env;
    }

    private createUI(reelX: number, reelY: number, vw: number, vh: number): void {
        // Coin SPIN button (pivot centred so the press-squash scales in place).
        const spinButton = new Graphics()
            .roundRect(0, 0, 170, 170, 85).fill(0x9a1c10)
            .roundRect(0, 0, 170, 170, 85).stroke({ width: 6, color: 0xffd54f });
        spinButton.pivot.set(85, 85);
        spinButton.position.set(GameConfig.width - 145, GameConfig.height / 2);
        spinButton.eventMode = 'static';
        spinButton.cursor = 'pointer';
        spinButton.on('pointerdown', () => {
            gsap.fromTo(spinButton.scale, { x: 0.9, y: 0.9 }, { x: 1, y: 1, duration: 0.4, ease: 'back.out(3)' });
            this.spin();
        });
        const spinText = new Text({ text: 'SPIN', style: { fill: 0xfff3d0, fontSize: 36, fontWeight: 'bold' } });
        spinText.anchor.set(0.5);
        spinText.position.set(85, 85);
        spinButton.addChild(spinText);
        this.uiContainer.addChild(spinButton);

        // Idle attract pulse behind the button.
        const pulse = new Graphics().circle(0, 0, 92).stroke({ width: 5, color: 0xffd54f });
        pulse.blendMode = 'add';
        pulse.position.copyFrom(spinButton.position);
        this.uiContainer.addChildAt(pulse, 0);
        gsap.timeline({ repeat: -1, repeatDelay: 1.2 })
            .set(pulse, { alpha: 0.8 })
            .set(pulse.scale, { x: 1, y: 1 }, 0)
            .to(pulse.scale, { x: 1.45, y: 1.45, duration: 1.1, ease: 'power1.out' }, 0)
            .to(pulse, { alpha: 0, duration: 1.1, ease: 'power1.out' }, 0);

        // Feature banner over the reels ("HOLD & WIN!" / "FEATURE WIN $N").
        this.featureBanner = new Text({
            text: '',
            style: {
                fontFamily: 'Georgia, "Times New Roman", serif', fontSize: 72, fontWeight: '900', letterSpacing: 3,
                fill: 0xffd54f, stroke: { color: 0x2e0806, width: 10 },
            },
        });
        this.featureBanner.anchor.set(0.5);
        this.featureBanner.position.set(reelX + vw / 2, reelY - 110);
        this.featureBanner.visible = false;
        this.uiContainer.addChild(this.featureBanner);

        // Respin pips, shown only during HOLD & WIN.
        this.respinText = new Text({
            text: '',
            style: {
                fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 30, fontWeight: '900', letterSpacing: 3,
                fill: 0xff5a4e, stroke: { color: 0x2e0806, width: 6 },
            },
        });
        this.respinText.anchor.set(0.5);
        this.respinText.position.set(reelX + vw / 2, reelY + vh + 76);
        this.respinText.visible = false;
        this.uiContainer.addChild(this.respinText);

        // Balance / win readouts.
        const balanceText = new Text({ text: '', style: { fill: 0xfff3d0, fontSize: 30 } });
        balanceText.position.set(50, GameConfig.height - 70);
        const winText = new Text({ text: '', style: { fill: 0xffd54f, fontSize: 30, fontWeight: 'bold' } });
        winText.position.set(50, GameConfig.height - 110);
        this.uiContainer.addChild(balanceText, winText);

        // Back to menu.
        const back = new Text({ text: '‹ MENU', style: { fill: 0xffd54f, fontSize: 26, fontWeight: 'bold' } });
        back.position.set(40, 36);
        back.eventMode = 'static';
        back.cursor = 'pointer';
        back.on('pointerdown', () => SceneManager.switchScene(new MenuScene()));
        // (back-to-menu removed) this.uiContainer.addChild(back);

        const hint = new Text({ text: '6+ fortune coins trigger HOLD & WIN · fill all 15 for the GRAND · space to spin', style: { fill: 0xd49a6a, fontSize: 20, fontStyle: 'italic' } });
        hint.anchor.set(0.5);
        hint.position.set(reelX + vw / 2, reelY + vh + 110);
        this.uiContainer.addChild(hint);

        const render = (s: ReturnType<typeof gameStore.getState>): void => {
            balanceText.text = `Balance: $${s.balance}   Bet: $${s.bet}`;
            winText.text = s.winAmount > 0 ? `WIN: $${s.winAmount}` : '';
        };
        render(gameStore.getState());
        gameStore.subscribe(render);
    }
}
