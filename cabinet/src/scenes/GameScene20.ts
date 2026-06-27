import { Text, Container, Graphics, FillGradient } from 'pixi.js';
import { GodrayFilter } from 'pixi-filters';
import { gsap } from 'gsap';
import { BaseScene } from './BaseScene';
import { GameConfig } from '../config/GameConfig';
import { gameStore } from '../state/GameState';
import { SceneManager } from '../managers/SceneManager';
import { MenuScene } from './MenuScene';

/**
 * GameScene20 — Slot 20: "Royal Megaways"
 * ----------------------------------------
 * The marquee modern slot engine. Six reels each stand a RANDOM height of 2–7
 * symbols every spin, so the number of ways to win changes from spin to spin —
 * up to 7⁶ = 117,649 MEGAWAYS. Wins are paid left-to-right by ways (product of
 * matching symbols per reel), then the winners TUMBLE: they burst, survivors
 * drop, fresh symbols fall, and a win MULTIPLIER climbs with every cascade.
 *
 * Production-grade feature set:
 *  - per-reel height randomisation with springy drop-in + symbol auto-sizing
 *  - animated MEGAWAYS counter that rolls to the new ways count each spin
 *  - cascading tumbles with an escalating multiplier ladder (×1→×2→×3→×5…)
 *  - 4+ crowns trigger FREE SPINS where the multiplier NEVER resets (the genre
 *    signature), with retriggers
 *  - wild substitution, win-line ways highlighting, big-win godray + coin storm
 */

const REELS = 6;
const MIN_H = 2;
const MAX_H = 7;
const BOARD_X = 150;
const BOARD_Y = 196;
const BOARD_W = 1340;
const BOARD_H = 760;
const REEL_GAP = 12;
const REEL_W = (BOARD_W - REEL_GAP * (REELS - 1)) / REELS;
const FILL = 0.9;

const BET_STEPS = [1, 2, 5, 10, 20, 50, 100];
const FREE_SPINS = 12;
const RETRIGGER = 5;
const BASE_LADDER = [1, 2, 3, 5, 8, 12, 18, 25, 40, 60, 100];
const MAX_WIN_MULT = 5000; // cap total spin win at × bet

interface Sym {
    id: string;
    kind: 'low' | 'high' | 'wild' | 'scatter';
    glyph: string;
    color: number;
    weight: number;
    pay: Record<number, number>; // count(3..6) → × bet × ways
}

const SYMS: readonly Sym[] = [
    { id: 's10', kind: 'low',  glyph: '10', color: 0x4a78c4, weight: 44, pay: { 3: 0.002, 4: 0.006, 5: 0.02, 6: 0.05 } },
    { id: 'sJ',  kind: 'low',  glyph: 'J',  color: 0x4aa86a, weight: 42, pay: { 3: 0.002, 4: 0.006, 5: 0.02, 6: 0.05 } },
    { id: 'sQ',  kind: 'low',  glyph: 'Q',  color: 0xc4a02a, weight: 38, pay: { 3: 0.003, 4: 0.008, 5: 0.025, 6: 0.06 } },
    { id: 'sK',  kind: 'low',  glyph: 'K',  color: 0xc46a2a, weight: 34, pay: { 3: 0.003, 4: 0.01, 5: 0.03, 6: 0.08 } },
    { id: 'sA',  kind: 'low',  glyph: 'A',  color: 0xc43a4a, weight: 30, pay: { 3: 0.004, 4: 0.012, 5: 0.035, 6: 0.1 } },
    { id: 'ruby',  kind: 'high', glyph: '◆', color: 0xe0243a, weight: 22, pay: { 3: 0.006, 4: 0.02, 5: 0.06, 6: 0.16 } },
    { id: 'emer',  kind: 'high', glyph: '❖', color: 0x18c46a, weight: 16, pay: { 3: 0.008, 4: 0.03, 5: 0.09, 6: 0.24 } },
    { id: 'crwn',  kind: 'high', glyph: '♛', color: 0xffd23d, weight: 11, pay: { 3: 0.012, 4: 0.05, 5: 0.15, 6: 0.4 } },
    { id: 'wild',  kind: 'wild', glyph: 'W', color: 0x9a4fff, weight: 8,  pay: {} },
    { id: 'scat',  kind: 'scatter', glyph: '★', color: 0xff9d2a, weight: 5, pay: {} },
];
const BY_ID = new Map(SYMS.map((s) => [s.id, s]));
const sym = (id: string): Sym => BY_ID.get(id)!;

interface Cell {
    id: string;
    node: Container;
    g: Graphics;
    glow: Graphics;
}

export class GameScene20 extends BaseScene {
    private readonly bgLayer = new Container();
    private readonly reelLayer = new Container();
    private readonly fxLayer = new Container();
    private readonly uiContainer = new Container();

    private heights: number[] = new Array(REELS).fill(MAX_H);
    private cols: Cell[][] = [];     // cols[reel][row]
    private busy = false;
    private turbo = false;

    private bonusActive = false;
    private spinsLeft = 0;
    private bonusTotal = 0;
    private multiplier = 1;

