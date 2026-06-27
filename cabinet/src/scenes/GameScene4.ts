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
import { drawEgyptTile } from '../reels/SymbolArtEgypt';
import { EgyptRegistry } from '../game/EgyptSymbols';
import { WeightedSymbolPicker } from '../game/SymbolRegistry';
import { PaylineManager } from '../game/PaylineManager';
import { WinCalculator } from '../game/WinCalculator';
import { SymbolAnimator } from '../game/SymbolAnimator';
import { SymbolEffects } from '../game/SymbolEffects';
import { WinPresenter } from '../game/WinPresenter';
import { MenuScene } from './MenuScene';

/**
 * GameScene4 — Slot 4: "Pharaoh's Fortune"
 * ----------------------------------------
 * Ancient-Egypt 5×3 payline slot. Reuses the generic reel engine + win systems
 * with the Egypt registry and cartouche tile art, set against a desert night:
 * pyramids on the horizon, a glowing sun disc behind the reels, and a
 * hieroglyph-trimmed sandstone temple frame.
 *
 * Premium presentation layer on top of the shared systems:
 *  - ambient drifting sand-dust + flickering torch flames
 *  - golden frame pulse while the reels spin
 *  - anticipation strobe on the final reels (near-win tension)
 *  - god-ray sweep across the temple + a falling coin rain on tiered wins
 *  - physical "thump" when the reels land
 */
export class GameScene4 extends BaseScene {
    private readonly reelsContainer = new Container();
    private readonly uiContainer = new Container();

    private cfg!: ReelEngineConfig;
    private reelManager!: ReelManager;
    private picker!: WeightedSymbolPicker;
    private paylines!: PaylineManager;
    private winCalculator!: WinCalculator;
    private winPresenter!: WinPresenter;

    // --- premium FX state ---
    private env!: Container;
    private readonly fxLayer = new Container();
    private dust!: Graphics;
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
            symbols: EgyptRegistry.reelSymbolDefinitions(),
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

        // Egyptian tiles via the pluggable artist.
        this.reelManager = new ReelManager(this.cfg, renderer, drawEgyptTile);
        this.reelManager.view.position.set(reelX, reelY);
        this.reelsContainer.addChild(this.reelManager.view);
        this.reelManager.onSpinComplete = (board) => this.onSpinComplete(board);

