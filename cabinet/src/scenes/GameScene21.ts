import { Text, Container, Graphics, FillGradient } from 'pixi.js';
import { gsap } from 'gsap';
import { BaseScene } from './BaseScene';
import { GameConfig } from '../config/GameConfig';
import { gameStore } from '../state/GameState';
import { SceneManager } from '../managers/SceneManager';
import { MenuScene } from './MenuScene';

/**
 * GameScene21 — Slot 21: "Bingo Blitz"
 * -------------------------------------
 * A live 90-ball bingo room. Buy 1–4 tickets, then balls are drawn from the
 * blower one at a time — each rattles up the tube, flies to the caller's spot,
 * lights its number on the 1–90 board and auto-daubs every matching ticket
 * cell. Complete a row for ONE LINE, two rows for TWO LINES, all fifteen for
 * the FULL HOUSE jackpot.
 *
 * Heavy gsap presentation:
 *  - glass blower with churning balls; a called ball arcs out on a spring path
 *  - daub stamps pop onto cells; completed rows sweep with a highlight bar
 *  - decade-coloured balls + a live results board; tiered win banners
 *  - full-house confetti cannons + coin shower
 */

const COLS = 9;
const ROWS = 3;
const BET_STEPS = [1, 2, 5, 10, 20, 50, 100];
const BALL_CAP = 52;                       // safety cap on draws per round
const PLANT = 0.68;                         // demo: bias draws toward ticket numbers
/** Incremental pay (× stake/ticket) for reaching each milestone. */
const PAY = { line: 2, twoLine: 3, full: 45 } as const;

interface BCell {
    n: number | null;
    daubed: boolean;
    node: Container | null;
    stamp: Graphics | null;
}
interface Ticket {
    cells: BCell[][];        // [row][col]
    root: Container;
    rowBars: Graphics[];
    awarded: number;         // 0=none 1=line 2=two-lines 3=full house
}

const DECADE_COLORS = [0xff3a4a, 0xff8a2a, 0xffd23d, 0x4ade6a, 0x2ad8d8, 0x3a8aff, 0x9a4fff, 0xff5aa8, 0xffb02a];

export class GameScene21 extends BaseScene {
    private readonly bgLayer = new Container();
    private readonly boardLayer = new Container();
    private readonly cardLayer = new Container();
    private readonly fxLayer = new Container();
    private readonly uiContainer = new Container();

    private tickets: Ticket[] = [];
    private numCards = 2;
    private playing = false;
    private called = new Set<number>();
    private ballsDrawn = 0;
    private roundWin = 0;
    private drawTimer: gsap.core.Tween | null = null;
    private turbo = false;

    private boardCells = new Map<number, Graphics>();
    private ballNode!: Container;
    private ballGfx!: Graphics;
    private ballText!: Text;
    private blowerBalls: { g: Graphics; bx: number; by: number; ph: number }[] = [];
    private calledCountText!: Text;
    private banner!: Text;
    private playButton!: Graphics;
    private playLabel!: Text;
    private playSub!: Text;
    private balanceText!: Text;
    private lastWinText!: Text;
    private turboPill!: Graphics;
    private turboLabel!: Text;
    private elapsed = 0;
    private readonly coins: Graphics[] = [];
    private readonly confetti: Graphics[] = [];
    private readonly calls: gsap.core.Tween[] = [];

    private readonly onKeyDown = (e: KeyboardEvent): void => {
        if (e.code === 'Space') { e.preventDefault(); this.buyAndPlay(); }
        if (e.code === 'KeyT') this.toggleTurbo();
        // (back-to-menu removed) if (e.code === 'Escape') SceneManager.switchScene(new MenuScene());
    };

    public async init(): Promise<void> {
        this.addChild(this.bgLayer);
        this.addChild(this.boardLayer);
        this.addChild(this.cardLayer);
        this.addChild(this.fxLayer);
        this.addChild(this.uiContainer);

        this.buildRoom();
        this.buildBoard();
        this.buildBlower();
        this.createUI();
        this.dealTickets();
        window.addEventListener('keydown', this.onKeyDown);
    }

    public async start(): Promise<void> {}

    public update(delta: number): void {
        const dt = Math.min(delta / 60, 0.05);
        this.elapsed += dt;
        // Idle churn of the blower balls.
        for (const b of this.blowerBalls) {
            b.g.position.set(
                b.bx + Math.sin(this.elapsed * 2.4 + b.ph) * 12,
                b.by + Math.cos(this.elapsed * 3.1 + b.ph * 1.3) * 12,
            );
        }
    }

    public resize(_width: number, _height: number): void {}

