import { Text, Container, Graphics, FillGradient } from 'pixi.js';
import { AdvancedBloomFilter } from 'pixi-filters';
import { gsap } from 'gsap';
import { BaseScene } from './BaseScene';
import { GameConfig } from '../config/GameConfig';
import { gameStore } from '../state/GameState';
import { SceneManager } from '../managers/SceneManager';
import { MenuScene } from './MenuScene';

/**
 * GameScene11 — Slot 11: "Neon Keno"
 * -----------------------------------
 * Keno with a live lottery machine. Pick up to 10 of 40 numbers, then the
 * glass chamber fires 10 glowing balls into the rack — every hit lights the
 * board. Payouts scale with how many you picked and how many hit.
 *
 * Advanced-graphics layer:
 *  - real-time physics ball pit inside the glass chamber (always tumbling)
 *  - AdvancedBloomFilter over the neon layer; bloom surges on every hit
 *  - drawn balls fly a bezier arc from the chamber to the rack
 *  - hit tiles detonate with ring + sparkle bursts; near-miss dims
 *  - glass highlights, animated agitator paddle, jackpot shockwave shake
 */

const NUMBERS = 40;
const COLS = 8;
const DRAWS = 10;
const MAX_PICKS = 10;
const BET_STEPS = [1, 2, 5, 10, 20, 50, 100];

/** Payout multipliers indexed [picks][hits]. Demo-tuned, edges favour the house. */
const PAYTABLE: Record<number, number[]> = {
    1: [0, 3.8],
    2: [0, 1.7, 5.3],
    3: [0, 0, 2.8, 50],
    4: [0, 0, 1.7, 10, 100],
    5: [0, 0, 1.4, 4, 14, 390],
    6: [0, 0, 0, 3, 9, 180, 710],
    7: [0, 0, 0, 2, 7, 30, 400, 800],
    8: [0, 0, 0, 2, 4, 11, 67, 400, 900],
    9: [0, 0, 0, 2, 2.5, 5, 15, 100, 500, 1000],
    10: [0, 0, 0, 1.6, 2, 4, 7, 26, 100, 500, 1000],
};

type Phase = 'idle' | 'drawing' | 'done';

interface KenoTile {
    root: Container;
    bg: Graphics;
    label: Text;
    n: number;
    state: 'off' | 'picked' | 'hit' | 'miss';
}

interface PitBall {
    x: number; y: number; vx: number; vy: number; r: number; hue: number;
}

export class GameScene11 extends BaseScene {
    private readonly chamber = { x: 280, y: 560, r: 195 };
    private readonly gridX = 600;
    private readonly gridY = 250;
    private readonly tile = 96;
    private readonly gap = 12;

    private readonly chamberBack = new Container(); // machine body, under the balls
    private readonly neonLayer = new Container(); // bloomed
    private readonly fxLayer = new Container();
    private readonly uiContainer = new Container();

    private phase: Phase = 'idle';
    private picks = new Set<number>();
    private drawn: number[] = [];
    private tiles: KenoTile[] = [];
    private bloom!: AdvancedBloomFilter;

    private pit: PitBall[] = [];
    private pitGfx!: Graphics;
    private agitator!: Graphics;
    private rackSlots: Container[] = [];
    private flyBalls: Graphics[] = [];

    private infoText!: Text;
    private banner!: Text;
    private payRows: Text[] = [];
    private playButton!: Graphics;
    private playLabel!: Text;
    private playSub!: Text;
    private betValueText!: Text;
    private balanceText!: Text;
    private readonly sparkles: Graphics[] = [];
    private readonly coins: Graphics[] = [];
    private elapsed = 0;

    private readonly onKeyDown = (e: KeyboardEvent): void => {
        if (e.code === 'Space') { e.preventDefault(); this.play(); }
        // (back-to-menu removed) if (e.code === 'Escape') SceneManager.switchScene(new MenuScene());
    };

    public async init(): Promise<void> {
        this.addChild(this.buildBackground());
        this.addChild(this.chamberBack);
        this.addChild(this.neonLayer);
        this.addChild(this.fxLayer);
        this.addChild(this.uiContainer);

        // Bloom only catches the genuinely bright pixels (balls, hit tiles),
        // so the grid numbers stay crisp.
        this.bloom = new AdvancedBloomFilter({ threshold: 0.6, bloomScale: 0.8, brightness: 1, blur: 4, quality: 4 });
        this.neonLayer.filters = [this.bloom];

        this.buildChamber();
        this.buildGrid();
        this.buildRack();
        this.createUI();
        this.refreshInfo();
        window.addEventListener('keydown', this.onKeyDown);
    }

    public async start(): Promise<void> {}
    public resize(_width: number, _height: number): void {}

    public override async destroyScene(): Promise<void> {
        window.removeEventListener('keydown', this.onKeyDown);
        gsap.killTweensOf(this.position);
        gsap.killTweensOf(this.bloom);
        for (const t of this.tiles) gsap.killTweensOf(t.root.scale);
        for (const pool of [this.sparkles, this.coins, this.flyBalls]) for (const g of pool) gsap.killTweensOf(g);
        gsap.killTweensOf(this.banner);
        gsap.killTweensOf(this.banner.scale);
        this.neonLayer.filters = [];
        await super.destroyScene();
    }

