import { Text, Container, Graphics, FillGradient } from 'pixi.js';
import type { FederatedPointerEvent } from 'pixi.js';
import { gsap } from 'gsap';
import { BaseScene } from './BaseScene';
import { GameConfig } from '../config/GameConfig';
import { gameStore } from '../state/GameState';
import { SceneManager } from '../managers/SceneManager';
import { MenuScene } from './MenuScene';

/**
 * GameScene18 — Slot 18: "Reef Hunter"
 * -------------------------------------
 * Arcade fish shooter — the only real-time, skill-aimed game in the lobby.
 * The turret tracks the pointer; every click fires a harpoon that costs one
 * stake. Fish drift across the reef; drain a fish's health and it pays its
 * species value × stake in a coin shower. The boss whale is a rare, high-HP
 * jackpot worth 200×.
 *
 * Built from scratch for this game (nothing shared with the other slots):
 *  - per-frame physics: fish shoals, harpoon ballistics, circle collisions
 *  - pointer-tracked turret with recoil, muzzle flash and tracer harpoons
 *  - vector fish with tail-wiggle swim cycles; boss whale with a health bar
 *  - hit sparks, kill coin-bursts, floating payouts, drifting bubbles/caustics
 */

interface Species {
    id: string;
    name: string;
    color: number;
    belly: number;
    size: number;       // body radius (px)
    hp: number;
    pay: number;        // × stake on kill
    weight: number;     // spawn weight
    speed: [number, number];
    boss?: boolean;
}

const SPECIES: readonly Species[] = [
    { id: 'minnow', name: 'Minnow',   color: 0x6fe9ff, belly: 0xd6fbff, size: 26, hp: 1,  pay: 2,   weight: 40, speed: [150, 220] },
    { id: 'clown',  name: 'Clownfish', color: 0xff8a3d, belly: 0xfff0d6, size: 32, hp: 2,  pay: 4,   weight: 30, speed: [120, 180] },
    { id: 'puffer', name: 'Puffer',   color: 0xffd23d, belly: 0xfff4c4, size: 40, hp: 4,  pay: 9,   weight: 16, speed: [90, 140] },
    { id: 'angler', name: 'Angler',   color: 0x9a4fd4, belly: 0xe6cdfb, size: 50, hp: 8,  pay: 22,  weight: 9,  speed: [70, 120] },
    { id: 'shark',  name: 'Shark',    color: 0x8a98a8, belly: 0xe2e8f0, size: 74, hp: 16, pay: 60,  weight: 4,  speed: [90, 130] },
    { id: 'whale',  name: 'Boss Whale', color: 0x3a6ea5, belly: 0xbcd8f0, size: 130, hp: 44, pay: 200, weight: 1, speed: [45, 70], boss: true },
];

const BET_STEPS = [1, 2, 5, 10, 20, 50, 100];
const MAX_FISH = 14;

/**
 * Difficulty zones. Deeper water = bigger, faster fish and fatter bounties, but
 * the clip costs more. cost/pay both scale off the per-shot stake, so the house
 * margin holds across levels — picking ABYSS is higher-variance, not free money.
 */
interface Level {
    name: string;
    tag: string;
    cost: number;     // buy-in multiplier (× bet × clip)
    pay: number;      // payout multiplier (× species bounty × bet)
    speed: number;    // fish speed multiplier (harder to hit)
    bigBias: number;  // shifts the shoal toward bigger species
    tint: number;
}
const LEVELS: readonly Level[] = [
    { name: 'REEF',  tag: 'LV 1', cost: 1.0, pay: 1.0, speed: 1.0,  bigBias: 0.0, tint: 0x6fe9ff },
    { name: 'KELP',  tag: 'LV 2', cost: 1.6, pay: 1.7, speed: 1.18, bigBias: 0.6, tint: 0x4ade6a },
    { name: 'DEEP',  tag: 'LV 3', cost: 2.6, pay: 3.2, speed: 1.34, bigBias: 1.2, tint: 0xffd23d },
    { name: 'ABYSS', tag: 'LV 4', cost: 4.2, pay: 6.0, speed: 1.55, bigBias: 2.0, tint: 0xff5a78 },
];

interface Fish {
    sp: Species;
    node: Container;
    tail: Graphics;
    hpBar: Graphics | null;
    x: number;
    y: number;
    vx: number;
    vy: number;
    radius: number;
    hp: number;
    dir: number;        // +1 swimming right, -1 left
    phase: number;
    alive: boolean;
}

interface Harpoon {
    g: Graphics;
    x: number;
    y: number;
    vx: number;
    vy: number;
    alive: boolean;
}

export class GameScene18 extends BaseScene {
    private readonly bgLayer = new Container();
    private readonly fishLayer = new Container();
    private readonly bulletLayer = new Container();
    private readonly fxLayer = new Container();
    private readonly uiContainer = new Container();

    private hitRect!: Graphics;
    private turret!: Container;
    private barrel!: Graphics;
    private crosshair!: Container;

    private fish: Fish[] = [];
    private readonly harpoons: Harpoon[] = [];
    private readonly bulletPool: Harpoon[] = [];
    private readonly sparks: Graphics[] = [];
    private readonly coins: Graphics[] = [];
    private readonly floats: Text[] = [];
    private bubbles!: Graphics;
    private readonly bubbleField: { x: number; y: number; r: number; vy: number; phase: number }[] = [];

    private aimX = GameConfig.width / 2;
    private aimY = 300;
    private spawnTimer = 0;
    private elapsed = 0;
    private readonly turretX = GameConfig.width / 2 - 140;
    private readonly turretY = GameConfig.height - 70;

