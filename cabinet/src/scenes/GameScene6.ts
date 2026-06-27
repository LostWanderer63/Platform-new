import { Text, Container, Graphics, FillGradient } from 'pixi.js';
import { GlowFilter } from 'pixi-filters';
import { gsap } from 'gsap';
import { BaseScene } from './BaseScene';
import { GameConfig } from '../config/GameConfig';
import { gameStore } from '../state/GameState';
import { SceneManager } from '../managers/SceneManager';
import { MenuScene } from './MenuScene';

/**
 * GameScene6 — Slot 6: "Aviator Crash"
 * -------------------------------------
 * Faithful Aviator-style crash game. The red plane idles on the runway during
 * the betting window, takes off, and the multiplier climbs along a swooping
 * red curve — cash out before the plane FLIES AWAY or the bet is gone.
 *
 *   WAITING (propeller loader + progress bar, place bet)
 *     → FLYING (curve + plane + CASH OUT)
 *     → FLEW AWAY (plane zooms off screen) → …
 *
 * Aviator signatures reproduced:
 *  - red propeller plane with spinning prop, idling bob on the runway
 *  - glowing red curve with gradient wash, swooping wave path
 *  - rotating light-ray sweep around the launch corner
 *  - scrolling dotted axes (white below, blue left) that speed up with the odds
 *  - "FLEW AWAY!" — the plane escapes off-screen rather than exploding
 *  - history chips (blue < 2x, purple < 10x, magenta ≥ 10x)
 *  - bet panel with − / + stepper and the green BET → orange CASH OUT button
 */

const HOUSE_EDGE = 0.03;
const GROWTH = 0.13;            // m(t) = e^(GROWTH·t)
const WAIT_TIME = 4.0;          // seconds betting window
const CRASH_PAUSE = 2.8;        // seconds showing FLEW AWAY
const MAX_CRASH = 500;
const BET_STEPS = [1, 2, 5, 10, 20, 50, 100];

type Phase = 'waiting' | 'flying' | 'crashed';

/** Provably-fair-style crash point: ~3% instant bust, long tail capped. */
function rollCrashPoint(): number {
    const u = Math.random();
    return Math.min(MAX_CRASH, Math.max(1, (1 - HOUSE_EDGE) / (1 - u)));
}

/** Aviator history palette: blue < 2x, purple < 10x, magenta beyond. */
function chipColor(m: number): number {
    if (m >= 10) return 0xc017b4;
    if (m >= 2) return 0x913ef8;
    return 0x34b4ff;
}

export class GameScene6 extends BaseScene {
    private readonly plot = { x: 250, y: 210, w: 1420, h: 600 };

    private readonly fxLayer = new Container();
    private readonly uiContainer = new Container();

    private phase: Phase = 'waiting';
    private t = 0;
    private mult = 1;
    private crashAt = rollCrashPoint();
    private betPlaced = false;
    private cashedOut = false;
    private readonly history: number[] = [];

    private stars: { x: number; y: number; r: number; depth: number }[] = [];
    private starGfx!: Graphics;
    private rays!: Container;
    private gridGfx!: Graphics;
    private curveGfx!: Graphics;
    private plane!: Container;
    private prop!: Graphics;
    private smoke: Graphics[] = [];

    private multText!: Text;
    private flewText!: Text;
    private loader!: Container;
    private loaderProp!: Graphics;
    private loaderBar!: Graphics;
    private actionButton!: Graphics;
    private actionLabel!: Text;
    private actionSub!: Text;
    private betValueText!: Text;
    private historyRow!: Container;
    private cashPop!: Text;
    private redFlash!: Graphics;
    private balanceText!: Text;
    private elapsed = 0;

    private readonly onKeyDown = (e: KeyboardEvent): void => {
        if (e.code === 'Space') { e.preventDefault(); this.action(); }
        // (back-to-menu removed) if (e.code === 'Escape') SceneManager.switchScene(new MenuScene());
    };