    private waysText!: Text;
    private multText!: Text;
    private winText!: Text;
    private bonusBar!: Text;
    private banner!: Text;
    private spinButton!: Graphics;
    private spinLabel!: Text;
    private betValueText!: Text;
    private balanceText!: Text;
    private turboPill!: Graphics;
    private turboLabel!: Text;
    private godray: GodrayFilter | null = null;
    private readonly coins: Graphics[] = [];
    private readonly bursts: Graphics[] = [];
    private readonly calls: gsap.core.Tween[] = [];
    private displayWays = 0;

    private readonly onKeyDown = (e: KeyboardEvent): void => {
        if (e.code === 'Space') { e.preventDefault(); void this.spin(); }
        if (e.code === 'KeyT') this.toggleTurbo();
        // (back-to-menu removed) if (e.code === 'Escape') SceneManager.switchScene(new MenuScene());
    };

    public async init(): Promise<void> {
        this.addChild(this.bgLayer);
        this.addChild(this.reelLayer);
        this.reelLayer.position.set(BOARD_X, BOARD_Y);
        this.fxLayer.position.set(BOARD_X, BOARD_Y);
        this.addChild(this.fxLayer);
        this.addChild(this.uiContainer);

        this.buildBackground();
        this.createUI();
        for (let r = 0; r < REELS; r++) this.cols.push([]);
        this.fillInitial();
        window.addEventListener('keydown', this.onKeyDown);
    }

    public async start(): Promise<void> {}

    public update(delta: number): void {
        const dt = Math.min(delta / 60, 0.05);
        if (this.godray) this.godray.time += dt * 1.1;
    }

    public resize(_width: number, _height: number): void {}

    public override async destroyScene(): Promise<void> {
        window.removeEventListener('keydown', this.onKeyDown);
        for (const c of this.calls) c.kill();
        for (const col of this.cols) for (const cell of col) { gsap.killTweensOf(cell.node); gsap.killTweensOf(cell.node.scale); }
        for (const g of [...this.coins, ...this.bursts]) gsap.killTweensOf(g);
        gsap.killTweensOf(this.banner);
        gsap.killTweensOf(this.banner.scale);
        this.bgLayer.filters = [];
        await super.destroyScene();
    }

    private d(s: number): number { return this.turbo ? s * 0.5 : s; }
    private wait(s: number): Promise<void> { return new Promise((res) => { this.calls.push(gsap.delayedCall(s, () => res())); }); }

    // --- geometry / cells -------------------------------------------------------------

    private reelX(r: number): number { return r * (REEL_W + REEL_GAP) + REEL_W / 2; }
    private cellH(r: number): number { return BOARD_H / this.heights[r]; }
    private cellY(r: number, row: number): number { return (row + 0.5) * this.cellH(r); }
    private cellSize(r: number): number { return Math.min(REEL_W, this.cellH(r)) * FILL; }

    private rollSymbol(): string {
        const total = SYMS.reduce((a, s) => a + s.weight, 0);
        let t = Math.random() * total;
        for (const s of SYMS) { t -= s.weight; if (t < 0) return s.id; }
        return SYMS[0].id;
    }

    private makeCell(id: string, r: number): Cell {
        const node = new Container();
        const glow = new Graphics();
        const g = new Graphics();
        node.addChild(glow, g);
        const cell: Cell = { id, node, g, glow };
        this.drawCell(cell, r);
        this.reelLayer.addChild(node);
        return cell;
    }

    private drawCell(cell: Cell, r: number): void {
        const s = this.cellSize(r);
        const def = sym(cell.id);
        const g = cell.g;
        g.clear();
        const rad = s * 0.16;
        // Tile body.
        g.roundRect(-s / 2 + 2, -s / 2 + 4, s - 4, s - 4, rad).fill({ color: 0x000000, alpha: 0.3 });
        g.roundRect(-s / 2, -s / 2, s, s, rad).fill(new FillGradient({
            type: 'linear', start: { x: 0, y: 0 }, end: { x: 0, y: 1 }, textureSpace: 'local',
            colorStops: [{ offset: 0, color: this.lighten(def.color, 0.4) }, { offset: 0.55, color: def.color }, { offset: 1, color: this.darken(def.color, 0.4) }],
        }));
        g.roundRect(-s / 2, -s / 2, s, s, rad).stroke({ width: Math.max(2, s * 0.03), color: this.lighten(def.color, 0.5), alpha: 0.7 });
        g.roundRect(-s / 2 + s * 0.08, -s / 2 + s * 0.08, s - s * 0.16, s * 0.34, rad * 0.7).fill({ color: 0xffffff, alpha: 0.12 });
        // Glyph.
        cell.g.removeChildren().forEach((c) => c.destroy());
        const isFace = def.kind === 'low';
        const t = new Text({ text: def.glyph, style: {
            fontFamily: isFace ? 'Georgia, serif' : 'Georgia, serif', fontSize: s * (isFace ? 0.5 : 0.56), fontWeight: '900',
            fill: isFace ? 0xffffff : this.lighten(def.color, 0.6),
            stroke: { color: this.darken(def.color, 0.6), width: Math.max(2, s * 0.03) },
        } });
        t.anchor.set(0.5);
        g.addChild(t);
        // Special ring for wild/scatter.
        if (def.kind === 'wild' || def.kind === 'scatter') {
            g.roundRect(-s / 2 + 4, -s / 2 + 4, s - 8, s - 8, rad * 0.8).stroke({ width: Math.max(2, s * 0.025), color: 0xffffff, alpha: 0.85 });
        }
    }

