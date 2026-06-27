/**
 * ReelManager
 * -----------
 * The master controller for the whole reel set and the public API the game
 * talks to. It builds the symbol textures, owns the `ReelContainer`, and
 * choreographs spin-up / stop timing across all reels.
 *
 * Responsibilities:
 *  - startSpin()          : kick every reel into motion (staggered spin-up).
 *  - stopSpin(results)    : cascade the reels to a stop left→right, with
 *                           optional forced results and near-win anticipation.
 *  - stopIndividualReel() : stop a single reel (debug / feature spins).
 *  - update(dt)           : drive every reel + the internal timing scheduler.
 *  - spin(results)        : convenience — start, then auto-stop after a delay.
 *
 * All scheduling is ticker-driven (no setTimeout) so it stays frame-accurate
 * and pauses/clears cleanly with the game loop.
 */
import type { Renderer } from 'pixi.js';
import type { ReelEngineConfig } from './ReelConfig';
import { SymbolTextureRegistry } from './Symbol';
import type { TileArtist } from './Symbol';
import { ReelContainer } from './ReelContainer';
import type { Reel } from './Reel';

interface ScheduledAction {
    remainingMs: number;
    run: () => void;
}

export class ReelManager {
    /** The display object to add to the scene. */
    public readonly view: ReelContainer;
    /** Fired once when every reel has come to rest. */
    public onSpinComplete?: (results: string[][]) => void;

    private readonly cfg: ReelEngineConfig;
    private readonly reels: Reel[];
    private readonly schedule: ScheduledAction[] = [];

    private spinning = false;
    private stoppedCount = 0;

    constructor(cfg: ReelEngineConfig, renderer: Renderer, artist?: TileArtist) {
        this.cfg = cfg;

        // Build all starter textures up-front (one GPU texture per symbol).
        SymbolTextureRegistry.build(renderer, cfg.symbols, cfg.symbolWidth, cfg.symbolHeight, artist);

        this.view = new ReelContainer(cfg);
        this.reels = this.view.reels;

        for (const reel of this.reels) {
            reel.onStopped = () => this.handleReelStopped();
        }
    }

    public get isSpinning(): boolean {
        return this.spinning;
    }

    // --- master controls ---------------------------------------------------

    /** Start every reel spinning with a short left→right spin-up stagger. */
    public startSpin(): void {
        if (this.spinning) return;
        this.spinning = true;
        this.stoppedCount = 0;
        this.schedule.length = 0;

        const { spinUpStagger } = this.cfg.timing;
        this.reels.forEach((reel, i) => {
            this.after(i * spinUpStagger, () => reel.spin());
        });
    }

    /**
     * Cascade the reels to a stop. `results[i]` (optional) forces reel i's
     * visible rows (top→bottom). Later reels gain extra delay when anticipation
     * is enabled, producing the classic near-win tension on the right side.
     */
    public stopSpin(results?: string[][]): void {
        if (!this.spinning) return;

        const { stopStagger, anticipation } = this.cfg.timing;
        this.reels.forEach((reel, i) => {
            let delay = i * stopStagger;
            if (anticipation.enabled && i >= anticipation.fromReel) {
                delay += (i - anticipation.fromReel + 1) * anticipation.extraStagger;
            }
            this.after(delay, () => reel.stop(results?.[i]));
        });
    }

    /** Stop a single reel immediately (after its minimum spin), forcing `result`. */
    public stopIndividualReel(index: number, result?: string[]): void {
        const reel = this.reels[index];
        if (reel) reel.stop(result);
    }

    /** Convenience: start a spin and auto-stop after `spinDuration` (or override). */
    public spin(results?: string[][], spinDurationMs = this.cfg.timing.spinDuration): void {
        if (this.spinning) return;
        this.startSpin();
        this.after(spinDurationMs, () => this.stopSpin(results));
    }

    /** Drive the scheduler and every reel. `dt` is in SECONDS. */
    public update(dt: number): void {
        // Process the ticker-driven schedule.
        if (this.schedule.length > 0) {
            const dtMs = dt * 1000;
            for (let i = this.schedule.length - 1; i >= 0; i--) {
                const action = this.schedule[i];
                action.remainingMs -= dtMs;
                if (action.remainingMs <= 0) {
                    this.schedule.splice(i, 1);
                    action.run();
                }
            }
        }

        for (const reel of this.reels) reel.update(dt);
    }

    /** Current symbols on every payline (outer index = reel, inner = row). */
    public getBoard(): string[][] {
        return this.reels.map((reel) => reel.getVisibleSymbols());
    }

    // ----------------------------------------------------------------------

    private after(delayMs: number, run: () => void): void {
        if (delayMs <= 0) {
            run();
            return;
        }
        this.schedule.push({ remainingMs: delayMs, run });
    }

    private handleReelStopped(): void {
        this.stoppedCount++;
        if (this.stoppedCount >= this.reels.length) {
            this.spinning = false;
            this.onSpinComplete?.(this.getBoard());
        }
    }
}