    public async init(): Promise<void> {
        this.addChild(this.buildBackground());
        this.gridGfx = new Graphics();
        this.curveGfx = new Graphics();
        this.curveGfx.filters = [new GlowFilter({ distance: 14, outerStrength: 1.5, color: 0xe50539, quality: 0.2 })];
        this.addChild(this.gridGfx, this.curveGfx);
        this.addChild(this.fxLayer);
        this.plane = this.buildPlane();
        this.addChild(this.plane);
        this.addChild(this.uiContainer);
        this.createUI();
        this.enterWaiting();
        window.addEventListener('keydown', this.onKeyDown);
    }

    public async start(): Promise<void> {}

    public override async destroyScene(): Promise<void> {
        window.removeEventListener('keydown', this.onKeyDown);
        gsap.killTweensOf(this.position);
        gsap.killTweensOf(this.plane);
        gsap.killTweensOf(this.plane.position);
        for (const s of this.smoke) gsap.killTweensOf(s);
        gsap.killTweensOf(this.cashPop);
        gsap.killTweensOf(this.redFlash);
        gsap.killTweensOf(this.multText.scale);
        gsap.killTweensOf(this.flewText);
        this.curveGfx.filters = [];
        await super.destroyScene();
    }

    // --- round state machine ---------------------------------------------------

    public update(delta: number): void {
        const dt = Math.min(delta / 60, 1 / 30);
        this.elapsed += dt;
        this.t += dt;

        // Propeller always spins; faster in flight.
        const propSpeed = this.phase === 'flying' ? 46 : 16;
        this.prop.rotation += dt * propSpeed;
        this.loaderProp.rotation += dt * 9;

        if (this.phase === 'waiting') {
            const left = Math.max(0, WAIT_TIME - this.t);
            this.drawLoaderBar(left / WAIT_TIME);
            // Idle bob on the runway.
            const ground = this.plot.y + this.plot.h;
            this.plane.position.set(this.plot.x + 34, ground - 16 + Math.sin(this.elapsed * 5) * 2);
            if (left <= 0) this.enterFlying();
        } else if (this.phase === 'flying') {
            this.mult = Math.exp(GROWTH * this.t);
            if (this.mult >= this.crashAt) {
                this.mult = this.crashAt;
                this.enterCrashed();
                this.updateStars(dt);
                return; // crashed this frame — keep the wreck state intact
            }
            this.multText.text = `${this.mult.toFixed(2)}x`;
            this.multText.style.fill = this.mult >= 10 ? 0xffd54f : 0xffffff;
            if (this.betPlaced && !this.cashedOut) {
                this.actionLabel.text = 'CASH OUT';
                this.actionSub.text = `$${Math.floor(gameStore.getState().bet * this.mult)}`;
            }
            this.drawCurve();
            this.emitSmoke();
        } else if (this.phase === 'crashed' && this.t >= CRASH_PAUSE) {
            this.enterWaiting();
        }

        this.updateStars(dt);
        this.rays.rotation += dt * (this.phase === 'flying' ? 0.25 : 0.08);
    }

    private enterWaiting(): void {
        this.phase = 'waiting';
        this.t = 0;
        this.mult = 1;
        this.crashAt = rollCrashPoint();
        this.betPlaced = false;
        this.cashedOut = false;
        this.curveGfx.clear();
        gsap.killTweensOf(this.plane);
        gsap.killTweensOf(this.plane.position);
        this.plane.visible = true;
        this.plane.alpha = 1;
        this.plane.rotation = 0;
        this.plane.scale.set(1);
        this.multText.visible = false;
        this.flewText.visible = false;
        this.loader.visible = true;
        this.styleAction(0x28a909, 0x5be32a, 'BET', `$${gameStore.getState().bet}`);
        this.drawGrid();
    }

    private enterFlying(): void {
        this.phase = 'flying';
        this.t = 0;
        this.loader.visible = false;
        this.multText.visible = true;
        this.multText.style.fill = 0xffffff;
        if (!this.betPlaced) this.styleAction(0x232a3a, 0x3a4663, 'IN FLIGHT', 'wait for next round');
        gsap.fromTo(this.plane.scale, { x: 0.94, y: 0.94 }, { x: 1, y: 1, duration: 0.5, ease: 'back.out(2)' });
    }

