import { Text, Container, Graphics, FillGradient } from 'pixi.js';
import { BaseScene } from './BaseScene';
import { GameConfig } from '../config/GameConfig';
import { gameStore } from '../state/GameState';
import { SceneManager } from '../managers/SceneManager';
import { AssetManager } from '../managers/AssetManager';
import { ReelManager } from '../reels/ReelManager';
import { createReelConfig, viewportWidth, viewportHeight } from '../reels/ReelConfig';
import type { ReelEngineConfig } from '../reels/ReelConfig';
import { SymbolTextureRegistry } from '../reels/Symbol';
import { drawVegasTile } from '../reels/SymbolArtVegas';
import { VegasRegistry } from '../game/VegasSymbols';
import { WeightedSymbolPicker } from '../game/SymbolRegistry';
import { PaylineManager } from '../game/PaylineManager';
import { WinCalculator } from '../game/WinCalculator';
import { SymbolAnimator } from '../game/SymbolAnimator';
import { SymbolEffects } from '../game/SymbolEffects';
import { WinPresenter } from '../game/WinPresenter';
import { MenuScene } from './MenuScene';
import { gsap } from 'gsap';

/**
 * GameScene2 — Slot 2: "Lucky 7s"
 * --------------------------------
 * Classic Vegas one-armed bandit. Reuses the generic reel engine + win systems
 * with the Vegas registry and tile art, a chrome cabinet background, and a
 * draggable pull handle (drag it down to spin).
 */
export class GameScene2 extends BaseScene {
    private readonly reelsContainer = new Container();
    private readonly uiContainer = new Container();

    private cfg!: ReelEngineConfig;
    private reelManager!: ReelManager;
    private picker!: WeightedSymbolPicker;
    private paylines!: PaylineManager;
    private winCalculator!: WinCalculator;
    private winPresenter!: WinPresenter;

    // Handle drag state.
    private handle!: Container;
    private handleDragging = false;
    private handleStartY = 0;
    private handlePull = 0;
    private static readonly HANDLE_MAX_ANGLE = 1.35;

    private readonly onKeyDown = (e: KeyboardEvent): void => {
        if (e.code === 'Space') { e.preventDefault(); this.spin(); }
        // (back-to-menu removed) if (e.code === 'Escape') SceneManager.switchScene(new MenuScene());
    };
    private readonly onPointerMove = (e: PointerEvent): void => this.dragHandle(e);
    private readonly onPointerUp = (): void => this.releaseHandle();

    constructor() {
        super();
        this.addChild(this.reelsContainer);
        this.addChild(this.uiContainer);
    }

    public async init(): Promise<void> {
        const renderer = SceneManager.application.renderer;
        this.cfg = createReelConfig({
            reelCount: 3,
            rowCount: 3,
            symbols: VegasRegistry.reelSymbolDefinitions(),
            timing: { stopStagger: 150, spinDuration: 900 },
            physics: { maxSpeed: 36, acceleration: 0.4, overshoot: 2.0 },
        });

        // Real art was preloaded by the LoaderScene; register it (procedural otherwise).
        for (const [id, texture] of AssetManager.preloadedSymbols) SymbolTextureRegistry.register(id, texture);

        const vw = viewportWidth(this.cfg);
        const vh = viewportHeight(this.cfg);
        const reelX = (GameConfig.width - vw) / 2;
        const reelY = (GameConfig.height - vh) / 2 + 40; // pushed down to make room for the marquee

        this.addChildAt(this.buildCabinet(reelX, reelY, vw, vh), 0);

        // Vegas tiles via the pluggable artist.
        this.reelManager = new ReelManager(this.cfg, renderer, drawVegasTile);
        this.reelManager.view.position.set(reelX, reelY);
        this.reelsContainer.addChild(this.reelManager.view);
        this.reelManager.onSpinComplete = (board) => this.onSpinComplete(board);

        this.picker = new WeightedSymbolPicker(VegasRegistry.all());
        this.paylines = new PaylineManager(this.cfg.reelCount, this.cfg.rowCount);
        this.winCalculator = new WinCalculator(VegasRegistry);
        const animator = new SymbolAnimator();
        const effects = new SymbolEffects(this.reelManager.view.overlayLayer, this.cfg.symbolWidth, this.cfg.symbolHeight);
        this.winPresenter = new WinPresenter(this.reelManager.view, this.cfg, VegasRegistry, animator, effects);

        this.createUI(reelX, reelY, vw, vh);
        window.addEventListener('keydown', this.onKeyDown);
        window.addEventListener('pointermove', this.onPointerMove);
        window.addEventListener('pointerup', this.onPointerUp);
    }

