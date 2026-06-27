import { Text, Container, Graphics, Sprite, FillGradient } from 'pixi.js';
import { gsap } from 'gsap';
import { BaseScene } from './BaseScene';
import { GameConfig } from '../config/GameConfig';
import { gameStore } from '../state/GameState';
import { SceneManager } from '../managers/SceneManager';
import { AssetManager } from '../managers/AssetManager';
import { SymbolTextureRegistry } from '../reels/Symbol';
import { drawCandy } from '../reels/SymbolArtCandy';
import { CANDY_SYMBOLS, SCATTER_PAYS, BOMB_VALUES, candy, clusterPay, rollCandy } from '../game/CandySymbols';
import { MenuScene } from './MenuScene';

/**
 * GameScene15 — Slot 15: "Sugar Storm"
 * -------------------------------------
 * Premium scatter-pays candy slot — the Sweet-Bonanza machine class. NO
 * paylines and NO spinning reels: candies physically DROP into a 6×5 grid;
 * 8+ matching anywhere pay, explode, and the grid tumbles until the chain
 * dies. 4+ lollipop scatters trigger 10 FREE SPINS where rainbow bombs land
 * carrying 2×–100× multipliers applied to the whole spin. BUY FEATURE and
 * TURBO included.
 *
 * The presentation layer is built from scratch for this game — nothing is
 * shared with the reel-engine slots:
 *  - per-candy gravity drops with squash-and-stretch landings + idle jelly wobble
 *  - winners pulse in sync, then burst into candy-coloured particle showers
 *  - floating "+$" counters, full-screen tiered win takeovers with confetti
 *    cannons and rainbow shockwaves
 *  - parallax candyland: drifting clouds, rotating sun rays, falling sprinkles,
 *    frosting hills and lollipop trees
 */

const COLS = 6;
const ROWS = 5;
const SW = 150;
const SH = 150;
const GAP = 8;
const VW = COLS * (SW + GAP) - GAP;
const VH = ROWS * (SH + GAP) - GAP;
const GX = 320;
const GY = 168;

const FREE_SPINS = 10;
const RETRIGGER = 5;
const BUY_COST = 100; // × bet
const BET_STEPS = [1, 2, 5, 10, 20, 50, 100];

interface CellNode {
    id: string;
    node: Container;
    bombValue: number; // 0 unless a rainbow bomb
}

export class GameScene15 extends BaseScene {
    private readonly skyLayer = new Container();
    private readonly candyLayer = new Container();
    private readonly fxLayer = new Container();
    private readonly uiContainer = new Container();
    private readonly takeover = new Container(); // full-screen win/bonus overlays

    private grid: (CellNode | null)[][] = [];

    private busy = false;
    private turbo = false;
    private bonusActive = false;
    private spinsLeft = 0;
    private bonusTotal = 0;

    // ambient state
    private elapsed = 0;
    private clouds: { node: Graphics; speed: number }[] = [];
    private sunRays!: Graphics;
    private sprinkles!: Graphics;
    private readonly motes: { x: number; y: number; r: number; vy: number; tint: number; phase: number }[] = [];

    // pooled fx
    private readonly burstPool: Graphics[] = [];
    private readonly confettiPool: Graphics[] = [];
    private readonly ringPool: Graphics[] = [];
    private readonly floatPool: Text[] = [];

    private winPlaque!: Container;
    private winPlaqueText!: Text;
    private bonusBar!: Text;
    private vignette!: Graphics;
    private takeoverText!: Text;
    private takeoverSub!: Text;
    private turboLabel!: Text;
    private turboPill!: Graphics;
    private betValueText!: Text;
    private balanceText!: Text;
    private readonly calls: gsap.core.Tween[] = [];

    private readonly onKeyDown = (e: KeyboardEvent): void => {
        if (e.code === 'Space') { e.preventDefault(); void this.spin(false); }
        if (e.code === 'KeyT') this.toggleTurbo();
        if (e.code === 'KeyB') void this.spin(true);
        // (back-to-menu removed) if (e.code === 'Escape') SceneManager.switchScene(new MenuScene());
    };

    public async init(): Promise<void> {
        const renderer = SceneManager.application.renderer;

        // Candy textures: transparent shaped sprites, not tiles.
        for (const [id, texture] of AssetManager.preloadedSymbols) SymbolTextureRegistry.register(id, texture);
        const defs = CANDY_SYMBOLS.map(({ id, name, color, accent, emblem }) => ({ id, name, color, accent, emblem, label: '', tier: 1 }));
        SymbolTextureRegistry.build(renderer, defs, SW, SH, drawCandy);

        this.addChild(this.skyLayer);
        this.buildCandyland();

        this.candyLayer.position.set(GX, GY);
        this.fxLayer.position.set(GX, GY);
        this.addChild(this.candyLayer);
        this.addChild(this.fxLayer);
        this.addChild(this.uiContainer);
        this.addChild(this.takeover);
        this.createUI();
        this.buildTakeover();

        for (let c = 0; c < COLS; c++) this.grid.push(new Array<CellNode | null>(ROWS).fill(null));
        await this.dropBoard(this.makeBoard(false));

        window.addEventListener('keydown', this.onKeyDown);
    }

    public async start(): Promise<void> {}

    public update(delta: number): void {
        const dt = Math.min(delta / 60, 0.05);
        this.elapsed += dt;

        // Parallax clouds + sun rays + falling sprinkles.
        for (const c of this.clouds) {
            c.node.x += c.speed * dt;
            if (c.node.x > GameConfig.width + 200) c.node.x = -260;
        }
        if (this.sunRays) this.sunRays.rotation += dt * 0.12;
        if (this.sprinkles) {
            this.sprinkles.clear();
            for (const m of this.motes) {
                m.y += m.vy * dt;
                const x = m.x + Math.sin(this.elapsed * 1.4 + m.phase) * 14;
                if (m.y > GameConfig.height + 8) { m.y = -8; m.x = Math.random() * GameConfig.width; }
                this.sprinkles.roundRect(x, m.y, m.r * 3, m.r, m.r * 0.5).fill({ color: m.tint, alpha: 0.7 });
            }
        }
    }

    public resize(_width: number, _height: number): void {}