    /** Ball-pit physics: balls tumble inside the chamber, stirred by the agitator. */
    public update(delta: number): void {
        if (!this.pitGfx) return; // ticker may fire before init resolves
        const dt = Math.min(delta / 60, 1 / 30);
        this.elapsed += dt;
        const { x: cx, y: cy, r } = this.chamber;
        this.agitator.rotation = this.elapsed * 2.4;

        this.pitGfx.clear();
        for (const b of this.pit) {
            b.vy += 620 * dt;                       // gravity
            // Agitator stir: swirling force near the centre.
            const dx = b.x - cx;
            const dy = b.y - cy;
            const d = Math.sqrt(dx * dx + dy * dy) || 1;
            if (d < r * 0.5) {
                b.vx += (-dy / d) * 900 * dt;
                b.vy += (dx / d) * 900 * dt - 500 * dt;
            }
            b.x += b.vx * dt;
            b.y += b.vy * dt;
            // Glass wall collision.
            const limit = r - 14 - b.r;
            const d2 = Math.sqrt((b.x - cx) ** 2 + (b.y - cy) ** 2);
            if (d2 > limit) {
                const nx = (b.x - cx) / d2;
                const ny = (b.y - cy) / d2;
                b.x = cx + nx * limit;
                b.y = cy + ny * limit;
                const vn = b.vx * nx + b.vy * ny;
                if (vn > 0) { b.vx -= 1.6 * vn * nx; b.vy -= 1.6 * vn * ny; }
            }
            const col = [0x55e0ff, 0xdd77ff, 0x00ff77, 0xffee55, 0xff6688][b.hue];
            const mid = [0x22a8cc, 0x9944cc, 0x00cc55, 0xccaa22, 0xcc3355][b.hue];
            const dark = [0x0a6a99, 0x5a1888, 0x007744, 0x996a0a, 0x991830][b.hue];
            // Shaded sphere: shadow rim, mid-tone, bright body, specular highlights.
            this.pitGfx
                .circle(b.x + 1, b.y + b.r * 0.2, b.r).fill({ color: dark })
                .circle(b.x, b.y, b.r * 0.96).fill({ color: mid })
                .circle(b.x, b.y - b.r * 0.04, b.r * 0.86).fill({ color: col })
                .circle(b.x - b.r * 0.25, b.y - b.r * 0.28, b.r * 0.44).fill({ color: 0xffffff, alpha: 0.30 })
                .circle(b.x - b.r * 0.30, b.y - b.r * 0.33, b.r * 0.24).fill({ color: 0xffffff, alpha: 0.60 })
                .circle(b.x - b.r * 0.32, b.y - b.r * 0.36, b.r * 0.11).fill({ color: 0xffffff, alpha: 0.95 })
                .ellipse(b.x + b.r * 0.12, b.y + b.r * 0.38, b.r * 0.22, b.r * 0.1).fill({ color: 0xffffff, alpha: 0.10 });
        }
    }

    // --- game flow -----------------------------------------------------------------

    private toggle(t: KenoTile): void {
        if (this.phase === 'drawing') return;
        if (this.phase === 'done') this.clearBoardStates();
        if (this.picks.has(t.n)) {
            this.picks.delete(t.n);
            this.setTileState(t, 'off');
        } else {
            if (this.picks.size >= MAX_PICKS) { this.shake(4); return; }
            this.picks.add(t.n);
            this.setTileState(t, 'picked');
        }
        this.refreshInfo();
    }

    private quickPick(): void {
        if (this.phase === 'drawing') return;
        this.clearPicks();
        while (this.picks.size < MAX_PICKS) this.picks.add(1 + ((Math.random() * NUMBERS) | 0));
        for (const t of this.tiles) this.setTileState(t, this.picks.has(t.n) ? 'picked' : 'off');
        this.refreshInfo();
    }

    private clearPicks(): void {
        if (this.phase === 'drawing') return;
        this.phase = 'idle';
        this.picks.clear();
        this.clearBoardStates();
        this.refreshInfo();
    }

    private clearBoardStates(): void {
        this.phase = 'idle';
        for (const t of this.tiles) this.setTileState(t, this.picks.has(t.n) ? 'picked' : 'off');
        for (const slot of this.rackSlots) {
            (slot.getChildAt(1) as Text).text = '';
            this.drawRackOrb(slot.getChildAt(0) as Graphics, 'empty');
        }
        this.banner.visible = false;
    }

    private play(): void {
        if (this.phase === 'drawing' || this.picks.size === 0) return;
        const state = gameStore.getState();
        if (state.balance < state.bet) return;
        state.setBalance(state.balance - state.bet);
        state.setWinAmount(0);
        this.clearBoardStates();
        this.phase = 'drawing';
        this.stylePlay(0x232a3a, 0x3a4663, 'DRAWING', '…');

        // Draw 10 unique numbers.
        const pool = Array.from({ length: NUMBERS }, (_, i) => i + 1);
        for (let i = pool.length - 1; i > 0; i--) {
            const j = (Math.random() * (i + 1)) | 0;
            [pool[i], pool[j]] = [pool[j], pool[i]];
        }
        this.drawn = pool.slice(0, DRAWS);
        this.drawn.forEach((n, i) => gsap.delayedCall(0.55 * i + 0.3, () => this.revealBall(n, i)));
        gsap.delayedCall(0.55 * DRAWS + 0.6, () => this.settle());
    }