    private betValueText!: Text;
    private balanceText!: Text;
    private roundWinText!: Text;
    private ammoText!: Text;
    private buyInText!: Text;
    private startButton!: Graphics;
    private startLabel!: Text;
    private startSub!: Text;
    private banner!: Text;
    private levelNameText!: Text;
    private levelArrows: Graphics[] = [];

    private levelIdx = 0;
    private get level(): Level { return LEVELS[this.levelIdx]; }

    // Each wager buys one hunt: a fixed clip of harpoons. Bounded chances.
    private readonly clip = 10;
    private ammo = 0;
    private roundActive = false;
    private roundWin = 0;
    private buyIn = 0;
    private settleCall: gsap.core.Tween | null = null;

    private readonly onKeyDown = (e: KeyboardEvent): void => {
        if (e.code === 'Space') { e.preventDefault(); this.startHunt(); }
        // (back-to-menu removed) if (e.code === 'Escape') SceneManager.switchScene(new MenuScene());
    };

    public async init(): Promise<void> {
        this.addChild(this.bgLayer);
        this.addChild(this.fishLayer);
        this.addChild(this.bulletLayer);
        this.addChild(this.fxLayer);
        this.addChild(this.uiContainer);

        this.buildReef();
        this.buildTurret();
        this.createUI();

        // Full-field input catcher (behind the UI panel, so panel clicks still work).
        this.hitRect = new Graphics().rect(0, 0, GameConfig.width, GameConfig.height).fill({ color: 0x000000, alpha: 0.001 });
        this.hitRect.eventMode = 'static';
        this.hitRect.cursor = 'none';
        this.hitRect.on('pointermove', (e: FederatedPointerEvent) => { const p = e.global; this.aimX = p.x; this.aimY = p.y; });
        this.hitRect.on('pointerdown', (e: FederatedPointerEvent) => { const p = e.global; this.aimX = p.x; this.aimY = p.y; this.fire(); });
        this.bgLayer.addChild(this.hitRect);

        // Seed a starting shoal.
        for (let i = 0; i < 6; i++) this.spawnFish(true);
        window.addEventListener('keydown', this.onKeyDown);
    }

    public async start(): Promise<void> {}

    public update(delta: number): void {
        const dt = Math.min(delta / 60, 0.05);
        this.elapsed += dt;

        this.updateBubbles(dt);
        this.aimTurret();

        // Spawn cadence (a touch faster over time, capped).
        this.spawnTimer -= dt;
        if (this.spawnTimer <= 0 && this.fish.length < MAX_FISH) {
            this.spawnFish(false);
            this.spawnTimer = 0.7 + Math.random() * 0.8;
        }

        this.moveFish(dt);
        this.moveHarpoons(dt);
        this.collide();
    }

    public resize(_width: number, _height: number): void {}

    public override async destroyScene(): Promise<void> {
        window.removeEventListener('keydown', this.onKeyDown);
        this.settleCall?.kill();
        gsap.killTweensOf(this.banner);
        gsap.killTweensOf(this.banner.scale);
        for (const f of this.fish) { gsap.killTweensOf(f.node); gsap.killTweensOf(f.node.scale); }
        for (const g of [...this.sparks, ...this.coins, ...this.floats, ...this.harpoons.map((h) => h.g), this.barrel, this.crosshair]) gsap.killTweensOf(g);
        await super.destroyScene();
    }

    // --- fish ------------------------------------------------------------------------

    private pickSpecies(): Species {
        // Deeper levels bias the shoal toward bigger species (later in the list).
        const bias = this.level.bigBias;
        const n = SPECIES.length - 1;
        const weights = SPECIES.map((s, i) => s.weight * (1 + bias * (i / n)));
        const total = weights.reduce((a, w) => a + w, 0);
        let r = Math.random() * total;
        for (let i = 0; i < SPECIES.length; i++) { r -= weights[i]; if (r < 0) return SPECIES[i]; }
        return SPECIES[0];
    }

    private spawnFish(seed: boolean): void {
        const sp = this.pickSpecies();
        const dir = Math.random() < 0.5 ? 1 : -1;
        const speed = (sp.speed[0] + Math.random() * (sp.speed[1] - sp.speed[0])) * this.level.speed;
        const node = new Container();
        const tail = new Graphics();
        node.addChild(tail);
        this.drawFish(node, tail, sp);

        const y = 150 + Math.random() * (GameConfig.height - 360);
        const x = seed
            ? 200 + Math.random() * (GameConfig.width - 700)
            : dir === 1 ? -sp.size - 40 : GameConfig.width + sp.size + 40;
        node.position.set(x, y);
        node.scale.x = dir; // face travel direction (art drawn facing right)
        this.fishLayer.addChild(node);

        let hpBar: Graphics | null = null;
        if (sp.boss) {
            hpBar = new Graphics();
            node.addChild(hpBar);
        }

        const fish: Fish = {
            sp, node, tail, hpBar, x, y,
            vx: dir * speed, vy: (Math.random() - 0.5) * 26,
            radius: sp.size * 1.05, hp: sp.hp, dir,
            phase: Math.random() * Math.PI * 2, alive: true,
        };
        if (hpBar) this.drawHpBar(fish);
        gsap.fromTo(node.scale, { y: 0.4 }, { y: 1, duration: 0.4, ease: 'back.out(2)' });
        this.fish.push(fish);
    }