    public override async destroyScene(): Promise<void> {
        window.removeEventListener('keydown', this.onKeyDown);
        for (const call of this.calls) call.kill();
        for (const col of this.grid) {
            for (const cell of col) {
                if (cell) { gsap.killTweensOf(cell.node); gsap.killTweensOf(cell.node.scale); }
            }
        }
        for (const pool of [this.burstPool, this.confettiPool, this.ringPool]) {
            for (const g of pool) { gsap.killTweensOf(g); gsap.killTweensOf(g.scale); }
        }
        for (const t of this.floatPool) gsap.killTweensOf(t);
        gsap.killTweensOf(this.vignette);
        gsap.killTweensOf(this.takeoverText.scale);
        gsap.killTweensOf(this.winPlaque);
        gsap.killTweensOf(this.winPlaque.scale);
        await super.destroyScene();
    }

    // --- timing helpers ------------------------------------------------------

    /** Turbo halves every animation. */
    private d(sec: number): number {
        return this.turbo ? sec * 0.5 : sec;
    }

    private wait(sec: number): Promise<void> {
        return new Promise((res) => { this.calls.push(gsap.delayedCall(sec, () => res())); });
    }

    /** Like wait(), but a tap on the takeover overlay ends it early. */
    private skipResolve: (() => void) | null = null;
    private waitSkippable(sec: number): Promise<void> {
        return new Promise((res) => {
            const call = gsap.delayedCall(sec, () => finish());
            const finish = (): void => {
                if (this.skipResolve === null) return;
                this.skipResolve = null;
                call.kill();
                res();
            };
            this.calls.push(call);
            this.skipResolve = finish;
        });
    }

    // --- board logic -----------------------------------------------------------

    private makeBoard(bonus: boolean, forceTrigger = false): string[][] {
        const board: string[][] = [];
        for (let c = 0; c < COLS; c++) {
            const col: string[] = [];
            for (let r = 0; r < ROWS; r++) col.push(rollCandy(bonus));
            board.push(col);
        }
        // DEMO ONLY: lift the hit-rate so the chain + bonus show often.
        if (Math.random() < (bonus ? 0.28 : 0.4)) {
            const pool = CANDY_SYMBOLS.filter((s) => s.kind === 'candy');
            const id = pool[(Math.random() * pool.length) | 0].id;
            const n = 8 + ((Math.random() * 4) | 0);
            const cells = new Set<number>();
            while (cells.size < n) cells.add((Math.random() * COLS * ROWS) | 0);
            for (const i of cells) board[(i / ROWS) | 0][i % ROWS] = id;
        }
        if (forceTrigger || (!bonus && Math.random() < 0.12)) {
            const cells = new Set<number>();
            while (cells.size < 4) cells.add((Math.random() * COLS * ROWS) | 0);
            for (const i of cells) board[(i / ROWS) | 0][i % ROWS] = 'c_pop';
        }
        return board;
    }

    private cellPos(col: number, row: number): { x: number; y: number } {
        return { x: col * (SW + GAP) + SW / 2, y: row * (SH + GAP) + SH / 2 };
    }

    /** Build one candy display node (sprite + bomb value badge + idle wobble). */
    private spawnNode(id: string): CellNode {
        const node = new Container();
        const sprite = new Sprite(SymbolTextureRegistry.get(id));
        sprite.anchor.set(0.5);
        sprite.width = SW;
        sprite.height = SH;
        node.addChild(sprite);

        let bombValue = 0;
        if (id === 'c_bomb') {
            bombValue = BOMB_VALUES[(Math.random() * BOMB_VALUES.length) | 0];
            const badge = new Text({ text: `x${bombValue}`, style: {
                fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 44, fontWeight: '900',
                fill: 0xffffff, stroke: { color: 0x3a1040, width: 7 },
                dropShadow: { color: 0x000000, blur: 4, distance: 2, alpha: 0.5 },
            } });
            badge.anchor.set(0.5);
            node.addChild(badge);
        }

        // Idle jelly wobble — every candy breathes a little, out of phase.
        gsap.to(node, {
            rotation: (Math.random() < 0.5 ? 1 : -1) * (0.035 + Math.random() * 0.03),
            duration: 1.4 + Math.random() * 1.2,
            yoyo: true, repeat: -1, ease: 'sine.inOut', delay: Math.random() * 1.5,
        });
        this.candyLayer.addChild(node);
        return { id, node, bombValue };
    }

    private killNode(cell: CellNode): void {
        gsap.killTweensOf(cell.node);
        gsap.killTweensOf(cell.node.scale);
        cell.node.destroy({ children: true });
    }

    /** Gravity drop of a full board: column stagger, bounce, squash on landing. */
    private async dropBoard(board: string[][]): Promise<void> {
        let maxEnd = 0;
        for (let c = 0; c < COLS; c++) {
            for (let r = ROWS - 1; r >= 0; r--) {
                const cell = this.spawnNode(board[c][r]);
                this.grid[c][r] = cell;
                const { x, y } = this.cellPos(c, r);
                const delay = this.d(c * 0.06 + (ROWS - 1 - r) * 0.05);
                const dur = this.d(0.5);
                cell.node.position.set(x, y - VH - 260 - Math.random() * 120);
                gsap.to(cell.node, { y, duration: dur, delay, ease: 'bounce.out' });
                // Squash-and-stretch on touchdown.
                gsap.timeline({ delay: delay + dur * 0.62 })
                    .to(cell.node.scale, { x: 1.16, y: 0.8, duration: this.d(0.08), ease: 'power2.out' })
                    .to(cell.node.scale, { x: 1, y: 1, duration: this.d(0.34), ease: 'elastic.out(1.4, 0.5)' });
                maxEnd = Math.max(maxEnd, delay + dur + this.d(0.3));
            }
        }
        await this.wait(maxEnd);
    }

    /** Throw the whole board off the bottom of the screen. */
    private async flingBoard(): Promise<void> {
        let any = false;
        for (let c = 0; c < COLS; c++) {
            for (let r = 0; r < ROWS; r++) {
                const cell = this.grid[c][r];
                if (!cell) continue;
                any = true;
                this.grid[c][r] = null;
                gsap.killTweensOf(cell.node);
                gsap.to(cell.node, {
                    y: cell.node.y + VH + 420,
                    rotation: (Math.random() - 0.5) * 1.6,
                    alpha: 0.9,
                    duration: this.d(0.42),
                    delay: this.d(c * 0.04),
                    ease: 'back.in(1.1)',
                    onComplete: () => cell.node.destroy({ children: true }),
                });
            }
        }
        if (any) await this.wait(this.d(0.42 + 0.04 * COLS) + 0.05);
    }

