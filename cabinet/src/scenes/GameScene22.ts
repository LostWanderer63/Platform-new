import { Text, Container, Graphics, FillGradient } from 'pixi.js';
import { gsap } from 'gsap';
import { BaseScene } from './BaseScene';
import { GameConfig } from '../config/GameConfig';
import { gameStore } from '../state/GameState';
import { SceneManager } from '../managers/SceneManager';
import { MenuScene } from './MenuScene';

/**
 * GameScene22 — Slot 22: "Jungle Swing"
 * --------------------------------------
 * A rope-swinging cash-ladder. A monkey hangs from a vine over a river; each
 * SWING he leaps for the next vine — catch it and the multiplier climbs, miss
 * and he plummets into the water and the round is lost. CASH OUT any time to
 * bank bet × the current multiplier. Every vine is riskier and worth more.
 *
 * The presentation is the point — production-grade character animation:
 *  - a fully rigged vector monkey (head, muzzle, ears, limbs, curling tail)
 *    that idle-bobs, pendulum-swings on a bending rope, fist-pumps on a catch
 *    and tumbles on a miss
 *  - parallax jungle (sun shafts, layered canopy, drifting spores, fireflies)
 *  - a flowing river with animated ripples + a splash on a fall
 *  - the vine row scrolls and the camera climbs as he ascends
 */

const BET_STEPS = [1, 2, 5, 10, 20, 50, 100];

const GRIP_X = 560;          // fixed screen x of the monkey's current grip
const GRIP_Y = 300;          // screen y of the current grip
const VINE_STRIDE = 360;     // horizontal spacing between vines
const VINE_RISE = 26;        // each vine sits a touch higher (climb feel)

// SKILL TIMING: the rope swings; the player must JUMP near the forward apex.
// Higher vines swing FASTER with a SMALLER sweet-spot window → harder.
const MULTS = [1, 1.5, 2.2, 3.3, 5, 7.5, 12, 20, 35, 65, 130];
const swingSpeed = (node: number): number => 2.1 + node * 0.34;          // phase rad/s
const swingAmp = (node: number): number => 0.54 + node * 0.02;           // pendulum amplitude
const jumpWindow = (node: number): number => Math.max(0.1, 0.46 - node * 0.04); // sweet-spot size in sin-units below the apex

export class GameScene22 extends BaseScene {
    private readonly bgLayer = new Container();
    private readonly farLayer = new Container();
    private readonly midLayer = new Container();
    private readonly worldLayer = new Container();   // vines + river, scrolls
    private readonly fxLayer = new Container();
    private readonly uiContainer = new Container();

    // monkey rig
    private swingPivot!: Container;   // pivots at the grip (pendulum)
    private rope!: Graphics;
    private monkey!: Container;
    private tail!: Graphics;
    private monkeyBody!: Container;

    private vineRow!: Container;
    private vines: { node: Container; tag: Text }[] = [];
    private river!: Graphics;
    private readonly riverPts: number[] = [];
    private spores!: Graphics;
    private readonly spore: { x: number; y: number; r: number; vy: number; vx: number; ph: number }[] = [];

    private node = 0;
    private inRun = false;
    private busy = false;
    private swinging = false;     // pendulum active, ready to time a JUMP
    private phase = 0;            // swing phase
    private elapsed = 0;
    private timingBar!: Graphics;
    private timingHint!: Text;

    private multBig!: Text;
    private nextText!: Text;
    private banner!: Text;
    private swingButton!: Graphics;
    private swingLabel!: Text;
    private swingSub!: Text;
    private cashButton!: Graphics;
    private cashLabel!: Text;
    private betValueText!: Text;
    private balanceText!: Text;
    private readonly coins: Graphics[] = [];
    private readonly calls: gsap.core.Tween[] = [];

    private readonly onKeyDown = (e: KeyboardEvent): void => {
        if (e.code === 'Space') { e.preventDefault(); this.swing(); }
        if (e.code === 'KeyC') this.cashOut();
        // (back-to-menu removed) if (e.code === 'Escape') SceneManager.switchScene(new MenuScene());
    };

    public async init(): Promise<void> {
        this.addChild(this.bgLayer);
        this.addChild(this.farLayer);
        this.addChild(this.midLayer);
        this.addChild(this.worldLayer);
        this.addChild(this.fxLayer);
        this.addChild(this.uiContainer);

        this.buildJungle();
        this.buildVines();
        this.buildMonkey();
        this.createUI();
        this.resetToStart();
        window.addEventListener('keydown', this.onKeyDown);
    }

    public async start(): Promise<void> {}