    /** Fire a ball from the chamber along an arc into rack slot `i`. */
    private revealBall(n: number, i: number): void {
        const slot = this.rackSlots[i];
        const hit = this.picks.has(n);
        let ball = this.flyBalls.find((g) => !g.visible);
        if (!ball) {
            ball = new Graphics();
            ball.visible = false;
            this.neonLayer.addChild(ball);
            this.flyBalls.push(ball);
        }
        const bodyCol = hit ? 0x00ff6a : 0x6fe9ff;
        const rimCol = hit ? 0x007a3a : 0x1a6a8a;
        const glowCol = hit ? 0x00ff6a : 0x88eeff;
        ball.clear()
            // Outer glow aura
            .circle(0, 0, 42).fill({ color: glowCol, alpha: 0.18 })
            .circle(0, 0, 36).fill({ color: glowCol, alpha: 0.12 })
            // Dark under-rim for 3D depth
            .circle(1, 4, 29).fill({ color: rimCol })
            // Main ball body
            .circle(0, 0, 28).fill({ color: bodyCol })
            // Bright edge ring
            .circle(0, 0, 28).stroke({ width: 3.5, color: 0xffffff, alpha: 0.7 })
            // Large specular highlight
            .circle(-8, -9, 12).fill({ color: 0xffffff, alpha: 0.65 })
            // Hot specular pinpoint
            .circle(-10, -11, 5).fill({ color: 0xffffff, alpha: 0.95 })
            // Bottom reflection
            .ellipse(5, 13, 9, 4).fill({ color: 0xffffff, alpha: 0.15 });
        const sx = this.chamber.x;
        const sy = this.chamber.y - this.chamber.r - 18;
        const ex = slot.x;
        const ey = slot.y;
        const cpx = (sx + ex) / 2;
        const cpy = Math.min(sy, ey) - 240;
        ball.position.set(sx, sy);
        ball.scale.set(0.4);
        ball.rotation = 0;
        ball.visible = true;
        const p = { t: 0 };
        gsap.to(p, {
            t: 1, duration: 0.5, ease: 'power2.in',
            onUpdate: () => {
                const t = p.t;
                ball.x = (1 - t) * (1 - t) * sx + 2 * (1 - t) * t * cpx + t * t * ex;
                ball.y = (1 - t) * (1 - t) * sy + 2 * (1 - t) * t * cpy + t * t * ey;
                ball.scale.set(0.4 + t * 0.7);
                ball.rotation += 0.18;
                // Spawn glowing trail particle along the flight arc
                if (Math.random() < 0.6) this.spawnTrailParticle(ball.x, ball.y, glowCol);
            },
            onComplete: () => {
                ball.visible = false;
                ball.scale.set(1);
                ball.rotation = 0;
                this.drawRackOrb(slot.getChildAt(0) as Graphics, hit ? 'hit' : 'miss');
                const label = slot.getChildAt(1) as Text;
                label.text = `${n}`;
                label.style.fill = hit ? 0x003318 : 0x0a1020;
                gsap.fromTo(slot.scale, { x: 1.5, y: 1.5 }, { x: 1, y: 1, duration: 0.35, ease: 'back.out(3)' });
                this.lightTile(n, hit);
            },
        });
    }

    private lightTile(n: number, hit: boolean): void {
        const t = this.tiles[n - 1];
        this.setTileState(t, hit ? 'hit' : 'miss');
        gsap.fromTo(t.root.scale, { x: 1.25, y: 1.25 }, { x: 1, y: 1, duration: 0.3, ease: 'back.out(2.2)' });
        if (hit) {
            this.sparkleBurst(t.root.x, t.root.y);
            // Bloom surge on every hit.
            gsap.killTweensOf(this.bloom);
            this.bloom.bloomScale = 1.7;
            gsap.to(this.bloom, { bloomScale: 0.9, duration: 0.5, ease: 'power2.out' });
        }
    }

    private settle(): void {
        this.phase = 'done';
        const state = gameStore.getState();
        const hits = this.drawn.filter((n) => this.picks.has(n)).length;
        const table = PAYTABLE[this.picks.size] ?? [];
        const mult = table[hits] ?? 0;
        if (mult > 0) {
            const win = Math.round(state.bet * mult * 100) / 100;
            state.setBalance(Math.round((state.balance + win) * 100) / 100);
            state.setWinAmount(win);
            this.showBanner(`${hits} HITS  +$${win}`, mult >= 10 ? 0xffdd44 : 0x00ff6a);
            this.coinBurst(this.gridX + (COLS * (this.tile + this.gap)) / 2, this.gridY + 240, Math.min(40, 8 + hits * 4));
            if (mult >= 10) this.shake(14);
        } else {
            this.showBanner(hits > 0 ? `${hits} HIT${hits === 1 ? '' : 'S'} — NO PAY` : 'NO HITS', 0xc8d4ec);
        }
        this.stylePlay(0x0e7c8a, 0x6fe9ff, 'PLAY', `${this.picks.size} picks · $${state.bet}`);
        this.refreshInfo();
    }

    // --- board ---------------------------------------------------------------------

    private tilePos(n: number): { x: number; y: number } {
        const i = n - 1;
        return {
            x: this.gridX + (i % COLS) * (this.tile + this.gap) + this.tile / 2,
            y: this.gridY + ((i / COLS) | 0) * (this.tile + this.gap) + this.tile / 2,
        };
    }