    // --- spin flow ---------------------------------------------------------------

    private async spin(buy: boolean): Promise<void> {
        // NOTE: zustand snapshots go stale after set() — always re-getState()
        // around every mutation, never cache across awaits.
        const state = gameStore.getState();
        if (this.busy || this.bonusActive) return;
        const cost = buy ? state.bet * BUY_COST : state.bet;
        if (state.balance < cost) return;
        this.busy = true;
        state.setBalance(state.balance - cost);
        state.setSpinning(true);
        state.setWinAmount(0);
        this.hidePlaque();

        await this.flingBoard();
        await this.dropBoard(this.makeBoard(false, buy));
        const win = await this.resolveTumbles(false);

        if (win > 0) {
            const fresh = gameStore.getState();
            fresh.setWinAmount(Math.round(win));
            fresh.setBalance(fresh.balance + Math.round(win));
            await this.celebrate(win, false);
        }

        if (this.countOnGrid('c_pop') >= 4) {
            await this.runBonus();
        }

        gameStore.getState().setSpinning(false);
        this.busy = false;
    }

    /** Pop clusters and tumble until the chain dies. Returns the total win. */
    private async resolveTumbles(bonus: boolean): Promise<number> {
        const bet = gameStore.getState().bet; // bet is locked while busy
        let total = 0;
        let scatterPaid = false;
        let chains = 0;

        // Chain cap guarantees a spin always terminates promptly.
        while (chains++ < 12) {
            // Group paying candies by id.
            const groups = new Map<string, { col: number; row: number }[]>();
            for (let c = 0; c < COLS; c++) {
                for (let r = 0; r < ROWS; r++) {
                    const cell = this.grid[c][r];
                    if (!cell || candy(cell.id).kind !== 'candy') continue;
                    groups.set(cell.id, [...(groups.get(cell.id) ?? []), { col: c, row: r }]);
                }
            }
            const winners = [...groups.entries()].filter(([id, cells]) => clusterPay(id, cells.length) > 0);

            // Scatter pay rides on the first evaluation only.
            if (!scatterPaid) {
                scatterPaid = true;
                const pops = this.countOnGrid('c_pop');
                if (pops >= 4) {
                    const pay = SCATTER_PAYS[Math.min(pops - 4, 2)] * bet;
                    total += pay;
                    this.floatText(`+$${Math.round(pay)}`, VW / 2, VH / 2, 0xff4fa0);
                }
            }

            if (winners.length === 0) break;

            // 1) Pulse every winner in sync.
            for (const [, cells] of winners) {
                for (const { col, row } of cells) {
                    const cell = this.grid[col][row];
                    if (!cell) continue;
                    gsap.to(cell.node.scale, { x: 1.18, y: 1.18, duration: this.d(0.16), yoyo: true, repeat: 1, ease: 'sine.inOut' });
                }
            }
            await this.wait(this.d(0.36));

            // 2) Explode them into candy-coloured bursts + float the pay.
            for (const [id, cells] of winners) {
                const pay = clusterPay(id, cells.length) * bet;
                total += pay;
                let cxSum = 0;
                let cySum = 0;
                for (const { col, row } of cells) {
                    const cell = this.grid[col][row];
                    if (!cell) continue;
                    const p = this.cellPos(col, row);
                    cxSum += p.x;
                    cySum += p.y;
                    this.burstAt(p.x, p.y, candy(id).color);
                    gsap.killTweensOf(cell.node.scale);
                    gsap.to(cell.node.scale, { x: 0, y: 0, duration: this.d(0.18), ease: 'back.in(2)' });
                    const doomed = cell;
                    this.calls.push(gsap.delayedCall(this.d(0.2), () => this.killNode(doomed)));
                    this.grid[col][row] = null;
                }
                this.floatText(`+$${Math.round(pay * 100) / 100}`, cxSum / cells.length, cySum / cells.length, candy(id).color);
            }
            this.microShake();
            await this.wait(this.d(0.3));

            // 3) Tumble: survivors fall, fresh candies rain in from the top.
            await this.tumbleFall(bonus);
        }

        // Rainbow bombs multiply the whole spin (free spins only).
        if (bonus && total > 0) {
            const bombs: CellNode[] = [];
            for (const col of this.grid) for (const cell of col) if (cell && cell.bombValue > 0) bombs.push(cell);
            if (bombs.length > 0) {
                let mult = 0;
                for (const bomb of bombs) {
                    mult += bomb.bombValue;
                    gsap.fromTo(bomb.node.scale, { x: 1.45, y: 1.45 }, { x: 1, y: 1, duration: this.d(0.4), ease: 'elastic.out(1.2, 0.5)' });
                    this.ringAt(bomb.node.x, bomb.node.y, 0xffffff);
                    this.floatText(`x${bomb.bombValue}`, bomb.node.x, bomb.node.y - 40, 0xffffff);
                    await this.wait(this.d(0.3));
                }
                this.floatText(`TOTAL x${mult}`, VW / 2, VH / 2 - 60, 0xffd23d);
                await this.wait(this.d(0.5));
                total *= mult;
            }
        }
        return total;
    }

