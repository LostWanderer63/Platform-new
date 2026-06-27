import { Text, Container, Graphics, FillGradient } from 'pixi.js';
import { gsap } from 'gsap';
import { BaseScene } from './BaseScene';
import { GameConfig } from '../config/GameConfig';
import { gameStore } from '../state/GameState';
import { SceneManager } from '../managers/SceneManager';
import { MenuScene } from './MenuScene';

/**
 * GameScene5 — Slot 5: "Neon Plinko"
 * -----------------------------------
 * Casino plinko board. A ball drops through a pyramid of pegs, bounces with
 * real (gravity + restitution) physics, and lands in a multiplier bucket at
 * the bottom — edge buckets pay big, centre buckets pay small.
 *
 * Production touches:
 *  - selectable row count (8–16), like real plinko — board + paytable rebuild
 *  - pooled balls with glowing motion trails
 *  - peg-hit flashes (pooled, additive)
 *  - buckets bounce + flash on a hit, with a floating "+$N" payout
 *  - big multipliers shake the board and burst coins
 *  - up to 8 balls in flight at once — DROP is never gated
 */

const PEG_R = 8;
const GRAVITY = 1150;        // px/s² — gentle fall so every bounce reads
const MAX_SPEED = 950;       // terminal fall speed cap
const RESTITUTION = 0.55;
const MAX_BALLS = 8;
const TOP_Y = 230;           // first peg row
const BUCKET_Y = 880;        // bucket rest line (board scales rows into this span)

/** Row choices + their bucket paytables (rows+1 buckets, edges hot, centre cold). */
const ROW_CHOICES = [8, 10, 12, 14, 16] as const;
const MULT_TABLES: Record<number, readonly number[]> = {
    8:  [13, 3, 1.3, 0.7, 0.4, 0.7, 1.3, 3, 13],
    10: [22, 5, 2, 1.4, 0.6, 0.4, 0.6, 1.4, 2, 5, 22],
    12: [33, 11, 4, 2, 1.1, 0.6, 0.3, 0.6, 1.1, 2, 4, 11, 33],
    14: [58, 15, 7, 4, 1.9, 1, 0.5, 0.2, 0.5, 1, 1.9, 4, 7, 15, 58],
    16: [110, 41, 10, 5, 3, 1.5, 1, 0.5, 0.3, 0.5, 1, 1.5, 3, 5, 10, 41, 110],
};

/** Bucket colour by payout heat: red-hot edges → gold → cool teal centre. */
function bucketColor(mult: number): number {
    if (mult >= 50) return 0xff2562;
    if (mult >= 10) return 0xff2e4d;
    if (mult >= 5) return 0xff7a2e;
    if (mult >= 2) return 0xffb300;
    if (mult >= 1) return 0xffd54f;
    if (mult >= 0.5) return 0x26c6da;
    return 0x2979ff;
}

interface Ball {
    gfx: Graphics;
    trail: Graphics;
    history: { x: number; y: number }[];
    x: number; y: number;
    vx: number; vy: number;
    active: boolean;
    bet: number;
    /** Seconds spent nearly motionless — watchdog kicks stuck balls free. */
    stuck: number;
    /** Total flight seconds — hard cap force-lands runaway balls. */
    life: number;
}

export class GameScene5 extends BaseScene {
    private readonly boardLayer = new Container();
    /** Static board (pegs/buckets/marker) — wiped + rebuilt when rows change. */
    private readonly pegLayer = new Container();
    /** Balls + trails live above the pegs and survive board rebuilds. */
    private readonly ballLayer = new Container();
    private readonly fxLayer = new Container();
    private readonly uiContainer = new Container();

    private readonly cx = GameConfig.width / 2;
    private readonly topY = TOP_Y;

    // Selected row count + geometry derived from it (set in buildBoard).
    private rows = 12;
    private hSpace = 66;
    private vSpace = 54;
    private ballR = 13;
    private mults: readonly number[] = MULT_TABLES[12];