    private buildGrid(): void {
        const w = COLS * (this.tile + this.gap) - this.gap;
        const h = (NUMBERS / COLS) * (this.tile + this.gap) - this.gap;
        this.chamberBack.addChild(new Graphics()
            .roundRect(this.gridX - 24, this.gridY - 24, w + 48, h + 48, 26).fill({ color: 0x101848, alpha: 0.9 })
            .roundRect(this.gridX - 24, this.gridY - 24, w + 48, h + 48, 26).stroke({ width: 4, color: 0x5a7aff })
            .roundRect(this.gridX - 14, this.gridY - 14, w + 28, h + 28, 20).stroke({ width: 2, color: 0x8af2ff, alpha: 0.4 }));

        for (let n = 1; n <= NUMBERS; n++) {
            const p = this.tilePos(n);
            const root = new Container();
            root.position.set(p.x, p.y);
            const bg = new Graphics();
            const label = new Text({
                text: `${n}`,
                style: {
                    fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 38, fontWeight: '900',
                    fill: 0xffffff, stroke: { color: 0x04101e, width: 5 },
                    dropShadow: { color: 0x000000, blur: 4, distance: 0, alpha: 0.5 },
                },
            });
            label.anchor.set(0.5);
            root.addChild(bg, label);
            const tile: KenoTile = { root, bg, label, n, state: 'off' };
            this.setTileState(tile, 'off');
            root.eventMode = 'static';
            root.cursor = 'pointer';
            root.on('pointerover', () => { if (this.phase !== 'drawing' && tile.state === 'off') root.alpha = 0.8; });
            root.on('pointerout', () => { root.alpha = 1; });
            root.on('pointerdown', () => this.toggle(tile));
            this.tiles.push(tile);
            this.neonLayer.addChild(root);
        }
    }

    private setTileState(t: KenoTile, state: KenoTile['state']): void {
        t.state = state;
        const s = this.tile;
        // Premium glassy tile: outer glow, drop shadow, gradient body, bevel edge, gloss.
        const draw = (top: number, bottom: number, edge: number, edgeW: number, glow?: number): void => {
            t.bg.clear();
            // Outer neon glow ring for active states
            if (glow !== undefined) {
                t.bg
                    .roundRect(-s / 2 - 8, -s / 2 - 8, s + 16, s + 16, 26)
                    .fill({ color: glow, alpha: 0.14 })
                    .roundRect(-s / 2 - 4, -s / 2 - 4, s + 8, s + 8, 23)
                    .fill({ color: glow, alpha: 0.10 });
            }
            t.bg
                // Drop shadow
                .roundRect(-s / 2 + 3, -s / 2 + 6, s, s, 18).fill({ color: 0x000000, alpha: 0.55 })
                // Main body gradient
                .roundRect(-s / 2, -s / 2, s, s, 18).fill(new FillGradient({
                    type: 'linear', start: { x: 0, y: 0 }, end: { x: 0, y: 1 }, textureSpace: 'local',
                    colorStops: [
                        { offset: 0, color: top },
                        { offset: 0.3, color: top },
                        { offset: 0.6, color: bottom },
                        { offset: 1, color: bottom },
                    ],
                }))
                // Outer bevel edge
                .roundRect(-s / 2, -s / 2, s, s, 18).stroke({ width: edgeW, color: edge })
                // Inner edge shimmer
                .roundRect(-s / 2 + 4, -s / 2 + 4, s - 8, s - 8, 14).stroke({ width: 1.5, color: edge, alpha: 0.30 })
                // Second inner depth ring
                .roundRect(-s / 2 + 8, -s / 2 + 8, s - 16, s - 16, 10).stroke({ width: 1, color: 0xffffff, alpha: 0.06 })
                // Top gloss highlight
                .roundRect(-s / 2 + 5, -s / 2 + 4, s - 10, s * 0.36, 14).fill({ color: 0xffffff, alpha: 0.16 })
                // Bottom rim light
                .roundRect(-s / 2 + 12, -s / 2 + s * 0.74, s - 24, s * 0.15, 8).fill({ color: 0xffffff, alpha: 0.04 });
        };
        switch (state) {
            case 'off':
                draw(0x3348cc, 0x1a2470, 0x6a9aff, 3);
                t.label.style.fill = 0xd0e4ff;
                t.label.alpha = 0.9;
                break;
            case 'picked':
                draw(0x00ddff, 0x0066bb, 0x66f8ff, 5, 0x00ccff);
                t.label.style.fill = 0xffffff;
                t.label.alpha = 1;
                break;
            case 'hit':
                draw(0x00ff66, 0x00992e, 0x55ffaa, 5, 0x00ff66);
                t.label.style.fill = 0xffffff;
                t.label.alpha = 1;
                break;
            case 'miss':
                draw(0xaa55ee, 0x5520aa, 0xcc88ff, 3);
                t.label.style.fill = 0xe0d4ff;
                t.label.alpha = 0.70;
                break;
        }
    }