    /** Drop survivors into the gaps and refill from above. */
    private async tumbleFall(bonus: boolean): Promise<void> {
        let maxEnd = 0;
        for (let c = 0; c < COLS; c++) {
            const survivors: CellNode[] = [];
            for (let r = ROWS - 1; r >= 0; r--) {
                const cell = this.grid[c][r];
                if (cell) survivors.push(cell);
            }
            const missing = ROWS - survivors.length;
            const next: (CellNode | null)[] = new Array(ROWS).fill(null);

            survivors.forEach((cell, i) => {
                const row = ROWS - 1 - i;
                next[row] = cell;
                const { y } = this.cellPos(c, row);
                if (Math.abs(cell.node.y - y) > 1) {
                    const dur = this.d(0.4);
                    gsap.to(cell.node, { y, duration: dur, ease: 'bounce.out' });
                    maxEnd = Math.max(maxEnd, dur);
                }
            });
            for (let i = 0; i < missing; i++) {
                const row = missing - 1 - i;
                const cell = this.spawnNode(rollCandy(bonus));
                next[row] = cell;
                const { x, y } = this.cellPos(c, row);
                const delay = this.d(0.06 * i);
                const dur = this.d(0.45);
                cell.node.position.set(x, -SH - 60 - i * (SH * 0.7));
                gsap.to(cell.node, { y, duration: dur, delay, ease: 'bounce.out' });
                gsap.timeline({ delay: delay + dur * 0.62 })
                    .to(cell.node.scale, { x: 1.14, y: 0.82, duration: this.d(0.07), ease: 'power2.out' })
                    .to(cell.node.scale, { x: 1, y: 1, duration: this.d(0.3), ease: 'elastic.out(1.4, 0.5)' });
                maxEnd = Math.max(maxEnd, delay + dur + this.d(0.2));
            }
            this.grid[c] = next;
        }
        await this.wait(maxEnd + 0.04);
    }

    private countOnGrid(id: string): number {
        let n = 0;
        for (const col of this.grid) for (const cell of col) if (cell?.id === id) n++;
        return n;
    }

    // --- free spins ----------------------------------------------------------------

    private async runBonus(): Promise<void> {
        this.bonusActive = true;
        this.spinsLeft = FREE_SPINS;
        this.bonusTotal = 0;

        await this.showTakeover('FREE SPINS!', `${FREE_SPINS} spins · rainbow bombs multiply every win`, 0xff4fa0, true);
        this.bonusBar.visible = true;

        while (this.spinsLeft > 0) {
            this.spinsLeft--;
            this.updateBonusBar();
            await this.flingBoard();
            await this.dropBoard(this.makeBoard(true));
            const win = await this.resolveTumbles(true);
            if (win > 0) {
                const rounded = Math.round(win);
                this.bonusTotal += rounded;
                const fresh = gameStore.getState(); // never reuse a pre-await snapshot
                fresh.setBalance(fresh.balance + rounded);
                fresh.setWinAmount(rounded);
                this.updateBonusBar();
                await this.celebrate(win, true);
            }
            if (this.countOnGrid('c_pop') >= 3 && this.spinsLeft < 20) {
                this.spinsLeft = Math.min(this.spinsLeft + RETRIGGER, 20);
                this.updateBonusBar();
                this.floatText(`+${RETRIGGER} SPINS`, VW / 2, VH / 2, 0xff4fa0);
                await this.wait(this.d(0.5));
            }
            await this.wait(this.d(0.15));
        }

        await this.showTakeover('BONUS OVER', `you won $${this.bonusTotal}`, 0xffd23d, true);
        this.bonusBar.visible = false;
        this.bonusActive = false;
    }

    private updateBonusBar(): void {
        this.bonusBar.text = `FREE SPINS  ${this.spinsLeft}    ·    BONUS WIN  $${this.bonusTotal}`;
        gsap.fromTo(this.bonusBar.scale, { x: 1.1, y: 1.1 }, { x: 1, y: 1, duration: 0.22, ease: 'back.out(2)' });
    }

    // --- celebrations ----------------------------------------------------------------

    /** Spin-total plaque + tiered full-screen takeover for big wins. */
    private async celebrate(win: number, inBonus: boolean): Promise<void> {
        const bet = gameStore.getState().bet;
        this.showPlaque(win);
        const x = win / bet;
        // Inside the bonus only truly big hits take the screen — keeps it flowing.
        const takeoverAt = inBonus ? 40 : 15;
        if (x >= takeoverAt) {
            const name = x >= 100 ? 'EPIC WIN' : x >= 40 ? 'SUPER WIN' : 'SWEET WIN';
            const tint = x >= 100 ? 0xff2d55 : x >= 40 ? 0xff9234 : 0xffd23d;
            await this.showTakeover(name, `$${Math.round(win)}`, tint, false);
        } else {
            await this.wait(this.d(inBonus ? 0.45 : 0.7));
        }
    }

    private showPlaque(win: number): void {
        const target = { value: 0 };
        this.winPlaque.visible = true;
        this.winPlaque.alpha = 1;
        gsap.killTweensOf(this.winPlaque);
        gsap.killTweensOf(this.winPlaque.scale);
        gsap.fromTo(this.winPlaque.scale, { x: 0.4, y: 0.4 }, { x: 1, y: 1, duration: this.d(0.4), ease: 'back.out(2.2)' });
        gsap.to(target, {
            value: win,
            duration: this.d(Math.min(0.5 + win / 400, 1.6)),
            ease: 'power1.out',
            onUpdate: () => { this.winPlaqueText.text = `WIN $${Math.floor(target.value)}`; },
            onComplete: () => { this.winPlaqueText.text = `WIN $${Math.round(win)}`; },
        });
        gsap.to(this.winPlaque, { alpha: 0, duration: 0.4, delay: this.d(1.6), onComplete: () => { this.winPlaque.visible = false; } });
    }

    private hidePlaque(): void {
        gsap.killTweensOf(this.winPlaque);
        this.winPlaque.visible = false;
    }