    public update(delta: number): void {
        const dt = Math.min(delta / 60, 0.05);
        this.elapsed += dt;

        if (this.swinging && !this.busy) {
            // Active pendulum — the rope visibly swings; player times the JUMP.
            this.phase += swingSpeed(this.node) * dt;
            this.swingPivot.rotation = swingAmp(this.node) * Math.sin(this.phase);
            this.monkeyBody.y = Math.abs(Math.sin(this.phase)) * 4;
            this.drawTimingBar();
        } else if (!this.inRun && !this.busy) {
            // Idle gentle sway at the start.
            this.monkeyBody.y = Math.sin(this.elapsed * 2.2) * 5;
            this.swingPivot.rotation = Math.sin(this.elapsed * 1.4) * 0.04;
            this.timingBar.visible = false;
        }
        this.tail.rotation = Math.sin(this.elapsed * 2.6) * 0.25;

        // River ripples.
        this.drawRiver();

        // Drifting spores / fireflies.
        this.spores.clear();
        for (const s of this.spore) {
            s.x += s.vx * dt; s.y -= s.vy * dt;
            if (s.y < 80) { s.y = GameConfig.height + 10; s.x = Math.random() * GameConfig.width; }
            if (s.x > GameConfig.width + 10) s.x = -10;
            const tw = 0.4 + 0.4 * Math.sin(this.elapsed * 3 + s.ph);
            this.spores.circle(s.x, s.y, s.r).fill({ color: 0xffe9a8, alpha: tw * 0.5 });
        }
    }

    public resize(_width: number, _height: number): void {}

    public override async destroyScene(): Promise<void> {
        window.removeEventListener('keydown', this.onKeyDown);
        for (const c of this.calls) c.kill();
        gsap.killTweensOf(this.swingPivot); gsap.killTweensOf(this.monkey); gsap.killTweensOf(this.monkey.scale);
        gsap.killTweensOf(this.worldLayer); gsap.killTweensOf(this.farLayer); gsap.killTweensOf(this.midLayer);
        gsap.killTweensOf(this.banner); gsap.killTweensOf(this.banner.scale);
        for (const g of this.coins) gsap.killTweensOf(g);
        await super.destroyScene();
    }

    private d(s: number): number { return s; }

    // --- run flow --------------------------------------------------------------------

    private resetToStart(): void {
        this.node = 0;
        this.inRun = false;
        this.busy = false;
        this.swinging = false;
        this.phase = 0;
        this.timingBar.visible = false;
        this.timingHint.visible = false;
        this.worldLayer.position.set(0, 0);
        this.farLayer.position.set(0, 0);
        this.midLayer.position.set(0, 0);
        this.swingPivot.rotation = 0;
        this.monkey.position.set(0, 0);
        this.monkey.rotation = 0;
        this.monkey.alpha = 1;
        this.monkey.scale.set(1);
        this.updateReadout();
        this.styleButtons();
    }

    private swing(): void {
        if (this.busy) return;
        const state = gameStore.getState();
        // First press: pay in and release him to start swinging (no jump yet).
        if (!this.inRun) {
            if (state.balance < state.bet) return;
            state.setBalance(Math.round((state.balance - state.bet) * 100) / 100);
            state.setWinAmount(0);
            this.inRun = true;
            this.banner.visible = false;
            this.node = 0;
            this.phase = 0;
            this.swinging = true;
            this.updateReadout();
            this.styleButtons();
            return;
        }
        if (!this.swinging) return;
        if (this.node >= MULTS.length - 1) { this.cashOut(); return; }

        // TIMING CHECK: jump must fire near the forward apex (sin → 1).
        const s = Math.sin(this.phase);
        const success = s >= 1 - jumpWindow(this.node);
        this.swinging = false;
        this.busy = true;
        this.timingBar.visible = false;
        this.styleButtons();
        gsap.killTweensOf(this.swingPivot);
        if (success) this.land(); else this.fall();
    }