    private enterCrashed(): void {
        this.drawCurve(); // freeze final curve as the backdrop
        this.phase = 'crashed';
        this.t = 0;
        this.history.unshift(this.mult);
        if (this.history.length > 12) this.history.pop();
        this.renderHistory();

        this.multText.text = `${this.mult.toFixed(2)}x`;
        this.multText.style.fill = 0xe50539;
        this.flewText.visible = true;
        this.flewText.alpha = 0;
        gsap.to(this.flewText, { alpha: 1, duration: 0.25 });
        gsap.fromTo(this.multText.scale, { x: 1.3, y: 1.3 }, { x: 1, y: 1, duration: 0.45, ease: 'back.out(2)' });

        if (this.betPlaced && !this.cashedOut) gameStore.getState().setWinAmount(0);
        this.styleAction(0x5a1020, 0xe50539, 'FLEW AWAY', `@ ${this.mult.toFixed(2)}x`);

        // Aviator signature: the plane ESCAPES — zooms off the top-right.
        gsap.killTweensOf(this.plane.position);
        gsap.to(this.plane.position, {
            x: GameConfig.width + 260,
            y: this.plane.y - 420,
            duration: 0.8,
            ease: 'power2.in',
        });
        gsap.to(this.plane, { rotation: -0.5, duration: 0.8, ease: 'power2.in' });

        this.shake(14);
        gsap.killTweensOf(this.redFlash);
        gsap.timeline()
            .set(this.redFlash, { alpha: 0.28 })
            .to(this.redFlash, { alpha: 0, duration: 0.7, ease: 'power2.out' });
    }

    // --- player actions ----------------------------------------------------------

    private action(): void {
        const state = gameStore.getState();
        if (this.phase === 'waiting' && !this.betPlaced) {
            if (state.balance < state.bet) return;
            state.setBalance(state.balance - state.bet);
            this.betPlaced = true;
            this.styleAction(0x8a6a0e, 0xffd54f, 'BET PLACED', `$${state.bet} — ready`);
        } else if (this.phase === 'flying' && this.betPlaced && !this.cashedOut) {
            this.cashedOut = true;
            const win = Math.floor(state.bet * this.mult);
            state.setBalance(state.balance + win);
            state.setWinAmount(win);
            this.styleAction(0x28a909, 0x5be32a, 'BANKED', `$${win} @ ${this.mult.toFixed(2)}x`);
            this.cashPopShow(`+$${win}`);
        }
    }

    private stepBet(dir: number): void {
        if (this.betPlaced && this.phase !== 'crashed') return; // locked while a bet rides
        const state = gameStore.getState();
        const i = BET_STEPS.findIndex((b) => b >= state.bet);
        const next = BET_STEPS[Math.max(0, Math.min(BET_STEPS.length - 1, (i < 0 ? BET_STEPS.length - 1 : i) + dir))];
        state.setBet(next);
        this.betValueText.text = `$${next}`;
        if (this.phase === 'waiting' && !this.betPlaced) this.styleAction(0x28a909, 0x5be32a, 'BET', `$${next}`);
    }

    // --- curve / graph -------------------------------------------------------------

    /**
     * Flight time → plot point with auto-zooming axes. A growing sine wave on
     * top of the exponential base makes the plane swoop up and down like the
     * real Aviator — presentation only, the multiplier maths is untouched.
     */
    private curvePoint(t: number): { x: number; y: number } {
        const tMax = Math.max(6, this.t * 1.38);
        const mMax = Math.max(2, (this.mult - 1) * 1.45 + 1);
        const px = this.plot.x + (t / tMax) * this.plot.w;
        const m = Math.exp(GROWTH * t);
        // Gentle swoop: low frequency, slow-growing amplitude, eased in softly.
        const wave = Math.sin(t * 1.25) * Math.min(26, t * 4);
        let py = this.plot.y + this.plot.h - ((m - 1) / (mMax - 1)) * this.plot.h + wave;
        py = Math.max(this.plot.y + 16, Math.min(this.plot.y + this.plot.h - 6, py));
        return { x: px, y: py };
    }