    /** Full-screen takeover: vignette, zooming banner, confetti + shockwaves. */
    private async showTakeover(headline: string, sub: string, tint: number, long: boolean): Promise<void> {
        this.takeover.visible = true;
        this.takeoverText.text = headline;
        this.takeoverText.style.fill = tint;
        this.takeoverText.style.dropShadow = { color: tint, blur: 30, distance: 0, alpha: 0.9, angle: Math.PI / 6 };
        this.takeoverSub.text = sub;

        gsap.killTweensOf(this.vignette);
        this.vignette.alpha = 0;
        gsap.to(this.vignette, { alpha: 0.62, duration: this.d(0.3) });

        gsap.killTweensOf(this.takeoverText.scale);
        this.takeoverText.alpha = 1;
        this.takeoverSub.alpha = 1;
        gsap.fromTo(this.takeoverText.scale, { x: 0.2, y: 0.2 }, { x: 1, y: 1, duration: this.d(0.55), ease: 'elastic.out(1.1, 0.55)' });
        gsap.fromTo(this.takeoverSub, { alpha: 0 }, { alpha: 1, duration: this.d(0.4), delay: this.d(0.25) });

        const cx = GameConfig.width / 2;
        const cy = GameConfig.height / 2;
        this.ringAtScreen(cx, cy, tint);
        this.confettiBlast(46);
        this.calls.push(gsap.delayedCall(this.d(0.5), () => this.ringAtScreen(cx, cy, 0xffffff)));

        const hold = long ? 1.6 : 1.1;
        await this.waitSkippable(this.d(hold));

        gsap.to(this.vignette, { alpha: 0, duration: this.d(0.3) });
        gsap.to(this.takeoverText, { alpha: 0, duration: this.d(0.25) });
        gsap.to(this.takeoverSub, { alpha: 0, duration: this.d(0.25), onComplete: () => { this.takeover.visible = false; this.takeoverText.alpha = 1; } });
        await this.wait(this.d(0.3));
    }

    // --- particles -------------------------------------------------------------------

    /** Candy shrapnel burst at a grid-local point. */
    private burstAt(x: number, y: number, color: number): void {
        for (let i = 0; i < 10; i++) {
            let p = this.burstPool.find((g) => !g.visible);
            if (!p) {
                p = new Graphics();
                p.visible = false;
                this.fxLayer.addChild(p);
                this.burstPool.push(p);
            }
            const r = 5 + Math.random() * 9;
            p.clear().circle(0, 0, r).fill({ color: Math.random() < 0.3 ? 0xffffff : color });
            p.position.set(x, y);
            p.alpha = 1;
            p.scale.set(1);
            p.visible = true;
            const a = Math.random() * Math.PI * 2;
            const speed = 130 + Math.random() * 240;
            gsap.killTweensOf(p);
            gsap.to(p, {
                x: x + Math.cos(a) * speed * 0.7,
                y: y + Math.sin(a) * speed * 0.7 + 130, // gravity pull
                alpha: 0,
                duration: this.d(0.55 + Math.random() * 0.3),
                ease: 'power2.out',
                onComplete: () => { p.visible = false; },
            });
            gsap.to(p.scale, { x: 0.2, y: 0.2, duration: this.d(0.6), ease: 'power1.in' });
        }
    }

    /** Expanding shockwave ring, grid-local. */
    private ringAt(x: number, y: number, color: number): void {
        this.spawnRing(this.fxLayer, x, y, color);
    }

    /** Expanding shockwave ring in screen space (takeover layer). */
    private ringAtScreen(x: number, y: number, color: number): void {
        this.spawnRing(this.takeover, x, y, color);
    }

    private spawnRing(layer: Container, x: number, y: number, color: number): void {
        let ring = this.ringPool.find((g) => !g.visible);
        if (!ring) {
            ring = new Graphics();
            ring.visible = false;
            ring.blendMode = 'add';
            this.ringPool.push(ring);
        }
        layer.addChild(ring); // re-parent to the requested layer
        ring.clear().circle(0, 0, 60).stroke({ width: 10, color, alpha: 0.9 });
        ring.position.set(x, y);
        ring.alpha = 0.9;
        ring.scale.set(0.3);
        ring.visible = true;
        gsap.killTweensOf(ring);
        gsap.killTweensOf(ring.scale);
        gsap.to(ring.scale, { x: 6, y: 6, duration: this.d(0.7), ease: 'power2.out' });
        gsap.to(ring, { alpha: 0, duration: this.d(0.7), ease: 'power2.out', onComplete: () => { ring.visible = false; } });
    }

    /** Confetti cannons from both bottom corners (screen space). */
    private confettiBlast(count: number): void {
        const colors = [0xff2d55, 0xff9234, 0xffd23d, 0x4ade6a, 0x3aa8ff, 0x9a4fd4, 0xff4fa0];
        const H = GameConfig.height;
        const W = GameConfig.width;
        for (let i = 0; i < count; i++) {
            let p = this.confettiPool.find((g) => !g.visible);
            if (!p) {
                p = new Graphics();
                p.visible = false;
                this.takeover.addChild(p);
                this.confettiPool.push(p);
            }
            const color = colors[(Math.random() * colors.length) | 0];
            p.clear().roundRect(-7, -4, 14, 8, 2).fill({ color });
            const fromLeft = i % 2 === 0;
            p.position.set(fromLeft ? -10 : W + 10, H * (0.65 + Math.random() * 0.3));
            p.rotation = Math.random() * Math.PI;
            p.alpha = 1;
            p.visible = true;
            const tx = fromLeft ? W * (0.15 + Math.random() * 0.5) : W * (0.35 + Math.random() * 0.5);
            const peak = H * (0.08 + Math.random() * 0.3);
            gsap.killTweensOf(p);
            gsap.timeline({ onComplete: () => { p.visible = false; } })
                .to(p, { x: tx, y: peak, rotation: p.rotation + 5, duration: this.d(0.55 + Math.random() * 0.2), ease: 'power2.out' })
                .to(p, { y: H + 30, rotation: p.rotation + 11, alpha: 0.85, duration: this.d(1 + Math.random() * 0.5), ease: 'power1.in' });
        }
    }

    /** Floating "+$N" / "xN" counter rising from a grid-local point. */
    private floatText(msg: string, x: number, y: number, tint: number): void {
        let t = this.floatPool.find((f) => !f.visible);
        if (!t) {
            t = new Text({ text: '', style: {
                fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 46, fontWeight: '900',
                fill: 0xffffff, stroke: { color: 0x5a1030, width: 8 },
            } });
            t.anchor.set(0.5);
            t.visible = false;
            this.fxLayer.addChild(t);
            this.floatPool.push(t);
        }
        t.text = msg;
        t.style.fill = tint === 0x3a1424 ? 0xffffff : tint;
        t.position.set(x, y);
        t.alpha = 1;
        t.visible = true;
        gsap.killTweensOf(t);
        gsap.killTweensOf(t.scale);
        gsap.fromTo(t.scale, { x: 0.4, y: 0.4 }, { x: 1, y: 1, duration: this.d(0.3), ease: 'back.out(2.5)' });
        gsap.to(t, { y: y - 90, duration: this.d(1), ease: 'power1.out' });
        gsap.to(t, { alpha: 0, duration: this.d(0.35), delay: this.d(0.65), onComplete: () => { t.visible = false; } });
    }