    public async start(): Promise<void> {}

    public update(delta: number): void {
        if (!this.reelManager) return;
        this.reelManager.update(Math.min(delta / 60, 0.05));
    }

    public resize(_width: number, _height: number): void {}

    public override async destroyScene(): Promise<void> {
        window.removeEventListener('keydown', this.onKeyDown);
        window.removeEventListener('pointermove', this.onPointerMove);
        window.removeEventListener('pointerup', this.onPointerUp);
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
        this.plantDemoWin(board);
        this.reelManager.spin(board);
    }

    private plantDemoWin(board: string[][]): void {
        if (Math.random() > 0.6) return;
        const line = this.paylines.get((Math.random() * this.paylines.count) | 0);
        const normals = VegasRegistry.all().filter((s) => s.kind === 'normal');
        const id = normals[(Math.random() * normals.length) | 0].id;
        const len = 3 + ((Math.random() * 3) | 0);
        for (let reel = 0; reel < len && reel < this.cfg.reelCount; reel++) board[reel][line[reel]] = id;
    }

    private onSpinComplete(board: string[][]): void {
        const state = gameStore.getState();
        state.setSpinning(false);
        const result = this.winCalculator.evaluate(board, this.paylines, state.bet);
        if (result.totalWin > 0) {
            const win = Math.round(result.totalWin);
            state.setWinAmount(win);
            state.setBalance(state.balance + win);
            this.winPresenter.present(result);
        }
    }

    // --- pull handle -------------------------------------------------------

    private dragHandle(e: PointerEvent): void {
        if (!this.handleDragging) return;
        const pull = Math.max(0, Math.min((e.clientY - this.handleStartY) / 200, 1));
        this.handlePull = pull;
        this.handle.rotation = pull * GameScene2.HANDLE_MAX_ANGLE;
    }

    private releaseHandle(): void {
        if (!this.handleDragging) return;
        this.handleDragging = false;
        if (this.handlePull > 0.35) {
            // Pulled far enough: spin now, lever springs back.
            this.spin();
            gsap.to(this.handle, { rotation: 0, duration: 0.5, ease: 'elastic.out(1, 0.5)' });
        } else {
            // Just a tap: auto-pull the lever fully, spin at the bottom, spring back.
            this.autoPull();
        }
        this.handlePull = 0;
    }

    /** Animate a full lever pull (used when the handle is tapped, not dragged). */
    private autoPull(): void {
        gsap.killTweensOf(this.handle);
        let fired = false;
        gsap.timeline()
            .to(this.handle, {
                rotation: GameScene2.HANDLE_MAX_ANGLE,
                duration: 0.18,
                ease: 'power2.in',
                onComplete: () => { if (!fired) { fired = true; this.spin(); } },
            })
            .to(this.handle, { rotation: 0, duration: 0.55, ease: 'elastic.out(1, 0.45)' });
    }

    // --- presentation ------------------------------------------------------

    private vgrad(stops: { offset: number; color: number }[]): FillGradient {
        return new FillGradient({ type: 'linear', start: { x: 0, y: 0 }, end: { x: 0, y: 1 }, textureSpace: 'local', colorStops: stops });
    }

    private drawStar(g: Graphics, cx: number, cy: number, points: number, outer: number, inner: number, color: number): void {
        const pts: number[] = [];
        for (let i = 0; i < points * 2; i++) {
            const r = i % 2 === 0 ? outer : inner;
            const a = (Math.PI * i) / points - Math.PI / 2;
            pts.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
        }
        g.poly(pts).fill({ color });
    }

