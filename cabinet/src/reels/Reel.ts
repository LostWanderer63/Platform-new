/**
 * Reel
 * ----
 * One vertical reel: a fixed pool of `ReelSymbol` sprites scrolling over a
 * "virtual band" of symbol ids. This is the heart of the infinite-scroll
 * illusion and the zero-allocation guarantee.
 *
 * The virtual band model
 * ----------------------
 * Instead of moving sprites off-screen and destroying them, the reel keeps a
 * small ring of sprites (`rowCount + bufferRows`) and a fixed `band: string[]`
 * of ids. The continuous `position` from the SpinController selects which slice
 * of the band is visible:
 *
 *   base = floor(position)         // integer band offset
 *   frac = position - base         // sub-symbol scroll (0..1) → pixel offset
 *   slot i shows band[(i - base) mod bandLength]
 *   slot i sits at y = (i - 1 + frac) * pitch + pitch/2
 *
 * As `position` increases the whole column slides DOWN by `frac`; when it
 * crosses an integer the band indices shift by one and a fresh id appears at
 * the top — seamlessly, because slot i+1 after the shift shows exactly what
 * slot i showed before it. No sprite is ever created or destroyed mid-spin.
 *
 * Forced results
 * --------------
 * Because the band is ours to write, landing a server-dictated result is just
 * writing those ids into the band at the indices that will sit on the visible
 * rows at the stop target — see `resolveStopTarget`.
 */
import { Container, BlurFilter } from 'pixi.js';
import { gsap } from 'gsap';
import type { ReelEngineConfig } from './ReelConfig';
import { reelPitch, symbolsPerReel } from './ReelConfig';
import { ReelSymbol } from './Symbol';
import { SpinController } from './SpinController';

/** Always-positive modulo (JS `%` keeps the sign of the dividend). */
function mod(n: number, m: number): number {
    return ((n % m) + m) % m;
}

/**
 * Cylinder projection constants. Treat the symbol's linear scroll position as an
 * ANGLE on a drum: screen y = R·sin(θ), foreshorten = cos(θ). This bunches and
 * shrinks symbols toward the top/bottom edges — the real "rotating drum" look,
 * instead of a flat scroll.
 */
const DRUM_ANGLE = 1.18;            // half-arc (radians) mapped across the window
const DRUM_SIN = Math.sin(DRUM_ANGLE);
const DRUM_REST = 0.8;              // constant curvature at rest (0 = flat, 1 = full)

function clamp(v: number, lo: number, hi: number): number {
    return v < lo ? lo : v > hi ? hi : v;
}

export class Reel {
    public readonly index: number;
    /** Scene node holding this reel's sprites. Positioned by ReelContainer. */
    public readonly view: Container;
    /** Invoked by the manager when this reel reaches a full stop. */
    public onStopped?: (index: number) => void;

    private readonly cfg: ReelEngineConfig;
    private readonly symbols: ReelSymbol[] = [];
    private readonly band: string[];
    private readonly controller: SpinController;

    private readonly pitch: number;
    private readonly count: number;
    private readonly bandLength: number;
    /** Vertical centre of the visible window + half its height (for the drum). */
    private readonly centerY: number;
    private readonly halfView: number;

    /** Result forced onto the payline rows on the next stop (top→bottom). */
    private pendingResult: string[] | null = null;

    // --- Motion blur (premium blur-phase effect, toggled on speed) ---
    private readonly blur: BlurFilter | null;
    private blurActive = false;

    constructor(cfg: ReelEngineConfig, index: number) {
        this.cfg = cfg;
        this.index = index;
        this.pitch = reelPitch(cfg);
        this.count = symbolsPerReel(cfg);
        this.bandLength = cfg.bandLength;
        this.centerY = (cfg.rowCount * this.pitch) / 2;
        this.halfView = this.centerY;

        this.view = new Container();
        this.band = new Array<string>(this.bandLength);
        this.fillBandRandom();

        // Pre-allocate the sprite pool ONCE. These live for the reel's lifetime.
        const cx = cfg.symbolWidth / 2;
        for (let i = 0; i < this.count; i++) {
            const symbol = new ReelSymbol(cfg.symbolWidth, cfg.symbolHeight);
            symbol.x = cx;
            this.symbols.push(symbol);
            this.view.addChild(symbol);
        }

        this.controller = new SpinController(
            cfg,
            index,
            (pos) => this.resolveStopTarget(pos),
            (idx) => this.handleStopped(idx),
        );

        // Vertical-only blur, created once and attached only while spinning fast.
        this.blur = cfg.enableMotionBlur
            ? new BlurFilter({ strength: 0, quality: 3, kernelSize: 5 })
            : null;

        this.layout();
    }

    public get state(): string {
        return this.controller.state;
    }

    public get isSpinning(): boolean {
        return this.controller.isSpinning;
    }

    /** Re-randomise the band and accelerate the reel from rest. */
    public spin(): void {
        for (const s of this.symbols) gsap.killTweensOf(s.scale); // layout drives scale
        this.fillBandRandom();
        this.controller.startSpin();
    }

