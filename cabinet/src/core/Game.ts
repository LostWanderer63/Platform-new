import { Application } from 'pixi.js';
import { GameConfig } from '../config/GameConfig';
import { ResizeManager } from '../managers/ResizeManager';
import { SceneManager } from '../managers/SceneManager';
import { AssetManager } from '../managers/AssetManager';
import { LoaderScene } from '../scenes/LoaderScene';

export class Game {
    private app: Application;


    constructor() {
        this.app = new Application();
    }

    public async init(container: HTMLElement): Promise<void> {
        // Initialize PIXI Application
        await this.app.init({
            width: GameConfig.width,
            height: GameConfig.height,
            backgroundColor: GameConfig.backgroundColor,
            resolution: GameConfig.resolution,
            autoDensity: true,
            antialias: true,
            hello: true // Print PIXI version to console
        });

        // Append canvas to the DOM
        container.appendChild(this.app.canvas);

        // Initialize Managers
        new ResizeManager(this.app);
        await AssetManager.init();
        SceneManager.init(this.app);

        // Start the first scene (Loader)
        SceneManager.switchScene(new LoaderScene());
    }
}