    private microShake(): void {
        gsap.killTweensOf(this.candyLayer.position);
        const tl = gsap.timeline({ onComplete: () => this.candyLayer.position.set(GX, GY) });
        for (let i = 0; i < 4; i++) {
            tl.to(this.candyLayer.position, { x: GX + (Math.random() - 0.5) * 12, y: GY + (Math.random() - 0.5) * 12, duration: 0.04 });
        }
        tl.to(this.candyLayer.position, { x: GX, y: GY, duration: 0.05 });
    }

    // --- candyland environment -----------------------------------------------------

    private vgrad(stops: { offset: number; color: number }[]): FillGradient {
        return new FillGradient({ type: 'linear', start: { x: 0, y: 0 }, end: { x: 0, y: 1 }, textureSpace: 'local', colorStops: stops });
    }

    private buildCandyland(): void {
        const W = GameConfig.width;
        const H = GameConfig.height;
        const sky = this.skyLayer;

        // Pastel sky.
        sky.addChild(new Graphics().rect(0, 0, W, H).fill(this.vgrad([
            { offset: 0, color: 0x7ec8f7 }, { offset: 0.55, color: 0xbfe3fb }, { offset: 1, color: 0xffd9ec },
        ])));

        // Sun with slowly rotating rays, top-left.
        this.sunRays = new Graphics();
        for (let i = 0; i < 12; i++) {
            const a = (Math.PI * 2 * i) / 12;
            this.sunRays.poly([
                Math.cos(a) * 90, Math.sin(a) * 90,
                Math.cos(a + 0.09) * 190, Math.sin(a + 0.09) * 190,
                Math.cos(a - 0.09) * 190, Math.sin(a - 0.09) * 190,
            ]).fill({ color: 0xfff3a0, alpha: 0.45 });
        }
        this.sunRays.position.set(180, 130);
        sky.addChild(this.sunRays);
        sky.addChild(new Graphics()
            .circle(180, 130, 92).fill({ color: 0xfff3a0, alpha: 0.5 })
            .circle(180, 130, 70).fill({ color: 0xffe066 }));

        // Drifting clouds (parallax speeds).
        const cloud = (y: number, scale: number, speed: number, alpha: number): void => {
            const g = new Graphics();
            for (const [ox, oy, r] of [[-70, 0, 44], [-10, -22, 56], [50, -4, 46], [10, 16, 50]] as const) {
                g.circle(ox * scale, oy * scale, r * scale).fill({ color: 0xffffff, alpha });
            }
            g.position.set(Math.random() * W, y);
            sky.addChild(g);
            this.clouds.push({ node: g, speed });
        };
        cloud(120, 1.1, 26, 0.9);
        cloud(250, 0.8, 38, 0.75);
        cloud(80, 0.6, 50, 0.6);
        cloud(330, 0.5, 60, 0.5);

        // Ice-cream mountains on the horizon.
        const peak = (px: number, pw: number, ph: number, tint: number): void => {
            sky.addChild(new Graphics()
                .poly([px - pw / 2, H * 0.78, px, H * 0.78 - ph, px + pw / 2, H * 0.78]).fill({ color: tint })
                .poly([px - pw * 0.16, H * 0.78 - ph * 0.62, px, H * 0.78 - ph, px + pw * 0.16, H * 0.78 - ph * 0.6, px + pw * 0.05, H * 0.78 - ph * 0.5, px - pw * 0.06, H * 0.78 - ph * 0.55])
                .fill({ color: 0xfff6ec }));
        };
        peak(W * 0.12, 460, 300, 0xe8a8d8);
        peak(W * 0.88, 520, 360, 0xc89ae8);
        peak(W * 0.72, 320, 220, 0xe8b8e0);

        // Frosting hills foreground.
        sky.addChild(new Graphics()
            .ellipse(W * 0.2, H * 1.04, W * 0.45, H * 0.3).fill({ color: 0xffc2e0 })
            .ellipse(W * 0.85, H * 1.08, W * 0.5, H * 0.34).fill({ color: 0xffaed4 })
            .ellipse(W * 0.5, H * 1.14, W * 0.55, H * 0.3).fill({ color: 0xff9cc8 }));

        // Lollipop trees + candy canes flanking the grid.
        const lolly = (x: number, y: number, r: number, tint: number): void => {
            const g = new Graphics()
                .roundRect(x - 7, y, 14, 150, 7).fill({ color: 0xfff6ec })
                .circle(x, y, r).fill({ color: tint })
                .circle(x, y, r).stroke({ width: 8, color: 0xfff6ec });
            for (let i = 1; i < 4; i++) g.circle(x, y, r * (i / 4)).stroke({ width: 5, color: 0xffffff, alpha: 0.5 });
            sky.addChild(g);
        };
        lolly(120, 720, 64, 0xff5a78);
        lolly(232, 800, 46, 0x3aa8ff);
        lolly(1800, 690, 70, 0x4ade6a);
        lolly(1692, 800, 48, 0xff9234);

        // Falling sprinkles field (animated in update()).
        this.sprinkles = new Graphics();
        sky.addChild(this.sprinkles);
        const tints = [0xff2d55, 0xff9234, 0xffd23d, 0x4ade6a, 0x3aa8ff, 0x9a4fd4];
        for (let i = 0; i < 40; i++) {
            this.motes.push({
                x: Math.random() * W, y: Math.random() * H,
                r: 2 + Math.random() * 3, vy: 18 + Math.random() * 30,
                tint: tints[(Math.random() * tints.length) | 0],
                phase: Math.random() * Math.PI * 2,
            });
        }

        // Frosted glass well behind the candy grid.
        sky.addChild(new Graphics()
            .roundRect(GX - 26, GY - 26, VW + 52, VH + 52, 34).fill({ color: 0xffffff, alpha: 0.34 })
            .roundRect(GX - 26, GY - 26, VW + 52, VH + 52, 34).stroke({ width: 6, color: 0xffffff, alpha: 0.75 })
            .roundRect(GX - 14, GY - 14, VW + 28, VH + 28, 26).fill({ color: 0x6a2a5a, alpha: 0.32 }));

        // Title: bouncy rainbow logo.
        const logo = new Container();
        const word = 'SUGAR STORM';
        const tintsL = [0xff2d55, 0xff9234, 0xffd23d, 0x4ade6a, 0x3aa8ff, 0x9a4fd4];
        let lx = 0;
        [...word].forEach((chr, i) => {
            if (chr === ' ') { lx += 26; return; }
            const letter = new Text({ text: chr, style: {
                fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 66, fontWeight: '900',
                fill: tintsL[i % tintsL.length], stroke: { color: 0xfff6ec, width: 8 },
                dropShadow: { color: 0xc2287a, blur: 0, distance: 5, alpha: 0.55, angle: Math.PI / 3 },
            } });
            letter.position.set(lx, 0);
            lx += letter.width - 4;
            logo.addChild(letter);
            gsap.to(letter, { y: -7, duration: 1.1, yoyo: true, repeat: -1, ease: 'sine.inOut', delay: i * 0.09 });
        });
        logo.position.set(GX + VW / 2 - lx / 2, 44);
        sky.addChild(logo);
    }