    private pegs: { x: number; y: number }[] = [];
    private readonly balls: Ball[] = [];
    private readonly pegFlashes: Graphics[] = [];
    private readonly floatTexts: Text[] = [];
    private readonly coinPool: Graphics[] = [];
    private buckets: Container[] = [];
    private bucketY = 0;
    private readonly rowPills: { pill: Graphics; label: Text; value: number }[] = [];

    private winText!: Text;
    private balanceText!: Text;
    private elapsed = 0;

    private readonly onKeyDown = (e: KeyboardEvent): void => {
        if (e.code === 'Space') { e.preventDefault(); this.drop(); }
        // (back-to-menu removed) if (e.code === 'Escape') SceneManager.switchScene(new MenuScene());
    };

    public async init(): Promise<void> {
        this.addChild(this.buildBackground());
        this.boardLayer.addChild(this.pegLayer);
        this.boardLayer.addChild(this.ballLayer);
        this.addChild(this.boardLayer);
        this.addChild(this.fxLayer);
        this.addChild(this.uiContainer);

        this.buildBoard();
        this.createUI();
        window.addEventListener('keydown', this.onKeyDown);
    }

    public async start(): Promise<void> {}

    public override async destroyScene(): Promise<void> {
        window.removeEventListener('keydown', this.onKeyDown);
        for (const b of this.balls) { gsap.killTweensOf(b.gfx); gsap.killTweensOf(b.gfx.scale); }
        for (const f of this.pegFlashes) gsap.killTweensOf(f);
        for (const t of this.floatTexts) gsap.killTweensOf(t);
        for (const c of this.coinPool) gsap.killTweensOf(c);
        for (const bk of this.buckets) { gsap.killTweensOf(bk); gsap.killTweensOf(bk.scale); }
        gsap.killTweensOf(this.boardLayer.position);
        await super.destroyScene();
    }

    // --- physics -------------------------------------------------------------

    public update(delta: number): void {
        const dt = Math.min(delta / 60, 1 / 30);
        this.elapsed += dt;
        // Two substeps keep fast balls from tunnelling through pegs.
        for (let s = 0; s < 2; s++) this.step(dt / 2);
        for (const b of this.balls) if (b.active) this.drawTrail(b);
    }

    private step(dt: number): void {
        for (const b of this.balls) {
            if (!b.active) continue;
            b.vy += GRAVITY * dt;
            b.x += b.vx * dt;
            b.y += b.vy * dt;

            // Peg collisions (brute force — ~150 pegs is nothing).
            const minDist = PEG_R + this.ballR;
            for (const p of this.pegs) {
                const dx = b.x - p.x;
                const dy = b.y - p.y;
                if (Math.abs(dx) > minDist || Math.abs(dy) > minDist) continue;
                const d2 = dx * dx + dy * dy;
                if (d2 >= minDist * minDist || d2 === 0) continue;
                const d = Math.sqrt(d2);
                const nx = dx / d;
                const ny = dy / d;
                // Push out of the peg, then reflect velocity about the normal.
                b.x = p.x + nx * minDist;
                b.y = p.y + ny * minDist;
                const vn = b.vx * nx + b.vy * ny;
                if (vn < 0) {
                    b.vx -= (1 + RESTITUTION) * vn * nx;
                    b.vy -= (1 + RESTITUTION) * vn * ny;
                    // Random tangential kick keeps paths organic (real plinko chaos).
                    b.vx += (Math.random() - 0.5) * 50;
                    if (Math.abs(vn) > 90) this.pegFlash(p.x, p.y);
                }
                // A ball must always leave a peg sideways — never balance on top.
                if (Math.abs(b.vx) < 55) {
                    const dir = nx !== 0 ? Math.sign(nx) : (Math.random() < 0.5 ? -1 : 1);
                    b.vx = dir * (55 + Math.random() * 50);
                }
                if (b.vx > 420) b.vx = 420;
                if (b.vx < -420) b.vx = -420;
            }

            // Funnel guards along the pyramid edges.
            const edge = (this.rows / 2 + 0.5) * this.hSpace + 26;
            const halfW = Math.min(((b.y - this.topY) / this.vSpace + 2.6) * (this.hSpace / 2) + 26, edge);
            if (b.x < this.cx - halfW) { b.x = this.cx - halfW; b.vx = Math.abs(b.vx) * 0.55; }
            if (b.x > this.cx + halfW) { b.x = this.cx + halfW; b.vx = -Math.abs(b.vx) * 0.55; }

            // Terminal velocity keeps the drop readable (and balls can't tunnel).
            if (b.vy > MAX_SPEED) b.vy = MAX_SPEED;

            // Anti-stuck watchdog: a nearly motionless ball gets a kick after
            // 0.9s; any ball still flying after 15s is force-landed so the
            // game can never deadlock at the MAX_BALLS cap.
            b.life += dt;
            if (b.vx * b.vx + b.vy * b.vy < 45 * 45) b.stuck += dt;
            else b.stuck = 0;
            if (b.stuck > 0.9) {
                b.vy = 240;
                b.vx += (Math.random() < 0.5 ? -1 : 1) * (90 + Math.random() * 90);
                b.stuck = 0;
            }

            b.gfx.position.set(b.x, b.y);

            if (b.y >= this.bucketY || b.life > 15) this.land(b);
        }
    }