    private drawGlow(cell: Cell, r: number, on: boolean): void {
        const s = this.cellSize(r);
        cell.glow.clear();
        if (on) {
            cell.glow.roundRect(-s / 2 - 6, -s / 2 - 6, s + 12, s + 12, s * 0.2).fill({ color: 0xffffff, alpha: 0.9 });
            cell.glow.blendMode = 'add';
        }
    }

    private fillInitial(): void {
        for (let r = 0; r < REELS; r++) this.heights[r] = MIN_H + ((Math.random() * (MAX_H - MIN_H + 1)) | 0);
        for (let r = 0; r < REELS; r++) {
            for (let row = 0; row < this.heights[r]; row++) {
                const cell = this.makeCell(this.rollSymbol(), r);
                cell.node.position.set(this.reelX(r), this.cellY(r, row));
                this.cols[r].push(cell);
            }
        }
        this.displayWays = this.computeWays();
        this.waysText.text = `${this.displayWays.toLocaleString()} WAYS`;
    }

    private computeWays(): number {
        let w = 1;
        for (let r = 0; r < REELS; r++) w *= this.heights[r];
        return w;
    }

    // --- spin -------------------------------------------------------------------------

    private async spin(): Promise<void> {
        const state = gameStore.getState();
        if (this.busy || this.bonusActive) return;
        if (state.balance < state.bet) return;
        this.busy = true;
        state.setBalance(Math.round((state.balance - state.bet) * 100) / 100);
        state.setWinAmount(0);
        this.banner.visible = false;
        this.multiplier = 1;
        this.updateMult();
        this.styleSpin();

        const win = await this.spinOnce(false);
        if (win > 0) {
            const w = Math.round(win);
            const fresh = gameStore.getState();
            fresh.setBalance(Math.round((fresh.balance + w) * 100) / 100);
            fresh.setWinAmount(w);
            await this.celebrate(win, false);
        }

        // Scatter trigger on the settled board.
        if (this.countScatter() >= 4) await this.runBonus();

        this.busy = false;
        this.styleSpin();
    }

    /** One reel-spin + full cascade chain. Returns total win for the spin. */
    private async spinOnce(bonus: boolean): Promise<number> {
        // New random heights + symbols.
        const newH: number[] = [];
        for (let r = 0; r < REELS; r++) newH.push(MIN_H + ((Math.random() * (MAX_H - MIN_H + 1)) | 0));

        // Drop old symbols out (kill any lingering tween first so nothing writes
        // to the node after it is destroyed).
        for (let r = 0; r < REELS; r++) {
            for (const cell of this.cols[r]) {
                gsap.killTweensOf(cell.node);
                gsap.killTweensOf(cell.node.scale);
                gsap.to(cell.node, { y: cell.node.y + BOARD_H + 120, alpha: 0.6, duration: this.d(0.3), ease: 'power2.in',
                    onComplete: () => { if (!cell.node.destroyed) cell.node.destroy({ children: true }); } });
            }
            this.cols[r] = [];
        }
        await this.wait(this.d(0.18));

        this.heights = newH;
        // Roll the MEGAWAYS counter to the new value.
        const ways = this.computeWays();
        this.rollWays(ways);

        // Drop new columns in with stagger + bounce.
        let maxEnd = 0;
        for (let r = 0; r < REELS; r++) {
            const ids = bonus ? this.rollBonusColumn(r) : Array.from({ length: this.heights[r] }, () => this.rollSymbol());
            ids.forEach((id, row) => {
                const cell = this.makeCell(id, r);
                const ty = this.cellY(r, row);
                cell.node.position.set(this.reelX(r), ty - BOARD_H - 100 - row * 40);
                this.cols[r].push(cell);
                const delay = this.d(r * 0.08 + row * 0.05);
                const dur = this.d(0.5);
                const node = cell.node;
                const tw = gsap.to(node, { y: ty, duration: dur, delay, ease: 'back.out(1.4)',
                    onUpdate: () => { if (node.destroyed) tw.kill(); } });
                maxEnd = Math.max(maxEnd, delay + dur);
            });
        }
        await this.wait(maxEnd + 0.05);

        // Cascade chain.
        let total = 0;
        let step = 0;
        for (;;) {
            const wins = this.evaluate();
            if (wins.total <= 0) break;

            this.multiplier = this.ladderMult(step, bonus);
            this.updateMult();
            const add = wins.total * this.multiplier;
            total += add;
            this.winText.text = `WIN $${Math.round(total)}`;
            gsap.fromTo(this.winText.scale, { x: 1.25, y: 1.25 }, { x: 1, y: 1, duration: this.d(0.25), ease: 'back.out(2)' });

            await this.flashWinners(wins.cells);
            await this.tumble(wins.cells, bonus);
            step++;
            if (total > MAX_WIN_MULT * gameStore.getState().bet) break;
        }
        return Math.min(total, MAX_WIN_MULT * gameStore.getState().bet);
    }

