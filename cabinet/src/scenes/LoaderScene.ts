import { Graphics, Text } from 'pixi.js';
import { BaseScene } from './BaseScene';
import { SceneManager } from '../managers/SceneManager';
import { AssetManager } from '../managers/AssetManager';
import { MenuScene, SLOTS } from './MenuScene';
import { GameConfig } from '../config/GameConfig';
import { SymbolRegistry } from '../game/SymbolRegistry';
import { VegasRegistry } from '../game/VegasSymbols';
import { JewelRegistry } from '../game/JewelSymbols';
import { EgyptRegistry } from '../game/EgyptSymbols';
import { FortuneRegistry } from '../game/FortuneSymbols';
import { CANDY_IDS } from '../game/CandySymbols';

export class LoaderScene extends BaseScene {
    private loadingText: Text;
    private progressBar: Graphics;

    constructor() {
        super();
        
        this.loadingText = new Text({
            text: 'Loading...', 
            style: { fill: 0xffffff, fontSize: 32 }
        });
        this.loadingText.anchor.set(0.5);
        this.loadingText.position.set(GameConfig.width / 2, GameConfig.height / 2 - 50);
        this.addChild(this.loadingText);

        this.progressBar = new Graphics();
        this.addChild(this.progressBar);
    }

    public async init(): Promise<void> {
        this.drawProgress(0);
    }

    public async start(): Promise<void> {
        // Preload all optional art (symbols + background) with a real progress bar.
        // Every slot's set goes in one pass — ids are prefixed per theme, no collisions.
        const ids = [SymbolRegistry, VegasRegistry, JewelRegistry, EgyptRegistry, FortuneRegistry]
            .flatMap((reg) => reg.all().map((s) => s.id))
            .concat(CANDY_IDS);
        await AssetManager.preload(ids, (p) => this.drawProgress(p));
        this.drawProgress(1);
        this.onLoadComplete();
    }

    private drawProgress(progress: number): void {
        const barWidth = 400;
        const barHeight = 20;
        const x = GameConfig.width / 2 - barWidth / 2;
        const y = GameConfig.height / 2 + 50;
        
        this.progressBar.clear();
        this.progressBar.rect(x, y, barWidth, barHeight);
        this.progressBar.fill(0x333333);
        
        this.progressBar.rect(x, y, barWidth * Math.min(progress, 1), barHeight);
        this.progressBar.fill(0xffd700); // Gold color for Olympus theme
    }

    private onLoadComplete(): void {
        // Deep-link: ?game=N boots straight into that slot (used when each game is
        // launched as its own tile from the Aurora lobby). Otherwise show the menu.
        const raw = new URLSearchParams(window.location.search).get('game');
        const n = raw === null ? NaN : parseInt(raw, 10);
        if (Number.isInteger(n) && n >= 0 && n < SLOTS.length) {
            SceneManager.switchScene(SLOTS[n].make());
        } else {
            SceneManager.switchScene(new MenuScene());
        }
    }

    public update(_delta: number): void {}
    public resize(_width: number, _height: number): void {}
}