    private moveFish(dt: number): void {
        const margin = 160;
        for (const f of this.fish) {
            if (!f.alive) continue;
            f.x += f.vx * dt;
            f.y += f.vy * dt + Math.sin(this.elapsed * 1.6 + f.phase) * 10 * dt;
            // Keep in a vertical band.
            if (f.y < 130) f.vy = Math.abs(f.vy) + 4;
            if (f.y > GameConfig.height - 150) f.vy = -Math.abs(f.vy) - 4;
            f.node.position.set(f.x, f.y);
            // Tail wiggle.
            f.tail.rotation = Math.sin(this.elapsed * 12 + f.phase) * 0.4;
            // Off the far edge → escaped.
            if ((f.dir === 1 && f.x > GameConfig.width + margin) || (f.dir === -1 && f.x < -margin)) {
                f.alive = false;
            }
        }
        this.fish = this.fish.filter((f) => {
            if (f.alive) return true;
            if (!f.node.destroyed) f.node.destroy({ children: true });
            return false;
        });
    }

    // --- harpoons ----------------------------------------------------------------------

    private fire(): void {
        if (!this.roundActive || this.ammo <= 0) return;
        this.ammo -= 1;
        this.updateAmmo();

        const dx = this.aimX - this.turretX;
        const dy = this.aimY - this.turretY;
        const len = Math.hypot(dx, dy) || 1;
        const speed = 1500;
        const ux = dx / len;
        const uy = dy / len;

        const h = this.acquireHarpoon();
        const tipX = this.turretX + ux * 70;
        const tipY = this.turretY + uy * 70;
        h.x = tipX; h.y = tipY;
        h.vx = ux * speed; h.vy = uy * speed;
        h.alive = true;
        h.g.position.set(tipX, tipY);
        h.g.rotation = Math.atan2(uy, ux);
        h.g.visible = true;

        // Recoil + muzzle flash.
        gsap.killTweensOf(this.barrel);
        gsap.fromTo(this.barrel, { y: 8 }, { y: 0, duration: 0.18, ease: 'power2.out' });
        this.muzzleFlash(tipX, tipY);

        // Last harpoon away → settle once it has had time to land.
        if (this.ammo <= 0) {
            this.settleCall?.kill();
            this.settleCall = gsap.delayedCall(0.7, () => this.settleHunt());
        }
    }

    // --- hunt rounds -------------------------------------------------------------------

    private startHunt(): void {
        if (this.roundActive) return;
        const state = gameStore.getState();
        this.buyIn = Math.round(state.bet * this.clip * this.level.cost * 100) / 100;
        if (state.balance < this.buyIn) return;
        state.setBalance(Math.round((state.balance - this.buyIn) * 100) / 100);
        state.setWinAmount(0);
        this.roundActive = true;
        this.roundWin = 0;
        this.ammo = this.clip;
        this.banner.visible = false;
        this.updateAmmo();
        this.roundWinText.text = '$0';
        this.styleStart();
    }

    private settleHunt(): void {
        if (!this.roundActive) return;
        this.roundActive = false;
        const profit = Math.round((this.roundWin - this.buyIn) * 100) / 100;
        const up = this.roundWin >= this.buyIn;
        this.showBanner(`HUNT OVER · CAUGHT $${this.roundWin}` + (up ? `  (+$${profit})` : ''), up ? 0x4ade6a : 0xff8a8a);
        this.styleStart();
    }

    private updateAmmo(): void {
        this.ammoText.text = `${'●'.repeat(this.ammo)}${'○'.repeat(Math.max(0, this.clip - this.ammo))}`;
    }

    private acquireHarpoon(): Harpoon {
        let h = this.bulletPool.find((b) => !b.alive);
        if (!h) {
            const g = new Graphics()
                .moveTo(-16, 0).lineTo(10, 0).stroke({ width: 5, color: 0x9adcff })
                .poly([10, 0, 0, -6, 0, 6]).fill({ color: 0xeaffff })
                .moveTo(-16, 0).lineTo(-22, 0).stroke({ width: 8, color: 0xffd23d, alpha: 0.9 });
            g.visible = false;
            this.bulletLayer.addChild(g);
            h = { g, x: 0, y: 0, vx: 0, vy: 0, alive: false };
            this.harpoons.push(h);
            this.bulletPool.push(h);
        }
        return h;
    }

    private moveHarpoons(dt: number): void {
        const W = GameConfig.width;
        const H = GameConfig.height;
        for (const h of this.harpoons) {
            if (!h.alive) continue;
            h.x += h.vx * dt;
            h.y += h.vy * dt;
            h.g.position.set(h.x, h.y);
            if (h.x < -40 || h.x > W + 40 || h.y < -40 || h.y > H + 40) {
                h.alive = false;
                h.g.visible = false;
            }
        }
    }

    // --- collisions / kills ------------------------------------------------------------

    private collide(): void {
        for (const h of this.harpoons) {
            if (!h.alive) continue;
            for (const f of this.fish) {
                if (!f.alive) continue;
                const dx = h.x - f.x;
                const dy = h.y - f.y;
                if (dx * dx + dy * dy <= f.radius * f.radius) {
                    h.alive = false;
                    h.g.visible = false;
                    this.hitSpark(h.x, h.y, f.sp.color);
                    f.hp -= 1;
                    if (f.hp <= 0) this.killFish(f);
                    else this.flinch(f);
                    break;
                }
            }
        }
    }

    private flinch(f: Fish): void {
        gsap.killTweensOf(f.node.scale);
        gsap.fromTo(f.node.scale, { x: f.dir * 1.12, y: 1.12 }, { x: f.dir, y: 1, duration: 0.18, ease: 'power2.out' });
        if (f.hpBar) this.drawHpBar(f);
    }