    /** Timing meter: marker tracks the swing, green = the jump sweet-spot. */
    private drawTimingBar(): void {
        const g = this.timingBar;
        const cx = 820;
        const y = 600;
        const half = 280;
        const s = Math.sin(this.phase);
        const winLeft = cx + (1 - jumpWindow(this.node)) * half; // left edge of the green zone
        g.visible = true;
        g.clear()
            .roundRect(cx - half - 16, y - 18, half * 2 + 32, 36, 18).fill({ color: 0x0c2a16, alpha: 0.9 })
            .roundRect(cx - half - 16, y - 18, half * 2 + 32, 36, 18).stroke({ width: 2, color: 0x2f8a44 })
            // Sweet-spot zone (right side, near the forward apex).
            .roundRect(winLeft, y - 12, cx + half - winLeft, 24, 10).fill({ color: 0x1f8a3c })
            .roundRect(winLeft, y - 12, cx + half - winLeft, 24, 10).stroke({ width: 2, color: 0x7dffb0 });
        // Marker.
        const mx = cx + s * half;
        g.roundRect(mx - 5, y - 22, 10, 44, 5).fill({ color: 0xffe082 })
            .roundRect(mx - 5, y - 22, 10, 44, 5).stroke({ width: 2, color: 0xffffff });
        const label = this.timingHint;
        label.visible = true;
        label.position.set(cx, y - 40);
    }

    /** Successful catch: scroll the world so the next vine reaches the grip. */
    private land(): void {
        this.node++;
        const dx = -VINE_STRIDE;
        const dy = VINE_RISE; // camera climbs: world drifts down a touch

        const atTop = this.node >= MULTS.length - 1;
        const tl = gsap.timeline({ onComplete: () => {
            this.busy = false;
            this.phase = 0;
            this.swinging = !atTop;   // resume the pendulum on the new vine (unless topped out)
            this.updateReadout();
            this.styleButtons();
            if (atTop) this.showBanner('TOP VINE! cash out!', 0xffd23d);
        } });
        // Carry-through swing back to vertical as the world slides under him.
        tl.to(this.swingPivot, { rotation: -0.18, duration: this.d(0.18), ease: 'power1.out' }, 0);
        tl.to(this.worldLayer.position, { x: this.worldLayer.position.x + dx, y: this.worldLayer.position.y + dy, duration: this.d(0.4), ease: 'power2.inOut' }, 0);
        tl.to(this.midLayer.position, { x: this.midLayer.position.x + dx * 0.5, y: this.midLayer.position.y + dy * 0.5, duration: this.d(0.4), ease: 'power2.inOut' }, 0);
        tl.to(this.farLayer.position, { x: this.farLayer.position.x + dx * 0.22, duration: this.d(0.4), ease: 'power2.inOut' }, 0);
        tl.to(this.swingPivot, { rotation: 0, duration: this.d(0.28), ease: 'back.out(2)' }, 0.3);
        // Landing squash + happy pump.
        tl.fromTo(this.monkey.scale, { x: 1.15, y: 0.85 }, { x: 1, y: 1, duration: this.d(0.35), ease: 'elastic.out(1.2, 0.5)' }, 0.4);
        this.bananaPop();
    }

    /** Miss: he lets go, arcs out and splashes into the river. */
    private fall(): void {
        this.showBanner('MISSED!', 0xff5a4e);
        const tl = gsap.timeline({ onComplete: () => {
            this.splash();
            const lostAt = this.node;
            this.calls.push(gsap.delayedCall(0.7, () => {
                this.resetToStart();
                if (lostAt === 0) this.showBanner('SPLASH! try again', 0xaab4c4);
            }));
        } });
        gsap.killTweensOf(this.monkey);
        // Release: fling forward, tumble, drop below the river line.
        tl.to(this.monkey, { x: 240, y: 120, rotation: 0.8, duration: this.d(0.28), ease: 'power2.out' });
        tl.to(this.monkey, { y: GameConfig.height - GRIP_Y + 40, rotation: 3.4, duration: this.d(0.55), ease: 'power2.in' });
        tl.to(this.monkey, { alpha: 0, duration: this.d(0.15) }, '-=0.1');
    }

    private cashOut(): void {
        if (this.busy || !this.inRun || this.node < 1) return;
        const state = gameStore.getState();
        const payout = Math.round(state.bet * MULTS[this.node] * 100) / 100;
        state.setBalance(Math.round((state.balance + payout) * 100) / 100);
        state.setWinAmount(payout);
        this.showBanner(`CASHED OUT  $${payout}`, 0x4ade6a);
        this.coinBurst(GRIP_X, GRIP_Y + 60, Math.min(40, 8 + (MULTS[this.node] | 0)));
        // Victory pump.
        gsap.fromTo(this.monkey.scale, { x: 1.2, y: 1.2 }, { x: 1, y: 1, duration: 0.5, ease: 'elastic.out(1.1, 0.5)' });
        this.busy = true;
        this.styleButtons();
        this.calls.push(gsap.delayedCall(1.4, () => this.resetToStart()));
    }