    // --- game flow -------------------------------------------------------------

    private drop(): void {
        const state = gameStore.getState();
        const inFlight = this.balls.filter((b) => b.active).length;
        if (inFlight >= MAX_BALLS || state.balance < state.bet) return;
        state.setBalance(state.balance - state.bet);

        const b = this.acquireBall();
        b.bet = state.bet;
        b.x = this.cx + (Math.random() - 0.5) * 14;
        b.y = this.topY - 90;
        b.vx = (Math.random() - 0.5) * 40;
        b.vy = 0;
        b.stuck = 0;
        b.life = 0;
        b.history.length = 0;
        b.active = true;
        b.gfx.visible = true;
        b.trail.visible = true;
        b.gfx.position.set(b.x, b.y);
        gsap.fromTo(b.gfx.scale, { x: 0.3, y: 0.3 }, { x: 1, y: 1, duration: 0.25, ease: 'back.out(2)' });
    }

    private land(ball: Ball): void {
        ball.active = false;
        const idx = Math.max(0, Math.min(this.mults.length - 1, Math.round((ball.x - this.cx) / this.hSpace) + this.rows / 2));
        const mult = this.mults[idx];
        const payout = Math.round(ball.bet * mult * 100) / 100;
        const bucket = this.buckets[idx];

        const state = gameStore.getState();
        state.setBalance(Math.round((state.balance + payout) * 100) / 100);
        state.setWinAmount(payout);

        // Ball sinks into the bucket and pops away.
        gsap.killTweensOf(ball.gfx);
        gsap.to(ball.gfx, {
            x: bucket.x, y: this.bucketY + 26, alpha: 0, duration: 0.22, ease: 'power2.in',
            onComplete: () => { ball.gfx.visible = false; ball.gfx.alpha = 1; ball.trail.visible = false; ball.trail.clear(); },
        });

        // Bucket bounce + squash.
        gsap.killTweensOf(bucket);
        gsap.killTweensOf(bucket.scale);
        gsap.timeline()
            .to(bucket, { y: this.bucketY + 14, duration: 0.09, ease: 'power2.out' })
            .to(bucket, { y: this.bucketY, duration: 0.45, ease: 'elastic.out(1.4, 0.5)' });
        gsap.fromTo(bucket.scale, { x: 1.12, y: 0.82 }, { x: 1, y: 1, duration: 0.4, ease: 'elastic.out(1.2, 0.5)' });

        this.floatText(`+$${payout}`, bucket.x, this.bucketY - 26, bucketColor(mult));
        this.winText.text = `WIN $${payout}`;
        gsap.killTweensOf(this.winText.scale);
        gsap.fromTo(this.winText.scale, { x: 1.25, y: 1.25 }, { x: 1, y: 1, duration: 0.35, ease: 'back.out(2)' });

        if (mult >= 5) {
            this.coinBurst(bucket.x, this.bucketY, mult >= 20 ? 26 : 14);
            this.shakeBoard(mult >= 20 ? 16 : 9);
        }
    }