    /** Glass lottery chamber with the live ball pit. */
    private buildChamber(): void {
        const { x, y, r } = this.chamber;
        const vgrad = (stops: { offset: number; color: number }[], horizontal = false): FillGradient =>
            new FillGradient({
                type: 'linear', start: { x: 0, y: 0 }, end: horizontal ? { x: 1, y: 0 } : { x: 0, y: 1 },
                textureSpace: 'local', colorStops: stops,
            });
        const CHROME = [{ offset: 0, color: 0xeaf2fc }, { offset: 0.35, color: 0x9fb4cc }, { offset: 0.55, color: 0xdce8f6 }, { offset: 1, color: 0x46586f }];
        const GOLD = [{ offset: 0, color: 0xffe9a8 }, { offset: 0.5, color: 0xd4af37 }, { offset: 1, color: 0x7a5f12 }];

        // Floor glow + gold pedestal with a chrome column (UNDER the balls).
        this.chamberBack.addChild(new Graphics()
            .ellipse(x, y + r + 122, 210, 30).fill({ color: 0x05080f })
            .ellipse(x, y + r + 116, 190, 24).fill(vgrad(GOLD))
            .ellipse(x, y + r + 110, 190, 22).fill(vgrad([{ offset: 0, color: 0x2a3a58 }, { offset: 1, color: 0x10182a }]))
            .poly([x - 64, y + r + 112, x + 64, y + r + 112, x + 38, y + r - 26, x - 38, y + r - 26])
            .fill(vgrad(CHROME, true))
            .poly([x - 64, y + r + 112, x + 64, y + r + 112, x + 38, y + r - 26, x - 38, y + r - 26])
            .stroke({ width: 2.5, color: 0x222c3c })
            .roundRect(x - 74, y + r - 38, 148, 26, 12).fill(vgrad(GOLD))
            .roundRect(x - 74, y + r - 38, 148, 26, 12).stroke({ width: 2, color: 0x5a4410 }));

        // Chrome bezel ring, then rim-lit glass interior (UNDER the balls).
        this.chamberBack.addChild(new Graphics()
            .circle(x, y, r + 16).fill(vgrad(CHROME))
            .circle(x, y, r + 16).stroke({ width: 3, color: 0x222c3c })
            .circle(x, y, r).fill(new FillGradient({
                type: 'radial', center: { x: 0.5, y: 0.55 }, innerRadius: 0.1, outerCenter: { x: 0.5, y: 0.55 }, outerRadius: 0.72, textureSpace: 'local',
                colorStops: [{ offset: 0, color: 0x1c3a6e }, { offset: 0.7, color: 0x2a5a9e }, { offset: 1, color: 0x5a9ae0 }],
            })));
        // Bezel bolts.
        const bolts = new Graphics();
        for (let i = 0; i < 8; i++) {
            const a = (Math.PI * 2 * i) / 8 + Math.PI / 8;
            const bx = x + Math.cos(a) * (r + 16);
            const by = y + Math.sin(a) * (r + 16);
            bolts.circle(bx, by, 7).fill({ color: 0x5a6a80 }).circle(bx - 1.5, by - 1.5, 3).fill({ color: 0xe8f2fc });
        }
        this.chamberBack.addChild(bolts);

        // Agitator paddle + ball pit live in the bloomed neon layer.
        this.agitator = new Graphics()
            .roundRect(-9, -64, 18, 128, 9).fill(vgrad(CHROME))
            .roundRect(-64, -9, 128, 18, 9).fill(vgrad(CHROME))
            .circle(0, 0, 18).fill({ color: 0x6fe9ff })
            .circle(0, 0, 18).stroke({ width: 3, color: 0x0a4a6a })
            .circle(-5, -5, 6).fill({ color: 0xffffff, alpha: 0.9 });
        this.agitator.position.set(x, y);
        this.neonLayer.addChild(this.agitator);

        for (let i = 0; i < 24; i++) {
            const a = Math.random() * Math.PI * 2;
            const d = Math.random() * r * 0.55;
            this.pit.push({
                x: x + Math.cos(a) * d,
                y: y + Math.sin(a) * d,
                vx: (Math.random() - 0.5) * 300,
                vy: (Math.random() - 0.5) * 300,
                r: 17 + Math.random() * 7,
                hue: i % 5,
            });
        }
        this.pitGfx = new Graphics();
        this.neonLayer.addChild(this.pitGfx);

        // Glass front: sweeping highlights, sparkle, exit tube with gold collar.
        const front = new Graphics();
        front.ellipse(0, 0, r * 0.34, r * 0.13).fill({ color: 0xffffff, alpha: 0.30 });
        front.position.set(x - r * 0.38, y - r * 0.46);
        front.rotation = -0.55;
        this.uiContainer.addChild(front);
        this.uiContainer.addChild(new Graphics()
            .arc(x, y, r - 14, Math.PI * 0.62, Math.PI * 1.12).stroke({ width: 12, color: 0xffffff, alpha: 0.14 })
            .arc(x, y, r - 30, Math.PI * 1.55, Math.PI * 1.9).stroke({ width: 7, color: 0xffffff, alpha: 0.08 })
            .circle(x + r * 0.42, y + r * 0.42, 7).fill({ color: 0xffffff, alpha: 0.5 })
            .circle(x, y, r).stroke({ width: 2.5, color: 0x9fd8ff, alpha: 0.4 })
            .roundRect(x - 24, y - r - 54, 48, 52, 12).fill(vgrad(CHROME, true))
            .roundRect(x - 24, y - r - 54, 48, 52, 12).stroke({ width: 2.5, color: 0x222c3c })
            .roundRect(x - 32, y - r - 18, 64, 16, 8).fill(vgrad(GOLD))
            .roundRect(x - 32, y - r - 18, 64, 16, 8).stroke({ width: 2, color: 0x5a4410 }));
    }