    private killFish(f: Fish): void {
        f.alive = false;
        const state = gameStore.getState();
        const payout = Math.round(f.sp.pay * state.bet * this.level.pay * 100) / 100;
        state.setBalance(Math.round((state.balance + payout) * 100) / 100);
        state.setWinAmount(payout);
        this.roundWin = Math.round((this.roundWin + payout) * 100) / 100;
        this.roundWinText.text = `$${this.roundWin}`;
        gsap.fromTo(this.roundWinText.scale, { x: 1.3, y: 1.3 }, { x: 1, y: 1, duration: 0.3, ease: 'back.out(2)' });

        this.floatText(`+$${payout}`, f.x, f.y, f.sp.boss ? 0xffd23d : 0x9adcff);
        this.coinBurst(f.x, f.y, Math.min(40, 6 + f.sp.pay));
        if (f.sp.boss) this.bossFlash();

        // Belly-up spin out.
        gsap.killTweensOf(f.node);
        gsap.to(f.node, { rotation: f.dir * 1.4, alpha: 0, duration: 0.5, ease: 'power1.in' });
        gsap.to(f.node.scale, { x: f.dir * 0.4, y: 0.4, duration: 0.5, ease: 'power1.in', onComplete: () => { if (!f.node.destroyed) f.node.destroy({ children: true }); } });
        this.fish = this.fish.filter((x) => x !== f);
    }

    // --- turret ------------------------------------------------------------------------

    private aimTurret(): void {
        const ang = Math.atan2(this.aimY - this.turretY, this.aimX - this.turretX);
        // Clamp so the barrel never points downward into the seabed.
        const clamped = Math.max(-Math.PI + 0.25, Math.min(-0.25, ang));
        this.barrel.rotation = clamped + Math.PI / 2;
        this.crosshair.position.set(this.aimX, this.aimY);
    }

