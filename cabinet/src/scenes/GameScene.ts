import { Text, Container, Graphics, Sprite, FillGradient } from 'pixi.js';
import { BaseScene } from './BaseScene';
import { GameConfig } from '../config/GameConfig';
import { gameStore } from '../state/GameState';
import { SceneManager } from '../managers/SceneManager';
import { AssetManager } from '../managers/AssetManager';
import { ReelManager } from '../reels/ReelManager';
import { SymbolTextureRegistry } from '../reels/Symbol';
import { createReelConfig, viewportWidth, viewportHeight } from '../reels/ReelConfig';
import type { ReelEngineConfig } from '../reels/ReelConfig';
import { SymbolRegistry, WeightedSymbolPicker } from '../game/SymbolRegistry';
import { PaylineManager } from '../game/PaylineManager';
import { WinCalculator } from '../game/WinCalculator';
import { SymbolAnimator } from '../game/SymbolAnimator';
import { SymbolEffects } from '../game/SymbolEffects';
import { WinPresenter } from '../game/WinPresenter';

/**
 * GameScene
 * ---------
 * Integration layer that binds the reel engine, the weighted RNG, the win math
 * and the win presentation into one playable round:
 *
 *   spin → weighted board → reels land → WinCalculator → WinPresenter
 *
 * Everything below the scene is decoupled: the scene is the only place that
 * knows about all systems at once.
 */
export class GameScene extends BaseScene {
    private readonly reelsContainer: Container;
    private readonly uiContainer: Container;

    private cfg!: ReelEngineConfig;
    private reelManager!: ReelManager;
    private picker!: WeightedSymbolPicker;
    private paylines!: PaylineManager;
    private winCalculator!: WinCalculator;
    private winPresenter!: WinPresenter;

    private readonly onKeyDown = (e: KeyboardEvent): void => {
        if (e.code === 'Space') {
            e.preventDefault();
            this.spin();
        }
    };

    constructor() {
        super();
        this.reelsContainer = new Container();
        this.uiContainer = new Container();
        this.addChild(this.reelsContainer);
        this.addChild(this.uiContainer);
    }

    public async init(): Promise<void> {
        const renderer = SceneManager.application.renderer;

        // Single source of truth: the reel engine renders the registry's symbols.
        this.cfg = createReelConfig({ symbols: SymbolRegistry.reelSymbolDefinitions() });

        // Real art was preloaded by the LoaderScene; register it (procedural otherwise).
        for (const [id, texture] of AssetManager.preloadedSymbols) SymbolTextureRegistry.register(id, texture);

        const vw = viewportWidth(this.cfg);
        const vh = viewportHeight(this.cfg);
        const reelX = (GameConfig.width - vw) / 2;
        const reelY = (GameConfig.height - vh) / 2 - 30;

        // Real background image when present; procedural temple otherwise.
        const bgTexture = AssetManager.background;
        if (bgTexture) {
            const bg = new Sprite(bgTexture);
            bg.width = GameConfig.width;
            bg.height = GameConfig.height;
            this.addChildAt(bg, 0);
        } else {
            this.addChildAt(this.buildEnvironment(reelX, reelY, vw, vh), 0);
        }

        this.reelManager = new ReelManager(this.cfg, renderer);
        this.reelManager.view.position.set(reelX, reelY);
        this.reelsContainer.addChild(this.reelManager.view);
        this.reelManager.onSpinComplete = (board) => this.onSpinComplete(board);

        // Game systems.
        this.picker = new WeightedSymbolPicker(SymbolRegistry.all());
        this.paylines = new PaylineManager(this.cfg.reelCount, this.cfg.rowCount);
        this.winCalculator = new WinCalculator(SymbolRegistry);
        const animator = new SymbolAnimator();
        const effects = new SymbolEffects(
            this.reelManager.view.overlayLayer, // glow/coins on the unmasked top layer
            this.cfg.symbolWidth,
            this.cfg.symbolHeight,
        );
        this.winPresenter = new WinPresenter(this.reelManager.view, this.cfg, SymbolRegistry, animator, effects);

        this.createUI();
        window.addEventListener('keydown', this.onKeyDown);
    }