    private ladderMult(step: number, bonus: boolean): number {
        if (bonus) {
            // Free spins: multiplier persists & keeps climbing across the feature.
            this.bonusMultStep = Math.min(this.bonusMultStep + (step === 0 ? 0 : 1), BASE_LADDER.length - 1);
            return BASE_LADDER[this.bonusMultStep];
        }
        return BASE_LADDER[Math.min(step, BASE_LADDER.length - 1)];
    }
    private bonusMultStep = 0;

    /** Ways evaluation: each symbol pays left→right over consecutive reels from reel 0. */
    private evaluate(): { total: number; cells: Cell[] } {
        const bet = gameStore.getState().bet;
        const winners = new Set<Cell>();
        let total = 0;

        for (const def of SYMS) {
            if (def.kind === 'wild' || def.kind === 'scatter') continue;
            // Count matches (symbol or wild) per reel, left to right, until a reel misses.
            const perReel: Cell[][] = [];
            let reelsHit = 0;
            for (let r = 0; r < REELS; r++) {
                const matches = this.cols[r].filter((c) => c.id === def.id || c.id === 'wild');
                if (matches.length === 0) break;
                perReel.push(matches);
                reelsHit++;
            }
            if (reelsHit < 3) continue;
            const pay = def.pay[reelsHit] ?? 0;
            if (pay <= 0) continue;
            let ways = 1;
            for (let r = 0; r < reelsHit; r++) ways *= perReel[r].length;
            total += pay * ways * bet;
            for (let r = 0; r < reelsHit; r++) for (const c of perReel[r]) winners.add(c);
        }
        return { total: Math.round(total * 100) / 100, cells: [...winners] };
    }

    private async flashWinners(cells: Cell[]): Promise<void> {
        for (const cell of cells) {
            const r = this.reelOf(cell);
            this.drawGlow(cell, r, true);
            gsap.to(cell.node.scale, { x: 1.12, y: 1.12, duration: this.d(0.18), yoyo: true, repeat: 1, ease: 'sine.inOut' });
        }
        await this.wait(this.d(0.42));
    }

    private reelOf(cell: Cell): number {
        for (let r = 0; r < REELS; r++) if (this.cols[r].includes(cell)) return r;
        return 0;
    }

    /** Burst winners, drop survivors, refill from the top. */
    private async tumble(winners: Cell[], bonus: boolean): Promise<void> {
        const winSet = new Set(winners);
        let maxEnd = 0;
        for (let r = 0; r < REELS; r++) {
            const survivors = this.cols[r].filter((c) => !winSet.has(c));
            const removed = this.cols[r].filter((c) => winSet.has(c));
            for (const c of removed) {
                this.burstAt(c.node.x, c.node.y, sym(c.id).color);
                gsap.killTweensOf(c.node);
                gsap.killTweensOf(c.node.scale);
                gsap.to(c.node.scale, { x: 0, y: 0, duration: this.d(0.2), ease: 'back.in(2)', onComplete: () => { if (!c.node.destroyed) c.node.destroy({ children: true }); } });
            }
            if (removed.length === 0) continue;

            // Keep reel height the same; refill removed count with new symbols on top.
            const fresh: Cell[] = [];
            for (let i = 0; i < removed.length; i++) fresh.push(this.makeCell(bonus ? this.rollBonusOne() : this.rollSymbol(), r));
            const next = [...fresh, ...survivors];
            this.cols[r] = next;
            next.forEach((cell, row) => {
                this.drawCell(cell, r);
                this.drawGlow(cell, r, false);
                const ty = this.cellY(r, row);
                if (cell.node.position.x === 0 && cell.node.position.y === 0) cell.node.position.set(this.reelX(r), ty);
                const fromTop = fresh.includes(cell);
                if (fromTop) cell.node.position.set(this.reelX(r), ty - BOARD_H - 80);
                const delay = this.d(row * 0.04);
                const dur = this.d(0.4);
                const node = cell.node;
                const tw = gsap.to(node, { x: this.reelX(r), y: ty, duration: dur, delay, ease: 'bounce.out',
                    onUpdate: () => { if (node.destroyed) tw.kill(); } });
                maxEnd = Math.max(maxEnd, delay + dur);
            });
        }
        await this.wait(maxEnd + 0.05);
    }

    // --- bonus ------------------------------------------------------------------------

    private countScatter(): number {
        let n = 0;
        for (const col of this.cols) for (const c of col) if (c.id === 'scat') n++;
        return n;
    }