    /** Switch the row count (blocked while balls are in flight) and rebuild. */
    private setRows(rows: number): void {
        if (rows === this.rows) return;
        if (this.balls.some((b) => b.active)) {
            this.shakeBoard(5); // feedback: finish the drops first
            return;
        }
        this.rows = rows;
        this.buildBoard();
        for (const { pill, label, value } of this.rowPills) this.stylePill(pill, label, value === rows);
    }

    // --- effects ---------------------------------------------------------------

    private pegFlash(x: number, y: number): void {
        let f = this.pegFlashes.find((g) => !g.visible);
        if (!f) {
            f = new Graphics().circle(0, 0, PEG_R + 7).fill({ color: 0xffffff, alpha: 0.9 });
            f.blendMode = 'add';
            f.visible = false;
            this.fxLayer.addChild(f);
            this.pegFlashes.push(f);
        }
        f.position.set(x, y);
        f.alpha = 0.9;
        f.scale.set(0.6);
        f.visible = true;
        gsap.killTweensOf(f);
        gsap.killTweensOf(f.scale);
        gsap.to(f.scale, { x: 1.8, y: 1.8, duration: 0.3, ease: 'power2.out' });
        gsap.to(f, { alpha: 0, duration: 0.3, ease: 'power2.out', onComplete: () => { f.visible = false; } });
    }

    private drawTrail(b: Ball): void {
        b.history.push({ x: b.x, y: b.y });
        if (b.history.length > 14) b.history.shift();
        b.trail.clear();
        for (let i = 1; i < b.history.length; i++) {
            const t = i / b.history.length;
            b.trail.moveTo(b.history[i - 1].x, b.history[i - 1].y)
                .lineTo(b.history[i].x, b.history[i].y)
                .stroke({ width: this.ballR * 1.5 * t, color: 0xffd54f, alpha: 0.28 * t, cap: 'round' });
        }
    }