    public async start(): Promise<void> {}

    public update(delta: number): void {
        if (!this.reelManager) return; // ticker may fire before async init() resolves
        const dt = Math.min(delta / 60, 0.05);
        this.reelManager.update(dt);
    }

    public resize(_width: number, _height: number): void {}

    public override async destroyScene(): Promise<void> {
        window.removeEventListener('keydown', this.onKeyDown);
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

        // Weighted outcome (server RNG stand-in). Forced onto the reels.
        const board = this.picker.spinBoard(this.cfg.reelCount, this.cfg.rowCount);
        this.plantDemoWin(board); // DEMO ONLY: lift the hit-rate so wins show often
        this.reelManager.spin(board);
    }

    /**
     * DEMO-ONLY win injection. A real game trusts the server RNG; for showcasing
     * the win presentation we plant a guaranteed paying line on most spins by
     * overwriting the first N cells of a random payline with one symbol.
     */
    private plantDemoWin(board: string[][]): void {
        if (Math.random() > 0.65) return; // ~65% of spins get a planted win

        const line = this.paylines.get((Math.random() * this.paylines.count) | 0);
        const normals = SymbolRegistry.all().filter((s) => s.kind === 'normal');
        const symbolId = normals[(Math.random() * normals.length) | 0].id;
        const length = 3 + ((Math.random() * 3) | 0); // 3..5 of a kind

        for (let reel = 0; reel < length && reel < this.cfg.reelCount; reel++) {
            board[reel][line[reel]] = symbolId;
        }
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

    // --- presentation ------------------------------------------------------

    /** Ancient Greek temple: night sky, marble columns, pediment + title. */
    private buildEnvironment(reelX: number, reelY: number, vw: number, vh: number): Container {
        const env = new Container();
        const W = GameConfig.width;
        const H = GameConfig.height;

        // Night-sky gradient.
        env.addChild(new Graphics().rect(0, 0, W, H).fill(new FillGradient({
            type: 'linear', start: { x: 0, y: 0 }, end: { x: 0, y: 1 }, textureSpace: 'local',
            colorStops: [{ offset: 0, color: 0x1b1536 }, { offset: 0.55, color: 0x241a3e }, { offset: 1, color: 0x0a0a16 }],
        })));

        // Divine glow behind the reels.
        env.addChild(new Graphics().ellipse(W / 2, reelY + vh / 2, vw * 0.95, vh * 1.05).fill(new FillGradient({
            type: 'radial', center: { x: 0.5, y: 0.5 }, innerRadius: 0, outerCenter: { x: 0.5, y: 0.5 }, outerRadius: 0.5, textureSpace: 'local',
            colorStops: [{ offset: 0, color: 'rgba(120,90,200,0.55)' }, { offset: 1, color: 'rgba(60,40,110,0)' }],
        })));

        // Marble floor.
        const floorY = reelY + vh + 80;
        env.addChild(new Graphics().rect(0, floorY, W, H - floorY).fill(new FillGradient({
            type: 'linear', start: { x: 0, y: 0 }, end: { x: 0, y: 1 }, textureSpace: 'local',
            colorStops: [{ offset: 0, color: 0x2a2440 }, { offset: 1, color: 0x110d1c }],
        })));

        // Flanking columns.
        const colW = 92;
        const gap = 50;
        this.drawColumn(env, reelX - gap - colW, reelY - 46, vh + 150, colW);
        this.drawColumn(env, reelX + vw + gap, reelY - 46, vh + 150, colW);

        // Pediment (temple roof) + title.
        const left = reelX - gap - colW - 22;
        const right = reelX + vw + gap + colW + 22;
        const apex = reelY - 168;
        const marble = new FillGradient({
            type: 'linear', start: { x: 0, y: 0 }, end: { x: 0, y: 1 }, textureSpace: 'local',
            colorStops: [{ offset: 0, color: 0xe9e3d2 }, { offset: 1, color: 0x9b927a }],
        });
        env.addChild(new Graphics()
            .poly([left, reelY - 34, right, reelY - 34, W / 2, apex]).fill(marble)
            .poly([left, reelY - 34, right, reelY - 34, W / 2, apex]).stroke({ width: 5, color: 0xd4af37, alpha: 0.9 }));

        const title = new Text({
            text: 'WRATH OF OLYMPUS',
            style: {
                fontFamily: 'Georgia, "Times New Roman", serif', fontSize: 46, fontWeight: '900',
                letterSpacing: 3, fill: 0x3a2a10, stroke: { color: 0xffe082, width: 2 },
            },
        });
        title.anchor.set(0.5);
        title.position.set(W / 2, reelY - 86);
        env.addChild(title);

        return env;
    }

    /** A fluted marble column with capital + base. */
    private drawColumn(parent: Container, x: number, top: number, h: number, w: number): void {
        const light = 0xe8e2d0;
        const dark = 0x6f6650;
        const g = new Graphics();
        // Cylindrical shaft (horizontal light→dark→light = round).
        g.rect(x, top, w, h).fill(new FillGradient({
            type: 'linear', start: { x: 0, y: 0 }, end: { x: 1, y: 0 }, textureSpace: 'local',
            colorStops: [{ offset: 0, color: dark }, { offset: 0.5, color: light }, { offset: 1, color: dark }],
        }));
        // Flutes.
        for (let k = 1; k < 6; k++) {
            g.rect(x + (w * k) / 6 - 1.5, top, 3, h).fill({ color: dark, alpha: 0.35 });
        }
        // Capital + base.
        g.rect(x - w * 0.16, top - 26, w * 1.32, 26).fill({ color: light })
            .rect(x - w * 0.16, top - 26, w * 1.32, 26).stroke({ width: 2, color: dark, alpha: 0.5 })
            .rect(x - w * 0.16, top + h, w * 1.32, 30).fill({ color: light })
            .rect(x - w * 0.16, top + h, w * 1.32, 30).stroke({ width: 2, color: dark, alpha: 0.5 });
        parent.addChild(g);
    }

    private createUI(): void {
        const spinButton = new Graphics()
            .roundRect(0, 0, 180, 180, 90)
            .fill(0xb71c1c)
            .stroke({ width: 6, color: 0xffd54f });
        spinButton.position.set(GameConfig.width - 240, GameConfig.height / 2 - 90);
        spinButton.eventMode = 'static';
        spinButton.cursor = 'pointer';
        spinButton.on('pointerdown', () => this.spin());
        this.uiContainer.addChild(spinButton);

        const spinText = new Text({ text: 'SPIN', style: { fill: 0xffffff, fontSize: 36, fontWeight: 'bold' } });
        spinText.anchor.set(0.5);
        spinText.position.set(90, 90);
        spinButton.addChild(spinText);

        const balanceText = new Text({ text: '', style: { fill: 0xffffff, fontSize: 32 } });
        balanceText.position.set(50, GameConfig.height - 80);
        this.uiContainer.addChild(balanceText);

        const winText = new Text({ text: '', style: { fill: 0xffd54f, fontSize: 32, fontWeight: 'bold' } });
        winText.position.set(50, GameConfig.height - 130);
        this.uiContainer.addChild(winText);

        const render = (s: ReturnType<typeof gameStore.getState>): void => {
            balanceText.text = `Balance: $${s.balance}   Bet: $${s.bet}`;
            winText.text = s.winAmount > 0 ? `WIN: $${s.winAmount}` : '';
        };
        render(gameStore.getState());
        gameStore.subscribe(render);
    }
}