    private buildTakeover(): void {
        const W = GameConfig.width;
        const H = GameConfig.height;
        this.vignette = new Graphics().rect(0, 0, W, H).fill(0x2a0a22);
        this.vignette.alpha = 0;
        this.takeover.addChild(this.vignette);

        this.takeoverText = new Text({ text: '', style: {
            fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 132, fontWeight: '900', letterSpacing: 4,
            fill: 0xffd23d, stroke: { color: 0xfff6ec, width: 14 },
        } });
        this.takeoverText.anchor.set(0.5);
        this.takeoverText.position.set(W / 2, H / 2 - 40);
        this.takeover.addChild(this.takeoverText);

        this.takeoverSub = new Text({ text: '', style: {
            fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 44, fontWeight: '900',
            fill: 0xffffff, stroke: { color: 0x5a1030, width: 8 },
        } });
        this.takeoverSub.anchor.set(0.5);
        this.takeoverSub.position.set(W / 2, H / 2 + 70);
        this.takeover.addChild(this.takeoverSub);
        this.takeover.visible = false;
        // Tap anywhere on the overlay to skip the celebration hold.
        this.takeover.eventMode = 'static';
        this.takeover.cursor = 'pointer';
        this.takeover.on('pointerdown', () => this.skipResolve?.());
    }

    // --- UI -------------------------------------------------------------------------

    private createUI(): void {
        const cx = 1758; // right control column

        // Panel.
        this.uiContainer.addChild(new Graphics()
            .roundRect(1618, 140, 280, 880, 26).fill({ color: 0xffffff, alpha: 0.55 })
            .roundRect(1618, 140, 280, 880, 26).stroke({ width: 4, color: 0xffffff, alpha: 0.9 })
            .roundRect(1628, 150, 260, 860, 20).stroke({ width: 2, color: 0xff4fa0, alpha: 0.35 }));

        const section = (txt: string, y: number): void => {
            const t = new Text({ text: txt, style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 17, fontWeight: '900', letterSpacing: 3, fill: 0xc2287a } });
            t.anchor.set(0.5);
            t.position.set(cx, y);
            this.uiContainer.addChild(t);
        };