    private rollBonusColumn(r: number): string[] {
        return Array.from({ length: this.heights[r] }, () => this.rollBonusOne());
    }
    private rollBonusOne(): string {
        // Slightly richer symbol mix during free spins.
        return this.rollSymbol();
    }

    private async runBonus(): Promise<void> {
        this.bonusActive = true;
        this.spinsLeft = FREE_SPINS;
        this.bonusTotal = 0;
        this.bonusMultStep = 0;
        this.multiplier = 1;
        await this.showTakeover('FREE SPINS!', `${FREE_SPINS} spins · the win multiplier never resets`, 0xffd23d);
        this.bonusBar.visible = true;

        while (this.spinsLeft > 0) {
            this.spinsLeft--;
            this.updateBonusBar();
            const win = await this.spinOnce(true);
            if (win > 0) {
                const w = Math.round(win);
                this.bonusTotal += w;
                const fresh = gameStore.getState();
                fresh.setBalance(Math.round((fresh.balance + w) * 100) / 100);
                fresh.setWinAmount(w);
                this.updateBonusBar();
                await this.celebrate(win, true);
            }
            if (this.countScatter() >= 3) {
                this.spinsLeft += RETRIGGER;
                this.updateBonusBar();
                await this.showTakeover('RETRIGGER!', `+${RETRIGGER} free spins`, 0xff9d2a);
            }
            await this.wait(this.d(0.25));
        }

        await this.showTakeover('FEATURE WIN', `$${this.bonusTotal}`, 0xffd23d);
        this.bonusBar.visible = false;
        this.bonusActive = false;
        this.multiplier = 1;
        this.updateMult();
    }

    private updateBonusBar(): void {
        this.bonusBar.text = `FREE SPINS  ${this.spinsLeft}    ·    ×${this.multiplier}    ·    WON $${this.bonusTotal}`;
        gsap.fromTo(this.bonusBar.scale, { x: 1.08, y: 1.08 }, { x: 1, y: 1, duration: 0.2, ease: 'back.out(2)' });
    }

    // --- presentation feedback --------------------------------------------------------

    private updateMult(): void {
        this.multText.text = `×${this.multiplier}`;
        this.multText.style.fill = this.multiplier >= 10 ? 0xff4d6d : this.multiplier >= 3 ? 0xffd23d : 0x8fe3ff;
        gsap.fromTo(this.multText.scale, { x: 1.3, y: 1.3 }, { x: 1, y: 1, duration: 0.25, ease: 'back.out(2)' });
    }

    private rollWays(target: number): void {
        const o = { v: this.displayWays };
        gsap.killTweensOf(o);
        gsap.to(o, { v: target, duration: this.d(0.6), ease: 'power2.out',
            onUpdate: () => { this.waysText.text = `${Math.round(o.v).toLocaleString()} WAYS`; },
            onComplete: () => { this.displayWays = target; this.waysText.text = `${target.toLocaleString()} WAYS`; } });
    }

    private async celebrate(win: number, bonus: boolean): Promise<void> {
        const x = win / gameStore.getState().bet;
        this.winText.text = `WIN $${Math.round(win)}`;
        gsap.fromTo(this.winText.scale, { x: 1.4, y: 1.4 }, { x: 1, y: 1, duration: this.d(0.35), ease: 'back.out(2)' });
        if (x >= 20) {
            const name = x >= 200 ? 'MEGA WIN' : x >= 80 ? 'BIG WIN' : 'NICE WIN';
            const tint = x >= 200 ? 0xff4d6d : x >= 80 ? 0xff9d2a : 0xffd23d;
            this.bigWinFx(x >= 80);
            await this.showTakeover(name, `$${Math.round(win)}`, tint);
        } else {
            await this.wait(this.d(bonus ? 0.4 : 0.7));
        }
    }

    private async showTakeover(headline: string, sub: string, tint: number): Promise<void> {
        this.banner.text = headline;
        this.banner.style.fill = tint;
        this.banner.style.dropShadow = { color: tint, blur: 28, distance: 0, alpha: 0.9, angle: Math.PI / 6 };
        const subT = this.bannerSub;
        subT.text = sub;
        this.banner.visible = true;
        subT.visible = true;
        this.banner.alpha = 1;
        subT.alpha = 1;
        gsap.killTweensOf(this.banner.scale);
        gsap.fromTo(this.banner.scale, { x: 0.3, y: 0.3 }, { x: 1, y: 1, duration: this.d(0.5), ease: 'back.out(2.2)' });
        gsap.fromTo(subT, { alpha: 0 }, { alpha: 1, duration: this.d(0.3), delay: this.d(0.2) });
        await this.wait(this.d(1.5));
        gsap.to(this.banner, { alpha: 0, duration: this.d(0.3) });
        gsap.to(subT, { alpha: 0, duration: this.d(0.3), onComplete: () => { this.banner.visible = false; subT.visible = false; } });
        await this.wait(this.d(0.32));
    }