    /** Rack of 10 cradled slots across the top where drawn balls land. */
    private buildRack(): void {
        const w = COLS * (this.tile + this.gap) - this.gap;
        const startX = this.gridX + w / 2 - (DRAWS - 1) * 38;
        // Rail behind the cradles.
        this.chamberBack.addChild(new Graphics()
            .roundRect(startX - 56, 116, (DRAWS - 1) * 76 + 112, 72, 36).fill({ color: 0x101848, alpha: 0.92 })
            .roundRect(startX - 56, 116, (DRAWS - 1) * 76 + 112, 72, 36).stroke({ width: 3, color: 0x5a7aff }));
        for (let i = 0; i < DRAWS; i++) {
            const slot = new Container();
            slot.position.set(startX + i * 76, 150);
            const orb = new Graphics();
            const label = new Text({
                text: '',
                style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 25, fontWeight: '900', fill: 0x0a1020 },
            });
            label.anchor.set(0.5);
            slot.addChild(orb, label);
            this.drawRackOrb(orb, 'empty');
            this.neonLayer.addChild(slot);
            this.rackSlots.push(slot);
        }
    }

    /** Shaded rack ball: empty glass socket, or a lit ball (green = hit). */
    private drawRackOrb(orb: Graphics, state: 'empty' | 'hit' | 'miss'): void {
        orb.clear();
        if (state === 'empty') {
            orb.circle(0, 2, 29).fill({ color: 0x0c1426 })
                .circle(0, 2, 29).stroke({ width: 2.5, color: 0x3a5380, alpha: 0.8 })
                .ellipse(-8, -8, 9, 6).fill({ color: 0xffffff, alpha: 0.10 });
            return;
        }
        const body = state === 'hit' ? 0x00ff6a : 0xe8eef8;
        const rim = state === 'hit' ? 0x008844 : 0x8aa0bc;
        orb.circle(0, 4, 30).fill({ color: rim })
            .circle(0, 0, 29).fill({ color: body })
            .circle(-9, -10, 13).fill({ color: 0xffffff, alpha: 0.6 })
            .circle(-11, -12, 6).fill({ color: 0xffffff, alpha: 0.95 })
            .circle(0, 0, 30).stroke({ width: 2.5, color: state === 'hit' ? 0x005a2a : 0x46586f });
    }

    // --- effects ---------------------------------------------------------------------

    private sparkleBurst(x: number, y: number): void {
        for (let i = 0; i < 7; i++) {
            let s = this.sparkles.find((g) => !g.visible);
            if (!s) {
                s = new Graphics();
                s.blendMode = 'add';
                s.visible = false;
                this.fxLayer.addChild(s);
                this.sparkles.push(s);
            }
            const pts: number[] = [];
            const sr = 6 + Math.random() * 8;
            for (let k = 0; k < 8; k++) {
                const rad = k % 2 === 0 ? sr : sr * 0.4;
                const a = (Math.PI * k) / 4;
                pts.push(Math.cos(a) * rad, Math.sin(a) * rad);
            }
            s.clear().poly(pts).fill({ color: i % 2 === 0 ? 0x00ff6a : 0xffffff });
            s.position.set(x, y);
            s.alpha = 1;
            s.visible = true;
            const a = Math.random() * Math.PI * 2;
            const d = 40 + Math.random() * 70;
            gsap.killTweensOf(s);
            gsap.to(s, {
                x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, alpha: 0, rotation: 2,
                duration: 0.5 + Math.random() * 0.3, ease: 'power2.out',
                onComplete: () => { s.visible = false; },
            });
        }
    }

    /** Spawn a small glowing trail particle used for the ball flight arc. */
    private spawnTrailParticle(x: number, y: number, color: number): void {
        let s = this.sparkles.find((g) => !g.visible);
        if (!s) {
            s = new Graphics();
            s.blendMode = 'add';
            s.visible = false;
            this.fxLayer.addChild(s);
            this.sparkles.push(s);
        }
        const r = 3 + Math.random() * 7;
        s.clear()
            .circle(0, 0, r).fill({ color, alpha: 0.7 })
            .circle(0, 0, r * 0.4).fill({ color: 0xffffff, alpha: 0.5 });
        s.position.set(x + (Math.random() - 0.5) * 14, y + (Math.random() - 0.5) * 14);
        s.alpha = 1;
        s.visible = true;
        gsap.killTweensOf(s);
        gsap.to(s, {
            alpha: 0,
            duration: 0.25 + Math.random() * 0.2,
            ease: 'power2.out',
            onComplete: () => { s.visible = false; },
        });
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
                .ellipse(0, 0, size, size * 0.8).fill({ color: 0xffe066 })
                .ellipse(0, 0, size, size * 0.8).stroke({ width: 2, color: 0xcc8800 });
            c.position.set(x, y);
            c.alpha = 1;
            c.visible = true;
            const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.0;
            const speed = 260 + Math.random() * 360;
            gsap.killTweensOf(c);
            gsap.killTweensOf(c.scale);
            gsap.to(c, {
                x: x + Math.cos(a) * speed * 0.6,
                y: y + Math.sin(a) * speed * 0.6 + 420,
                alpha: 0,
                duration: 1.0 + Math.random() * 0.5,
                delay: Math.random() * 0.2,
                ease: 'power1.in',
                onComplete: () => { c.visible = false; },
            });
            gsap.to(c.scale, { x: 0.3, duration: 0.2, yoyo: true, repeat: 7, ease: 'sine.inOut' });
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

    private showBanner(msg: string, tint: number): void {
        this.banner.text = msg;
        this.banner.style.fill = tint;
        this.banner.style.stroke = { color: 0x0a0e2e, width: 12 };
        this.banner.style.dropShadow = { color: tint, blur: 30, distance: 0, alpha: 0.8, angle: Math.PI / 6 };
        this.banner.alpha = 1;
        this.banner.visible = true;
        gsap.killTweensOf(this.banner);
        gsap.killTweensOf(this.banner.scale);
        gsap.fromTo(this.banner.scale, { x: 0.3, y: 0.3 }, { x: 1, y: 1, duration: 0.45, ease: 'back.out(2.2)' });
        gsap.to(this.banner, { alpha: 0, duration: 0.5, delay: 1.6, onComplete: () => { this.banner.visible = false; } });
    }

    // --- presentation -----------------------------------------------------------------

    private buildBackground(): Container {
        const env = new Container();
        const W = GameConfig.width;
        const H = GameConfig.height;
        env.addChild(new Graphics().rect(0, 0, W, H).fill(new FillGradient({
            type: 'linear', start: { x: 0, y: 0 }, end: { x: 0, y: 1 }, textureSpace: 'local',
            colorStops: [{ offset: 0, color: 0x2a1a5e }, { offset: 0.55, color: 0x141c52 }, { offset: 1, color: 0x0a0e2e }],
        })));
        // Vivid colour washes — cyan around the machine, magenta on the right.
        const wash = (wx: number, wy: number, rad: number, rgba: string): void => {
            env.addChild(new Graphics().ellipse(wx, wy, rad, rad * 0.8).fill(new FillGradient({
                type: 'radial', center: { x: 0.5, y: 0.5 }, innerRadius: 0, outerCenter: { x: 0.5, y: 0.5 }, outerRadius: 0.5, textureSpace: 'local',
                colorStops: [{ offset: 0, color: rgba }, { offset: 1, color: 'rgba(0,0,0,0)' }],
            })));
        };
        wash(this.chamber.x, this.chamber.y, 520, 'rgba(40,180,255,0.30)');
        wash(1500, 300, 620, 'rgba(192,80,255,0.22)');
        wash(1000, 950, 700, 'rgba(40,220,140,0.14)');
        const stars = new Graphics();
        for (let i = 0; i < 110; i++) {
            stars.circle(Math.random() * W, Math.random() * H, Math.random() * 1.8 + 0.5)
                .fill({ color: [0x9fd8ff, 0xffd54f, 0xff8ad8][i % 3], alpha: Math.random() * 0.5 + 0.15 });
        }
        env.addChild(stars);

        const title = new Text({
            text: 'NEON KENO',
            style: {
                fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 46, fontWeight: '900', letterSpacing: 8,
                fill: 0x6fe9ff, stroke: { color: 0x07203a, width: 6 },
                dropShadow: { color: 0x26c6da, blur: 14, distance: 0, alpha: 0.8 },
            },
        });
        title.anchor.set(0, 0.5);
        title.position.set(44, 52);
        env.addChild(title);
        return env;
    }

    private createUI(): void {
        const H = GameConfig.height;
        const cx = 1758;

        this.banner = new Text({
            text: '',
            style: {
                fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 86, fontWeight: '900',
                fill: 0x00ff6a,
                stroke: { color: 0x0a0e2e, width: 12 },
                dropShadow: { color: 0x00ff6a, blur: 30, distance: 0, alpha: 0.8 },
            },
        });
        this.banner.anchor.set(0.5);
        const gridW = COLS * (this.tile + this.gap) - this.gap;
        this.banner.position.set(this.gridX + gridW / 2, 560);
        this.banner.visible = false;
        this.uiContainer.addChild(this.banner);

        this.infoText = new Text({
            text: '',
            style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 24, fontWeight: '900', letterSpacing: 2, fill: 0x8fb8d8 },
        });
        this.infoText.anchor.set(0.5);
        this.infoText.position.set(this.gridX + gridW / 2, this.gridY + 5 * (this.tile + this.gap) + 30);
        this.uiContainer.addChild(this.infoText);

        // Control panel.
        this.uiContainer.addChild(new Graphics()
            .roundRect(1618, 140, 280, 880, 26).fill({ color: 0x0c1220, alpha: 0.96 })
            .roundRect(1618, 140, 280, 880, 26).stroke({ width: 2, color: 0x2a3a5a })
            .roundRect(1628, 150, 260, 860, 20).stroke({ width: 1.5, color: 0x6fe9ff, alpha: 0.2 }));

        const section = (txt: string, y: number): void => {
            const t = new Text({ text: txt, style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 15, fontWeight: '900', letterSpacing: 2, fill: 0x5a7a9a } });
            t.anchor.set(0.5);
            t.position.set(cx, y);
            this.uiContainer.addChild(t);
        };
        const divider = (y: number): void => {
            this.uiContainer.addChild(new Graphics().moveTo(1650, y).lineTo(1866, y).stroke({ width: 1.5, color: 0x2a3a5a }));
        };

        section('NUMBERS', 196);
        const smallBtn = (label: string, dx: number, fn: () => void): void => {
            const b = new Graphics()
                .roundRect(-52, -22, 104, 44, 14).fill({ color: 0x14203a })
                .roundRect(-52, -22, 104, 44, 14).stroke({ width: 2, color: 0x3a5a8e });
            b.position.set(cx + dx, 248);
            b.eventMode = 'static';
            b.cursor = 'pointer';
            b.on('pointerdown', () => {
                gsap.fromTo(b.scale, { x: 0.9, y: 0.9 }, { x: 1, y: 1, duration: 0.25, ease: 'back.out(3)' });
                fn();
            });
            const t = new Text({ text: label, style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 16, fontWeight: '900', fill: 0x9fd8ff } });
            t.anchor.set(0.5);
            b.addChild(t);
            this.uiContainer.addChild(b);
        };
        smallBtn('QUICK', -62, () => this.quickPick());
        smallBtn('RESET', 62, () => this.clearPicks());

        divider(296);
        section('BET', 330);
        this.betValueText = new Text({ text: `$${gameStore.getState().bet}`, style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 32, fontWeight: '900', fill: 0xffffff } });
        this.betValueText.anchor.set(0.5);
        this.betValueText.position.set(cx, 382);
        this.uiContainer.addChild(this.betValueText);
        const stepBtn = (dx: number, glyph: string, dir: number): void => {
            const b = new Graphics()
                .circle(0, 0, 25).fill({ color: 0x14203a })
                .circle(0, 0, 25).stroke({ width: 2, color: 0x3a5a8e });
            b.position.set(cx + dx, 382);
            b.eventMode = 'static';
            b.cursor = 'pointer';
            b.on('pointerdown', () => {
                if (this.phase === 'drawing') return;
                gsap.fromTo(b.scale, { x: 0.85, y: 0.85 }, { x: 1, y: 1, duration: 0.25, ease: 'back.out(3)' });
                const state = gameStore.getState();
                const i = BET_STEPS.findIndex((v) => v >= state.bet);
                const next = BET_STEPS[Math.max(0, Math.min(BET_STEPS.length - 1, (i < 0 ? BET_STEPS.length - 1 : i) + dir))];
                state.setBet(next);
                this.betValueText.text = `$${next}`;
                this.refreshInfo();
            });
            const t = new Text({ text: glyph, style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 26, fontWeight: '900', fill: 0x9fd8ff } });
            t.anchor.set(0.5);
            b.addChild(t);
            this.uiContainer.addChild(b);
        };
        stepBtn(-80, '−', -1);
        stepBtn(80, '+', 1);

        divider(440);
        section('PAYTABLE · HITS → X', 474);
        for (let i = 0; i < 11; i++) {
            const t = new Text({ text: '', style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 16, fontWeight: '900', fill: 0x5a7a9a } });
            t.anchor.set(0.5);
            t.position.set(cx, 506 + i * 30);
            this.uiContainer.addChild(t);
            this.payRows.push(t);
        }

        // PLAY button.
        this.playButton = new Graphics();
        this.playButton.position.set(cx, 890);
        this.playButton.eventMode = 'static';
        this.playButton.cursor = 'pointer';
        this.playButton.on('pointerdown', () => {
            gsap.fromTo(this.playButton.scale, { x: 0.94, y: 0.94 }, { x: 1, y: 1, duration: 0.3, ease: 'back.out(3)' });
            this.play();
        });
        this.playLabel = new Text({ text: '', style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 30, fontWeight: '900', fill: 0xffffff } });
        this.playLabel.anchor.set(0.5);
        this.playLabel.position.set(0, -14);
        this.playSub = new Text({ text: '', style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 14, fontWeight: '900', fill: 0xffffff } });
        this.playSub.alpha = 0.85;
        this.playSub.anchor.set(0.5);
        this.playSub.position.set(0, 24);
        this.playButton.addChild(this.playLabel, this.playSub);
        this.uiContainer.addChild(this.playButton);
        this.stylePlay(0x0e7c8a, 0x6fe9ff, 'PLAY', '');

        this.balanceText = new Text({ text: '', style: { fontFamily: 'Arial, sans-serif', fontSize: 19, fontWeight: 'bold', fill: 0x9fd8ff } });
        this.balanceText.anchor.set(0.5);
        this.balanceText.position.set(cx, 985);
        this.uiContainer.addChild(this.balanceText);

        const back = new Text({ text: '‹ MENU', style: { fill: 0x6fe9ff, fontSize: 26, fontWeight: 'bold' } });
        back.position.set(44, 86);
        back.eventMode = 'static';
        back.cursor = 'pointer';
        back.on('pointerdown', () => SceneManager.switchScene(new MenuScene()));
        // (back-to-menu removed) this.uiContainer.addChild(back);

        const hint = new Text({ text: 'pick up to 10 numbers · 10 balls drawn · more hits, bigger pay (space to play)', style: { fill: 0x5a7a9a, fontSize: 18, fontStyle: 'italic' } });
        hint.anchor.set(0.5);
        hint.position.set(this.gridX + gridW / 2, H - 14);
        this.uiContainer.addChild(hint);

        const render = (s: ReturnType<typeof gameStore.getState>): void => {
            this.balanceText.text = `Balance  $${Math.round(s.balance * 100) / 100}`;
        };
        render(gameStore.getState());
        gameStore.subscribe(render);
    }

    private refreshInfo(): void {
        const state = gameStore.getState();
        this.infoText.text = this.picks.size === 0
            ? 'TAP NUMBERS TO PICK (UP TO 10)'
            : `${this.picks.size} PICKED  ·  BET $${state.bet}`;
        if (this.phase !== 'drawing') {
            this.stylePlay(this.picks.size > 0 ? 0x0e7c8a : 0x1a2438, 0x6fe9ff, 'PLAY', this.picks.size > 0 ? `${this.picks.size} picks · $${state.bet}` : 'pick numbers first');
        }
        // Paytable for the current pick count.
        const table = PAYTABLE[this.picks.size] ?? [];
        for (let i = 0; i < this.payRows.length; i++) {
            const row = this.payRows[i];
            if (i < table.length && table[i] > 0) {
                row.text = `${i} hits  →  ${table[i]}x`;
                row.style.fill = 0x9fd8ff;
            } else if (i < table.length) {
                row.text = `${i} hits  →  —`;
                row.style.fill = 0x3a4a6a;
            } else {
                row.text = '';
            }
        }
    }

    private stylePlay(fill: number, edge: number, label: string, sub: string): void {
        this.playButton.clear()
            .roundRect(-110, -52, 220, 104, 22).fill(fill)
            .roundRect(-110, -52, 220, 104, 22).stroke({ width: 3, color: edge });
        this.playLabel.text = label;
        this.playSub.text = sub;
        if (this.playSub.width > 200) this.playSub.scale.set(200 / this.playSub.width);
        else this.playSub.scale.set(1);
    }
}