        section('BET', 196);
        this.betValueText = new Text({ text: `$${gameStore.getState().bet}`, style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 36, fontWeight: '900', fill: 0x6a2a5a } });
        this.betValueText.anchor.set(0.5);
        this.betValueText.position.set(cx, 250);
        this.uiContainer.addChild(this.betValueText);
        const stepBtn = (dx: number, glyph: string, dir: number): void => {
            const b = new Graphics()
                .circle(0, 0, 26).fill({ color: 0xffffff })
                .circle(0, 0, 26).stroke({ width: 3, color: 0xff4fa0 });
            b.position.set(cx + dx, 250);
            b.eventMode = 'static';
            b.cursor = 'pointer';
            b.on('pointerdown', () => {
                if (this.busy || this.bonusActive) return;
                gsap.fromTo(b.scale, { x: 0.85, y: 0.85 }, { x: 1, y: 1, duration: 0.25, ease: 'back.out(3)' });
                const state = gameStore.getState();
                const i = BET_STEPS.findIndex((v) => v >= state.bet);
                const next = BET_STEPS[Math.max(0, Math.min(BET_STEPS.length - 1, (i < 0 ? BET_STEPS.length - 1 : i) + dir))];
                state.setBet(next);
                this.betValueText.text = `$${next}`;
                this.buyLabel.text = `$${next * BUY_COST}`;
            });
            const t = new Text({ text: glyph, style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 28, fontWeight: '900', fill: 0xc2287a } });
            t.anchor.set(0.5);
            b.addChild(t);
            this.uiContainer.addChild(b);
        };
        stepBtn(-80, '−', -1);
        stepBtn(80, '+', 1);

        // SPIN — big candy button.
        const spinBtn = new Graphics()
            .circle(0, 6, 86).fill({ color: 0xc2287a, alpha: 0.45 })
            .circle(0, 0, 86).fill(new FillGradient({
                type: 'linear', start: { x: 0, y: 0 }, end: { x: 0, y: 1 }, textureSpace: 'local',
                colorStops: [{ offset: 0, color: 0xff7ab8 }, { offset: 0.5, color: 0xff4fa0 }, { offset: 1, color: 0xc2287a }],
            }))
            .circle(0, 0, 86).stroke({ width: 7, color: 0xfff6ec })
            .ellipse(-24, -32, 30, 16).fill({ color: 0xffffff, alpha: 0.45 });
        spinBtn.position.set(cx, 420);
        spinBtn.eventMode = 'static';
        spinBtn.cursor = 'pointer';
        spinBtn.on('pointerdown', () => {
            gsap.fromTo(spinBtn.scale, { x: 0.9, y: 0.9 }, { x: 1, y: 1, duration: 0.35, ease: 'back.out(3)' });
            void this.spin(false);
        });
        const spinT = new Text({ text: 'SPIN', style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 40, fontWeight: '900', fill: 0xffffff, stroke: { color: 0xc2287a, width: 5 } } });
        spinT.anchor.set(0.5);
        spinBtn.addChild(spinT);
        this.uiContainer.addChild(spinBtn);

        // BUY FEATURE.
        section('BUY FEATURE', 572);
        const buyBtn = new Graphics()
            .roundRect(-110, -44, 220, 88, 22).fill(new FillGradient({
                type: 'linear', start: { x: 0, y: 0 }, end: { x: 0, y: 1 }, textureSpace: 'local',
                colorStops: [{ offset: 0, color: 0xffe066 }, { offset: 0.55, color: 0xffb02e }, { offset: 1, color: 0xd4861a }],
            }))
            .roundRect(-110, -44, 220, 88, 22).stroke({ width: 5, color: 0xfff6ec });
        buyBtn.position.set(cx, 644);
        buyBtn.eventMode = 'static';
        buyBtn.cursor = 'pointer';
        buyBtn.on('pointerdown', () => {
            gsap.fromTo(buyBtn.scale, { x: 0.92, y: 0.92 }, { x: 1, y: 1, duration: 0.3, ease: 'back.out(3)' });
            void this.spin(true);
        });
        const buyT = new Text({ text: 'FREE SPINS', style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 24, fontWeight: '900', fill: 0x6a3a06 } });
        buyT.anchor.set(0.5);
        buyT.position.set(0, -14);
        this.buyLabel = new Text({ text: `$${gameStore.getState().bet * BUY_COST}`, style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 26, fontWeight: '900', fill: 0xffffff, stroke: { color: 0x6a3a06, width: 4 } } });
        this.buyLabel.anchor.set(0.5);
        this.buyLabel.position.set(0, 18);
        buyBtn.addChild(buyT, this.buyLabel);
        this.uiContainer.addChild(buyBtn);
        // Shimmer sweep that loops over the buy button.
        const shimmer = new Graphics().roundRect(-14, -44, 28, 88, 10).fill({ color: 0xffffff, alpha: 0.4 });
        shimmer.blendMode = 'add';
        buyBtn.addChild(shimmer);
        gsap.fromTo(shimmer, { x: -110 }, { x: 110, duration: 1.4, repeat: -1, repeatDelay: 1.6, ease: 'power1.inOut' });

        // TURBO toggle.
        section('TURBO', 760);
        this.turboPill = new Graphics();
        this.turboPill.position.set(cx, 816);
        this.turboPill.eventMode = 'static';
        this.turboPill.cursor = 'pointer';
        this.turboLabel = new Text({ text: '', style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 22, fontWeight: '900', fill: 0xffffff } });
        this.turboLabel.anchor.set(0.5);
        this.turboPill.addChild(this.turboLabel);
        this.turboPill.on('pointerdown', () => this.toggleTurbo());
        this.uiContainer.addChild(this.turboPill);
        this.styleTurbo();

        // Balance.
        this.balanceText = new Text({ text: '', style: { fontFamily: 'Arial, sans-serif', fontSize: 22, fontWeight: 'bold', fill: 0x6a2a5a } });
        this.balanceText.anchor.set(0.5);
        this.balanceText.position.set(cx, 968);
        this.uiContainer.addChild(this.balanceText);

        // Win plaque (centre of the grid).
        this.winPlaque = new Container();
        this.winPlaque.position.set(GX + VW / 2, GY - 36);
        const plaqueBg = new Graphics()
            .roundRect(-220, -46, 440, 92, 46).fill({ color: 0xfff6ec, alpha: 0.96 })
            .roundRect(-220, -46, 440, 92, 46).stroke({ width: 6, color: 0xff4fa0 });
        this.winPlaqueText = new Text({ text: '', style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 48, fontWeight: '900', fill: 0xc2287a } });
        this.winPlaqueText.anchor.set(0.5);
        this.winPlaque.addChild(plaqueBg, this.winPlaqueText);
        this.winPlaque.visible = false;
        this.uiContainer.addChild(this.winPlaque);

        // Free-spins bar under the grid.
        this.bonusBar = new Text({ text: '', style: {
            fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 30, fontWeight: '900', letterSpacing: 2,
            fill: 0xff4fa0, stroke: { color: 0xfff6ec, width: 7 },
        } });
        this.bonusBar.anchor.set(0.5);
        this.bonusBar.position.set(GX + VW / 2, GY + VH + 46);
        this.bonusBar.visible = false;
        this.uiContainer.addChild(this.bonusBar);

        // Back to menu + hint.
        const back = new Text({ text: '‹ MENU', style: { fill: 0xc2287a, fontSize: 26, fontWeight: 'bold', stroke: { color: 0xfff6ec, width: 4 } } });
        back.position.set(40, 36);
        back.eventMode = 'static';
        back.cursor = 'pointer';
        back.on('pointerdown', () => SceneManager.switchScene(new MenuScene()));
        // (back-to-menu removed) this.uiContainer.addChild(back);

        const hint = new Text({ text: '8+ matching candies pay anywhere · tumbles chain · 4+ lollipops = free spins with bomb multipliers', style: { fill: 0x8a4a7a, fontSize: 19, fontStyle: 'italic' } });
        hint.anchor.set(0.5);
        hint.position.set(GX + VW / 2, GameConfig.height - 18);
        this.uiContainer.addChild(hint);

        const render = (s: ReturnType<typeof gameStore.getState>): void => {
            this.balanceText.text = `Balance  $${Math.round(s.balance * 100) / 100}`;
        };
        render(gameStore.getState());
        gameStore.subscribe(render);
    }

    private buyLabel!: Text;

    private toggleTurbo(): void {
        this.turbo = !this.turbo;
        this.styleTurbo();
    }

    private styleTurbo(): void {
        const on = this.turbo;
        this.turboPill.clear()
            .roundRect(-86, -30, 172, 60, 30).fill({ color: on ? 0xff4fa0 : 0xffffff, alpha: on ? 1 : 0.8 })
            .roundRect(-86, -30, 172, 60, 30).stroke({ width: 4, color: on ? 0xfff6ec : 0xff4fa0 });
        this.turboLabel.text = on ? 'TURBO ON' : 'TURBO OFF';
        this.turboLabel.style.fill = on ? 0xffffff : 0xc2287a;
    }
}
