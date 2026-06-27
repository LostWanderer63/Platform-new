import { Text, Container, Graphics, FillGradient } from 'pixi.js';
import { gsap } from 'gsap';
import { BaseScene } from './BaseScene';
import { GameConfig } from '../config/GameConfig';
import { gameStore } from '../state/GameState';
import { SceneManager } from '../managers/SceneManager';
import { AssetManager } from '../managers/AssetManager';
import { SymbolTextureRegistry } from '../reels/Symbol';
import { createReelConfig } from '../reels/ReelConfig';
import type { ReelEngineConfig } from '../reels/ReelConfig';
import { drawJewelTile } from '../reels/SymbolArtJewel';
import { JewelRegistry } from '../game/JewelSymbols';
import { WeightedSymbolPicker } from '../game/SymbolRegistry';
import { PaylineManager } from '../game/PaylineManager';
import { WinCalculator } from '../game/WinCalculator';
import type { Cell } from '../game/WinCalculator';
import { SymbolEffects } from '../game/SymbolEffects';
import { TumbleGrid } from '../game/TumbleGrid';
import { MenuScene } from './MenuScene';

/**
 * GameScene3 — Slot 3: "Gemstorm" (tumble / cascade)
 * --------------------------------------------------
 * No spinning reels. Gems DROP into a 6×5 grid and bounce; winning gems pop and
 * the gems above fall to fill, refilling from the top. Each tumble in a chain
 * raises the multiplier — the signature cascade mechanic.
 */
export class GameScene3 extends BaseScene {
    private readonly uiContainer = new Container();

    private cfg!: ReelEngineConfig;
    private grid!: TumbleGrid;
    private picker!: WeightedSymbolPicker;
    private paylines!: PaylineManager;
    private winCalculator!: WinCalculator;
    private fx!: SymbolEffects;
    private winText!: Text;
    private multText!: Text;

    private busy = false;

    private readonly onKeyDown = (e: KeyboardEvent): void => {
        if (e.code === 'Space') { e.preventDefault(); void this.spin(); }
        // (back-to-menu removed) if (e.code === 'Escape') SceneManager.switchScene(new MenuScene());
    };

    public async init(): Promise<void> {
        const renderer = SceneManager.application.renderer;
        this.cfg = createReelConfig({
            reelCount: 6, rowCount: 5,
            symbolWidth: 150, symbolHeight: 150, horizontalGap: 10, verticalGap: 10,
            symbols: JewelRegistry.reelSymbolDefinitions(),
        });

        // Real art was preloaded by the LoaderScene; register it BEFORE build so it
        // wins over the procedural tiles (build skips ids already cached).
        for (const [id, texture] of AssetManager.preloadedSymbols) SymbolTextureRegistry.register(id, texture);
        SymbolTextureRegistry.build(renderer, this.cfg.symbols, this.cfg.symbolWidth, this.cfg.symbolHeight, drawJewelTile);

        const vw = this.cfg.reelCount * (this.cfg.symbolWidth + this.cfg.horizontalGap) - this.cfg.horizontalGap;
        const vh = this.cfg.rowCount * (this.cfg.symbolHeight + this.cfg.verticalGap) - this.cfg.verticalGap;
        const gx = (GameConfig.width - vw) / 2;
        const gy = (GameConfig.height - vh) / 2 - 10;

        this.addChildAt(this.buildBackground(gx, gy, vw, vh), 0);

        this.picker = new WeightedSymbolPicker(JewelRegistry.all());
        this.grid = new TumbleGrid(this.cfg, this.picker);
        this.grid.position.set(gx, gy);
        this.addChild(this.grid);

        this.paylines = new PaylineManager(this.cfg.reelCount, this.cfg.rowCount);
        this.winCalculator = new WinCalculator(JewelRegistry);
        this.fx = new SymbolEffects(this.grid.effectsLayer, this.cfg.symbolWidth, this.cfg.symbolHeight);

        this.addChild(this.uiContainer);
        this.createUI();

        // Initial fill.
        await this.grid.drop(this.makeBoard(false));

        window.addEventListener('keydown', this.onKeyDown);
    }

    public async start(): Promise<void> {}
    public update(_delta: number): void {}
    public resize(_width: number, _height: number): void {}

    public override async destroyScene(): Promise<void> {
        window.removeEventListener('keydown', this.onKeyDown);
        await super.destroyScene();
    }

    // --- tumble flow -------------------------------------------------------

    private async spin(): Promise<void> {
        const state = gameStore.getState();
        if (this.busy || state.balance < state.bet) return;
        this.busy = true;
        this.fx.clearAll();
        state.setBalance(state.balance - state.bet);
        state.setSpinning(true);
        state.setWinAmount(0);
        this.winText.text = '';
        this.multText.text = '';

        await this.grid.drop(this.makeBoard(true));

        let total = 0;
        let multiplier = 1;
        // Cascade while wins keep landing.
        for (;;) {
            const result = this.winCalculator.evaluate(this.grid.getBoard(), this.paylines, state.bet);
            if (result.totalWin <= 0) break;

            const cells: Cell[] = [];
            for (const line of result.lineWins) cells.push(...line.cells);
            if (result.scatter) cells.push(...result.scatter.cells);

            total += result.totalWin * multiplier;
            this.winText.text = `WIN $${Math.round(total)}`;
            this.multText.text = multiplier > 1 ? `x${multiplier}` : '';

            await this.highlight(cells);
            await this.grid.tumble(this.toMask(cells));
            multiplier++;
        }

        if (total > 0) {
            const win = Math.round(total);
            state.setWinAmount(win);
            state.setBalance(state.balance + win);
            this.winText.text = `WIN $${win}`;
            gsap.fromTo(this.winText.scale, { x: 1.3, y: 1.3 }, { x: 1, y: 1, duration: 0.4, ease: 'back.out(2)' });
        } else {
            this.winText.text = '';
        }
        this.multText.text = '';
        state.setSpinning(false);
        this.busy = false;
    }

