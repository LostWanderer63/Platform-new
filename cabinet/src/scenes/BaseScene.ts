import { Container } from 'pixi.js';

export abstract class BaseScene extends Container {
    public abstract init(): Promise<void>;
    public abstract start(): Promise<void>;
    public abstract update(delta: number): void;
    public abstract resize(width: number, height: number): void;
    
    public async destroyScene(): Promise<void> {
        this.destroy({ children: true });
    }
}