    private drawCurve(): void {
        const g = this.curveGfx;
        g.clear();
        const steps = 72;
        const pts: { x: number; y: number }[] = [];
        for (let i = 0; i <= steps; i++) pts.push(this.curvePoint((this.t * i) / steps));

        // Red gradient wash under the curve.
        g.moveTo(pts[0].x, this.plot.y + this.plot.h);
        for (const p of pts) g.lineTo(p.x, p.y);
        g.lineTo(pts[steps].x, this.plot.y + this.plot.h);
        g.closePath();
        g.fill(new FillGradient({
            type: 'linear', start: { x: 0, y: 0 }, end: { x: 0, y: 1 }, textureSpace: 'local',
            colorStops: [
                { offset: 0, color: 'rgba(229,5,57,0.42)' },
                { offset: 1, color: 'rgba(229,5,57,0.04)' },
            ],
        }));

        // The curve itself: Aviator red, gold beyond 10x.
        g.moveTo(pts[0].x, pts[0].y);
        for (const p of pts) g.lineTo(p.x, p.y);
        g.stroke({ width: 8, color: this.mult >= 10 ? 0xffd54f : 0xe50539, cap: 'round', join: 'round' });

        // Plane rides the tip, nose along the tangent.
        const tip = pts[steps];
        const prev = pts[steps - 2];
        this.plane.position.set(tip.x, tip.y - 10);
        // Soften the pitch and smooth it across frames so the nose never jerks.
        const target = Math.atan2(tip.y - prev.y, tip.x - prev.x) * 0.45;
        this.plane.rotation += (target - this.plane.rotation) * 0.15;

        this.drawGrid();
    }

    private drawGrid(): void {
        const g = this.gridGfx;
        const { x, y, w, h } = this.plot;
        g.clear();
        // Runway line.
        g.moveTo(x - 20, y + h).lineTo(x + w + 20, y + h).stroke({ width: 2, color: 0x2a3142, alpha: 0.9 });
        g.moveTo(x, y + h).lineTo(x, y - 20).stroke({ width: 2, color: 0x2a3142, alpha: 0.9 });
        // Aviator dotted axes — white dots stream left along the bottom, blue
        // dots stream down the left edge, faster as the odds climb.
        const speed = this.phase === 'flying' ? Math.min(34 + this.mult * 16, 240) : 14;
        const spacing = 64;
        const scroll = (this.elapsed * speed) % spacing;
        for (let dx = x + w - scroll; dx > x + 4; dx -= spacing) {
            g.circle(dx, y + h + 26, 3.5).fill({ color: 0xffffff, alpha: 0.6 });
        }
        for (let dy = y + scroll; dy < y + h - 4; dy += spacing) {
            g.circle(x - 26, dy, 3.5).fill({ color: 0x34b4ff, alpha: 0.7 });
        }
    }

    // --- the plane -------------------------------------------------------------------

