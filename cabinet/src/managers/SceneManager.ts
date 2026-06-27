import { Application, Container, Ticker } from 'pixi.js';
import { BaseScene } from '../scenes/BaseScene';

export class SceneManager {
    private static app: Application;
    private static currentScene: BaseScene | null = null;
    private static sceneContainer: Container;

    public static init(app: Application): void {
        this.app = app;
        this.sceneContainer = new Container();
        this.app.stage.addChild(this.sceneContainer);

        // Add global ticker for scene updates
        this.app.ticker.add(this.update.bind(this));
    }

    /** Shared PIXI application (renderer access for runtime texture baking, etc). */
    public static get application(): Application {
        return this.app;
    }

    public static async switchScene(scene: BaseScene): Promise<void> {
        if (this.currentScene) {
            await this.currentScene.destroyScene();
            this.sceneContainer.removeChild(this.currentScene);
        }
        
        this.currentScene = scene;
        this.sceneContainer.addChild(this.currentScene);
        
        await this.currentScene.init();
        await this.currentScene.start();
    }
    
    public static resize(width: number, height: number): void {
        if (this.currentScene) {
            this.currentScene.resize(width, height);
        }
    }

    private static update(ticker: Ticker): void {
        if (this.currentScene) {
            this.currentScene.update(ticker.deltaTime);
        }
    }
}