    /** Ornate gold "Casino" cabinet — marquee, reel frame, button panel, nameplate. */
    private buildCabinet(reelX: number, reelY: number, vw: number, vh: number): Container {
        const env = new Container();
        const W = GameConfig.width;
        const H = GameConfig.height;
        const cx = W / 2;
        const GOLD = [{ offset: 0, color: 0xffe9a8 }, { offset: 0.5, color: 0xd4af37 }, { offset: 1, color: 0x7a5f12 }];
        const PURPLE = [{ offset: 0, color: 0x2a1a4a }, { offset: 1, color: 0x0c0720 }];

        // Starry backdrop.
        env.addChild(new Graphics().rect(0, 0, W, H).fill(this.vgrad([{ offset: 0, color: 0x140a26 }, { offset: 1, color: 0x05030f }])));
        const stars = new Graphics();
        for (let i = 0; i < 90; i++) stars.circle(Math.random() * W, Math.random() * H, Math.random() * 1.8 + 0.4).fill({ color: 0xffffff, alpha: Math.random() * 0.5 + 0.15 });
        env.addChild(stars);

        // Cabinet body (gold).
        const cabLeft = reelX - 150, cabRight = reelX + vw + 150;
        const cabTop = reelY - 250, cabBottom = reelY + vh + 250;
        const cabW = cabRight - cabLeft, cabH = cabBottom - cabTop;
        env.addChild(new Graphics()
            .roundRect(cabLeft, cabTop, cabW, cabH, 52).fill(this.vgrad(GOLD))
            .roundRect(cabLeft, cabTop, cabW, cabH, 52).stroke({ width: 6, color: 0x5a4410 })
            .roundRect(cabLeft + 16, cabTop + 16, cabW - 32, cabH - 32, 44).stroke({ width: 3, color: 0xfff2c0, alpha: 0.45 }));

        // Star finial.
        const finial = new Graphics();
        this.drawStar(finial, cx, cabTop - 4, 5, 36, 15, 0xffe082);
        finial.stroke({ width: 3, color: 0x7a5f12 });
        env.addChild(finial);

        // Arched marquee with "CASINO".
        const mqL = reelX - 70, mqW = vw + 140, mqTop = cabTop + 34, mqH = 150;
        env.addChild(new Graphics()
            .roundRect(mqL, mqTop, mqW, mqH, 56).fill(this.vgrad(PURPLE))
            .roundRect(mqL, mqTop, mqW, mqH, 56).stroke({ width: 6, color: 0xffd54f })
            .roundRect(mqL + 10, mqTop + 10, mqW - 20, mqH - 20, 48).stroke({ width: 2, color: 0xffe9a8, alpha: 0.4 }));
        const marquee = new Text({
            text: 'CASINO',
            style: { fontFamily: '"Brush Script MT", "Segoe Script", cursive', fontSize: 92, fontStyle: 'italic', fontWeight: '900', fill: 0xff3b54, stroke: { color: 0xffe082, width: 4 }, dropShadow: { color: 0x000000, blur: 6, distance: 3, alpha: 0.6 } },
        });
        marquee.anchor.set(0.5);
        marquee.position.set(cx, mqTop + mqH / 2);
        env.addChild(marquee);

        // Ornate reel frame.
        env.addChild(new Graphics()
            .roundRect(reelX - 34, reelY - 34, vw + 68, vh + 68, 26).fill(this.vgrad(GOLD))
            .roundRect(reelX - 34, reelY - 34, vw + 68, vh + 68, 26).stroke({ width: 5, color: 0x5a4410 })
            .roundRect(reelX - 16, reelY - 16, vw + 32, vh + 32, 16).fill(0x05060d)
            .roundRect(reelX - 16, reelY - 16, vw + 32, vh + 32, 16).stroke({ width: 4, color: 0xffe9a8, alpha: 0.5 }));

        // Button panel.
        const bpY = reelY + vh + 36, bpH = 64;
        env.addChild(new Graphics()
            .roundRect(reelX - 30, bpY, vw + 60, bpH, 16).fill(this.vgrad([{ offset: 0, color: 0xc89b2e }, { offset: 1, color: 0x6e5410 }]))
            .roundRect(reelX - 30, bpY, vw + 60, bpH, 16).stroke({ width: 3, color: 0x4a3a10 }));
        const buttons = new Graphics();
        const btnColors = [0xff5252, 0xffd54f, 0x4caf50, 0xffd54f, 0x42a5f5, 0xffd54f, 0xff5252];
        for (let i = 0; i < btnColors.length; i++) {
            const bx = reelX + 30 + (vw - 60) * (i / (btnColors.length - 1));
            buttons.circle(bx, bpY + bpH / 2, 14).fill({ color: 0x2a2208 })
                .circle(bx, bpY + bpH / 2, 11).fill({ color: btnColors[i] });
        }
        env.addChild(buttons);

        // Bottom nameplate.
        const npY = bpY + bpH + 16, npH = 86;
        env.addChild(new Graphics()
            .roundRect(reelX - 40, npY, vw + 80, npH, 18).fill(this.vgrad(PURPLE))
            .roundRect(reelX - 40, npY, vw + 80, npH, 18).stroke({ width: 5, color: 0xffd54f }));
        const sub = new Text({ text: 'LUCKY 7s', style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 44, fontWeight: '900', letterSpacing: 6, fill: 0xffd54f, stroke: { color: 0x3a2a10, width: 5 } } });
        sub.anchor.set(0.5); sub.position.set(cx, npY + npH / 2);
        env.addChild(sub);

