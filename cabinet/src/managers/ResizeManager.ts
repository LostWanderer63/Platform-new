import { Application } from 'pixi.js';
import { GameConfig } from '../config/GameConfig';

export class ResizeManager {
    private app: Application;
    
    constructor(app: Application) {
        this.app = app;
        window.addEventListener('resize', this.resize.bind(this));
        this.resize();
    }
    
    public resize(): void {
        const targetRatio = GameConfig.width / GameConfig.height;
        const currentWidth = window.innerWidth;
        const currentHeight = window.innerHeight;
        const currentRatio = currentWidth / currentHeight;
        
        let newWidth = currentWidth;
        let newHeight = currentHeight;
        
        if (currentRatio > targetRatio) {
            // Screen is wider than target ratio
            newWidth = currentHeight * targetRatio;
        } else {
            // Screen is taller than target ratio
            newHeight = currentWidth / targetRatio;
        }
        
        // Resize canvas via CSS
        this.app.canvas.style.width = `${newWidth}px`;
        this.app.canvas.style.height = `${newHeight}px`;
        
        // Optional: Trigger resize on active scenes
    }
    
    public destroy(): void {
        window.removeEventListener('resize', this.resize.bind(this));
    }
}