    private buildTurret(): void {
        this.turret = new Container();
        this.turret.position.set(this.turretX, this.turretY);

        // Coral mount.
        this.turret.addChild(new Graphics()
            .ellipse(0, 40, 96, 34).fill({ color: 0x0a2a3a, alpha: 0.6 })
            .roundRect(-58, -10, 116, 70, 26).fill(new FillGradient({
                type: 'linear', start: { x: 0, y: 0 }, end: { x: 0, y: 1 }, textureSpace: 'local',
                colorStops: [{ offset: 0, color: 0xff6aa8 }, { offset: 1, color: 0xb83a78 }],
            }))
            .roundRect(-58, -10, 116, 70, 26).stroke({ width: 4, color: 0xffd23d }));

        // Barrel (pivot at base so it rotates in place).
        this.barrel = new Graphics()
            .roundRect(-15, -86, 30, 96, 12).fill(new FillGradient({
                type: 'linear', start: { x: 0, y: 0 }, end: { x: 1, y: 0 }, textureSpace: 'local',
                colorStops: [{ offset: 0, color: 0xeaf4ff }, { offset: 0.5, color: 0x9fb4cc }, { offset: 1, color: 0x5a6e84 }],
            }))
            .roundRect(-15, -86, 30, 96, 12).stroke({ width: 3, color: 0x2a3a4a })
            .circle(0, -86, 9).fill({ color: 0xffd23d });
        this.turret.addChild(this.barrel);
        this.turret.addChild(new Graphics()
            .circle(0, 0, 26).fill({ color: 0xffd23d })
            .circle(0, 0, 26).stroke({ width: 4, color: 0x8a5e10 })
            .circle(0, 0, 11).fill({ color: 0x6a4a10 }));
        this.fxLayer.addChild(this.turret);

        // Crosshair that rides the pointer.
        this.crosshair = new Container();
        const ch = new Graphics()
            .circle(0, 0, 22).stroke({ width: 3, color: 0xffd23d, alpha: 0.9 })
            .circle(0, 0, 4).fill({ color: 0xffd23d });
        for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
            ch.moveTo(Math.cos(a) * 12, Math.sin(a) * 12).lineTo(Math.cos(a) * 28, Math.sin(a) * 28).stroke({ width: 3, color: 0xffd23d, alpha: 0.9 });
        }
        this.crosshair.addChild(ch);
        gsap.to(this.crosshair, { rotation: Math.PI * 2, duration: 6, repeat: -1, ease: 'none' });
        this.fxLayer.addChild(this.crosshair);
    }

    // --- art ---------------------------------------------------------------------------

    /** Vector fish (or whale) drawn facing right; `tail` is a separate wiggle piece. */
    private drawFish(node: Container, tail: Graphics, sp: Species): void {
        const s = sp.size;
        const body = new Graphics();

        if (sp.boss) {
            // Whale: big rounded body, fluke, spout, eye.
            tail.clear()
                .poly([0, 0, -s * 0.5, -s * 0.5, -s * 0.32, 0, -s * 0.5, s * 0.5]).fill({ color: sp.color });
            tail.position.set(-s * 0.78, 0);
            body.roundRect(-s * 0.8, -s * 0.52, s * 1.7, s * 1.04, s * 0.5).fill(new FillGradient({
                type: 'linear', start: { x: 0, y: 0 }, end: { x: 0, y: 1 }, textureSpace: 'local',
                colorStops: [{ offset: 0, color: sp.color }, { offset: 0.6, color: sp.color }, { offset: 0.62, color: sp.belly }, { offset: 1, color: sp.belly }],
            }));
            body.ellipse(s * 0.5, s * 0.18, s * 0.5, s * 0.22).fill({ color: sp.belly, alpha: 0.5 });
            body.moveTo(s * 0.2, -s * 0.5).lineTo(s * 0.34, -s * 0.78).lineTo(s * 0.46, -s * 0.5).fill({ color: sp.color }); // dorsal
            body.circle(s * 0.66, -s * 0.12, s * 0.08).fill({ color: 0x10243a });
            body.circle(s * 0.69, -s * 0.15, s * 0.03).fill({ color: 0xffffff });
            for (let i = 0; i < 5; i++) body.circle(-s * 0.2 + i * s * 0.18, s * 0.3, s * 0.04).fill({ color: 0x10243a, alpha: 0.3 });
            node.addChild(body);
            return;
        }

        // Generic fish.
        tail.clear().poly([0, 0, -s * 0.7, -s * 0.55, -s * 0.45, 0, -s * 0.7, s * 0.55]).fill({ color: sp.color });
        tail.position.set(-s * 0.6, 0);

        body.ellipse(0, 0, s, s * 0.72).fill(new FillGradient({
            type: 'linear', start: { x: 0, y: 0 }, end: { x: 0, y: 1 }, textureSpace: 'local',
            colorStops: [{ offset: 0, color: sp.color }, { offset: 0.58, color: sp.color }, { offset: 0.6, color: sp.belly }, { offset: 1, color: sp.belly }],
        }));
        // Top fin.
        body.moveTo(-s * 0.2, -s * 0.6).quadraticCurveTo(0, -s * 1.05, s * 0.25, -s * 0.55).fill({ color: sp.color });
        // Stripes for clownfish / texture for others.
        if (sp.id === 'clown') {
            for (const sx of [-0.2, 0.2]) body.ellipse(s * sx, 0, s * 0.08, s * 0.6).fill({ color: 0xffffff, alpha: 0.85 });
        } else if (sp.id === 'puffer') {
            for (let i = 0; i < 10; i++) { const a = (Math.PI * 2 * i) / 10; body.circle(Math.cos(a) * s * 0.7, Math.sin(a) * s * 0.5, s * 0.05).fill({ color: 0xffffff, alpha: 0.5 }); }
        } else if (sp.id === 'shark') {
            body.moveTo(s * 0.1, -s * 0.55).lineTo(s * 0.2, -s * 1.0).lineTo(s * 0.4, -s * 0.5).fill({ color: sp.color }); // tall dorsal
            body.poly([s * 0.7, s * 0.0, s, s * 0.05, s * 0.7, s * 0.18]).fill({ color: 0x33424f }); // teeth/jaw
        }
        // Eye.
        body.circle(s * 0.55, -s * 0.16, s * 0.13).fill({ color: 0xffffff });
        body.circle(s * 0.58, -s * 0.16, s * 0.07).fill({ color: 0x10243a });
        // Side fin.
        body.moveTo(s * 0.1, s * 0.2).quadraticCurveTo(-s * 0.1, s * 0.7, s * 0.35, s * 0.45).fill({ color: sp.color, alpha: 0.9 });
        node.addChild(body);
    }

    private drawHpBar(f: Fish): void {
        if (!f.hpBar) return;
        const w = 150;
        const frac = Math.max(0, f.hp / f.sp.hp);
        f.hpBar.clear()
            .roundRect(-w / 2, -f.sp.size - 36, w, 16, 8).fill({ color: 0x10243a, alpha: 0.8 })
            .roundRect(-w / 2, -f.sp.size - 36, w * frac, 16, 8).fill({ color: frac > 0.4 ? 0x4ade6a : 0xff4d6d })
            .roundRect(-w / 2, -f.sp.size - 36, w, 16, 8).stroke({ width: 2, color: 0xffd23d });
        // Counter-flip so the bar text stays upright regardless of facing.
        f.hpBar.scale.x = f.dir;
    }

    // --- fx ----------------------------------------------------------------------------

    private muzzleFlash(x: number, y: number): void {
        const g = this.acquireSpark();
        g.clear();
        for (let i = 0; i < 6; i++) {
            const a = (Math.PI * 2 * i) / 6;
            g.moveTo(0, 0).lineTo(Math.cos(a) * 20, Math.sin(a) * 20).stroke({ width: 4, color: 0xffe9a8 });
        }
        g.circle(0, 0, 12).fill({ color: 0xffffff });
        g.position.set(x, y);
        g.alpha = 1;
        g.scale.set(1);
        g.visible = true;
        gsap.to(g, { alpha: 0, duration: 0.18, onComplete: () => { g.visible = false; } });
        gsap.to(g.scale, { x: 1.8, y: 1.8, duration: 0.18 });
    }

    private hitSpark(x: number, y: number, color: number): void {
        for (let i = 0; i < 7; i++) {
            const g = this.acquireSpark();
            const size = 3 + Math.random() * 5;
            g.clear().circle(0, 0, size).fill({ color: Math.random() < 0.4 ? 0xffffff : color });
            g.position.set(x, y);
            g.alpha = 1;
            g.scale.set(1);
            g.visible = true;
            const a = Math.random() * Math.PI * 2;
            const sp = 90 + Math.random() * 170;
            gsap.to(g, { x: x + Math.cos(a) * sp * 0.5, y: y + Math.sin(a) * sp * 0.5, alpha: 0, duration: 0.4, ease: 'power2.out', onComplete: () => { g.visible = false; } });
        }
    }

    private acquireSpark(): Graphics {
        let g = this.sparks.find((s) => !s.visible);
        if (!g) {
            g = new Graphics();
            g.visible = false;
            this.fxLayer.addChild(g);
            this.sparks.push(g);
        }
        gsap.killTweensOf(g);
        gsap.killTweensOf(g.scale);
        return g;
    }

    private coinBurst(x: number, y: number, count: number): void {
        for (let i = 0; i < count; i++) {
            let c = this.coins.find((g) => !g.visible);
            if (!c) {
                c = new Graphics();
                c.visible = false;
                this.fxLayer.addChild(c);
                this.coins.push(c);
            }
            const size = 7 + Math.random() * 8;
            c.clear()
                .ellipse(0, 0, size, size * 0.8).fill({ color: 0xffd54f })
                .ellipse(0, 0, size, size * 0.8).stroke({ width: 2, color: 0x8a6512 })
                .ellipse(-size * 0.3, -size * 0.25, size * 0.3, size * 0.18).fill({ color: 0xfff6cf, alpha: 0.9 });
            c.position.set(x, y);
            c.alpha = 1;
            c.scale.set(1);
            c.visible = true;
            const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
            const speed = 220 + Math.random() * 320;
            gsap.killTweensOf(c);
            gsap.killTweensOf(c.scale);
            gsap.to(c, { x: x + Math.cos(a) * speed * 0.5, y: y + Math.sin(a) * speed * 0.5 + 360, alpha: 0, duration: 1.0 + Math.random() * 0.4, ease: 'power1.in', onComplete: () => { c.visible = false; } });
            gsap.to(c.scale, { x: 0.3, duration: 0.2, yoyo: true, repeat: 6, ease: 'sine.inOut' });
        }
    }

    private floatText(msg: string, x: number, y: number, tint: number): void {
        let t = this.floats.find((f) => !f.visible);
        if (!t) {
            t = new Text({ text: '', style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 40, fontWeight: '900', fill: 0xffffff, stroke: { color: 0x04243a, width: 7 } } });
            t.anchor.set(0.5);
            t.visible = false;
            this.fxLayer.addChild(t);
            this.floats.push(t);
        }
        t.text = msg;
        t.style.fill = tint;
        t.position.set(x, y);
        t.alpha = 1;
        t.visible = true;
        gsap.killTweensOf(t);
        gsap.killTweensOf(t.scale);
        gsap.fromTo(t.scale, { x: 0.4, y: 0.4 }, { x: 1, y: 1, duration: 0.3, ease: 'back.out(2.5)' });
        gsap.to(t, { y: y - 80, duration: 0.9, ease: 'power1.out' });
        gsap.to(t, { alpha: 0, duration: 0.3, delay: 0.6, onComplete: () => { t.visible = false; } });
    }

    private bossFlash(): void {
        const flash = new Graphics().rect(0, 0, GameConfig.width, GameConfig.height).fill(0xffe9a8);
        flash.alpha = 0;
        this.fxLayer.addChild(flash);
        gsap.timeline({ onComplete: () => flash.destroy() })
            .to(flash, { alpha: 0.5, duration: 0.1 })
            .to(flash, { alpha: 0, duration: 0.5 });
    }

    // --- reef + bubbles ----------------------------------------------------------------

    private buildReef(): void {
        const W = GameConfig.width;
        const H = GameConfig.height;
        this.bgLayer.addChild(new Graphics().rect(0, 0, W, H).fill(new FillGradient({
            type: 'linear', start: { x: 0, y: 0 }, end: { x: 0, y: 1 }, textureSpace: 'local',
            colorStops: [{ offset: 0, color: 0x0a4a78 }, { offset: 0.5, color: 0x073a5e }, { offset: 1, color: 0x041e34 }],
        })));

        // God-ray light shafts.
        const rays = new Graphics();
        rays.blendMode = 'add';
        for (let i = 0; i < 5; i++) {
            const x = 120 + i * 360 + Math.random() * 80;
            rays.poly([x, 0, x + 90, 0, x + 200, H, x - 30, H]).fill({ color: 0x6fe9ff, alpha: 0.05 });
        }
        this.bgLayer.addChild(rays);

        // Seabed with coral + weeds.
        const bed = new Graphics()
            .ellipse(W * 0.5, H + 80, W * 0.75, 200).fill({ color: 0x0a2a3a });
        for (let i = 0; i < 9; i++) {
            const x = 80 + i * 220 + Math.random() * 80;
            const c = [0xff6aa8, 0xffb04a, 0x9a4fd4, 0x4ade6a][i % 4];
            for (let b = 0; b < 4; b++) {
                bed.roundRect(x - 8 + b * 6, H - 60 - b * 18, 14, 60, 7).fill({ color: c, alpha: 0.6 });
            }
        }
        this.bgLayer.addChild(bed);

        this.bubbles = new Graphics();
        this.bgLayer.addChild(this.bubbles);
        for (let i = 0; i < 50; i++) {
            this.bubbleField.push({ x: Math.random() * W, y: Math.random() * H, r: 2 + Math.random() * 6, vy: 18 + Math.random() * 36, phase: Math.random() * Math.PI * 2 });
        }
    }

    private updateBubbles(dt: number): void {
        this.bubbles.clear();
        for (const b of this.bubbleField) {
            b.y -= b.vy * dt;
            const x = b.x + Math.sin(this.elapsed * 1.2 + b.phase) * 12;
            if (b.y < -10) { b.y = GameConfig.height + 10; b.x = Math.random() * GameConfig.width; }
            this.bubbles.circle(x, b.y, b.r).stroke({ width: 1.5, color: 0xbfe8ff, alpha: 0.3 });
            this.bubbles.circle(x - b.r * 0.3, b.y - b.r * 0.3, b.r * 0.3).fill({ color: 0xffffff, alpha: 0.4 });
        }
    }

    // --- UI ----------------------------------------------------------------------------

    private createUI(): void {
        const cx = 1758;

        this.uiContainer.addChild(new Graphics()
            .roundRect(1618, 140, 280, 880, 26).fill({ color: 0x052033, alpha: 0.95 })
            .roundRect(1618, 140, 280, 880, 26).stroke({ width: 3, color: 0x0e6a8a })
            .roundRect(1628, 150, 260, 860, 20).stroke({ width: 1.5, color: 0x6fe9ff, alpha: 0.3 }));

        const title = new Text({ text: 'REEF HUNTER', style: {
            fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 44, fontWeight: '900', letterSpacing: 4,
            fill: 0x6fe9ff, stroke: { color: 0x04243a, width: 8 },
            dropShadow: { color: 0x6fe9ff, blur: 18, distance: 0, alpha: 0.7 },
        } });
        title.anchor.set(0, 0.5);
        title.position.set(44, 52);
        this.uiContainer.addChild(title);

        const section = (txt: string, y: number): void => {
            const t = new Text({ text: txt, style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 16, fontWeight: '900', letterSpacing: 3, fill: 0x5ab8d4 } });
            t.anchor.set(0.5);
            t.position.set(cx, y);
            this.uiContainer.addChild(t);
        };

        section('STAKE / SHOT', 184);
        this.betValueText = new Text({ text: `$${gameStore.getState().bet}`, style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 34, fontWeight: '900', fill: 0xffffff } });
        this.betValueText.anchor.set(0.5);
        this.betValueText.position.set(cx, 224);
        this.uiContainer.addChild(this.betValueText);
        const stepBtn = (dx: number, glyph: string, dir: number): void => {
            const b = new Graphics()
                .circle(0, 0, 24).fill({ color: 0x0a3a52 })
                .circle(0, 0, 24).stroke({ width: 2, color: 0x0e6a8a });
            b.position.set(cx + dx, 224);
            b.eventMode = 'static';
            b.cursor = 'pointer';
            b.on('pointerdown', () => {
                gsap.fromTo(b.scale, { x: 0.85, y: 0.85 }, { x: 1, y: 1, duration: 0.25, ease: 'back.out(3)' });
                const state = gameStore.getState();
                const i = BET_STEPS.findIndex((v) => v >= state.bet);
                const next = BET_STEPS[Math.max(0, Math.min(BET_STEPS.length - 1, (i < 0 ? BET_STEPS.length - 1 : i) + dir))];
                state.setBet(next);
                this.betValueText.text = `$${next}`;
            });
            const t = new Text({ text: glyph, style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 28, fontWeight: '900', fill: 0x6fe9ff } });
            t.anchor.set(0.5);
            b.addChild(t);
            this.uiContainer.addChild(b);
        };
        stepBtn(-80, '−', -1);
        stepBtn(80, '+', 1);

        // LEVEL / depth zone selector (◀ NAME ▶).
        section('DEPTH ZONE', 282);
        this.levelNameText = new Text({ text: '', style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 28, fontWeight: '900', letterSpacing: 2, fill: 0x6fe9ff } });
        this.levelNameText.anchor.set(0.5);
        this.levelNameText.position.set(cx, 320);
        this.uiContainer.addChild(this.levelNameText);
        const levelArrow = (dx: number, glyph: string, dir: number): void => {
            const b = new Graphics()
                .circle(0, 0, 22).fill({ color: 0x0a3a52 })
                .circle(0, 0, 22).stroke({ width: 2, color: 0x0e6a8a });
            b.position.set(cx + dx, 320);
            b.eventMode = 'static';
            b.cursor = 'pointer';
            b.on('pointerdown', () => {
                gsap.fromTo(b.scale, { x: 0.85, y: 0.85 }, { x: 1, y: 1, duration: 0.25, ease: 'back.out(3)' });
                this.setLevel(dir);
            });
            const t = new Text({ text: glyph, style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 26, fontWeight: '900', fill: 0x6fe9ff } });
            t.anchor.set(0.5);
            b.addChild(t);
            this.uiContainer.addChild(b);
            this.levelArrows.push(b);
        };
        levelArrow(-108, '‹', -1);
        levelArrow(108, '›', 1);

        // Level summary (pay multiplier + buy-in for the current stake/zone).
        this.buyInText = new Text({ text: '', style: { fontFamily: 'Arial, sans-serif', fontSize: 16, fontWeight: 'bold', fill: 0x5ab8d4 } });
        this.buyInText.anchor.set(0.5);
        this.buyInText.position.set(cx, 356);
        this.uiContainer.addChild(this.buyInText);

        // START HUNT — a wager buys one clip of harpoons (bounded chances).
        this.startButton = new Graphics();
        this.startButton.position.set(cx, 426);
        this.startButton.eventMode = 'static';
        this.startButton.cursor = 'pointer';
        this.startButton.on('pointerdown', () => {
            gsap.fromTo(this.startButton.scale, { x: 0.94, y: 0.94 }, { x: 1, y: 1, duration: 0.3, ease: 'back.out(3)' });
            this.startHunt();
        });
        this.startLabel = new Text({ text: '', style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 30, fontWeight: '900', fill: 0xffffff } });
        this.startLabel.anchor.set(0.5);
        this.startLabel.position.set(0, -14);
        this.startSub = new Text({ text: '', style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 15, fontWeight: '900', fill: 0xffffff } });
        this.startSub.alpha = 0.85;
        this.startSub.anchor.set(0.5);
        this.startSub.position.set(0, 24);
        this.startButton.addChild(this.startLabel, this.startSub);
        this.uiContainer.addChild(this.startButton);

        section('HARPOONS LEFT', 506);
        this.ammoText = new Text({ text: '', style: { fontFamily: 'Arial, sans-serif', fontSize: 24, fontWeight: '900', fill: 0xffd23d } });
        this.ammoText.anchor.set(0.5);
        this.ammoText.position.set(cx, 540);
        this.uiContainer.addChild(this.ammoText);

        section('THIS HUNT', 582);
        this.roundWinText = new Text({ text: '$0', style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 38, fontWeight: '900', fill: 0x4ade6a } });
        this.roundWinText.anchor.set(0.5);
        this.roundWinText.position.set(cx, 620);
        this.uiContainer.addChild(this.roundWinText);

        // Bounty list (compact).
        section('BOUNTY  (× stake × zone)', 668);
        SPECIES.forEach((sp, i) => {
            const y = 700 + i * 32;
            const icon = new Container();
            icon.position.set(cx - 100, y);
            icon.scale.set(sp.boss ? 0.34 : Math.min(0.6, 20 / sp.size));
            const tail = new Graphics();
            this.drawFish(icon, tail, sp);
            this.uiContainer.addChild(icon);
            const name = new Text({ text: sp.name, style: { fontFamily: 'Arial, sans-serif', fontSize: 16, fontWeight: 'bold', fill: 0xcdeefb } });
            name.anchor.set(0, 0.5);
            name.position.set(cx - 64, y);
            const pay = new Text({ text: `×${sp.pay}`, style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 20, fontWeight: '900', fill: sp.boss ? 0xffd23d : 0x6fe9ff } });
            pay.anchor.set(1, 0.5);
            pay.position.set(cx + 116, y);
            this.uiContainer.addChild(name, pay);
        });

        // Hunt-over banner over the reef.
        this.banner = new Text({ text: '', style: {
            fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 58, fontWeight: '900',
            fill: 0x4ade6a, stroke: { color: 0x04243a, width: 9 },
        } });
        this.banner.anchor.set(0.5);
        this.banner.position.set((GameConfig.width - 280) / 2, 110);
        this.banner.visible = false;
        this.uiContainer.addChild(this.banner);

        this.balanceText = new Text({ text: '', style: { fontFamily: 'Arial, sans-serif', fontSize: 22, fontWeight: 'bold', fill: 0x6fe9ff } });
        this.balanceText.anchor.set(0.5);
        this.balanceText.position.set(cx, 980);
        this.uiContainer.addChild(this.balanceText);

        const back = new Text({ text: '‹ MENU', style: { fill: 0x6fe9ff, fontSize: 26, fontWeight: 'bold', stroke: { color: 0x04243a, width: 4 } } });
        back.position.set(44, 92);
        back.eventMode = 'static';
        back.cursor = 'pointer';
        back.on('pointerdown', () => SceneManager.switchScene(new MenuScene()));
        // (back-to-menu removed) this.uiContainer.addChild(back);

        const hint = new Text({ text: 'START HUNT buys a clip of harpoons · aim & click to fire · whatever you catch is yours when the clip runs dry', style: { fill: 0x5ab8d4, fontSize: 19, fontStyle: 'italic' } });
        hint.anchor.set(0.5);
        hint.position.set((GameConfig.width - 280) / 2, GameConfig.height - 18);
        this.uiContainer.addChild(hint);

        const render = (s: ReturnType<typeof gameStore.getState>): void => {
            this.balanceText.text = `Balance  $${Math.round(s.balance * 100) / 100}`;
            if (!this.roundActive) { this.updateLevelDisplay(); this.styleStart(); }
        };
        render(gameStore.getState());
        gameStore.subscribe(render);
        this.updateAmmo();
        this.updateLevelDisplay();
        this.styleStart();
    }

    private styleStart(): void {
        const ready = !this.roundActive;
        this.startButton.clear()
            .roundRect(-112, -50, 224, 100, 24).fill(ready ? 0x0e8a6a : 0x0a3a52)
            .roundRect(-112, -50, 224, 100, 24).stroke({ width: 3, color: ready ? 0x4ade6a : 0x0e6a8a });
        this.startLabel.text = ready ? 'START HUNT' : 'HUNTING';
        const cost = Math.round(gameStore.getState().bet * this.clip * this.level.cost * 100) / 100;
        this.startSub.text = ready ? `$${cost} · ${this.clip} shots` : 'fire your clip!';
        this.startButton.cursor = ready ? 'pointer' : 'default';
    }

    /** Cycle the difficulty zone (locked while a hunt is live). */
    private setLevel(dir: number): void {
        if (this.roundActive) return;
        this.levelIdx = Math.max(0, Math.min(LEVELS.length - 1, this.levelIdx + dir));
        this.updateLevelDisplay();
        this.styleStart();
        gsap.fromTo(this.levelNameText.scale, { x: 0.8, y: 0.8 }, { x: 1, y: 1, duration: 0.25, ease: 'back.out(2.5)' });
    }

    private updateLevelDisplay(): void {
        const lv = this.level;
        this.levelNameText.text = `${lv.tag}  ${lv.name}`;
        this.levelNameText.style.fill = lv.tint;
        const cost = Math.round(gameStore.getState().bet * this.clip * lv.cost * 100) / 100;
        this.buyInText.text = `pay ×${lv.pay}  ·  hunt $${cost}`;
        // Dim the arrows that can't go further.
        if (this.levelArrows.length === 2) {
            this.levelArrows[0].alpha = this.levelIdx === 0 ? 0.3 : 1;
            this.levelArrows[1].alpha = this.levelIdx === LEVELS.length - 1 ? 0.3 : 1;
        }
    }

    private showBanner(msg: string, tint: number): void {
        this.banner.text = msg;
        this.banner.style.fill = tint;
        this.banner.style.dropShadow = { color: tint, blur: 22, distance: 0, alpha: 0.8, angle: Math.PI / 6 };
        this.banner.alpha = 1;
        this.banner.visible = true;
        gsap.killTweensOf(this.banner);
        gsap.killTweensOf(this.banner.scale);
        gsap.fromTo(this.banner.scale, { x: 0.4, y: 0.4 }, { x: 1, y: 1, duration: 0.4, ease: 'back.out(2.2)' });
        gsap.to(this.banner, { alpha: 0, duration: 0.5, delay: 2.6, onComplete: () => { this.banner.visible = false; } });
    }
}