    public override async destroyScene(): Promise<void> {
        window.removeEventListener('keydown', this.onKeyDown);
        this.drawTimer?.kill();
        for (const c of this.calls) c.kill();
        for (const g of [...this.coins, ...this.confetti, this.ballNode]) gsap.killTweensOf(g);
        gsap.killTweensOf(this.banner); gsap.killTweensOf(this.banner.scale);
        for (const t of this.tickets) for (const row of t.cells) for (const c of row) if (c.node) gsap.killTweensOf(c.node.scale);
        await super.destroyScene();
    }

    private d(s: number): number { return this.turbo ? s * 0.5 : s; }

    // --- tickets ---------------------------------------------------------------------

    private genTicket(): (number | null)[][] {
        const grid: (number | null)[][] = [[], [], []];
        for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) grid[r][c] = null;
        // Each row gets 5 distinct columns.
        const usedPerCol: number[][] = Array.from({ length: COLS }, () => []);
        for (let r = 0; r < ROWS; r++) {
            const colsPick = [...Array(COLS).keys()].sort(() => Math.random() - 0.5).slice(0, 5);
            for (const c of colsPick) usedPerCol[c].push(r);
        }
        // Assign numbers per column (distinct, in range), sorted top→bottom.
        for (let c = 0; c < COLS; c++) {
            const rowsHere = usedPerCol[c].sort((a, b) => a - b);
            if (rowsHere.length === 0) continue;
            const low = c === 0 ? 1 : c * 10;
            const high = c === 8 ? 90 : c * 10 + 9;
            const pool: number[] = [];
            for (let n = low; n <= high; n++) pool.push(n);
            for (let i = pool.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [pool[i], pool[j]] = [pool[j], pool[i]]; }
            const chosen = pool.slice(0, rowsHere.length).sort((a, b) => a - b);
            rowsHere.forEach((r, i) => { grid[r][c] = chosen[i]; });
        }
        return grid;
    }

    private dealTickets(): void {
        for (const t of this.tickets) t.root.destroy({ children: true });
        this.tickets = [];

        const n = this.numCards;
        // Layout: up to 2 columns of tickets in the lower play area.
        const cardW = 720;
        const cardH = 232;
        const gapX = 60;
        const gapY = 36;
        const perRow = n === 1 ? 1 : 2;
        const rowsN = Math.ceil(n / perRow);
        const totalW = perRow * cardW + (perRow - 1) * gapX;
        const startX = (1600 - totalW) / 2 + 20;
        const startY = 560 + (Math.max(0, 2 - rowsN)) * 60;

        for (let i = 0; i < n; i++) {
            const col = i % perRow;
            const row = (i / perRow) | 0;
            const x = startX + col * (cardW + gapX);
            const y = startY + row * (cardH + gapY);
            this.tickets.push(this.buildTicket(this.genTicket(), x, y, cardW, cardH));
        }
    }

    private buildTicket(grid: (number | null)[][], x: number, y: number, w: number, h: number): Ticket {
        const root = new Container();
        root.position.set(x, y);
        this.cardLayer.addChild(root);

        // Card body.
        root.addChild(new Graphics()
            .roundRect(0, 8, w, h, 20).fill({ color: 0x000000, alpha: 0.4 })
            .roundRect(0, 0, w, h, 20).fill(new FillGradient({
                type: 'linear', start: { x: 0, y: 0 }, end: { x: 0, y: 1 }, textureSpace: 'local',
                colorStops: [{ offset: 0, color: 0xfff6ec }, { offset: 1, color: 0xffe0c4 }],
            }))
            .roundRect(0, 0, w, h, 20).stroke({ width: 5, color: 0xff8a2a }));

        const padX = 16;
        const padY = 16;
        const cw = (w - padX * 2) / COLS;
        const chh = (h - padY * 2) / ROWS;

        const rowBars: Graphics[] = [];
        for (let r = 0; r < ROWS; r++) {
            const bar = new Graphics().roundRect(padX, padY + r * chh + 3, w - padX * 2, chh - 6, 10).fill({ color: 0x4ade6a });
            bar.alpha = 0;
            root.addChild(bar);
            rowBars.push(bar);
        }

        const cells: BCell[][] = [];
        for (let r = 0; r < ROWS; r++) {
            cells.push([]);
            for (let c = 0; c < COLS; c++) {
                const n = grid[r][c];
                const cellX = padX + c * cw;
                const cellY = padY + r * chh;
                // Cell frame.
                root.addChild(new Graphics()
                    .rect(cellX, cellY, cw, chh).stroke({ width: 1.5, color: 0xd9a06a, alpha: 0.6 })
                    .rect(cellX + 2, cellY + 2, cw - 4, chh - 4).fill({ color: n === null ? 0xe9c9a4 : 0xfffaf2, alpha: n === null ? 0.5 : 1 }));
                let node: Container | null = null;
                let stamp: Graphics | null = null;
                if (n !== null) {
                    node = new Container();
                    node.position.set(cellX + cw / 2, cellY + chh / 2);
                    const t = new Text({ text: `${n}`, style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: chh * 0.46, fontWeight: '900', fill: 0x3a1e08 } });
                    t.anchor.set(0.5);
                    stamp = new Graphics();
                    node.addChild(t, stamp);
                    root.addChild(node);
                }
                cells[r].push({ n, daubed: false, node, stamp });
            }
        }
        return { cells, root, rowBars, awarded: 0 };
    }

    // --- round flow ------------------------------------------------------------------

    private buyAndPlay(): void {
        if (this.playing) return;
        const state = gameStore.getState();
        const cost = state.bet * this.numCards;
        if (state.balance < cost) return;
        state.setBalance(Math.round((state.balance - cost) * 100) / 100);
        state.setWinAmount(0);

        this.dealTickets();
        this.called.clear();
        this.ballsDrawn = 0;
        this.roundWin = 0;
        this.playing = true;
        this.banner.visible = false;
        this.calledCountText.text = '0 / 90';
        for (const [, g] of this.boardCells) this.resetBoardCell(g);
        this.stylePlay();
        this.drawNext();
    }

    private drawNext(): void {
        if (!this.playing) return;
        if (this.ballsDrawn >= BALL_CAP || this.tickets.every((t) => t.awarded >= 3)) { this.endRound(); return; }

        const n = this.pickBall();
        if (n < 0) { this.endRound(); return; }
        this.called.add(n);
        this.ballsDrawn++;
        this.calledCountText.text = `${this.ballsDrawn} / 90`;
        this.animateBall(n);

        // Daub after the ball lands, then resolve, then schedule the next draw.
        this.calls.push(gsap.delayedCall(this.d(0.5), () => {
            this.daub(n);
            this.lightBoard(n);
            this.resolveWins();
            if (this.playing) this.drawTimer = gsap.delayedCall(this.d(0.45), () => this.drawNext());
        }));
    }

    /** Demo-biased draw: usually pull a number that's live on a ticket. */
    private pickBall(): number {
        const remaining: number[] = [];
        for (let i = 1; i <= 90; i++) if (!this.called.has(i)) remaining.push(i);
        if (remaining.length === 0) return -1;
        if (Math.random() < PLANT) {
            const live: number[] = [];
            for (const t of this.tickets) for (const row of t.cells) for (const c of row) if (c.n !== null && !c.daubed) live.push(c.n);
            if (live.length > 0) return live[(Math.random() * live.length) | 0];
        }
        return remaining[(Math.random() * remaining.length) | 0];
    }

    private daub(n: number): void {
        for (const t of this.tickets) {
            for (const row of t.cells) {
                for (const c of row) {
                    if (c.n !== n || c.daubed || !c.node || !c.stamp) continue;
                    c.daubed = true;
                    const col = DECADE_COLORS[Math.min(8, ((n - 1) / 10) | 0)];
                    const s = 26;
                    c.stamp.clear()
                        .circle(0, 0, s).fill({ color: col, alpha: 0.85 })
                        .circle(0, 0, s).stroke({ width: 3, color: 0xffffff, alpha: 0.9 });
                    gsap.killTweensOf(c.node.scale);
                    gsap.fromTo(c.node.scale, { x: 1.5, y: 1.5 }, { x: 1, y: 1, duration: this.d(0.3), ease: 'back.out(2.5)' });
                }
            }
        }
    }

    private resolveWins(): void {
        const bet = gameStore.getState().bet;
        for (const t of this.tickets) {
            let linesDone = 0;
            for (let r = 0; r < ROWS; r++) {
                const rowCells = t.cells[r].filter((c) => c.n !== null);
                if (rowCells.every((c) => c.daubed)) linesDone++;
            }
            const full = t.cells.every((row) => row.filter((c) => c.n !== null).every((c) => c.daubed));
            const level = full ? 3 : Math.min(2, linesDone);
            if (level <= t.awarded) continue;

            // Award each newly reached milestone.
            for (let lv = t.awarded + 1; lv <= level; lv++) {
                const pay = (lv === 1 ? PAY.line : lv === 2 ? PAY.twoLine : PAY.full) * bet;
                this.roundWin += pay;
                const fresh = gameStore.getState();
                fresh.setBalance(Math.round((fresh.balance + pay) * 100) / 100);
                fresh.setWinAmount(this.roundWin);
                this.lastWinText.text = `$${Math.round(this.roundWin)}`;
                gsap.fromTo(this.lastWinText.scale, { x: 1.3, y: 1.3 }, { x: 1, y: 1, duration: 0.3, ease: 'back.out(2)' });
                const label = lv === 1 ? 'ONE LINE!' : lv === 2 ? 'TWO LINES!' : 'FULL HOUSE!';
                const tint = lv === 3 ? 0xffd23d : lv === 2 ? 0x6fe9ff : 0x4ade6a;
                this.showBanner(`${label}  +$${Math.round(pay)}`, tint);
                if (lv === 3) { this.confettiBlast(50); this.coinShower(36); }
                this.flashRows(t);
            }
            t.awarded = level;
        }
    }

    private flashRows(t: Ticket): void {
        for (let r = 0; r < ROWS; r++) {
            const rowCells = t.cells[r].filter((c) => c.n !== null);
            if (rowCells.every((c) => c.daubed)) {
                const bar = t.rowBars[r];
                gsap.killTweensOf(bar);
                gsap.fromTo(bar, { alpha: 0.5 }, { alpha: 0, duration: 0.7, ease: 'power2.out' });
            }
        }
    }

    private endRound(): void {
        this.playing = false;
        this.drawTimer?.kill();
        this.stylePlay();
        if (this.roundWin > 0) this.showBanner(`ROUND WIN  $${Math.round(this.roundWin)}`, 0xffd23d);
        else this.showBanner('NO WIN — PLAY AGAIN', 0xaab4c4);
    }

    // --- ball animation --------------------------------------------------------------

    private animateBall(n: number): void {
        const col = DECADE_COLORS[Math.min(8, ((n - 1) / 10) | 0)];
        const start = { x: 1090, y: 560 };   // blower mouth
        const end = { x: 1090, y: 300 };     // caller spot
        this.drawBall(this.ballGfx, col);
        this.ballText.text = `${n}`;
        // Number sits on the white centre disc → always dark for contrast.
        this.ballText.style.fill = 0x1a1208;
        this.ballNode.position.set(start.x, start.y);
        this.ballNode.scale.set(0.5);
        this.ballNode.alpha = 1;
        gsap.killTweensOf(this.ballNode);
        gsap.killTweensOf(this.ballNode.scale);
        gsap.killTweensOf(this.ballNode.position);
        // Rattle up the tube then settle at the caller spot with a spring.
        gsap.timeline()
            .to(this.ballNode, { x: start.x, y: start.y - 120, duration: this.d(0.18), ease: 'power2.out' })
            .to(this.ballNode, { x: end.x, y: end.y, duration: this.d(0.34), ease: 'back.out(1.6)' })
            .add(() => {}, '>');
        gsap.to(this.ballNode.scale, { x: 1, y: 1, duration: this.d(0.5), ease: 'back.out(1.8)' });
        // Tiny wobble while it sits.
        gsap.to(this.ballNode, { rotation: 0.12, duration: this.d(0.5), yoyo: true, repeat: 1, ease: 'sine.inOut', delay: this.d(0.5) });
    }

    private drawBall(g: Graphics, color: number): void {
        const R = 56;
        g.clear()
            .circle(0, 6, R).fill({ color: 0x000000, alpha: 0.3 })
            .circle(0, 0, R).fill(new FillGradient({
                type: 'radial', center: { x: 0.38, y: 0.34 }, innerRadius: 0.05, outerCenter: { x: 0.5, y: 0.5 }, outerRadius: 0.6, textureSpace: 'local',
                colorStops: [{ offset: 0, color: this.lighten(color, 0.5) }, { offset: 0.6, color }, { offset: 1, color: this.darken(color, 0.35) }],
            }))
            .circle(0, 0, R).stroke({ width: 3, color: this.darken(color, 0.4) })
            .circle(0, 0, R * 0.62).fill({ color: 0xffffff, alpha: 0.92 })
            .ellipse(-R * 0.3, -R * 0.32, R * 0.22, R * 0.13).fill({ color: 0xffffff, alpha: 0.7 });
    }

    private lightBoard(n: number): void {
        const g = this.boardCells.get(n);
        if (!g) return;
        const col = DECADE_COLORS[Math.min(8, ((n - 1) / 10) | 0)];
        g.clear()
            .roundRect(0, 0, this.boardCellW, this.boardCellH, 6).fill({ color: col })
            .roundRect(0, 0, this.boardCellW, this.boardCellH, 6).stroke({ width: 2, color: 0xffffff, alpha: 0.8 });
        const lbl = g.children[0] as Text | undefined;
        if (lbl) lbl.style.fill = this.lumaDark(col) ? 0xffffff : 0x1a1208;
        gsap.fromTo(g.scale, { x: 1.4, y: 1.4 }, { x: 1, y: 1, duration: this.d(0.3), ease: 'back.out(2)' });
    }

    private resetBoardCell(g: Graphics): void {
        g.clear()
            .roundRect(0, 0, this.boardCellW, this.boardCellH, 6).fill({ color: 0x12203a })
            .roundRect(0, 0, this.boardCellW, this.boardCellH, 6).stroke({ width: 1.5, color: 0x2a4a6a });
        const lbl = g.children[0] as Text | undefined;
        if (lbl) lbl.style.fill = 0x6a8ab0;
    }

    // --- environment + board ---------------------------------------------------------

    private boardCellW = 0;
    private boardCellH = 0;

    private buildRoom(): void {
        const W = GameConfig.width;
        const H = GameConfig.height;
        this.bgLayer.addChild(new Graphics().rect(0, 0, W, H).fill(new FillGradient({
            type: 'linear', start: { x: 0, y: 0 }, end: { x: 0, y: 1 }, textureSpace: 'local',
            colorStops: [{ offset: 0, color: 0x141a3a }, { offset: 0.5, color: 0x0e1430 }, { offset: 1, color: 0x080a1c }],
        })));
        // Neon glow strips.
        const neon = new Graphics();
        neon.blendMode = 'add';
        for (let i = 0; i < 3; i++) neon.roundRect(60, 130 + i * 4, 760, 3, 2).fill({ color: 0xff8a2a, alpha: 0.2 });
        this.bgLayer.addChild(neon);

        const title = new Text({ text: 'BINGO BLITZ', style: {
            fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 46, fontWeight: '900', letterSpacing: 6,
            fill: 0xffd23d, stroke: { color: 0x2a1004, width: 7 },
            dropShadow: { color: 0xff5aa8, blur: 18, distance: 0, alpha: 0.6 },
        } });
        title.anchor.set(0, 0.5);
        title.position.set(60, 70);
        this.bgLayer.addChild(title);
    }

    private buildBoard(): void {
        // 1–90 results board: 15 columns × 6 rows.
        const cols = 15;
        const rows = 6;
        const bx = 60;
        const by = 150;
        const bw = 760;
        const gap = 4;
        this.boardCellW = (bw - gap * (cols - 1)) / cols;
        this.boardCellH = 44;

        this.boardLayer.addChild(new Graphics()
            .roundRect(bx - 14, by - 14, bw + 28, rows * (this.boardCellH + gap) - gap + 28, 16).fill({ color: 0x0a1124, alpha: 0.9 })
            .roundRect(bx - 14, by - 14, bw + 28, rows * (this.boardCellH + gap) - gap + 28, 16).stroke({ width: 3, color: 0x2a4a6a }));

        for (let i = 1; i <= 90; i++) {
            const idx = i - 1;
            const c = idx % cols;
            const r = (idx / cols) | 0;
            const g = new Graphics();
            g.position.set(bx + c * (this.boardCellW + gap), by + r * (this.boardCellH + gap));
            g.pivot.set(0, 0);
            const t = new Text({ text: `${i}`, style: { fontFamily: 'Arial, sans-serif', fontSize: 18, fontWeight: 'bold', fill: 0x6a8ab0 } });
            t.anchor.set(0.5);
            t.position.set(this.boardCellW / 2, this.boardCellH / 2);
            g.addChild(t);
            this.boardLayer.addChild(g);
            this.boardCells.set(i, g);
            this.resetBoardCell(g);
        }

        this.calledCountText = new Text({ text: '0 / 90', style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 22, fontWeight: '900', fill: 0xff8a2a } });
        this.calledCountText.anchor.set(1, 0.5);
        this.calledCountText.position.set(820, 80);
        this.boardLayer.addChild(this.calledCountText);
    }

    private buildBlower(): void {
        const cx = 1090;
        const cy = 560;
        // Glass dome.
        this.boardLayer.addChild(new Graphics()
            .circle(cx, cy, 150).fill({ color: 0x0a2a44, alpha: 0.5 })
            .circle(cx, cy, 150).stroke({ width: 6, color: 0xffd23d, alpha: 0.7 })
            .circle(cx, cy - 24, 120).fill({ color: 0xbfe8ff, alpha: 0.07 })
            .roundRect(cx - 26, cy - 220, 52, 90, 14).fill({ color: 0x1a3550 })   // tube
            .roundRect(cx - 26, cy - 220, 52, 90, 14).stroke({ width: 4, color: 0xffd23d, alpha: 0.7 })
            .ellipse(cx, cy + 120, 130, 30).fill({ color: 0x06182a, alpha: 0.6 }));
        // Churning balls inside.
        for (let i = 0; i < 12; i++) {
            const col = DECADE_COLORS[i % DECADE_COLORS.length];
            const g = new Graphics();
            this.drawBall(g, col);
            g.scale.set(0.34);
            const bx = cx + (Math.random() - 0.5) * 180;
            const by = cy + (Math.random() - 0.2) * 120;
            g.position.set(bx, by);
            this.boardLayer.addChild(g);
            this.blowerBalls.push({ g, bx, by, ph: Math.random() * Math.PI * 2 });
        }

        // Caller spot ring.
        this.boardLayer.addChild(new Graphics()
            .circle(cx, 300, 70).stroke({ width: 4, color: 0xff8a2a, alpha: 0.5 }));
        const callLabel = new Text({ text: 'NOW CALLING', style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 16, fontWeight: '900', letterSpacing: 3, fill: 0xff8a2a } });
        callLabel.anchor.set(0.5);
        callLabel.position.set(cx, 210);
        this.boardLayer.addChild(callLabel);

        // The called ball (front-most).
        this.ballNode = new Container();
        this.ballGfx = new Graphics();
        this.drawBall(this.ballGfx, 0xff3a4a);
        this.ballText = new Text({ text: '', style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 40, fontWeight: '900', fill: 0x1a1208 } });
        this.ballText.anchor.set(0.5);
        this.ballNode.addChild(this.ballGfx, this.ballText);
        this.ballNode.position.set(cx, 300);
        this.ballNode.alpha = 0;
        this.fxLayer.addChild(this.ballNode);
    }

    // --- UI --------------------------------------------------------------------------

    private createUI(): void {
        const cx = 1758;

        this.banner = new Text({ text: '', style: {
            fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 70, fontWeight: '900',
            fill: 0xffd23d, stroke: { color: 0x2a1004, width: 11 },
        } });
        this.banner.anchor.set(0.5);
        this.banner.position.set(800, 470);
        this.banner.visible = false;
        this.uiContainer.addChild(this.banner);

        this.uiContainer.addChild(new Graphics()
            .roundRect(1618, 140, 280, 880, 26).fill({ color: 0x0e1330, alpha: 0.96 })
            .roundRect(1618, 140, 280, 880, 26).stroke({ width: 3, color: 0x3a4a8a })
            .roundRect(1628, 150, 260, 860, 20).stroke({ width: 1.5, color: 0xffd23d, alpha: 0.3 }));

        const section = (txt: string, y: number): void => {
            const t = new Text({ text: txt, style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 16, fontWeight: '900', letterSpacing: 3, fill: 0x8a9ad8 } });
            t.anchor.set(0.5); t.position.set(cx, y); this.uiContainer.addChild(t);
        };
        const stepper = (y: number, get: () => string, dir: (d: number) => void): void => {
            const value = new Text({ text: get(), style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 34, fontWeight: '900', fill: 0xffffff } });
            value.anchor.set(0.5); value.position.set(cx, y); this.uiContainer.addChild(value);
            const mk = (dx: number, glyph: string, d: number): void => {
                const b = new Graphics().circle(0, 0, 26).fill({ color: 0x1c2448 }).circle(0, 0, 26).stroke({ width: 2, color: 0x3a4a8a });
                b.position.set(cx + dx, y); b.eventMode = 'static'; b.cursor = 'pointer';
                b.on('pointerdown', () => { if (this.playing) return; gsap.fromTo(b.scale, { x: 0.85, y: 0.85 }, { x: 1, y: 1, duration: 0.25, ease: 'back.out(3)' }); dir(d); value.text = get(); });
                const t = new Text({ text: glyph, style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 28, fontWeight: '900', fill: 0x8fb0ff } });
                t.anchor.set(0.5); b.addChild(t); this.uiContainer.addChild(b);
            };
            mk(-80, '−', -1); mk(80, '+', 1);
        };

        section('STAKE / TICKET', 196);
        stepper(250, () => `$${gameStore.getState().bet}`, (d) => {
            const s = gameStore.getState();
            const i = BET_STEPS.findIndex((v) => v >= s.bet);
            s.setBet(BET_STEPS[Math.max(0, Math.min(BET_STEPS.length - 1, (i < 0 ? BET_STEPS.length - 1 : i) + d))]);
            this.refreshPlaySub();
        });
        section('TICKETS', 320);
        stepper(374, () => `${this.numCards}`, (d) => { this.numCards = Math.max(1, Math.min(4, this.numCards + d)); this.dealTickets(); this.refreshPlaySub(); });

        // PLAY.
        this.playButton = new Graphics();
        this.playButton.position.set(cx, 500);
        this.playButton.eventMode = 'static'; this.playButton.cursor = 'pointer';
        this.playButton.on('pointerdown', () => { gsap.fromTo(this.playButton.scale, { x: 0.94, y: 0.94 }, { x: 1, y: 1, duration: 0.3, ease: 'back.out(3)' }); this.buyAndPlay(); });
        this.playLabel = new Text({ text: '', style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 32, fontWeight: '900', fill: 0xffffff } });
        this.playLabel.anchor.set(0.5); this.playLabel.position.set(0, -14);
        this.playSub = new Text({ text: '', style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 15, fontWeight: '900', fill: 0xffffff } });
        this.playSub.alpha = 0.85; this.playSub.anchor.set(0.5); this.playSub.position.set(0, 24);
        this.playButton.addChild(this.playLabel, this.playSub);
        this.uiContainer.addChild(this.playButton);
        this.stylePlay();

        // TURBO.
        section('TURBO', 620);
        this.turboPill = new Graphics();
        this.turboPill.position.set(cx, 676);
        this.turboPill.eventMode = 'static'; this.turboPill.cursor = 'pointer';
        this.turboLabel = new Text({ text: '', style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 22, fontWeight: '900', fill: 0xffffff } });
        this.turboLabel.anchor.set(0.5); this.turboPill.addChild(this.turboLabel);
        this.turboPill.on('pointerdown', () => this.toggleTurbo());
        this.uiContainer.addChild(this.turboPill);
        this.styleTurbo();

        // Pay table.
        section('PAYS  (× stake)', 760);
        const pays = new Text({ text: `ONE LINE   ×${PAY.line}\nTWO LINES   ×${PAY.line + PAY.twoLine}\nFULL HOUSE   ×${PAY.line + PAY.twoLine + PAY.full}`, style: { fontFamily: 'Arial, sans-serif', fontSize: 18, fontWeight: 'bold', fill: 0xaab8e8, align: 'center', lineHeight: 28 } });
        pays.anchor.set(0.5); pays.position.set(cx, 818);
        this.uiContainer.addChild(pays);

        section('LAST WIN', 890);
        this.lastWinText = new Text({ text: '$0', style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 36, fontWeight: '900', fill: 0xffd23d } });
        this.lastWinText.anchor.set(0.5); this.lastWinText.position.set(cx, 932);
        this.uiContainer.addChild(this.lastWinText);

        this.balanceText = new Text({ text: '', style: { fontFamily: 'Arial, sans-serif', fontSize: 20, fontWeight: 'bold', fill: 0x8fb0ff } });
        this.balanceText.anchor.set(0.5); this.balanceText.position.set(cx, 988);
        this.uiContainer.addChild(this.balanceText);

        const back = new Text({ text: '‹ MENU', style: { fill: 0xffd23d, fontSize: 26, fontWeight: 'bold' } });
        back.position.set(60, 116); back.eventMode = 'static'; back.cursor = 'pointer';
        back.on('pointerdown', () => SceneManager.switchScene(new MenuScene()));
        // (back-to-menu removed) this.uiContainer.addChild(back);

        const render = (s: ReturnType<typeof gameStore.getState>): void => {
            this.balanceText.text = `Balance  $${Math.round(s.balance * 100) / 100}`;
        };
        render(gameStore.getState());
        gameStore.subscribe(render);
    }

    private refreshPlaySub(): void {
        if (!this.playing) this.playSub.text = `$${gameStore.getState().bet * this.numCards} · ${this.numCards} card${this.numCards > 1 ? 's' : ''}`;
    }

    private stylePlay(): void {
        const ready = !this.playing;
        this.playButton.clear()
            .roundRect(-112, -52, 224, 104, 24).fill(ready ? 0xe06a14 : 0x4a2a10)
            .roundRect(-112, -52, 224, 104, 24).stroke({ width: 3, color: ready ? 0xffb02a : 0x6a4a1a });
        this.playLabel.text = ready ? 'BUY & PLAY' : 'CALLING…';
        this.refreshPlaySub();
        this.playButton.cursor = ready ? 'pointer' : 'default';
    }

    private toggleTurbo(): void { this.turbo = !this.turbo; this.styleTurbo(); }
    private styleTurbo(): void {
        const on = this.turbo;
        this.turboPill.clear()
            .roundRect(-86, -28, 172, 56, 28).fill({ color: on ? 0xe06a14 : 0x1c2448 })
            .roundRect(-86, -28, 172, 56, 28).stroke({ width: 3, color: on ? 0xffb02a : 0x3a4a8a });
        this.turboLabel.text = on ? 'TURBO ON' : 'TURBO OFF';
    }

    private showBanner(msg: string, tint: number): void {
        this.banner.text = msg;
        this.banner.style.fill = tint;
        this.banner.style.dropShadow = { color: tint, blur: 24, distance: 0, alpha: 0.85, angle: Math.PI / 6 };
        this.banner.alpha = 1; this.banner.visible = true;
        gsap.killTweensOf(this.banner); gsap.killTweensOf(this.banner.scale);
        gsap.fromTo(this.banner.scale, { x: 0.3, y: 0.3 }, { x: 1, y: 1, duration: 0.45, ease: 'back.out(2.2)' });
        gsap.to(this.banner, { alpha: 0, duration: 0.5, delay: 1.6, onComplete: () => { this.banner.visible = false; } });
    }

    // --- fx --------------------------------------------------------------------------

    private coinShower(count: number): void {
        for (let i = 0; i < count; i++) {
            let c = this.coins.find((g) => !g.visible);
            if (!c) { c = new Graphics(); c.visible = false; this.fxLayer.addChild(c); this.coins.push(c); }
            const size = 8 + Math.random() * 9;
            c.clear().ellipse(0, 0, size, size * 0.78).fill({ color: 0xffd54f }).ellipse(0, 0, size, size * 0.78).stroke({ width: 2, color: 0x8a6512 }).ellipse(-size * 0.3, -size * 0.25, size * 0.3, size * 0.18).fill({ color: 0xfff6cf, alpha: 0.9 });
            const sx = Math.random() * 1600;
            c.position.set(sx, -40); c.alpha = 1; c.scale.set(1); c.visible = true;
            gsap.killTweensOf(c); gsap.killTweensOf(c.scale);
            gsap.to(c, { y: GameConfig.height + 60, x: sx + (Math.random() - 0.5) * 160, rotation: (Math.random() - 0.5) * 8, duration: 1.4 + Math.random(), delay: Math.random() * 0.5, ease: 'power1.in', onComplete: () => { c.visible = false; } });
            gsap.to(c.scale, { x: 0.25, duration: 0.22, yoyo: true, repeat: 9, ease: 'sine.inOut' });
        }
    }

    private confettiBlast(count: number): void {
        const colors = [0xff2d55, 0xff9234, 0xffd23d, 0x4ade6a, 0x3aa8ff, 0x9a4fff, 0xff5aa8];
        for (let i = 0; i < count; i++) {
            let p = this.confetti.find((g) => !g.visible);
            if (!p) { p = new Graphics(); p.visible = false; this.fxLayer.addChild(p); this.confetti.push(p); }
            p.clear().roundRect(-7, -4, 14, 8, 2).fill({ color: colors[(Math.random() * colors.length) | 0] });
            const fromLeft = i % 2 === 0;
            p.position.set(fromLeft ? -10 : 1600, GameConfig.height * (0.5 + Math.random() * 0.3));
            p.rotation = Math.random() * Math.PI; p.alpha = 1; p.visible = true;
            const tx = fromLeft ? 400 + Math.random() * 700 : 500 + Math.random() * 700;
            gsap.killTweensOf(p);
            gsap.timeline({ onComplete: () => { p.visible = false; } })
                .to(p, { x: tx, y: GameConfig.height * (0.15 + Math.random() * 0.25), rotation: p.rotation + 5, duration: 0.6, ease: 'power2.out' })
                .to(p, { y: GameConfig.height + 30, rotation: p.rotation + 11, alpha: 0.85, duration: 1.1, ease: 'power1.in' });
        }
    }

    // --- colour helpers --------------------------------------------------------------
    private lighten(c: number, t: number): number { const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255; return ((r + (255 - r) * t) | 0) << 16 | ((g + (255 - g) * t) | 0) << 8 | ((b + (255 - b) * t) | 0); }
    private darken(c: number, t: number): number { const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255; return ((r * (1 - t)) | 0) << 16 | ((g * (1 - t)) | 0) << 8 | ((b * (1 - t)) | 0); }
    private lumaDark(c: number): boolean { const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255; return (0.299 * r + 0.587 * g + 0.114 * b) < 150; }
}