    private updateReadout(): void {
        const cur = MULTS[this.node];
        this.multBig.text = `${cur.toFixed(2)}×`;
        this.multBig.style.fill = this.node === 0 ? 0xbfe8c8 : cur >= 10 ? 0xff5a4e : cur >= 3 ? 0xffd23d : 0x7dffb0;
        gsap.fromTo(this.multBig.scale, { x: 1.25, y: 1.25 }, { x: 1, y: 1, duration: 0.25, ease: 'back.out(2)' });
        const nextN = Math.min(this.node + 1, MULTS.length - 1);
        this.nextText.text = this.node >= MULTS.length - 1 ? 'top vine reached' : `next vine  ${MULTS[nextN].toFixed(2)}×   ·   jump at the apex!`;
    }

    // --- vines -----------------------------------------------------------------------

    private buildVines(): void {
        this.vineRow = new Container();
        this.worldLayer.addChild(this.vineRow);
        for (let i = 0; i < MULTS.length; i++) {
            const node = new Container();
            const x = GRIP_X + i * VINE_STRIDE;
            const y = GRIP_Y - i * VINE_RISE;
            node.position.set(x, y);
            // Hanging vine from the canopy down past the grip.
            const v = new Graphics();
            v.moveTo(0, -y).bezierCurveTo(20, -y * 0.5, -16, -40, 0, 0).stroke({ width: 7, color: 0x2f6a32 });
            // Leaves along the vine.
            for (let k = 1; k <= 4; k++) {
                const ly = -y * (k / 5);
                v.ellipse(((k % 2) ? 14 : -14), ly, 16, 8).fill({ color: 0x3f9e4d });
            }
            // Grip knot.
            v.circle(0, 0, 12).fill({ color: 0x6a4a2a }).circle(0, 0, 12).stroke({ width: 3, color: 0x3a2a14 });
            node.addChild(v);
            // Multiplier tag (banana plaque).
            const tagBg = new Graphics()
                .roundRect(-52, 18, 104, 44, 22).fill({ color: 0x1a3a1e, alpha: 0.92 })
                .roundRect(-52, 18, 104, 44, 22).stroke({ width: 3, color: 0xffd23d });
            const tag = new Text({ text: `${MULTS[i].toFixed(2)}×`, style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 22, fontWeight: '900', fill: 0xffe082 } });
            tag.anchor.set(0.5); tag.position.set(0, 40);
            node.addChild(tagBg, tag);
            this.vineRow.addChild(node);
            this.vines.push({ node, tag });
        }
    }

    // --- monkey rig ------------------------------------------------------------------

    private buildMonkey(): void {
        this.swingPivot = new Container();
        this.swingPivot.position.set(GRIP_X, GRIP_Y);
        this.fxLayer.addChild(this.swingPivot);

        this.rope = new Graphics();
        this.swingPivot.addChild(this.rope);
        this.drawRope();

        this.monkey = new Container();
        this.monkey.position.set(0, 0);
        this.swingPivot.addChild(this.monkey);

        this.monkeyBody = new Container();
        this.monkey.addChild(this.monkeyBody);

        const fur = 0x6a4222;
        const furD = 0x4a2c14;
        const face = 0xd9a86a;

        // Tail (separate for sway), behind body.
        this.tail = new Graphics();
        this.tail.moveTo(0, 0).bezierCurveTo(40, 30, 70, 0, 64, -46).stroke({ width: 11, color: fur, cap: 'round' });
        this.tail.position.set(-18, 150);
        this.monkeyBody.addChild(this.tail);

        const g = new Graphics();
        // Gripping arm up to the rope.
        g.moveTo(2, 56).quadraticCurveTo(-6, 10, 0, -2).stroke({ width: 15, color: fur, cap: 'round' });
        g.circle(0, -4, 10).fill({ color: face });                                  // hand on knot
        // Far arm.
        g.moveTo(8, 64).quadraticCurveTo(34, 96, 26, 128).stroke({ width: 14, color: furD, cap: 'round' });
        g.circle(26, 130, 9).fill({ color: face });
        // Body.
        g.ellipse(6, 96, 34, 44).fill({ color: fur });
        g.ellipse(6, 104, 22, 30).fill({ color: face });                            // belly
        // Legs.
        g.moveTo(-8, 132).quadraticCurveTo(-22, 160, -6, 176).stroke({ width: 14, color: furD, cap: 'round' });
        g.moveTo(18, 134).quadraticCurveTo(30, 162, 16, 180).stroke({ width: 14, color: fur, cap: 'round' });
        g.circle(-6, 178, 8).fill({ color: face });
        g.circle(16, 182, 8).fill({ color: face });
        // Head.
        g.circle(8, 54, 30).fill({ color: fur });
        g.circle(-14, 44, 11).fill({ color: fur }).circle(-14, 44, 6).fill({ color: face }); // ear L
        g.circle(30, 44, 11).fill({ color: fur }).circle(30, 44, 6).fill({ color: face });   // ear R
        g.ellipse(8, 60, 20, 17).fill({ color: face });                              // muzzle
        g.circle(8, 46, 18).fill({ color: face, alpha: 0.0 });                       // (face area)
        g.ellipse(2, 64, 3, 4).fill({ color: 0x2a1a10 }).ellipse(14, 64, 3, 4).fill({ color: 0x2a1a10 }); // nostrils
        g.circle(0, 48, 5).fill({ color: 0xffffff }).circle(1, 49, 3).fill({ color: 0x1a1008 });          // eye L
        g.circle(16, 48, 5).fill({ color: 0xffffff }).circle(17, 49, 3).fill({ color: 0x1a1008 });        // eye R
        g.moveTo(2, 70).quadraticCurveTo(8, 74, 14, 70).stroke({ width: 2, color: 0x6a3a1a });            // smile
        this.monkeyBody.addChild(g);
    }

    private drawRope(): void {
        this.rope.clear()
            .moveTo(0, -GRIP_Y).bezierCurveTo(10, -GRIP_Y * 0.5, -8, -40, 0, 0).stroke({ width: 6, color: 0x6a8a3a })
            .circle(0, 0, 10).fill({ color: 0x6a4a2a });
    }

    private bananaPop(): void {
        const b = this.acquireCoin();
        b.clear().moveTo(-4, -14).quadraticCurveTo(14, -8, 8, 16).quadraticCurveTo(-2, 6, -4, -14).fill({ color: 0xffd23d }).stroke({ width: 2, color: 0x8a6512 });
        b.position.set(GRIP_X + 20, GRIP_Y + 40);
        b.alpha = 1; b.scale.set(1); b.visible = true;
        gsap.killTweensOf(b); gsap.killTweensOf(b.scale);
        gsap.to(b, { y: GRIP_Y - 40, alpha: 0, duration: 0.6, ease: 'power1.out', onComplete: () => { b.visible = false; } });
        gsap.fromTo(b.scale, { x: 0.4, y: 0.4 }, { x: 1.2, y: 1.2, duration: 0.6 });
    }

    private splash(): void {
        const riverY = GameConfig.height - 120;
        for (let i = 0; i < 16; i++) {
            const p = this.acquireCoin();
            const sz = 4 + Math.random() * 8;
            p.clear().circle(0, 0, sz).fill({ color: 0x9fe0ff, alpha: 0.9 });
            p.position.set(GRIP_X + 240, riverY);
            p.alpha = 1; p.scale.set(1); p.visible = true;
            const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.6;
            const sp = 120 + Math.random() * 220;
            gsap.killTweensOf(p);
            gsap.to(p, { x: GRIP_X + 240 + Math.cos(a) * sp * 0.6, y: riverY + Math.sin(a) * sp * 0.6 + 120, alpha: 0, duration: 0.7, ease: 'power2.out', onComplete: () => { p.visible = false; } });
        }
    }

    // --- environment -----------------------------------------------------------------

    private buildJungle(): void {
        const W = GameConfig.width;
        const H = GameConfig.height;
        // Sky / deep jungle gradient.
        this.bgLayer.addChild(new Graphics().rect(0, 0, W, H).fill(new FillGradient({
            type: 'linear', start: { x: 0, y: 0 }, end: { x: 0, y: 1 }, textureSpace: 'local',
            colorStops: [{ offset: 0, color: 0x9fd86a }, { offset: 0.35, color: 0x4fa23e }, { offset: 0.7, color: 0x1f6a32 }, { offset: 1, color: 0x0c3a1e }],
        })));
        // Sun shafts.
        const rays = new Graphics();
        rays.blendMode = 'add';
        for (let i = 0; i < 6; i++) {
            const x = 200 + i * 280;
            rays.poly([x, 0, x + 70, 0, x + 160, H, x - 30, H]).fill({ color: 0xfff3a0, alpha: 0.05 });
        }
        this.bgLayer.addChild(rays);

        // Far canopy (slow parallax) — wide so it can scroll.
        const far = new Graphics();
        for (let x = -200; x < W + 1600; x += 220) {
            const h = 180 + ((x * 7) % 120);
            far.circle(x, 220, h).fill({ color: 0x2a7a3e, alpha: 0.55 });
        }
        this.farLayer.addChild(far);

        // Mid canopy.
        const mid = new Graphics();
        for (let x = -200; x < W + 1600; x += 180) {
            const h = 130 + ((x * 13) % 90);
            mid.circle(x, 150, h).fill({ color: 0x2f8a44, alpha: 0.8 });
        }
        this.midLayer.addChild(mid);
        // Top canopy band the vines hang from.
        this.midLayer.addChild(new Graphics().rect(-200, -40, W + 2000, 120).fill({ color: 0x1f6a32 }));

        // River across the bottom (in fixed bgLayer so it doesn't scroll vertically away).
        this.river = new Graphics();
        this.bgLayer.addChild(this.river);
        const riverY = H - 150;
        for (let x = 0; x <= W; x += 40) this.riverPts.push(x);
        this.bgLayer.addChild(new Graphics().rect(0, riverY + 30, W, 180).fill(0x0a2a44)); // deep water base
        void riverY;

        // Spores / fireflies field.
        this.spores = new Graphics();
        this.fxLayer.addChild(this.spores);
        for (let i = 0; i < 36; i++) this.spore.push({ x: Math.random() * W, y: Math.random() * H, r: 1.5 + Math.random() * 3, vy: 8 + Math.random() * 16, vx: (Math.random() - 0.5) * 14, ph: Math.random() * Math.PI * 2 });

        const title = new Text({ text: 'JUNGLE SWING', style: {
            fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 46, fontWeight: '900', letterSpacing: 5,
            fill: 0xffe082, stroke: { color: 0x143a18, width: 7 },
            dropShadow: { color: 0x0c3a1e, blur: 0, distance: 4, alpha: 0.6, angle: Math.PI / 3 },
        } });
        title.anchor.set(0, 0.5);
        title.position.set(60, 64);
        this.bgLayer.addChild(title);
    }

    private drawRiver(): void {
        const H = GameConfig.height;
        const riverY = H - 150;
        const g = this.river;
        g.clear();
        g.moveTo(0, riverY);
        for (const x of this.riverPts) g.lineTo(x, riverY + Math.sin(x * 0.02 + this.elapsed * 2) * 8);
        g.lineTo(GameConfig.width, H).lineTo(0, H).closePath();
        g.fill(new FillGradient({
            type: 'linear', start: { x: 0, y: 0 }, end: { x: 0, y: 1 }, textureSpace: 'local',
            colorStops: [{ offset: 0, color: 0x3aa8d8 }, { offset: 1, color: 0x0c4a6a }],
        }));
        // Glints.
        for (let i = 0; i < 8; i++) {
            const x = ((i * 240 + this.elapsed * 40) % GameConfig.width);
            g.ellipse(x, riverY + 24 + (i % 3) * 22, 26, 3).fill({ color: 0xbfe8ff, alpha: 0.25 });
        }
    }

    // --- UI --------------------------------------------------------------------------

    private createUI(): void {
        const cx = 1758;

        this.multBig = new Text({ text: '', style: {
            fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 96, fontWeight: '900',
            fill: 0x7dffb0, stroke: { color: 0x0c3a1e, width: 10 },
            dropShadow: { color: 0x000000, blur: 8, distance: 3, alpha: 0.5 },
        } });
        this.multBig.anchor.set(0.5);
        this.multBig.position.set(820, 150);
        this.uiContainer.addChild(this.multBig);

        this.nextText = new Text({ text: '', style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 24, fontWeight: '900', fill: 0xffffff, stroke: { color: 0x0c3a1e, width: 4 } } });
        this.nextText.anchor.set(0.5);
        this.nextText.position.set(820, 212);
        this.uiContainer.addChild(this.nextText);

        // Timing meter (drawn each frame while swinging).
        this.timingBar = new Graphics();
        this.timingBar.visible = false;
        this.uiContainer.addChild(this.timingBar);
        this.timingHint = new Text({ text: 'JUMP when the marker hits the green!', style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 20, fontWeight: '900', fill: 0x7dffb0, stroke: { color: 0x0c3a1e, width: 4 } } });
        this.timingHint.anchor.set(0.5);
        this.timingHint.visible = false;
        this.uiContainer.addChild(this.timingHint);

        this.banner = new Text({ text: '', style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 76, fontWeight: '900', fill: 0xffd23d, stroke: { color: 0x143a18, width: 11 } } });
        this.banner.anchor.set(0.5);
        this.banner.position.set(820, 470);
        this.banner.visible = false;
        this.uiContainer.addChild(this.banner);

        this.uiContainer.addChild(new Graphics()
            .roundRect(1618, 140, 280, 880, 26).fill({ color: 0x0e2418, alpha: 0.96 })
            .roundRect(1618, 140, 280, 880, 26).stroke({ width: 3, color: 0x2f8a44 })
            .roundRect(1628, 150, 260, 860, 20).stroke({ width: 1.5, color: 0xffd23d, alpha: 0.3 }));

        const section = (txt: string, y: number): void => {
            const t = new Text({ text: txt, style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 16, fontWeight: '900', letterSpacing: 3, fill: 0x8ad8a0 } });
            t.anchor.set(0.5); t.position.set(cx, y); this.uiContainer.addChild(t);
        };

        section('BET', 200);
        this.betValueText = new Text({ text: `$${gameStore.getState().bet}`, style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 36, fontWeight: '900', fill: 0xffffff } });
        this.betValueText.anchor.set(0.5); this.betValueText.position.set(cx, 256);
        this.uiContainer.addChild(this.betValueText);
        const stepBtn = (dx: number, glyph: string, dir: number): void => {
            const b = new Graphics().circle(0, 0, 26).fill({ color: 0x123a22 }).circle(0, 0, 26).stroke({ width: 2, color: 0x2f8a44 });
            b.position.set(cx + dx, 256); b.eventMode = 'static'; b.cursor = 'pointer';
            b.on('pointerdown', () => {
                if (this.inRun) return;
                gsap.fromTo(b.scale, { x: 0.85, y: 0.85 }, { x: 1, y: 1, duration: 0.25, ease: 'back.out(3)' });
                const s = gameStore.getState();
                const i = BET_STEPS.findIndex((v) => v >= s.bet);
                s.setBet(BET_STEPS[Math.max(0, Math.min(BET_STEPS.length - 1, (i < 0 ? BET_STEPS.length - 1 : i) + dir))]);
                this.betValueText.text = `$${gameStore.getState().bet}`;
            });
            const t = new Text({ text: glyph, style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 28, fontWeight: '900', fill: 0x8ad8a0 } });
            t.anchor.set(0.5); b.addChild(t); this.uiContainer.addChild(b);
        };
        stepBtn(-80, '−', -1); stepBtn(80, '+', 1);

        // SWING.
        this.swingButton = new Graphics();
        this.swingButton.position.set(cx, 430);
        this.swingButton.eventMode = 'static'; this.swingButton.cursor = 'pointer';
        this.swingButton.on('pointerdown', () => { gsap.fromTo(this.swingButton.scale, { x: 0.94, y: 0.94 }, { x: 1, y: 1, duration: 0.3, ease: 'back.out(3)' }); this.swing(); });
        this.swingLabel = new Text({ text: '', style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 32, fontWeight: '900', fill: 0xffffff } });
        this.swingLabel.anchor.set(0.5); this.swingLabel.position.set(0, -14);
        this.swingSub = new Text({ text: '', style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 15, fontWeight: '900', fill: 0xffffff } });
        this.swingSub.alpha = 0.85; this.swingSub.anchor.set(0.5); this.swingSub.position.set(0, 24);
        this.swingButton.addChild(this.swingLabel, this.swingSub);
        this.uiContainer.addChild(this.swingButton);

        // CASH OUT.
        this.cashButton = new Graphics();
        this.cashButton.position.set(cx, 580);
        this.cashButton.eventMode = 'static'; this.cashButton.cursor = 'pointer';
        this.cashButton.on('pointerdown', () => { gsap.fromTo(this.cashButton.scale, { x: 0.94, y: 0.94 }, { x: 1, y: 1, duration: 0.3, ease: 'back.out(3)' }); this.cashOut(); });
        this.cashLabel = new Text({ text: 'CASH OUT', style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 28, fontWeight: '900', fill: 0xffffff } });
        this.cashLabel.anchor.set(0.5);
        this.cashButton.addChild(this.cashLabel);
        this.uiContainer.addChild(this.cashButton);

        section('HOW TO PLAY', 690);
        const info = new Text({ text: 'tap SWING to release.\nthe rope swings — JUMP\nwhen the marker hits the\ngreen. higher = faster!', style: { fontFamily: 'Arial, sans-serif', fontSize: 18, fontWeight: 'bold', fill: 0xaae0bc, align: 'center', lineHeight: 26 } });
        info.anchor.set(0.5); info.position.set(cx, 770);
        this.uiContainer.addChild(info);

        this.balanceText = new Text({ text: '', style: { fontFamily: 'Arial, sans-serif', fontSize: 22, fontWeight: 'bold', fill: 0x8ad8a0 } });
        this.balanceText.anchor.set(0.5); this.balanceText.position.set(cx, 980);
        this.uiContainer.addChild(this.balanceText);

        const back = new Text({ text: '‹ MENU', style: { fill: 0xffe082, fontSize: 26, fontWeight: 'bold', stroke: { color: 0x143a18, width: 4 } } });
        back.position.set(60, 116); back.eventMode = 'static'; back.cursor = 'pointer';
        back.on('pointerdown', () => SceneManager.switchScene(new MenuScene()));
        // (back-to-menu removed) this.uiContainer.addChild(back);

        const render = (s: ReturnType<typeof gameStore.getState>): void => {
            this.balanceText.text = `Balance  $${Math.round(s.balance * 100) / 100}`;
        };
        render(gameStore.getState());
        gameStore.subscribe(render);

        this.styleButtons();
    }

    private styleButtons(): void {
        const canSwing = !this.busy;
        const atTop = this.node >= MULTS.length - 1;
        this.swingButton.clear()
            .roundRect(-112, -52, 224, 104, 24).fill(canSwing ? (atTop ? 0x4a2a10 : 0x1f8a3c) : 0x123a22)
            .roundRect(-112, -52, 224, 104, 24).stroke({ width: 3, color: canSwing ? (atTop ? 0x6a4a1a : 0x7dffb0) : 0x2f8a44 });
        this.swingLabel.text = !this.inRun ? 'SWING' : (atTop ? 'TOP VINE' : 'JUMP!');
        this.swingSub.text = !this.inRun ? `bet $${gameStore.getState().bet}` : (atTop ? 'cash out now' : 'time the apex!');
        this.swingButton.cursor = canSwing ? 'pointer' : 'default';

        const canCash = this.inRun && this.node >= 1 && !this.busy;
        this.cashButton.clear()
            .roundRect(-112, -40, 224, 80, 20).fill({ color: canCash ? 0xe0a01a : 0x3a3014, alpha: canCash ? 1 : 0.5 })
            .roundRect(-112, -40, 224, 80, 20).stroke({ width: 3, color: canCash ? 0xffd23d : 0x5a4a1a, alpha: canCash ? 1 : 0.5 });
        this.cashLabel.text = canCash ? `CASH $${Math.round(gameStore.getState().bet * MULTS[this.node] * 100) / 100}` : 'CASH OUT';
        this.cashLabel.style.fontSize = canCash ? 24 : 28;
        this.cashLabel.alpha = canCash ? 1 : 0.4;
        this.cashButton.eventMode = canCash ? 'static' : 'none';
        this.cashButton.cursor = canCash ? 'pointer' : 'default';
    }

    private showBanner(msg: string, tint: number): void {
        this.banner.text = msg;
        this.banner.style.fill = tint;
        this.banner.style.dropShadow = { color: tint, blur: 22, distance: 0, alpha: 0.8, angle: Math.PI / 6 };
        this.banner.alpha = 1; this.banner.visible = true;
        gsap.killTweensOf(this.banner); gsap.killTweensOf(this.banner.scale);
        gsap.fromTo(this.banner.scale, { x: 0.3, y: 0.3 }, { x: 1, y: 1, duration: 0.45, ease: 'back.out(2.2)' });
        gsap.to(this.banner, { alpha: 0, duration: 0.5, delay: 1.5, onComplete: () => { this.banner.visible = false; } });
    }

    private acquireCoin(): Graphics {
        let c = this.coins.find((g) => !g.visible);
        if (!c) { c = new Graphics(); c.visible = false; this.fxLayer.addChild(c); this.coins.push(c); }
        gsap.killTweensOf(c); gsap.killTweensOf(c.scale);
        return c;
    }

    private coinBurst(x: number, y: number, count: number): void {
        for (let i = 0; i < count; i++) {
            const c = this.acquireCoin();
            const size = 8 + Math.random() * 8;
            c.clear()
                .ellipse(0, 0, size, size * 0.8).fill({ color: 0xffd54f })
                .ellipse(0, 0, size, size * 0.8).stroke({ width: 2, color: 0x8a6512 })
                .ellipse(-size * 0.3, -size * 0.25, size * 0.3, size * 0.18).fill({ color: 0xfff6cf, alpha: 0.9 });
            c.position.set(x, y); c.alpha = 1; c.scale.set(1); c.visible = true;
            const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
            const sp = 240 + Math.random() * 320;
            gsap.to(c, { x: x + Math.cos(a) * sp * 0.5, y: y + Math.sin(a) * sp * 0.5 + 360, alpha: 0, duration: 1.0 + Math.random() * 0.4, ease: 'power1.in', onComplete: () => { c.visible = false; } });
            gsap.to(c.scale, { x: 0.3, duration: 0.2, yoyo: true, repeat: 6, ease: 'sine.inOut' });
        }
    }
}