    private burstAt(x: number, y: number, color: number): void {
        for (let i = 0; i < 8; i++) {
            let p = this.bursts.find((g) => !g.visible);
            if (!p) { p = new Graphics(); p.visible = false; this.fxLayer.addChild(p); this.bursts.push(p); }
            const rr = 4 + Math.random() * 8;
            p.clear().circle(0, 0, rr).fill({ color: Math.random() < 0.3 ? 0xffffff : color });
            p.position.set(x, y);
            p.alpha = 1; p.scale.set(1); p.visible = true;
            const a = Math.random() * Math.PI * 2;
            const sp = 120 + Math.random() * 220;
            gsap.killTweensOf(p);
            gsap.to(p, { x: x + Math.cos(a) * sp * 0.6, y: y + Math.sin(a) * sp * 0.6 + 120, alpha: 0, duration: this.d(0.55), ease: 'power2.out', onComplete: () => { p.visible = false; } });
            gsap.to(p.scale, { x: 0.2, y: 0.2, duration: this.d(0.55) });
        }
    }

    private bigWinFx(epic: boolean): void {
        if (!this.godray) this.godray = new GodrayFilter({ angle: 28, gain: 0.5, lacunarity: 2.6, parallel: true, alpha: 0 });
        const ray = this.godray;
        this.bgLayer.filters = [ray];
        gsap.killTweensOf(ray);
        gsap.timeline({ onComplete: () => { this.bgLayer.filters = []; } })
            .to(ray, { alpha: epic ? 0.85 : 0.55, duration: 0.5 })
            .to(ray, { alpha: 0, duration: 1.2 }, '+=1.6');
        const count = epic ? 40 : 24;
        for (let i = 0; i < count; i++) {
            let c = this.coins.find((g) => !g.visible);
            if (!c) { c = new Graphics(); c.visible = false; this.fxLayer.addChild(c); this.coins.push(c); }
            const size = 9 + Math.random() * 9;
            c.clear()
                .ellipse(0, 0, size, size * 0.78).fill({ color: 0xffd54f })
                .ellipse(0, 0, size, size * 0.78).stroke({ width: 2.5, color: 0x8a6512 })
                .ellipse(-size * 0.3, -size * 0.25, size * 0.3, size * 0.18).fill({ color: 0xfff6cf, alpha: 0.9 });
            const sx = Math.random() * BOARD_W;
            c.position.set(sx, -40 - Math.random() * 200);
            c.alpha = 1; c.scale.set(1); c.visible = true;
            gsap.killTweensOf(c);
            gsap.to(c, { y: BOARD_H + 60, x: sx + (Math.random() - 0.5) * 160, rotation: (Math.random() - 0.5) * 8, duration: 1.4 + Math.random() * 1, delay: Math.random() * 0.5, ease: 'power1.in', onComplete: () => { c.visible = false; } });
            gsap.to(c.scale, { x: 0.25, duration: 0.22, yoyo: true, repeat: 9, ease: 'sine.inOut' });
        }
    }

    // --- env + UI ---------------------------------------------------------------------

    private lighten(c: number, t: number): number { const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255; return ((r + (255 - r) * t) | 0) << 16 | ((g + (255 - g) * t) | 0) << 8 | ((b + (255 - b) * t) | 0); }
    private darken(c: number, t: number): number { const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255; return ((r * (1 - t)) | 0) << 16 | ((g * (1 - t)) | 0) << 8 | ((b * (1 - t)) | 0); }

    private buildBackground(): void {
        const W = GameConfig.width;
        const H = GameConfig.height;
        this.bgLayer.addChild(new Graphics().rect(0, 0, W, H).fill(new FillGradient({
            type: 'linear', start: { x: 0, y: 0 }, end: { x: 0, y: 1 }, textureSpace: 'local',
            colorStops: [{ offset: 0, color: 0x241046 }, { offset: 0.55, color: 0x15082e }, { offset: 1, color: 0x0a0418 }],
        })));
        // Radiant burst behind the reels.
        this.bgLayer.addChild(new Graphics().ellipse(W / 2 - 70, BOARD_Y + BOARD_H / 2, 900, 560).fill(new FillGradient({
            type: 'radial', center: { x: 0.5, y: 0.5 }, innerRadius: 0, outerCenter: { x: 0.5, y: 0.5 }, outerRadius: 0.5, textureSpace: 'local',
            colorStops: [{ offset: 0, color: 'rgba(160,80,255,0.25)' }, { offset: 1, color: 'rgba(120,40,200,0)' }],
        })));
        // Reel well.
        this.bgLayer.addChild(new Graphics()
            .roundRect(BOARD_X - 18, BOARD_Y - 18, BOARD_W + 36, BOARD_H + 36, 24).fill({ color: 0x0a0518, alpha: 0.9 })
            .roundRect(BOARD_X - 18, BOARD_Y - 18, BOARD_W + 36, BOARD_H + 36, 24).stroke({ width: 5, color: 0xffd23d, alpha: 0.7 }));
        // Faint reel separators.
        const seps = new Graphics();
        for (let r = 1; r < REELS; r++) {
            const x = BOARD_X + r * (REEL_W + REEL_GAP) - REEL_GAP / 2;
            seps.rect(x - 1, BOARD_Y, 2, BOARD_H).fill({ color: 0xffffff, alpha: 0.05 });
        }
        this.bgLayer.addChild(seps);

        const title = new Text({ text: 'ROYAL MEGAWAYS', style: {
            fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 40, fontWeight: '900', letterSpacing: 5,
            fill: 0xffd23d, stroke: { color: 0x2a1004, width: 7 },
            dropShadow: { color: 0x9a4fff, blur: 18, distance: 0, alpha: 0.6 },
        } });
        title.anchor.set(0, 0.5);
        title.position.set(BOARD_X - 6, 96);
        this.bgLayer.addChild(title);
    }