    /**
     * Ask the reel to settle. Optionally force the visible result (top→bottom,
     * length === rowCount). The reel finishes its minimum spin first.
     */
    public stop(result?: readonly string[]): void {
        this.pendingResult = result ? result.slice(0, this.cfg.rowCount) : null;
        this.controller.requestStop();
    }

    /** Fired when the controller reaches a full stop. */
    private handleStopped(index: number): void {
        // Keep the rest curvature (layout re-applies it); just notify.
        this.onStopped?.(index);
    }

    /** Advance physics + repaint the column. Called every frame by the manager. */
    public update(dt: number): void {
        this.controller.update(dt);
        this.layout();
        this.updateMotionBlur();
    }

    /**
     * The pooled sprite currently occupying payline `row` (0..rowCount-1).
     * Valid when the reel is at rest; used by the win presenter to animate the
     * exact symbols that landed on a winning line.
     */
    public getSymbolAt(row: number): ReelSymbol {
        return this.symbols[row + 1]; // slot 0 is the top buffer row
    }

    /** Symbol ids currently shown on the payline rows (top→bottom). */
    public getVisibleSymbols(): string[] {
        const base = Math.floor(this.controller.position);
        const out: string[] = [];
        for (let r = 0; r < this.cfg.rowCount; r++) {
            out.push(this.band[mod(r + 1 - base, this.bandLength)]);
        }
        return out;
    }

    // ----------------------------------------------------------------------

    /** Position every pooled sprite for the current scroll offset. */
    private layout(): void {
        const pos = this.controller.position;
        const base = Math.floor(pos);
        const frac = pos - base;
        const halfPitch = this.pitch / 2;

        // Cylindrical drum: project the linear scroll onto a curved surface so
        // symbols bunch + foreshorten toward the top/bottom edges. Applied ALWAYS
        // (a constant rest curvature) so the reel reads as a real drum even when
        // stopped, and ramps up to full as it spins. Win tiles use flat lifted
        // copies, so this never distorts the win presentation.
        const speed = this.controller.isSpinning
            ? Math.min(Math.abs(this.controller.velocity) / this.cfg.physics.maxSpeed, 1)
            : 0;
        const sf = Math.max(speed, DRUM_REST);

        for (let i = 0; i < this.count; i++) {
            const symbol = this.symbols[i];
            symbol.setSymbolId(this.band[mod(i - base, this.bandLength)]);
            const linearY = (i - 1 + frac) * this.pitch + halfPitch;

            const theta = clamp(((linearY - this.centerY) / this.halfView) * DRUM_ANGLE, -1.5, 1.5);
            const projY = this.centerY + (Math.sin(theta) / DRUM_SIN) * this.halfView;
            const fore = Math.max(Math.cos(theta), 0.08); // foreshorten at edges
            symbol.y = linearY + (projY - linearY) * sf;
            symbol.scale.set(1 - (1 - (0.9 + 0.1 * fore)) * sf, 1 - (1 - fore) * sf);
        }
    }

    /**
     * Choose the grid-aligned integer position to stop on and stamp the forced
     * result into the band so it lands exactly on the visible rows. The result
     * ids are written at the band indices that slot 1..rowCount will read at the
     * target — these are "ahead" of the current window, so they scroll in from
     * the top during the settle and come to rest precisely on the paylines.
     */
    private resolveStopTarget(position: number): number {
        const target = Math.ceil(position) + this.cfg.physics.stopDistance;
        const result = this.pendingResult ?? this.randomRow();

        // Payline rows (visible slots 1..rowCount).
        for (let r = 0; r < this.cfg.rowCount; r++) {
            this.band[mod(r + 1 - target, this.bandLength)] = result[r];
        }
        // Buffer rows (above/below) get fresh randoms so the bounce reveals
        // a believable neighbour rather than a duplicate.
        this.band[mod(0 - target, this.bandLength)] = this.randomSymbolId();
        this.band[mod(this.cfg.rowCount + 1 - target, this.bandLength)] = this.randomSymbolId();

        this.pendingResult = null;
        return target;
    }

    /** Drive the vertical blur from current speed; detach the filter at rest. */
    private updateMotionBlur(): void {
        if (!this.blur) return;

        const speed = Math.abs(this.controller.velocity); // symbols / second
        const threshold = this.cfg.physics.maxSpeed * 0.15;

        if (speed > threshold) {
            // Map speed → blur, capped so it never smears into mush.
            this.blur.strengthY = Math.min(speed * 0.8, 30);
            this.blur.strengthX = 0;
            if (!this.blurActive) {
                this.view.filters = [this.blur];
                this.blurActive = true;
            }
        } else if (this.blurActive) {
            this.view.filters = [];
            this.blurActive = false;
        }
    }

    private fillBandRandom(): void {
        for (let i = 0; i < this.bandLength; i++) {
            this.band[i] = this.randomSymbolId();
        }
    }

    private randomSymbolId(): string {
        const symbols = this.cfg.symbols;
        return symbols[(Math.random() * symbols.length) | 0].id;
    }

    private randomRow(): string[] {
        const row: string[] = [];
        for (let r = 0; r < this.cfg.rowCount; r++) row.push(this.randomSymbolId());
        return row;
    }
}