    /** Brief glow + pop-pulse on the winning gems before they tumble away. */
    private async highlight(cells: readonly Cell[]): Promise<void> {
        const seen = new Set<string>();
        for (const cell of cells) {
            const key = `${cell.reel}:${cell.row}`;
            if (seen.has(key)) continue;
            seen.add(key);
            const sym = this.grid.getCellSymbol(cell.reel, cell.row);
            const c = this.grid.cellCenter(cell.reel, cell.row);
            this.fx.showGlow(c.x, c.y, 0xffe082);
            gsap.fromTo(sym.scale, { x: 1, y: 1 }, { x: 1.25, y: 1.25, duration: 0.18, yoyo: true, repeat: 1, ease: 'sine.inOut' });
        }
        await new Promise((r) => setTimeout(r, 360));
        this.fx.clearAll();
    }

    private toMask(cells: readonly Cell[]): boolean[][] {
        const mask: boolean[][] = [];
        for (let reel = 0; reel < this.cfg.reelCount; reel++) {
            mask.push(new Array<boolean>(this.cfg.rowCount).fill(false));
        }
        for (const c of cells) mask[c.reel][c.row] = true;
        return mask;
    }

    private makeBoard(allowPlant: boolean): string[][] {
        const board = this.picker.spinBoard(this.cfg.reelCount, this.cfg.rowCount);
        if (allowPlant && Math.random() < 0.7) {
            // Plant a winning line so the cascade shows often (DEMO only).
            const line = this.paylines.get((Math.random() * this.paylines.count) | 0);
            const normals = JewelRegistry.all().filter((s) => s.kind === 'normal');
            const id = normals[(Math.random() * normals.length) | 0].id;
            const len = 3 + ((Math.random() * (this.cfg.reelCount - 2)) | 0);
            for (let reel = 0; reel < len; reel++) board[reel][line[reel]] = id;
        }
        return board;
    }

    // --- presentation ------------------------------------------------------

    private buildBackground(gx: number, gy: number, vw: number, vh: number): Container {
        const env = new Container();
        const W = GameConfig.width, H = GameConfig.height;
        env.addChild(new Graphics().rect(0, 0, W, H).fill(new FillGradient({
            type: 'linear', start: { x: 0, y: 0 }, end: { x: 0, y: 1 }, textureSpace: 'local',
            colorStops: [{ offset: 0, color: 0x06283b }, { offset: 1, color: 0x041018 }],
        })));
        // Sparkles.
        const sp = new Graphics();
        for (let i = 0; i < 70; i++) sp.circle(Math.random() * W, Math.random() * H, Math.random() * 2 + 0.5).fill({ color: 0x80deea, alpha: Math.random() * 0.5 + 0.1 });
        env.addChild(sp);
        // Grid well.
        env.addChild(new Graphics()
            .roundRect(gx - 20, gy - 20, vw + 40, vh + 40, 24).fill({ color: 0x041018, alpha: 0.85 })
            .roundRect(gx - 20, gy - 20, vw + 40, vh + 40, 24).stroke({ width: 5, color: 0x26c6da, alpha: 0.8 }));
        return env;
    }

    private createUI(): void {
        const spinButton = new Graphics().roundRect(0, 0, 170, 170, 85).fill(0x00897b).stroke({ width: 6, color: 0x80deea });
        spinButton.position.set(GameConfig.width - 230, GameConfig.height / 2 - 85);
        spinButton.eventMode = 'static';
        spinButton.cursor = 'pointer';
        spinButton.on('pointerdown', () => void this.spin());
        const spinTxt = new Text({ text: 'DROP', style: { fill: 0xffffff, fontSize: 34, fontWeight: 'bold' } });
        spinTxt.anchor.set(0.5); spinTxt.position.set(85, 85); spinButton.addChild(spinTxt);
        this.uiContainer.addChild(spinButton);

        this.winText = new Text({ text: '', style: { fontFamily: 'Georgia, serif', fontSize: 64, fontWeight: '900', fill: 0xffe082, stroke: { color: 0x06283b, width: 7 } } });
        this.winText.anchor.set(0.5); this.winText.position.set(GameConfig.width / 2, 70);
        this.uiContainer.addChild(this.winText);

        this.multText = new Text({ text: '', style: { fontFamily: 'Georgia, serif', fontSize: 80, fontWeight: '900', fill: 0xff5252, stroke: { color: 0xffffff, width: 5 } } });
        this.multText.anchor.set(0.5); this.multText.position.set(GameConfig.width - 150, GameConfig.height / 2 - 150);
        this.uiContainer.addChild(this.multText);

        const balanceText = new Text({ text: '', style: { fill: 0xffffff, fontSize: 30 } });
        balanceText.position.set(50, GameConfig.height - 70);
        this.uiContainer.addChild(balanceText);

        const back = new Text({ text: '‹ MENU', style: { fill: 0x80deea, fontSize: 26, fontWeight: 'bold' } });
        back.position.set(40, 36); back.eventMode = 'static'; back.cursor = 'pointer';
        back.on('pointerdown', () => SceneManager.switchScene(new MenuScene()));
        // (back-to-menu removed) this.uiContainer.addChild(back);

        const render = (s: ReturnType<typeof gameStore.getState>): void => {
            balanceText.text = `Balance: $${s.balance}   Bet: $${s.bet}`;
        };
        render(gameStore.getState());
        gameStore.subscribe(render);
    }
}