        this.picker = new WeightedSymbolPicker(EgyptRegistry.all());
        this.paylines = new PaylineManager(this.cfg.reelCount, this.cfg.rowCount);
        this.winCalculator = new WinCalculator(EgyptRegistry);
        const animator = new SymbolAnimator();
        const effects = new SymbolEffects(this.reelManager.view.overlayLayer, this.cfg.symbolWidth, this.cfg.symbolHeight);
        this.winPresenter = new WinPresenter(this.reelManager.view, this.cfg, EgyptRegistry, animator, effects);

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
        this.updateDust(dt);
        if (this.godray) this.godray.time += dt * 1.2;
    }

    public resize(_width: number, _height: number): void {}

    public override async destroyScene(): Promise<void> {
        window.removeEventListener('keydown', this.onKeyDown);
        this.strobeCall?.kill();
        gsap.killTweensOf(this.framePulse);
        gsap.killTweensOf(this.anticipationStrobe);
        for (const c of this.coinPool) gsap.killTweensOf(c);
        this.env.filters = [];
        this.winPresenter?.clear();
        await super.destroyScene();
    }

    // --- spin flow ---------------------------------------------------------

    private spin(): void {
        const state = gameStore.getState();
        if (this.reelManager.isSpinning || state.balance < state.bet) return;
        this.winPresenter.clear();
        state.setBalance(state.balance - state.bet);
        state.setSpinning(true);
        state.setWinAmount(0);
        const board = this.picker.spinBoard(this.cfg.reelCount, this.cfg.rowCount);
        this.plantDemoWin(board); // DEMO ONLY: lift the hit-rate so wins show often
        this.reelManager.spin(board);
        this.startSpinFx();
    }

    private plantDemoWin(board: string[][]): void {
        if (Math.random() > 0.6) return;
        const line = this.paylines.get((Math.random() * this.paylines.count) | 0);
        const normals = EgyptRegistry.all().filter((s) => s.kind === 'normal');
        const id = normals[(Math.random() * normals.length) | 0].id;
        const len = 3 + ((Math.random() * 3) | 0);
        for (let reel = 0; reel < len && reel < this.cfg.reelCount; reel++) board[reel][line[reel]] = id;
    }

    private onSpinComplete(board: string[][]): void {
        const state = gameStore.getState();
        state.setSpinning(false);
        this.stopSpinFx();
        this.thump();
        const result = this.winCalculator.evaluate(board, this.paylines, state.bet);
        if (result.totalWin > 0) {
            const win = Math.round(result.totalWin);
            state.setWinAmount(win);
            state.setBalance(state.balance + win);
            this.winPresenter.present(result);
            if (result.totalWin >= state.bet * 15) this.bigWinFx(result.totalWin >= state.bet * 40);
        }
    }

    // --- premium FX ----------------------------------------------------------

    /** Ambient + reactive FX objects, built once after the environment/UI. */
    private buildFx(): void {
        const fb = this.frameBox;

        // Drifting golden sand-dust motes (updated every frame in updateDust).
        this.dust = new Graphics();
        this.dust.blendMode = 'add';
        this.fxLayer.addChild(this.dust);
        for (let i = 0; i < 46; i++) {
            this.motes.push({
                x: Math.random() * GameConfig.width,
                y: Math.random() * GameConfig.height,
                r: Math.random() * 2.4 + 0.8,
                vy: 8 + Math.random() * 18,
                vx: 4 + Math.random() * 10,
                phase: Math.random() * Math.PI * 2,
            });
        }

        // Flickering torch flames over the static glows in the environment.
        for (const tx of [fb.x - 44, fb.x + fb.w + 44]) {
            const flame = new Graphics()
                .ellipse(0, 0, 18, 30).fill({ color: 0xffb74d, alpha: 0.85 })
                .ellipse(0, 6, 10, 16).fill({ color: 0xfff3d0, alpha: 0.95 });
            flame.blendMode = 'add';
            flame.position.set(tx, fb.y + fb.h * 0.28);
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

        // Golden pulse ring around the temple frame while reels spin.
        this.framePulse = new Graphics()
            .roundRect(fb.x - 6, fb.y - 6, fb.w + 12, fb.h + 12, 34)
            .stroke({ width: 10, color: 0xffd54f });
        this.framePulse.blendMode = 'add';
        this.framePulse.alpha = 0;
        this.fxLayer.addChild(this.framePulse);

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

    private updateDust(dt: number): void {
        this.dust.clear();
        const H = GameConfig.height;
        const W = GameConfig.width;
        for (const m of this.motes) {
            m.y -= m.vy * dt;
            m.x += Math.sin(this.elapsed * 0.7 + m.phase) * m.vx * dt;
            if (m.y < -8) { m.y = H + 8; m.x = Math.random() * W; }
            const tw = 0.25 + 0.2 * Math.sin(this.elapsed * 2 + m.phase * 3);
            this.dust.circle(m.x, m.y, m.r).fill({ color: 0xffd99a, alpha: tw });
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

    /** God-ray sweep over the temple + golden coin rain. `epic` doubles it. */
    private bigWinFx(epic: boolean): void {
        // God rays wash over the environment for a few seconds.
        if (!this.godray) {
            this.godray = new GodrayFilter({ angle: 24, gain: 0.45, lacunarity: 2.6, parallel: true, alpha: 0 });
        }
        const ray = this.godray;
        this.env.filters = [ray];
        gsap.killTweensOf(ray);
        gsap.timeline({ onComplete: () => { this.env.filters = []; } })
            .to(ray, { alpha: epic ? 0.85 : 0.6, duration: 0.5, ease: 'power2.out' })
            .to(ray, { alpha: 0, duration: 1.2, ease: 'power2.in' }, '+=2.2');

        // Coin rain across the temple frame.
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

    /** Desert night: starfield, distant pyramids, sun-disc glow, temple frame. */
    private buildEnvironment(reelX: number, reelY: number, vw: number, vh: number): Container {
        const env = new Container();
        const W = GameConfig.width;
        const H = GameConfig.height;
        const cx = W / 2;
        const horizon = H * 0.66;

        // Night-sky gradient (deep indigo → warm horizon).
        env.addChild(new Graphics().rect(0, 0, W, H).fill(this.vgrad([
            { offset: 0, color: 0x0d0a26 }, { offset: 0.55, color: 0x241540 }, { offset: 1, color: 0x4a2410 },
        ])));

        // Stars.
        const stars = new Graphics();
        for (let i = 0; i < 110; i++) {
            stars.circle(Math.random() * W, Math.random() * horizon, Math.random() * 1.7 + 0.4)
                .fill({ color: 0xfff3d0, alpha: Math.random() * 0.5 + 0.15 });
        }
        env.addChild(stars);

        // Golden sun-disc glow behind the reels.
        env.addChild(new Graphics().ellipse(cx, reelY + vh / 2, vw * 0.85, vh * 1.1).fill(new FillGradient({
            type: 'radial', center: { x: 0.5, y: 0.5 }, innerRadius: 0, outerCenter: { x: 0.5, y: 0.5 }, outerRadius: 0.5, textureSpace: 'local',
            colorStops: [{ offset: 0, color: 'rgba(255,179,0,0.4)' }, { offset: 1, color: 'rgba(120,60,0,0)' }],
        })));

        // Distant pyramids on the horizon.
        const pyr = new Graphics();
        const silhouettes: Array<[number, number, number]> = [
            [W * 0.12, 240, 340], [W * 0.84, 300, 420], [W * 0.94, 180, 260],
        ];
        for (const [px, ph, pw2] of silhouettes) {
            pyr.poly([px - pw2 / 2, horizon, px, horizon - ph, px + pw2 / 2, horizon]).fill({ color: 0x1a0f2e });
            pyr.poly([px, horizon - ph, px + pw2 / 2, horizon, px + pw2 * 0.12, horizon]).fill({ color: 0x2a1a44, alpha: 0.8 });
        }
        env.addChild(pyr);

        // Desert floor.
        env.addChild(new Graphics().rect(0, horizon, W, H - horizon).fill(this.vgrad([
            { offset: 0, color: 0x3a2a14 }, { offset: 1, color: 0x140c04 },
        ])));

        // Sandstone temple frame around the reels, hieroglyph-trimmed.
        const GOLD = [{ offset: 0, color: 0xffe9a8 }, { offset: 0.5, color: 0xd4af37 }, { offset: 1, color: 0x7a5f12 }];
        const SAND = [{ offset: 0, color: 0xe8d9b0 }, { offset: 0.5, color: 0xc8ae72 }, { offset: 1, color: 0x66572f }];
        env.addChild(new Graphics()
            .roundRect(reelX - 46, reelY - 46, vw + 92, vh + 92, 30).fill(this.vgrad(SAND))
            .roundRect(reelX - 46, reelY - 46, vw + 92, vh + 92, 30).stroke({ width: 6, color: 0x4a3a14 })
            .roundRect(reelX - 20, reelY - 20, vw + 40, vh + 40, 18).fill(0x120b04)
            .roundRect(reelX - 20, reelY - 20, vw + 40, vh + 40, 18).stroke({ width: 4, color: 0xffe9a8, alpha: 0.5 }));

        // Hieroglyph studs along the frame.
        const glyphs = new Graphics();
        for (let gx = reelX - 10; gx < reelX + vw + 10; gx += 64) {
            glyphs.circle(gx, reelY - 33, 5).fill({ color: 0x7a5f12 })
                .circle(gx, reelY + vh + 33, 5).fill({ color: 0x7a5f12 });
        }
        env.addChild(glyphs);

        // Pediment with title.
        const pedW = vw + 200;
        const pedH = 92;
        const pedY = reelY - 46 - pedH - 6;
        env.addChild(new Graphics()
            .roundRect(cx - pedW / 2, pedY, pedW, pedH, 20).fill(this.vgrad(GOLD))
            .roundRect(cx - pedW / 2, pedY, pedW, pedH, 20).stroke({ width: 5, color: 0x4a3a14 })
            .poly([cx - pedW / 2 + 30, pedY, cx, pedY - 44, cx + pedW / 2 - 30, pedY]).fill(this.vgrad(SAND))
            .poly([cx - pedW / 2 + 30, pedY, cx, pedY - 44, cx + pedW / 2 - 30, pedY]).stroke({ width: 4, color: 0x4a3a14 }));
        const title = new Text({
            text: "PHARAOH'S FORTUNE",
            style: {
                fontFamily: 'Georgia, "Times New Roman", serif', fontSize: 46, fontWeight: '900',
                letterSpacing: 4, fill: 0x3a2a10, stroke: { color: 0xffe082, width: 2 },
            },
        });
        title.anchor.set(0.5);
        title.position.set(cx, pedY + pedH / 2);
        env.addChild(title);

        // Torch glows flanking the frame.
        const torches = new Graphics();
        torches.blendMode = 'add';
        for (const tx of [reelX - 90, reelX + vw + 90]) {
            torches.circle(tx, reelY + vh * 0.2, 26).fill({ color: 0xff9800, alpha: 0.3 })
                .circle(tx, reelY + vh * 0.2, 10).fill({ color: 0xffd180, alpha: 0.8 });
        }
        env.addChild(torches);

        return env;
    }

    private createUI(reelX: number, reelY: number, vw: number, vh: number): void {
        // Scarab SPIN button (pivot centred so the press-squash scales in place).
        const spinButton = new Graphics()
            .roundRect(0, 0, 170, 170, 85).fill(0x8d6e1a)
            .roundRect(0, 0, 170, 170, 85).stroke({ width: 6, color: 0xffe082 });
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
        const pulse = new Graphics().circle(0, 0, 92).stroke({ width: 5, color: 0xffe082 });
        pulse.blendMode = 'add';
        pulse.position.copyFrom(spinButton.position);
        this.uiContainer.addChildAt(pulse, 0);
        gsap.timeline({ repeat: -1, repeatDelay: 1.2 })
            .set(pulse, { alpha: 0.8 })
            .set(pulse.scale, { x: 1, y: 1 }, 0)
            .to(pulse.scale, { x: 1.45, y: 1.45, duration: 1.1, ease: 'power1.out' }, 0)
            .to(pulse, { alpha: 0, duration: 1.1, ease: 'power1.out' }, 0);

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

        const hint = new Text({ text: 'space to spin · esc for menu', style: { fill: 0xc8ae72, fontSize: 20, fontStyle: 'italic' } });
        hint.anchor.set(0.5);
        hint.position.set(reelX + vw / 2, reelY + vh + 76);
        this.uiContainer.addChild(hint);

        const render = (s: ReturnType<typeof gameStore.getState>): void => {
            balanceText.text = `Balance: $${s.balance}   Bet: $${s.bet}`;
            winText.text = s.winAmount > 0 ? `WIN: $${s.winAmount}` : '';
        };
        render(gameStore.getState());
        gameStore.subscribe(render);
    }
}