    private bannerSub!: Text;

    private createUI(): void {
        const cx = 1758;

        // MEGAWAYS counter pill (top-centre over the board).
        const waysPill = new Graphics()
            .roundRect(BOARD_X + BOARD_W / 2 - 230, 70, 460, 52, 26).fill({ color: 0x1a0a3a, alpha: 0.95 })
            .roundRect(BOARD_X + BOARD_W / 2 - 230, 70, 460, 52, 26).stroke({ width: 3, color: 0x9a4fff });
        this.uiContainer.addChild(waysPill);
        this.waysText = new Text({ text: '', style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 30, fontWeight: '900', letterSpacing: 2, fill: 0xc9a8ff } });
        this.waysText.anchor.set(0.5);
        this.waysText.position.set(BOARD_X + BOARD_W / 2, 96);
        this.uiContainer.addChild(this.waysText);

        // Win + multiplier readouts under the board.
        this.winText = new Text({ text: '', style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 40, fontWeight: '900', fill: 0xffd23d, stroke: { color: 0x2a1004, width: 6 } } });
        this.winText.anchor.set(0.5);
        this.winText.position.set(BOARD_X + BOARD_W / 2 - 120, BOARD_Y + BOARD_H + 36);
        this.uiContainer.addChild(this.winText);
        this.multText = new Text({ text: '×1', style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 44, fontWeight: '900', fill: 0x8fe3ff, stroke: { color: 0x05182a, width: 6 } } });
        this.multText.anchor.set(0.5);
        this.multText.position.set(BOARD_X + BOARD_W / 2 + 180, BOARD_Y + BOARD_H + 36);
        this.uiContainer.addChild(this.multText);

        // Big win / feature banner.
        this.banner = new Text({ text: '', style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 110, fontWeight: '900', fill: 0xffd23d, stroke: { color: 0x2a1004, width: 12 } } });
        this.banner.anchor.set(0.5);
        this.banner.position.set(BOARD_X + BOARD_W / 2, BOARD_Y + BOARD_H / 2 - 20);
        this.banner.visible = false;
        this.uiContainer.addChild(this.banner);
        this.bannerSub = new Text({ text: '', style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 44, fontWeight: '900', fill: 0xffffff, stroke: { color: 0x2a1004, width: 7 } } });
        this.bannerSub.anchor.set(0.5);
        this.bannerSub.position.set(BOARD_X + BOARD_W / 2, BOARD_Y + BOARD_H / 2 + 64);
        this.bannerSub.visible = false;
        this.uiContainer.addChild(this.bannerSub);

        this.bonusBar = new Text({ text: '', style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 26, fontWeight: '900', letterSpacing: 2, fill: 0xffd23d, stroke: { color: 0x2a1004, width: 6 } } });
        this.bonusBar.anchor.set(0.5);
        this.bonusBar.position.set(BOARD_X + BOARD_W / 2, 150);
        this.bonusBar.visible = false;
        this.uiContainer.addChild(this.bonusBar);

        // Right control panel.
        this.uiContainer.addChild(new Graphics()
            .roundRect(1618, 140, 280, 880, 26).fill({ color: 0x140a26, alpha: 0.96 })
            .roundRect(1618, 140, 280, 880, 26).stroke({ width: 3, color: 0x6a3aa8 })
            .roundRect(1628, 150, 260, 860, 20).stroke({ width: 1.5, color: 0xffd23d, alpha: 0.3 }));

        const section = (txt: string, y: number): void => {
            const t = new Text({ text: txt, style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 16, fontWeight: '900', letterSpacing: 3, fill: 0xb088d8 } });
            t.anchor.set(0.5); t.position.set(cx, y); this.uiContainer.addChild(t);
        };

        section('BET', 200);
        this.betValueText = new Text({ text: `$${gameStore.getState().bet}`, style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 36, fontWeight: '900', fill: 0xffffff } });
        this.betValueText.anchor.set(0.5);
        this.betValueText.position.set(cx, 254);
        this.uiContainer.addChild(this.betValueText);
        const stepBtn = (dx: number, glyph: string, dir: number): void => {
            const b = new Graphics().circle(0, 0, 26).fill({ color: 0x2a1648 }).circle(0, 0, 26).stroke({ width: 2, color: 0x6a3aa8 });
            b.position.set(cx + dx, 254);
            b.eventMode = 'static'; b.cursor = 'pointer';
            b.on('pointerdown', () => {
                if (this.busy) return;
                gsap.fromTo(b.scale, { x: 0.85, y: 0.85 }, { x: 1, y: 1, duration: 0.25, ease: 'back.out(3)' });
                const s = gameStore.getState();
                const i = BET_STEPS.findIndex((v) => v >= s.bet);
                const next = BET_STEPS[Math.max(0, Math.min(BET_STEPS.length - 1, (i < 0 ? BET_STEPS.length - 1 : i) + dir))];
                s.setBet(next); this.betValueText.text = `$${next}`;
            });
            const t = new Text({ text: glyph, style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 28, fontWeight: '900', fill: 0xc9a8ff } });
            t.anchor.set(0.5); b.addChild(t); this.uiContainer.addChild(b);
        };
        stepBtn(-80, '−', -1);
        stepBtn(80, '+', 1);

        // SPIN.
        this.spinButton = new Graphics();
        this.spinButton.position.set(cx, 420);
        this.spinButton.eventMode = 'static'; this.spinButton.cursor = 'pointer';
        this.spinButton.on('pointerdown', () => { gsap.fromTo(this.spinButton.scale, { x: 0.94, y: 0.94 }, { x: 1, y: 1, duration: 0.3, ease: 'back.out(3)' }); void this.spin(); });
        this.spinLabel = new Text({ text: 'SPIN', style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 38, fontWeight: '900', fill: 0xffffff } });
        this.spinLabel.anchor.set(0.5);
        this.spinButton.addChild(this.spinLabel);
        this.uiContainer.addChild(this.spinButton);
        this.styleSpin();

        // TURBO.
        section('TURBO', 540);
        this.turboPill = new Graphics();
        this.turboPill.position.set(cx, 596);
        this.turboPill.eventMode = 'static'; this.turboPill.cursor = 'pointer';
        this.turboLabel = new Text({ text: '', style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 22, fontWeight: '900', fill: 0xffffff } });
        this.turboLabel.anchor.set(0.5);
        this.turboPill.addChild(this.turboLabel);
        this.turboPill.on('pointerdown', () => this.toggleTurbo());
        this.uiContainer.addChild(this.turboPill);
        this.styleTurbo();

        // Pay info.
        section('FEATURE', 690);
        const info = new Text({ text: '4+ ★ scatters\nwin 12 free spins\nmultiplier never resets', style: { fontFamily: 'Arial, sans-serif', fontSize: 18, fontWeight: 'bold', fill: 0xc9a8ff, align: 'center', lineHeight: 26 } });
        info.anchor.set(0.5);
        info.position.set(cx, 760);
        this.uiContainer.addChild(info);

        this.balanceText = new Text({ text: '', style: { fontFamily: 'Arial, sans-serif', fontSize: 22, fontWeight: 'bold', fill: 0xc9a8ff } });
        this.balanceText.anchor.set(0.5);
        this.balanceText.position.set(cx, 980);
        this.uiContainer.addChild(this.balanceText);

        const back = new Text({ text: '‹ MENU', style: { fill: 0xffd23d, fontSize: 26, fontWeight: 'bold' } });
        back.position.set(BOARD_X - 6, 150);
        back.eventMode = 'static'; back.cursor = 'pointer';
        back.on('pointerdown', () => SceneManager.switchScene(new MenuScene()));
        // (back-to-menu removed) this.uiContainer.addChild(back);

        const render = (s: ReturnType<typeof gameStore.getState>): void => {
            this.balanceText.text = `Balance  $${Math.round(s.balance * 100) / 100}`;
        };
        render(gameStore.getState());
        gameStore.subscribe(render);
    }

    private styleSpin(): void {
        const ready = !this.busy && !this.bonusActive;
        this.spinButton.clear()
            .circle(0, 6, 64).fill({ color: 0x4a1a8a, alpha: 0.5 })
            .circle(0, 0, 64).fill(new FillGradient({
                type: 'linear', start: { x: 0, y: 0 }, end: { x: 0, y: 1 }, textureSpace: 'local',
                colorStops: [{ offset: 0, color: ready ? 0xb86aff : 0x5a3a7a }, { offset: 1, color: ready ? 0x7a2ad8 : 0x3a2452 }],
            }))
            .circle(0, 0, 64).stroke({ width: 5, color: ready ? 0xffd23d : 0x6a4a8a });
        this.spinLabel.text = this.bonusActive ? 'BONUS' : this.busy ? '…' : 'SPIN';
        this.spinButton.cursor = ready ? 'pointer' : 'default';
    }

    private toggleTurbo(): void { this.turbo = !this.turbo; this.styleTurbo(); }
    private styleTurbo(): void {
        const on = this.turbo;
        this.turboPill.clear()
            .roundRect(-86, -28, 172, 56, 28).fill({ color: on ? 0x7a2ad8 : 0x2a1648 })
            .roundRect(-86, -28, 172, 56, 28).stroke({ width: 3, color: on ? 0xffd23d : 0x6a3aa8 });
        this.turboLabel.text = on ? 'TURBO ON' : 'TURBO OFF';
    }
}