    /** Aviator's red propeller plane, nose pointing +x, ~100px long. */
    private buildPlane(): Container {
        const c = new Container();

        const fuselageGrad = new FillGradient({
            type: 'linear', start: { x: 0, y: 0 }, end: { x: 0, y: 1 }, textureSpace: 'local',
            colorStops: [{ offset: 0, color: 0xff7585 }, { offset: 0.45, color: 0xe50539 }, { offset: 1, color: 0x90101f }],
        });

        const body = new Graphics();
        // Far wing (behind the fuselage, swept up-back).
        body.poly([8, -5, 42, -30, 56, -28, 24, -2]).fill({ color: 0x8a0f22 })
            .poly([8, -5, 42, -30, 56, -28, 24, -2]).stroke({ width: 2, color: 0x5e0a16 });
        // Tailplane (far side).
        body.poly([-30, -3, -48, -12, -48, -7, -30, 2]).fill({ color: 0x8a0f22 });
        // Fuselage — sleek teardrop.
        body.moveTo(52, -1)
            .quadraticCurveTo(48, -11, 28, -13)
            .lineTo(-24, -10)
            .quadraticCurveTo(-38, -9, -40, -2)
            .quadraticCurveTo(-38, 6, -24, 8)
            .lineTo(28, 11)
            .quadraticCurveTo(48, 9, 52, 3)
            .closePath()
            .fill(fuselageGrad)
            .stroke({ width: 2, color: 0x5e0a16 });
        // White belly stripe.
        body.moveTo(40, 6).lineTo(-30, 4).lineTo(-30, 7).quadraticCurveTo(0, 11, 38, 9).closePath()
            .fill({ color: 0xfff3f5, alpha: 0.85 });
        // Tail fin.
        body.poly([-22, -10, -34, -34, -25, -34, -10, -11]).fill(fuselageGrad)
            .poly([-22, -10, -34, -34, -25, -34, -10, -11]).stroke({ width: 2, color: 0x5e0a16 });
        // Cockpit canopy.
        body.ellipse(16, -10, 11, 6).fill({ color: 0xbfe9ff })
            .ellipse(16, -10, 11, 6).stroke({ width: 2, color: 0x4a6a8a });
        body.moveTo(16, -16).lineTo(16, -4).stroke({ width: 1.5, color: 0x4a6a8a, alpha: 0.7 });
        // Main wing (foreground, swept down-back).
        body.poly([6, 1, -10, 30, 6, 32, 26, 3]).fill({ color: 0xc40a30 })
            .poly([6, 1, -10, 30, 6, 32, 26, 3]).stroke({ width: 2, color: 0x5e0a16 });
        // Top sheen.
        body.ellipse(4, -9, 24, 3).fill({ color: 0xffffff, alpha: 0.35 });
        // Spinner cone.
        body.poly([52, -4, 62, 0, 52, 4]).fill({ color: 0x3a3f4a });
        c.addChild(body);

        // Propeller: two blades + blur disc, spun in update().
        this.prop = new Graphics()
            .ellipse(0, -16, 3.2, 16).fill({ color: 0x2a2e38, alpha: 0.95 })
            .ellipse(0, 16, 3.2, 16).fill({ color: 0x2a2e38, alpha: 0.95 })
            .circle(0, 0, 30).fill({ color: 0xaab4c4, alpha: 0.14 });
        this.prop.position.set(57, 0);
        c.addChild(this.prop);

        return c;
    }

    /** Faint smoke puffs drifting off the tail during flight. */
    private emitSmoke(): void {
        if (Math.random() > 0.5) return;
        let s = this.smoke.find((g) => !g.visible);
        if (!s) {
            s = new Graphics();
            s.visible = false;
            this.fxLayer.addChild(s);
            this.smoke.push(s);
        }
        const size = 3 + Math.random() * 5;
        s.clear().circle(0, 0, size).fill({ color: 0xd6dde8, alpha: 0.4 });
        const cos = Math.cos(this.plane.rotation);
        const sin = Math.sin(this.plane.rotation);
        s.position.set(this.plane.x - 46 * cos, this.plane.y - 46 * sin + 4);
        s.alpha = 0.5;
        s.scale.set(1);
        s.visible = true;
        gsap.killTweensOf(s);
        gsap.killTweensOf(s.scale);
        gsap.to(s.scale, { x: 2.4, y: 2.4, duration: 0.9, ease: 'power1.out' });
        gsap.to(s, {
            x: s.x - 90, y: s.y + 14, alpha: 0,
            duration: 0.9, ease: 'power1.out',
            onComplete: () => { s.visible = false; },
        });
    }

    // --- ambient -------------------------------------------------------------------

    /** Parallax star streaks, faster + longer the higher the multiplier. */
    private updateStars(dt: number): void {
        const speed = this.phase === 'flying' ? 40 + Math.min(this.mult * 26, 700) : 22;
        this.starGfx.clear();
        const W = GameConfig.width;
        for (const s of this.stars) {
            s.x -= speed * s.depth * dt;
            if (s.x < -14) { s.x = W + 14; s.y = Math.random() * GameConfig.height; }
            const stretch = this.phase === 'flying' ? Math.min(1 + this.mult * 0.35, 14) : 1;
            this.starGfx.roundRect(s.x, s.y, s.r * stretch, s.r, s.r / 2)
                .fill({ color: 0x8a93a8, alpha: 0.2 + s.depth * 0.4 });
        }
    }

    private shake(amplitude: number): void {
        gsap.killTweensOf(this.position);
        const tl = gsap.timeline({ onComplete: () => this.position.set(0, 0) });
        for (let i = 0; i < 6; i++) {
            const falloff = 1 - i / 7;
            tl.to(this.position, {
                x: (Math.random() - 0.5) * 2 * amplitude * falloff,
                y: (Math.random() - 0.5) * 2 * amplitude * falloff,
                duration: 0.05,
            });
        }
        tl.to(this.position, { x: 0, y: 0, duration: 0.06 });
    }

