/**
 * SpinController
 * --------------
 * The physics state-machine for a SINGLE reel. It owns the continuous scroll
 * `position` (in symbol units) and `velocity` (symbols/second) and advances
 * them every frame. The owning `Reel` only reads `position` to lay out sprites;
 * all motion feel lives here.
 *
 * Lifecycle of one spin:
 *
 *   idle ──startSpin()──▶ accelerating ──(ramp done)──▶ cruising
 *                                                           │
 *                                       requestStop() + minSpinTime elapsed
 *                                                           ▼
 *                                                       settling ──(t==1)──▶ stopped
 *
 * Phases:
 *  - accelerating : ease-in ramp from rest to maxSpeed (weighty kick-off).
 *  - cruising     : constant maxSpeed — the motion-blur "blur phase".
 *  - settling     : a single easeOutBack glide onto a grid-aligned target.
 *
 * Why one easeOutBack instead of a separate decel + bounce?
 *   easeOutBack already encodes deceleration AND a slight overshoot bounce.
 *   By choosing the settle DURATION from the curve's initial slope we make the
 *   velocity continuous with the cruise phase (no visible "snap" when braking),
 *   which is exactly the cinematic, inertia-driven stop premium slots use.
 */
import type { ReelEngineConfig } from './ReelConfig';

export type SpinState = 'idle' | 'accelerating' | 'cruising' | 'settling' | 'stopped';

/**
 * d/dt easeOutBack(t) at t=0 for the standard overshoot constant. Used to pick
 * a settle duration whose opening speed matches the cruise speed (C1 continuity).
 * Derivation: easeOutBack'(0) = 3*(s+1) - 2*s = s + 3.
 */
const easeOutBackInitialSlope = (overshoot: number): number => overshoot + 3;

/** easeOutBack — decelerate then overshoot slightly and settle back. */
function easeOutBack(t: number, overshoot: number): number {
    const c1 = overshoot;
    const c3 = overshoot + 1;
    const p = t - 1;
    return 1 + c3 * p * p * p + c1 * p * p;
}

/** Smooth ease-in (smoothstep-style) for an organic, non-linear acceleration. */
function easeInRamp(t: number): number {
    return t * t * (3 - 2 * t); // smoothstep, but only the [0,1] rising half is used
}

export class SpinController {
    /** Continuous scroll offset in symbol units. Monotonic while spinning. */
    public position = 0;
    /** Current speed in symbols / second (drives motion blur strength). */
    public velocity = 0;
    public state: SpinState = 'idle';

    private readonly cfg: ReelEngineConfig;
    private readonly index: number;

    private accelElapsed = 0;
    private cruiseElapsed = 0;
    private pendingStop = false;

    // Settle-phase working set (all pre-allocated; no per-frame allocation).
    private settleFrom = 0;
    private settleTarget = 0;
    private settleDistance = 0;
    private settleDuration = 0;
    private settleElapsed = 0;

    /**
     * Resolves the grid-aligned stop target the instant settling begins. The
     * Reel supplies this so it can ALSO inject the forced result symbols into
     * its band at the exact indices that will land on the payline rows.
     */
    private readonly resolveStopTarget: (currentPosition: number) => number;
    /** Fired once when this reel reaches a full stop. */
    private readonly onStopped: (index: number) => void;

    constructor(
        cfg: ReelEngineConfig,
        index: number,
        resolveStopTarget: (currentPosition: number) => number,
        onStopped: (index: number) => void,
    ) {
        this.cfg = cfg;
        this.index = index;
        this.resolveStopTarget = resolveStopTarget;
        this.onStopped = onStopped;
    }

    public get isSpinning(): boolean {
        return this.state !== 'idle' && this.state !== 'stopped';
    }

    /** Kick the reel into its acceleration phase. */
    public startSpin(): void {
        this.state = 'accelerating';
        this.velocity = 0;
        this.accelElapsed = 0;
        this.cruiseElapsed = 0;
        this.pendingStop = false;
    }

    /**
     * Request a stop. The reel will keep cruising until it has satisfied
     * `minSpinTime`, then glide to a grid-aligned rest. Safe to call at any time.
     */
    public requestStop(): void {
        this.pendingStop = true;
    }

    /** Advance the physics by `dt` seconds. */
    public update(dt: number): void {
        switch (this.state) {
            case 'accelerating': {
                this.accelElapsed += dt;
                const t = Math.min(this.accelElapsed / this.cfg.physics.acceleration, 1);
                this.velocity = this.cfg.physics.maxSpeed * easeInRamp(t);
                this.position += this.velocity * dt;
                if (t >= 1) {
                    this.velocity = this.cfg.physics.maxSpeed;
                    this.state = 'cruising';
                    this.cruiseElapsed = 0;
                }
                break;
            }

            case 'cruising': {
                this.velocity = this.cfg.physics.maxSpeed;
                this.position += this.velocity * dt;
                this.cruiseElapsed += dt;
                if (this.pendingStop && this.cruiseElapsed >= this.cfg.physics.minSpinTime) {
                    this.beginSettle();
                }
                break;
            }

            case 'settling': {
                this.settleElapsed += dt;
                const t = Math.min(this.settleElapsed / this.settleDuration, 1);
                const previous = this.position;
                this.position = this.settleFrom + this.settleDistance * easeOutBack(t, this.cfg.physics.overshoot);
                // Keep velocity meaningful for the motion-blur driver.
                this.velocity = dt > 0 ? (this.position - previous) / dt : 0;
                if (t >= 1) {
                    this.position = this.settleTarget; // exact grid alignment
                    this.velocity = 0;
                    this.state = 'stopped';
                    this.onStopped(this.index);
                }
                break;
            }

            // idle / stopped: nothing to integrate.
            default:
                break;
        }
    }

    /**
     * Transition cruise → settle. Picks the next grid-aligned target a fixed
     * number of symbols ahead, then derives a duration so the opening velocity
     * of the easeOutBack matches the current cruise velocity (smooth braking).
     */
    private beginSettle(): void {
        this.settleFrom = this.position;
        this.settleTarget = this.resolveStopTarget(this.position);
        this.settleDistance = this.settleTarget - this.settleFrom;

        const v0 = this.velocity > 0 ? this.velocity : this.cfg.physics.maxSpeed;
        const slope = easeOutBackInitialSlope(this.cfg.physics.overshoot);
        // velocity(0) of the curve == slope * distance / duration  ⇒  match to v0.
        this.settleDuration = (slope * this.settleDistance) / v0;

        this.settleElapsed = 0;
        this.state = 'settling';
    }
}