    private floatText(msg: string, x: number, y: number, tint: number): void {
        let t = this.floatTexts.find((ft) => !ft.visible);
        if (!t) {
            t = new Text({ text: '', style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 34, fontWeight: '900', fill: 0xffffff, stroke: { color: 0x000000, width: 6 } } });
            t.anchor.set(0.5);
            t.visible = false;
            this.fxLayer.addChild(t);
            this.floatTexts.push(t);
        }
        t.text = msg;
        t.style.fill = tint;
        t.position.set(x, y);
        t.alpha = 1;
        t.visible = true;
        gsap.killTweensOf(t);
        gsap.to(t, { y: y - 90, alpha: 0, duration: 1.1, ease: 'power1.out', onComplete: () => { t.visible = false; } });
    }

    private coinBurst(x: number, y: number, count: number): void {
        for (let i = 0; i < count; i++) {
            let c = this.coinPool.find((g) => !g.visible);
            if (!c) {
                c = new Graphics();
                c.visible = false;
                this.fxLayer.addChild(c);
                this.coinPool.push(c);
            }
            const size = 6 + Math.random() * 7;
            c.clear().circle(0, 0, size).fill({ color: 0xffd54f }).circle(0, 0, size).stroke({ width: 2, color: 0x8a6512 });
            c.position.set(x, y);
            c.alpha = 1;
            c.visible = true;
            const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.8;
            const speed = 260 + Math.random() * 320;
            gsap.killTweensOf(c);
            gsap.to(c, {
                x: x + Math.cos(angle) * speed * 0.5,
                y: y + Math.sin(angle) * speed * 0.5 + 320,
                alpha: 0,
                duration: 0.8 + Math.random() * 0.4,
                ease: 'power1.in',
                onComplete: () => { c.visible = false; },
            });
        }
    }

    private shakeBoard(amplitude: number): void {
        gsap.killTweensOf(this.boardLayer.position);
        const tl = gsap.timeline({ onComplete: () => this.boardLayer.position.set(0, 0) });
        for (let i = 0; i < 6; i++) {
            const falloff = 1 - i / 7;
            tl.to(this.boardLayer.position, {
                x: (Math.random() - 0.5) * 2 * amplitude * falloff,
                y: (Math.random() - 0.5) * 2 * amplitude * falloff,
                duration: 0.05,
            });
        }
        tl.to(this.boardLayer.position, { x: 0, y: 0, duration: 0.06 });
    }

    // --- construction ----------------------------------------------------------

    private acquireBall(): Ball {
        let b = this.balls.find((x) => !x.active && !x.gfx.visible);
        if (!b) {
            const gfx = new Graphics();
            const trail = new Graphics();
            trail.blendMode = 'add';
            gfx.visible = false;
            this.ballLayer.addChild(trail);
            this.ballLayer.addChild(gfx);
            b = { gfx, trail, history: [], x: 0, y: 0, vx: 0, vy: 0, active: false, bet: 0, stuck: 0, life: 0 };
            this.balls.push(b);
        }
        // Redraw at the current ball radius — it shrinks on dense boards.
        b.gfx.clear()
            .circle(0, 0, this.ballR).fill(new FillGradient({
                type: 'radial', center: { x: 0.35, y: 0.3 }, innerRadius: 0.05, outerCenter: { x: 0.5, y: 0.5 }, outerRadius: 0.75, textureSpace: 'local',
                colorStops: [{ offset: 0, color: 0xfff6cf }, { offset: 0.5, color: 0xffc83d }, { offset: 1, color: 0x9a6a0c }],
            }))
            .circle(0, 0, this.ballR).stroke({ width: 2.5, color: 0x6e4a08 });
        return b;
    }

    /** (Re)build pegs, buckets and drop marker for the current row count. */
    private buildBoard(): void {
        // Geometry: squeeze the pitch so any row count fills the same board area.
        this.hSpace = Math.min(66, 1080 / (this.rows + 1));
        this.vSpace = Math.min(54, (BUCKET_Y - 58 - this.topY) / (this.rows - 1));
        this.ballR = Math.max(9, Math.min(13, this.hSpace * 0.2));
        this.mults = MULT_TABLES[this.rows];
        this.bucketY = this.topY + (this.rows - 1) * this.vSpace + 58;
        this.pegs = [];

        for (const child of this.pegLayer.children) gsap.killTweensOf(child);
        this.pegLayer.removeChildren().forEach((c) => c.destroy({ children: true }));

        // Pegs.
        const pegGfx = new Graphics();
        for (let row = 0; row < this.rows; row++) {
            const count = row + 3;
            const y = this.topY + row * this.vSpace;
            for (let i = 0; i < count; i++) {
                const x = this.cx + (i - (count - 1) / 2) * this.hSpace;
                this.pegs.push({ x, y });
                pegGfx.circle(x, y + 2, PEG_R).fill({ color: 0x0a1530, alpha: 0.9 });   // shadow
                pegGfx.circle(x, y, PEG_R).fill({ color: 0xcfe4ff });
                pegGfx.circle(x - 2, y - 2, PEG_R * 0.4).fill({ color: 0xffffff });
            }
        }
        this.pegLayer.addChild(pegGfx);

        // Buckets (rows+1 of them, centre index rows/2).
        const half = this.rows / 2;
        this.buckets = this.mults.map((mult, k) => {
            const c = new Container();
            const color = bucketColor(mult);
            const w = this.hSpace - 8;
            c.addChild(new Graphics()
                .roundRect(-w / 2, 0, w, 64, 10).fill(new FillGradient({
                    type: 'linear', start: { x: 0, y: 0 }, end: { x: 0, y: 1 }, textureSpace: 'local',
                    colorStops: [{ offset: 0, color }, { offset: 1, color: 0x0a0c18 }],
                }))
                .roundRect(-w / 2, 0, w, 64, 10).stroke({ width: 3, color, alpha: 0.95 }));
            const label = new Text({
                text: mult >= 1 ? `${mult}x` : `${mult}x`.replace('0.', '.'),
                style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 24, fontWeight: '900', fill: 0xffffff, stroke: { color: 0x000000, width: 4 } },
            });
            label.anchor.set(0.5);
            label.position.set(0, 32);
            if (label.width > w - 8) label.scale.set((w - 8) / label.width);
            c.addChild(label);
            c.position.set(this.cx + (k - half) * this.hSpace, this.bucketY);
            this.pegLayer.addChild(c);
            return c;
        });

        // Side neon rails hugging the pyramid edges (rebuilt with the board so
        // they always contain the pegs, whatever the row count).
        const railTopHalf = this.hSpace * 1.9;
        const railBotHalf = ((this.rows + 1) / 2) * this.hSpace + 36;
        const rails = new Graphics();
        rails.blendMode = 'add';
        for (const side of [-1, 1]) {
            rails.moveTo(this.cx + side * railTopHalf, this.topY - 64)
                .lineTo(this.cx + side * railBotHalf, this.bucketY - 8)
                .stroke({ width: 5, color: side < 0 ? 0x26c6da : 0xc06bff, alpha: 0.75 });
        }
        this.pegLayer.addChild(rails);

        // Drop arrow marker.
        const marker = new Graphics().poly([this.cx - 16, this.topY - 120, this.cx + 16, this.topY - 120, this.cx, this.topY - 92]).fill({ color: 0xffd54f });
        marker.blendMode = 'add';
        this.pegLayer.addChild(marker);
        gsap.to(marker, { y: 10, duration: 0.6, ease: 'sine.inOut', yoyo: true, repeat: -1 });
    }

    private buildBackground(): Container {
        const env = new Container();
        const W = GameConfig.width;
        const H = GameConfig.height;

        env.addChild(new Graphics().rect(0, 0, W, H).fill(new FillGradient({
            type: 'linear', start: { x: 0, y: 0 }, end: { x: 0, y: 1 }, textureSpace: 'local',
            colorStops: [{ offset: 0, color: 0x101732 }, { offset: 0.6, color: 0x0a0f24 }, { offset: 1, color: 0x05070f }],
        })));

        // Starfield.
        const stars = new Graphics();
        for (let i = 0; i < 90; i++) {
            stars.circle(Math.random() * W, Math.random() * H, Math.random() * 1.7 + 0.4)
                .fill({ color: 0x9fd8ff, alpha: Math.random() * 0.5 + 0.12 });
        }
        env.addChild(stars);

        // Neon glow behind the pyramid.
        env.addChild(new Graphics().ellipse(W / 2, 520, 620, 460).fill(new FillGradient({
            type: 'radial', center: { x: 0.5, y: 0.5 }, innerRadius: 0, outerCenter: { x: 0.5, y: 0.5 }, outerRadius: 0.5, textureSpace: 'local',
            colorStops: [{ offset: 0, color: 'rgba(38,198,218,0.22)' }, { offset: 1, color: 'rgba(38,198,218,0)' }],
        })));

        // Marquee title.
        const title = new Text({
            text: 'NEON PLINKO',
            style: {
                fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 64, fontWeight: '900', letterSpacing: 10,
                fill: 0x6fe9ff, stroke: { color: 0x07203a, width: 8 },
                dropShadow: { color: 0x26c6da, blur: 16, distance: 0, alpha: 0.9 },
            },
        });
        title.anchor.set(0.5);
        title.position.set(W / 2, 84);
        env.addChild(title);
        gsap.to(title, { alpha: 0.78, duration: 1.6, ease: 'sine.inOut', yoyo: true, repeat: -1 });

        return env;
    }

    private createUI(): void {
        // DROP button.
        const dropButton = new Graphics()
            .roundRect(0, 0, 170, 170, 85).fill(0x0e7c8a)
            .roundRect(0, 0, 170, 170, 85).stroke({ width: 6, color: 0x6fe9ff });
        dropButton.pivot.set(85, 85);
        dropButton.position.set(GameConfig.width - 145, GameConfig.height / 2);
        dropButton.eventMode = 'static';
        dropButton.cursor = 'pointer';
        dropButton.on('pointerdown', () => {
            gsap.fromTo(dropButton.scale, { x: 0.9, y: 0.9 }, { x: 1, y: 1, duration: 0.35, ease: 'back.out(3)' });
            this.drop();
        });
        const dropText = new Text({ text: 'DROP', style: { fill: 0xffffff, fontSize: 36, fontWeight: 'bold' } });
        dropText.anchor.set(0.5);
        dropText.position.set(85, 85);
        dropButton.addChild(dropText);
        this.uiContainer.addChild(dropButton);

        const pulse = new Graphics().circle(0, 0, 92).stroke({ width: 5, color: 0x6fe9ff });
        pulse.blendMode = 'add';
        pulse.position.copyFrom(dropButton.position);
        this.uiContainer.addChildAt(pulse, 0);
        gsap.timeline({ repeat: -1, repeatDelay: 1.1 })
            .set(pulse, { alpha: 0.8 })
            .set(pulse.scale, { x: 1, y: 1 }, 0)
            .to(pulse.scale, { x: 1.45, y: 1.45, duration: 1.0, ease: 'power1.out' }, 0)
            .to(pulse, { alpha: 0, duration: 1.0, ease: 'power1.out' }, 0);

        // ROWS selector — like real plinko: more rows, longer odds, bigger edges.
        const selX = 145;
        const selTop = GameConfig.height / 2 - 150;
        const rowsTitle = new Text({ text: 'ROWS', style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 26, fontWeight: '900', letterSpacing: 4, fill: 0x6fe9ff } });
        rowsTitle.anchor.set(0.5);
        rowsTitle.position.set(selX, selTop - 40);
        this.uiContainer.addChild(rowsTitle);

        ROW_CHOICES.forEach((value, i) => {
            const pill = new Graphics();
            pill.position.set(selX, selTop + i * 62);
            pill.eventMode = 'static';
            pill.cursor = 'pointer';
            const label = new Text({ text: `${value}`, style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 26, fontWeight: '900', fill: 0xffffff } });
            label.anchor.set(0.5);
            pill.addChild(label);
            this.stylePill(pill, label, value === this.rows);
            pill.on('pointerdown', () => this.setRows(value));
            pill.on('pointerover', () => { if (value !== this.rows) pill.alpha = 0.85; });
            pill.on('pointerout', () => { pill.alpha = 1; });
            this.uiContainer.addChild(pill);
            this.rowPills.push({ pill, label, value });
        });

        // Readouts.
        this.winText = new Text({ text: '', style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 44, fontWeight: '900', fill: 0xffd54f, stroke: { color: 0x07203a, width: 7 } } });
        this.winText.anchor.set(0.5);
        this.winText.position.set(GameConfig.width / 2, 154);
        this.uiContainer.addChild(this.winText);

        this.balanceText = new Text({ text: '', style: { fill: 0xffffff, fontSize: 30 } });
        this.balanceText.position.set(50, GameConfig.height - 70);
        this.uiContainer.addChild(this.balanceText);

        const back = new Text({ text: '‹ MENU', style: { fill: 0x6fe9ff, fontSize: 26, fontWeight: 'bold' } });
        back.position.set(40, 36);
        back.eventMode = 'static';
        back.cursor = 'pointer';
        back.on('pointerdown', () => SceneManager.switchScene(new MenuScene()));
        // (back-to-menu removed) this.uiContainer.addChild(back);

        const hint = new Text({ text: 'space or DROP · pick ROWS for risk · up to 8 balls in flight · esc for menu', style: { fill: 0x8fb8d8, fontSize: 20, fontStyle: 'italic' } });
        hint.anchor.set(0.5);
        hint.position.set(GameConfig.width / 2, GameConfig.height - 36);
        this.uiContainer.addChild(hint);

        const render = (s: ReturnType<typeof gameStore.getState>): void => {
            this.balanceText.text = `Balance: $${Math.round(s.balance * 100) / 100}   Bet: $${s.bet}`;
        };
        render(gameStore.getState());
        gameStore.subscribe(render);
    }

    /** Pill button style: filled cyan when active, dark outline otherwise. */
    private stylePill(pill: Graphics, label: Text, active: boolean): void {
        pill.clear()
            .roundRect(-54, -24, 108, 48, 24).fill({ color: active ? 0x0e7c8a : 0x0c1428, alpha: active ? 1 : 0.85 })
            .roundRect(-54, -24, 108, 48, 24).stroke({ width: 3, color: active ? 0x6fe9ff : 0x2a4a6a });
        label.style.fill = active ? 0xffffff : 0x8fb8d8;
    }

    public resize(_width: number, _height: number): void {}
}
