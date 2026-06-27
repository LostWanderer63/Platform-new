/**
 * TumbleGrid (Slot 3 mechanic)
 * ----------------------------
 * A cascading grid — NOT a spinning reel. Symbols drop into fixed cells and
 * bounce; on a win the winning symbols pop and vanish, the symbols above fall to
 * fill the gaps, and new ones drop from the top. This repeats (a "tumble") while
 * wins keep landing, with a rising multiplier driven by the scene.
 *
 * Pooled: one `ReelSymbol` per cell, reused across drops/cascades (no GC churn).
 */
import { Container } from 'pixi.js';
import { gsap } from 'gsap';
import type { ReelEngineConfig } from '../reels/ReelConfig';
import { ReelSymbol } from '../reels/Symbol';
import type { WeightedSymbolPicker } from './SymbolRegistry';

/** Await a gsap tween. */
function tween(target: object, vars: gsap.TweenVars): Promise<void> {
    return new Promise((resolve) => { gsap.to(target, { ...vars, onComplete: () => resolve() }); });
}

export class TumbleGrid extends Container {
    /** Top-most layer for win glows / effects (above the gems). */
    public readonly effectsLayer = new Container();

    private readonly cfg: ReelEngineConfig;
    private readonly picker: WeightedSymbolPicker;
    private readonly cells: ReelSymbol[][] = []; // [reel][row]
    private readonly board: string[][] = [];
    private readonly cellW: number;
    private readonly cellH: number;
    private readonly vh: number;

    constructor(cfg: ReelEngineConfig, picker: WeightedSymbolPicker) {
        super();
        this.cfg = cfg;
        this.picker = picker;
        this.cellW = cfg.symbolWidth + cfg.horizontalGap;
        this.cellH = cfg.symbolHeight + cfg.verticalGap;
        this.vh = cfg.rowCount * this.cellH;

        for (let reel = 0; reel < cfg.reelCount; reel++) {
            this.cells.push([]);
            this.board.push([]);
            for (let row = 0; row < cfg.rowCount; row++) {
                const sym = new ReelSymbol(cfg.symbolWidth, cfg.symbolHeight);
                const c = this.cellCenter(reel, row);
                sym.position.set(c.x, c.y);
                sym.visible = false;
                this.addChild(sym);
                this.cells[reel].push(sym);
                this.board[reel].push('');
            }
        }
        this.addChild(this.effectsLayer);
    }

    public cellCenter(reel: number, row: number): { x: number; y: number } {
        return { x: reel * this.cellW + this.cfg.symbolWidth / 2, y: row * this.cellH + this.cfg.symbolHeight / 2 };
    }

    public getCellSymbol(reel: number, row: number): ReelSymbol {
        return this.cells[reel][row];
    }

    public getBoard(): string[][] {
        return this.board.map((col) => col.slice());
    }

    /** Drop a fresh board in from the top with a staggered bounce. */
    public async drop(board: string[][]): Promise<void> {
        const tweens: Promise<void>[] = [];
        for (let reel = 0; reel < this.cfg.reelCount; reel++) {
            for (let row = 0; row < this.cfg.rowCount; row++) {
                const cell = this.cells[reel][row];
                const c = this.cellCenter(reel, row);
                this.board[reel][row] = board[reel][row];
                cell.setSymbolId(board[reel][row]);
                cell.scale.set(1);
                cell.alpha = 1;
                cell.visible = true;
                cell.x = c.x;
                cell.y = c.y - this.vh - this.cellH;
                gsap.killTweensOf(cell);
                tweens.push(tween(cell, { y: c.y, duration: 0.55, ease: 'bounce.out', delay: reel * 0.04 + row * 0.05 }));
            }
        }
        await Promise.all(tweens);
    }

    /**
     * One tumble step: pop the `removed` cells, then collapse each affected
     * column (survivors fall, new gems drop in). Mutates the board in place.
     */
    public async tumble(removed: boolean[][]): Promise<void> {
        // 1) Pop the winning gems.
        const pops: Promise<void>[] = [];
        for (let reel = 0; reel < this.cfg.reelCount; reel++) {
            for (let row = 0; row < this.cfg.rowCount; row++) {
                if (!removed[reel][row]) continue;
                const cell = this.cells[reel][row];
                gsap.killTweensOf(cell.scale);
                pops.push(tween(cell.scale, { x: 0, y: 0, duration: 0.26, ease: 'back.in(2.5)' }));
            }
        }
        await Promise.all(pops);

        // 2) Collapse + refill affected columns.
        const falls: Promise<void>[] = [];
        for (let reel = 0; reel < this.cfg.reelCount; reel++) {
            const removedCount = removed[reel].filter(Boolean).length;
            if (removedCount === 0) continue;

            const survivors: string[] = [];
            for (let row = 0; row < this.cfg.rowCount; row++) {
                if (!removed[reel][row]) survivors.push(this.board[reel][row]);
            }
            const newIds: string[] = [];
            for (let k = 0; k < removedCount; k++) newIds.push(this.picker.pick());
            const finalIds = newIds.concat(survivors); // new gems fill the top

            for (let row = 0; row < this.cfg.rowCount; row++) {
                const cell = this.cells[reel][row];
                const c = this.cellCenter(reel, row);
                this.board[reel][row] = finalIds[row];
                cell.setSymbolId(finalIds[row]);
                cell.scale.set(1);
                cell.alpha = 1;
                cell.visible = true;
                cell.x = c.x;
                cell.y = c.y - this.vh - this.cellH;
                gsap.killTweensOf(cell);
                falls.push(tween(cell, { y: c.y, duration: 0.5, ease: 'bounce.out', delay: row * 0.05 }));
            }
        }
        await Promise.all(falls);
    }
}