        // Glowing edge lights down both sides.
        const lights = new Graphics();
        lights.blendMode = 'add';
        for (let y = cabTop + 70; y < cabBottom - 50; y += 48) {
            for (const lx of [cabLeft + 22, cabRight - 22]) {
                lights.circle(lx, y, 14).fill({ color: 0xff9800, alpha: 0.25 })
                    .circle(lx, y, 6).fill({ color: 0xffd180 });
            }
        }
        env.addChild(lights);

        return env;
    }

    private createUI(reelX: number, reelY: number, vw: number, vh: number): void {
        // --- pull handle: pivot at cabinet right (mid-height); arm points UP,
        //     ball on top. Pulling down rotates it down-and-right. ---
        const pivotX = reelX + vw + 98;
        const pivotY = reelY + vh * 0.55;
        this.handle = new Container();
        this.handle.position.set(pivotX, pivotY);
        const rod = new Graphics()
            .roundRect(-9, -250, 18, 250, 9).fill(new FillGradient({
                type: 'linear', start: { x: 0, y: 0 }, end: { x: 1, y: 0 }, textureSpace: 'local',
                colorStops: [{ offset: 0, color: 0x6b7480 }, { offset: 0.5, color: 0xf0f4f8 }, { offset: 1, color: 0x6b7480 }],
            }));
        const knob = new Graphics()
            .circle(0, -272, 36).fill(0xd32f2f).circle(0, -272, 36).stroke({ width: 6, color: 0xffd54f })
            .circle(-12, -282, 11).fill({ color: 0xff8a80, alpha: 0.8 });
        // Generous invisible hit area so the whole lever is grabbable.
        const hit = new Graphics().rect(-40, -310, 80, 320).fill({ color: 0xffffff, alpha: 0.001 });
        this.handle.addChild(hit, rod, knob);

        // Mount cap at the pivot.
        const mount = new Graphics()
            .circle(pivotX, pivotY, 24).fill(0x3a3f47)
            .circle(pivotX, pivotY, 24).stroke({ width: 4, color: 0x20242a });
        this.uiContainer.addChild(mount);
        this.uiContainer.addChild(this.handle);

        this.handle.eventMode = 'static';
        this.handle.cursor = 'grab';
        this.handle.on('pointerdown', (e) => {
            const state = gameStore.getState();
            if (this.reelManager.isSpinning || state.balance < state.bet) return;
            this.handleDragging = true;
            this.handlePull = 0;
            this.handleStartY = e.clientY; // DOM px, matches window pointermove
        });

        // --- SPIN button (alternative) ---
        const spinButton = new Graphics().roundRect(0, 0, 150, 150, 75).fill(0x1565c0).stroke({ width: 6, color: 0xffd54f });
        spinButton.position.set(reelX - 200, reelY + vh / 2 - 75);
        spinButton.eventMode = 'static';
        spinButton.cursor = 'pointer';
        spinButton.on('pointerdown', () => this.spin());
        const spinText = new Text({ text: 'SPIN', style: { fill: 0xffffff, fontSize: 32, fontWeight: 'bold' } });
        spinText.anchor.set(0.5); spinText.position.set(75, 75); spinButton.addChild(spinText);
        this.uiContainer.addChild(spinButton);

        // --- balance / win / back ---
        const balanceText = new Text({ text: '', style: { fill: 0xffffff, fontSize: 30 } });
        balanceText.position.set(50, GameConfig.height - 70);
        const winText = new Text({ text: '', style: { fill: 0xffd54f, fontSize: 30, fontWeight: 'bold' } });
        winText.position.set(50, GameConfig.height - 110);
        this.uiContainer.addChild(balanceText, winText);

        const back = new Text({ text: '‹ MENU', style: { fill: 0xffd54f, fontSize: 26, fontWeight: 'bold' } });
        back.position.set(40, 36);
        back.eventMode = 'static'; back.cursor = 'pointer';
        back.on('pointerdown', () => SceneManager.switchScene(new MenuScene()));
        // (back-to-menu removed) this.uiContainer.addChild(back);

        const hint = new Text({ text: 'pull the handle ↓', style: { fill: 0xffffff, fontSize: 22, fontStyle: 'italic' } });
        hint.anchor.set(0.5); hint.position.set(this.handle.x, reelY + vh + 70);
        this.uiContainer.addChild(hint);

        const render = (s: ReturnType<typeof gameStore.getState>): void => {
            balanceText.text = `Balance: $${s.balance}   Bet: $${s.bet}`;
            winText.text = s.winAmount > 0 ? `WIN: $${s.winAmount}` : '';
        };
        render(gameStore.getState());
        gameStore.subscribe(render);
    }
}