    private cashPopShow(msg: string): void {
        this.cashPop.text = msg;
        this.cashPop.alpha = 1;
        this.cashPop.visible = true;
        this.cashPop.position.set(this.plane.x, this.plane.y - 64);
        gsap.killTweensOf(this.cashPop);
        gsap.killTweensOf(this.cashPop.scale);
        gsap.fromTo(this.cashPop.scale, { x: 0.4, y: 0.4 }, { x: 1, y: 1, duration: 0.35, ease: 'back.out(2.5)' });
        gsap.to(this.cashPop, { y: this.cashPop.y - 90, alpha: 0, duration: 1.7, ease: 'power1.out', delay: 0.4, onComplete: () => { this.cashPop.visible = false; } });
    }

    private renderHistory(): void {
        this.historyRow.removeChildren().forEach((c) => c.destroy({ children: true }));
        this.history.forEach((m, i) => {
            const chip = new Container();
            const color = chipColor(m);
            chip.addChild(new Graphics()
                .roundRect(-46, -19, 92, 38, 19).fill({ color: 0x14181f })
                .roundRect(-46, -19, 92, 38, 19).stroke({ width: 2, color, alpha: 0.9 }));
            const label = new Text({ text: `${m.toFixed(2)}x`, style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 18, fontWeight: '900', fill: color } });
            label.anchor.set(0.5);
            chip.addChild(label);
            chip.position.set(i * 102, 0);
            if (i === 0) gsap.fromTo(chip.scale, { x: 0.3, y: 0.3 }, { x: 1, y: 1, duration: 0.35, ease: 'back.out(2.5)' });
            this.historyRow.addChild(chip);
        });
    }

    private buildBackground(): Container {
        const env = new Container();
        const W = GameConfig.width;
        const H = GameConfig.height;

        // Aviator charcoal: near-black with a soft radial lift from the corner.
        env.addChild(new Graphics().rect(0, 0, W, H).fill(0x0e0e12));
        env.addChild(new Graphics().ellipse(this.plot.x, this.plot.y + this.plot.h, 1500, 1000).fill(new FillGradient({
            type: 'radial', center: { x: 0.5, y: 0.5 }, innerRadius: 0, outerCenter: { x: 0.5, y: 0.5 }, outerRadius: 0.5, textureSpace: 'local',
            colorStops: [{ offset: 0, color: 'rgba(54,36,46,0.55)' }, { offset: 1, color: 'rgba(20,14,18,0)' }],
        })));

        // Star streaks (drawn each frame).
        this.stars = Array.from({ length: 90 }, () => ({
            x: Math.random() * W,
            y: Math.random() * H,
            r: Math.random() * 2 + 0.7,
            depth: 0.25 + Math.random() * 0.75,
        }));
        this.starGfx = new Graphics();
        env.addChild(this.starGfx);

        // Rotating ray sweep around the launch corner — the Aviator backdrop.
        this.rays = new Container();
        this.rays.position.set(this.plot.x, this.plot.y + this.plot.h);
        const rayGfx = new Graphics();
        for (let i = 0; i < 16; i++) {
            const a = (Math.PI * 2 * i) / 16;
            rayGfx.poly([
                0, 0,
                Math.cos(a) * 2600, Math.sin(a) * 2600,
                Math.cos(a + 0.1) * 2600, Math.sin(a + 0.1) * 2600,
            ]).fill({ color: 0xffffff, alpha: 0.03 });
        }
        this.rays.addChild(rayGfx);
        const rayMask = new Graphics().rect(0, 0, W, H).fill(0xffffff);
        env.addChild(rayMask);
        this.rays.mask = rayMask;
        env.addChild(this.rays);

        const title = new Text({
            text: 'AVIATOR CRASH',
            style: {
                fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 44, fontWeight: '900', letterSpacing: 7,
                fill: 0xe50539, stroke: { color: 0x1a0508, width: 6 },
                dropShadow: { color: 0xe50539, blur: 12, distance: 0, alpha: 0.7 },
            },
        });
        title.anchor.set(0, 0.5);
        title.position.set(44, 52);
        env.addChild(title);

        // Crash red flash overlay.
        this.redFlash = new Graphics().rect(0, 0, W, H).fill(0xe50539);
        this.redFlash.alpha = 0;
        env.addChild(this.redFlash);
        return env;
    }

    private createUI(): void {
        const W = GameConfig.width;
        const H = GameConfig.height;

        // Giant multiplier readout (visible in flight + crash).
        this.multText = new Text({
            text: '1.00x',
            style: {
                fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 124, fontWeight: '900',
                fill: 0xffffff, stroke: { color: 0x0e0e12, width: 10 },
                dropShadow: { color: 0x000000, blur: 8, distance: 4, alpha: 0.5 },
            },
        });
        this.multText.anchor.set(0.5);
        this.multText.position.set(W / 2, 360);
        this.uiContainer.addChild(this.multText);

        this.flewText = new Text({
            text: 'FLEW AWAY!',
            style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 42, fontWeight: '900', letterSpacing: 5, fill: 0xe50539 },
        });
        this.flewText.anchor.set(0.5);
        this.flewText.position.set(W / 2, 264);
        this.flewText.visible = false;
        this.uiContainer.addChild(this.flewText);

        // Waiting loader: spinning propeller + draining red bar.
        this.loader = new Container();
        this.loader.position.set(W / 2, 400);
        this.loaderProp = new Graphics()
            .ellipse(0, -34, 7, 34).fill({ color: 0xe50539 })
            .ellipse(0, 34, 7, 34).fill({ color: 0xe50539 })
            .ellipse(-34, 0, 34, 7).fill({ color: 0xb00428 })
            .ellipse(34, 0, 34, 7).fill({ color: 0xb00428 })
            .circle(0, 0, 12).fill({ color: 0xfff3f5 });
        this.loader.addChild(this.loaderProp);
        const waitingLabel = new Text({
            text: 'WAITING FOR NEXT ROUND',
            style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 30, fontWeight: '900', letterSpacing: 3, fill: 0xffffff },
        });
        waitingLabel.anchor.set(0.5);
        waitingLabel.position.set(0, 92);
        this.loader.addChild(waitingLabel);
        this.loaderBar = new Graphics();
        this.loaderBar.position.set(0, 138);
        this.loader.addChild(this.loaderBar);
        this.uiContainer.addChild(this.loader);

        // History chips top-centre.
        this.historyRow = new Container();
        this.historyRow.position.set(620, 52);
        this.uiContainer.addChild(this.historyRow);

        // --- bottom bet panel -------------------------------------------------
        const panelW = 760;
        const panelH = 130;
        const panelX = W / 2 - panelW / 2;
        const panelY = H - panelH - 28;
        this.uiContainer.addChild(new Graphics()
            .roundRect(panelX, panelY, panelW, panelH, 26).fill({ color: 0x14181f, alpha: 0.96 })
            .roundRect(panelX, panelY, panelW, panelH, 26).stroke({ width: 2, color: 0x2a3142 }));

        // Bet stepper (− value +).
        const betLabel = new Text({ text: 'BET', style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 20, fontWeight: '900', letterSpacing: 2, fill: 0x6a7384 } });
        betLabel.anchor.set(0.5);
        betLabel.position.set(panelX + 160, panelY + 32);
        this.uiContainer.addChild(betLabel);

        this.betValueText = new Text({ text: `$${gameStore.getState().bet}`, style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 40, fontWeight: '900', fill: 0xffffff } });
        this.betValueText.anchor.set(0.5);
        this.betValueText.position.set(panelX + 160, panelY + 78);
        this.uiContainer.addChild(this.betValueText);

        const stepBtn = (dx: number, glyph: string, dir: number): void => {
            const b = new Graphics()
                .circle(0, 0, 26).fill({ color: 0x232a3a })
                .circle(0, 0, 26).stroke({ width: 2, color: 0x3a4663 });
            b.position.set(panelX + 160 + dx, panelY + 78);
            b.eventMode = 'static';
            b.cursor = 'pointer';
            b.on('pointerdown', () => {
                gsap.fromTo(b.scale, { x: 0.85, y: 0.85 }, { x: 1, y: 1, duration: 0.25, ease: 'back.out(3)' });
                this.stepBet(dir);
            });
            const t = new Text({ text: glyph, style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 28, fontWeight: '900', fill: 0xaab4c4 } });
            t.anchor.set(0.5);
            b.addChild(t);
            this.uiContainer.addChild(b);
        };
        stepBtn(-104, '−', -1);
        stepBtn(104, '+', 1);

        // Morphing action button (BET / CASH OUT).
        this.actionButton = new Graphics();
        this.actionButton.position.set(panelX + panelW - 230, panelY + panelH / 2);
        this.actionButton.eventMode = 'static';
        this.actionButton.cursor = 'pointer';
        this.actionButton.on('pointerdown', () => {
            gsap.fromTo(this.actionButton.scale, { x: 0.94, y: 0.94 }, { x: 1, y: 1, duration: 0.3, ease: 'back.out(3)' });
            this.action();
        });
        this.actionLabel = new Text({ text: '', style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 34, fontWeight: '900', fill: 0xffffff } });
        this.actionLabel.anchor.set(0.5);
        this.actionLabel.position.set(0, -14);
        this.actionSub = new Text({ text: '', style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 22, fontWeight: '900', fill: 0xffffff } });
        this.actionSub.alpha = 0.85;
        this.actionSub.anchor.set(0.5);
        this.actionSub.position.set(0, 24);
        this.actionButton.addChild(this.actionLabel, this.actionSub);
        this.uiContainer.addChild(this.actionButton);

        // Cash-out pop.
        this.cashPop = new Text({
            text: '',
            style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 48, fontWeight: '900', fill: 0x5be32a, stroke: { color: 0x07230a, width: 7 } },
        });
        this.cashPop.anchor.set(0.5);
        this.cashPop.visible = false;
        this.uiContainer.addChild(this.cashPop);

        this.balanceText = new Text({ text: '', style: { fill: 0xaab4c4, fontSize: 26 } });
        this.balanceText.position.set(panelX + 30, panelY - 40);
        this.uiContainer.addChild(this.balanceText);

        const back = new Text({ text: '‹ MENU', style: { fill: 0xe50539, fontSize: 26, fontWeight: 'bold' } });
        back.position.set(44, 86);
        back.eventMode = 'static';
        back.cursor = 'pointer';
        back.on('pointerdown', () => SceneManager.switchScene(new MenuScene()));
        // (back-to-menu removed) this.uiContainer.addChild(back);

        const hint = new Text({ text: 'space or button · bet in the countdown, cash out before the plane flies away', style: { fill: 0x6a7384, fontSize: 18, fontStyle: 'italic' } });
        hint.anchor.set(0.5);
        hint.position.set(W / 2, H - 10);
        this.uiContainer.addChild(hint);

        const render = (s: ReturnType<typeof gameStore.getState>): void => {
            this.balanceText.text = `Balance: $${Math.round(s.balance * 100) / 100}`;
        };
        render(gameStore.getState());
        gameStore.subscribe(render);
    }

    private drawLoaderBar(frac: number): void {
        const w = 360;
        this.loaderBar.clear()
            .roundRect(-w / 2, -7, w, 14, 7).fill({ color: 0x232a3a })
            .roundRect(-w / 2, -7, Math.max(14, w * frac), 14, 7).fill({ color: 0xe50539 });
    }

    /** Restyle the morphing action button. */
    private styleAction(fill: number, edge: number, label: string, sub: string): void {
        this.actionButton.clear()
            .roundRect(-170, -52, 340, 104, 22).fill(fill)
            .roundRect(-170, -52, 340, 104, 22).stroke({ width: 3, color: edge });
        this.actionLabel.text = label;
        this.actionSub.text = sub;
        this.actionSub.visible = sub.length > 0;
        this.actionLabel.position.set(0, sub ? -14 : 0);
        if (this.actionLabel.width > 300) this.actionLabel.scale.set(300 / this.actionLabel.width);
        else this.actionLabel.scale.set(1);
        if (this.actionSub.width > 300) this.actionSub.scale.set(300 / this.actionSub.width);
        else this.actionSub.scale.set(1);
    }

    public resize(_width: number, _height: number): void {}
}
