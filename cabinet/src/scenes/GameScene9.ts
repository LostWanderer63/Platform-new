import { Text, Container, Graphics, Sprite, FillGradient } from 'pixi.js';
import { gsap } from 'gsap';
import { BaseScene } from './BaseScene';
import { GameConfig } from '../config/GameConfig';
import { gameStore } from '../state/GameState';
import { SceneManager } from '../managers/SceneManager';
import { AssetManager } from '../managers/AssetManager';
import { MenuScene } from './MenuScene';

/**
 * GameScene9 — Slot 9: "Dragon Tower"
 * ------------------------------------
 * Tower-climb gambling game. Nine rows of stone tiles guard the dragon's
 * hoard — every row hides one flame trap. Pick a safe tile to find a dragon
 * egg and climb; the multiplier compounds every row. Cash out any time, or
 * touch a flame and the stake burns. Reach the top for the grand prize.
 *
 *   EASY = 3 tiles per row (1 trap) → ~37x at the top
 *   HARD = 2 tiles per row (1 trap) → ~496x at the top
 *
 * Production touches:
 *  - lava-lit cavern, drifting embers, flickering wall torches
 *  - active row glow sweep; eggs pop in with sparkles, traps erupt in flame
 *  - per-row multiplier ladder that lights up as you climb
 *  - bust reveals every trap in the tower (ghosted), shake + red flash
 *  - cash-out coin fountain; grand-win banner at the summit
 */

const ROWS = 9;
const TILE_W = 150;
const TILE_H = 62;
const ROW_GAP = 78;
const HOUSE_EDGE = 0.97;
const BET_STEPS = [1, 2, 5, 10, 20, 50, 100];

type Phase = 'idle' | 'playing' | 'done';
type Difficulty = 'easy' | 'hard';

const TILES_PER_ROW: Record<Difficulty, number> = { easy: 3, hard: 2 };

function rowMult(rowsDone: number, diff: Difficulty): number {
    const n = TILES_PER_ROW[diff];
    return HOUSE_EDGE * Math.pow(n / (n - 1), rowsDone);
}

interface TowerTile {
    root: Container;
    face: Graphics;
    row: number;
    col: number;
    revealed: boolean;
}

export class GameScene9 extends BaseScene {
    private readonly towerCx = 720;
    private readonly baseY = 880;

    private readonly towerLayer = new Container();
    private readonly fxLayer = new Container();
    private readonly uiContainer = new Container();

    private phase: Phase = 'idle';
    private diff: Difficulty = 'easy';
    private row = 0;                  // current row to pick (0 = bottom)
    private traps: number[] = [];     // trap column per row
    private tiles: TowerTile[][] = [];
    private ladder: { plaque: Graphics; label: Text }[] = [];
    private rowGlow!: Graphics;

    private banner!: Text;
    private actionButton!: Graphics;
    private actionLabel!: Text;
    private actionSub!: Text;
    private betValueText!: Text;
    private balanceText!: Text;
    private redFlash!: Graphics;
    private readonly diffPills: { pill: Graphics; label: Text; value: Difficulty }[] = [];
    private readonly sparkles: Graphics[] = [];
    private readonly flames: Graphics[] = [];
    private readonly coins: Graphics[] = [];
    private readonly embers: { x: number; y: number; r: number; vy: number; phase: number }[] = [];
    private emberGfx!: Graphics;
    private elapsed = 0;

    private readonly onKeyDown = (e: KeyboardEvent): void => {
        if (e.code === 'Space') { e.preventDefault(); this.action(); }
        // (back-to-menu removed) if (e.code === 'Escape') SceneManager.switchScene(new MenuScene());
    };

    public async init(): Promise<void> {
        this.addChild(await this.buildBackground());
        this.addChild(this.towerLayer);
        this.addChild(this.fxLayer);
        this.addChild(this.uiContainer);
        this.buildTower();
        this.createUI();
        this.updateLadder();
        window.addEventListener('keydown', this.onKeyDown);
    }

    public async start(): Promise<void> {}
    public resize(_width: number, _height: number): void {}

    public update(delta: number): void {
        if (!this.emberGfx) return; // ticker can fire before async init() resolves
        const dt = Math.min(delta / 60, 1 / 30);
        this.elapsed += dt;
        // Embers drift up from the lava.
        this.emberGfx.clear();
        for (const e of this.embers) {
            e.y -= e.vy * dt;
            e.x += Math.sin(this.elapsed * 1.4 + e.phase) * 14 * dt;
            if (e.y < -10) { e.y = GameConfig.height + 10; e.x = Math.random() * GameConfig.width; }
            const tw = 0.3 + 0.25 * Math.sin(this.elapsed * 3 + e.phase * 5);
            this.emberGfx.circle(e.x, e.y, e.r).fill({ color: 0xff8a3d, alpha: tw });
        }
    }

    public override async destroyScene(): Promise<void> {
        window.removeEventListener('keydown', this.onKeyDown);
        gsap.killTweensOf(this.position);
        gsap.killTweensOf(this.rowGlow);
        for (const row of this.tiles) for (const t of row) { gsap.killTweensOf(t.root.scale); gsap.killTweensOf(t.root); }
        for (const pool of [this.sparkles, this.flames, this.coins]) for (const g of pool) gsap.killTweensOf(g);
        gsap.killTweensOf(this.banner);
        gsap.killTweensOf(this.banner.scale);
        gsap.killTweensOf(this.redFlash);
        await super.destroyScene();
    }

    // --- round flow --------------------------------------------------------------

    private action(): void {
        const state = gameStore.getState();
        if (this.phase === 'idle') {
            if (state.balance < state.bet) return;
            state.setBalance(state.balance - state.bet);
            state.setWinAmount(0);
            this.startRound();
        } else if (this.phase === 'playing' && this.row > 0) {
            this.cashOut();
        }
    }

    private startRound(): void {
        this.phase = 'playing';
        this.row = 0;
        const n = TILES_PER_ROW[this.diff];
        this.traps = Array.from({ length: ROWS }, () => (Math.random() * n) | 0);
        this.resetTiles();
        this.setRowGlow(0);
        this.styleAction(0x232a3a, 0x3a4663, 'CASH OUT', 'clear a row first');
        this.updateLadder();
    }

    private pick(t: TowerTile): void {
        if (this.phase !== 'playing' || t.row !== this.row || t.revealed) return;
        t.revealed = true;
        const trap = this.traps[t.row] === t.col;
        if (trap) {
            this.bust(t);
            return;
        }
        this.revealEgg(t);
        this.row++;
        this.updateLadder();
        const state = gameStore.getState();
        const mult = rowMult(this.row, this.diff);
        this.styleAction(0x28a909, 0x5be32a, 'CASH OUT', `$${Math.floor(state.bet * mult)} @ ${mult.toFixed(2)}x`);
        if (this.row >= ROWS) {
            this.cashOut(true);
        } else {
            this.setRowGlow(this.row);
        }
    }

    private cashOut(summit = false): void {
        const state = gameStore.getState();
        const mult = rowMult(this.row, this.diff);
        const win = Math.floor(state.bet * mult);
        state.setBalance(state.balance + win);
        state.setWinAmount(win);
        this.phase = 'done';
        this.rowGlow.visible = false;
        this.ghostReveal();
        this.styleAction(0x28a909, 0x5be32a, 'BANKED', `$${win} @ ${mult.toFixed(2)}x`);
        this.showBanner(summit ? `TOWER CLEARED! +$${win}` : `+$${win}`, summit ? 0xffd54f : 0x7dffb0);
        this.coinFountain(this.towerCx, this.baseY - this.row * ROW_GAP, Math.min(40, 10 + this.row * 4));
        if (summit) this.shake(14);
        gsap.delayedCall(1.8, () => this.toIdle());
    }

    private bust(t: TowerTile): void {
        this.phase = 'done';
        this.rowGlow.visible = false;
        this.revealFlame(t, true);
        this.ghostReveal();
        this.shake(16);
        gsap.killTweensOf(this.redFlash);
        gsap.timeline()
            .set(this.redFlash, { alpha: 0.3 })
            .to(this.redFlash, { alpha: 0, duration: 0.7, ease: 'power2.out' });
        this.styleAction(0x5a1020, 0xff4d6d, 'BURNED', `lost $${gameStore.getState().bet}`);
        this.showBanner('BURNED!', 0xff4d6d);
        gsap.delayedCall(2.0, () => this.toIdle());
    }

    private toIdle(): void {
        this.phase = 'idle';
        this.row = 0;
        this.resetTiles();
        this.rowGlow.visible = false;
        this.styleAction(0xb8860b, 0xffd54f, 'START', `bet $${gameStore.getState().bet} · ${this.diff.toUpperCase()}`);
        this.updateLadder();
    }

    /** Ghost-reveal every unrevealed trap/egg when the round ends. */
    private ghostReveal(): void {
        this.tiles.forEach((rowTiles, r) => {
            for (const t of rowTiles) {
                if (t.revealed) continue;
                t.revealed = true;
                t.root.alpha = 0.45;
                if (this.traps[r] === t.col) this.revealFlame(t, false);
                else this.drawEggFace(t);
            }
        });
    }

    // --- tower -------------------------------------------------------------------

    private tileX(col: number, n: number): number {
        return this.towerCx + (col - (n - 1) / 2) * (TILE_W + 24);
    }

    private buildTower(): void {
        // Stone tower shaft behind the tiles.
        const shaftW = 3 * (TILE_W + 24) + 60;
        const top = this.baseY - (ROWS - 1) * ROW_GAP - 70;
        this.towerLayer.addChild(new Graphics()
            .roundRect(this.towerCx - shaftW / 2, top, shaftW, this.baseY - top + 110, 26)
            .fill({ color: 0x171420, alpha: 0.88 })
            .roundRect(this.towerCx - shaftW / 2, top, shaftW, this.baseY - top + 110, 26)
            .stroke({ width: 4, color: 0x5a4a3a })
            .roundRect(this.towerCx - shaftW / 2 + 12, top + 12, shaftW - 24, this.baseY - top + 86, 18)
            .stroke({ width: 2, color: 0xff8a3d, alpha: 0.25 }));

        // Sconce torches mounted on the tower's top corners — clear of the
        // multiplier ladder on the left and the control panel on the right.
        for (const side of [-1, 1]) {
            const sx = this.towerCx + side * (shaftW / 2 - 4);
            const sy = top + 44;
            const bracket = new Graphics()
                .poly([sx - 14, sy + 4, sx + 14, sy + 4, sx + 8, sy + 26, sx - 8, sy + 26]).fill(new FillGradient({
                    type: 'linear', start: { x: 0, y: 0 }, end: { x: 0, y: 1 }, textureSpace: 'local',
                    colorStops: [{ offset: 0, color: 0xd4af37 }, { offset: 1, color: 0x6e5410 }],
                }))
                .poly([sx - 14, sy + 4, sx + 14, sy + 4, sx + 8, sy + 26, sx - 8, sy + 26]).stroke({ width: 2, color: 0x3a2c08 })
                .rect(sx - 3, sy + 26, 6, 14).fill({ color: 0x6e5410 });
            this.towerLayer.addChild(bracket);
            const glow = new Graphics().circle(sx, sy - 14, 34).fill({ color: 0xff9d3d, alpha: 0.18 });
            glow.blendMode = 'add';
            this.towerLayer.addChild(glow);
            const flame = new Graphics()
                .ellipse(0, 0, 13, 23).fill({ color: 0xffb74d, alpha: 0.9 })
                .ellipse(0, 5, 7, 12).fill({ color: 0xfff3d0, alpha: 0.95 });
            flame.blendMode = 'add';
            flame.position.set(sx, sy - 14);
            this.towerLayer.addChild(flame);
            const flick = (): void => {
                gsap.to(flame, { alpha: 0.55 + Math.random() * 0.45, duration: 0.1 + Math.random() * 0.15, onComplete: flick });
                gsap.to(flame.scale, { x: 0.85 + Math.random() * 0.3, y: 0.8 + Math.random() * 0.4, duration: 0.1 + Math.random() * 0.15 });
                gsap.to(glow, { alpha: 0.6 + Math.random() * 0.4, duration: 0.1 + Math.random() * 0.15 });
            };
            flick();
        }

        // Row glow indicator (re-positioned per active row).
        this.rowGlow = new Graphics()
            .roundRect(-shaftW / 2 + 18, -TILE_H / 2 - 8, shaftW - 36, TILE_H + 16, 16)
            .stroke({ width: 4, color: 0xffd54f, alpha: 0.9 });
        this.rowGlow.blendMode = 'add';
        this.rowGlow.position.set(this.towerCx, 0);
        this.rowGlow.visible = false;
        this.towerLayer.addChild(this.rowGlow);

        this.rebuildTiles();
    }

    /** Build tile grid for the current difficulty. */
    private rebuildTiles(): void {
        for (const row of this.tiles) for (const t of row) { gsap.killTweensOf(t.root.scale); t.root.destroy({ children: true }); }
        this.tiles = [];
        const n = TILES_PER_ROW[this.diff];
        for (let r = 0; r < ROWS; r++) {
            const rowTiles: TowerTile[] = [];
            for (let c = 0; c < n; c++) {
                const root = new Container();
                root.position.set(this.tileX(c, n), this.baseY - r * ROW_GAP);
                const face = new Graphics();
                root.addChild(face);
                const tile: TowerTile = { root, face, row: r, col: c, revealed: false };
                this.drawStoneFace(tile);
                root.eventMode = 'static';
                root.cursor = 'pointer';
                root.on('pointerover', () => {
                    if (this.phase === 'playing' && tile.row === this.row && !tile.revealed) {
                        gsap.to(root.scale, { x: 1.07, y: 1.07, duration: 0.15 });
                    }
                });
                root.on('pointerout', () => gsap.to(root.scale, { x: 1, y: 1, duration: 0.15 }));
                root.on('pointerdown', () => this.pick(tile));
                rowTiles.push(tile);
                this.towerLayer.addChild(root);
            }
            this.tiles.push(rowTiles);
        }
    }

    private resetTiles(): void {
        for (const row of this.tiles) {
            for (const t of row) {
                t.revealed = false;
                t.root.alpha = 1;
                t.root.scale.set(1);
                this.drawStoneFace(t);
            }
        }
    }

    /** Unrevealed stone tile with a carved claw mark. */
    private drawStoneFace(t: TowerTile): void {
        const g = t.face;
        g.clear()
            .roundRect(-TILE_W / 2 + 2, -TILE_H / 2 + 4, TILE_W, TILE_H, 12).fill({ color: 0x000000, alpha: 0.4 })
            .roundRect(-TILE_W / 2, -TILE_H / 2, TILE_W, TILE_H, 12).fill(new FillGradient({
                type: 'linear', start: { x: 0, y: 0 }, end: { x: 0, y: 1 }, textureSpace: 'local',
                colorStops: [{ offset: 0, color: 0x6a5a4c }, { offset: 0.5, color: 0x4a3e34 }, { offset: 1, color: 0x2c241e }],
            }))
            .roundRect(-TILE_W / 2, -TILE_H / 2, TILE_W, TILE_H, 12).stroke({ width: 3, color: 0x1a140e })
            .roundRect(-TILE_W / 2 + 5, -TILE_H / 2 + 5, TILE_W - 10, TILE_H - 10, 9).stroke({ width: 1.5, color: 0x8a7a64, alpha: 0.5 });
        // Claw scratches.
        for (let i = -1; i <= 1; i++) {
            g.moveTo(i * 14 - 10, -12).lineTo(i * 14 + 4, 14).stroke({ width: 3, color: 0x1a140e, alpha: 0.6 });
        }
        t.root.removeChildren();
        t.root.addChild(g);
    }

    /** Safe pick: golden dragon egg pops out of the stone. */
    private drawEggFace(t: TowerTile): void {
        const g = t.face;
        g.clear()
            .roundRect(-TILE_W / 2, -TILE_H / 2, TILE_W, TILE_H, 12).fill({ color: 0x1c2a1e })
            .roundRect(-TILE_W / 2, -TILE_H / 2, TILE_W, TILE_H, 12).stroke({ width: 3, color: 0x5be32a, alpha: 0.8 });
        g.ellipse(0, 2, 17, 23).fill(new FillGradient({
            type: 'radial', center: { x: 0.38, y: 0.3 }, innerRadius: 0.05, outerCenter: { x: 0.5, y: 0.5 }, outerRadius: 0.8, textureSpace: 'local',
            colorStops: [{ offset: 0, color: 0xfff3b0 }, { offset: 0.5, color: 0xffc83d }, { offset: 1, color: 0x9a6a0c }],
        }));
        g.ellipse(0, 2, 17, 23).stroke({ width: 2, color: 0x6e4a08 });
        g.circle(-5, -6, 3).fill({ color: 0xfff6cf, alpha: 0.9 });
        g.circle(6, 4, 2.4).fill({ color: 0x9a6a0c, alpha: 0.7 });
        g.circle(-3, 10, 2).fill({ color: 0x9a6a0c, alpha: 0.7 });
    }

    private revealEgg(t: TowerTile): void {
        this.drawEggFace(t);
        gsap.fromTo(t.root.scale, { x: 0.7, y: 0.7 }, { x: 1, y: 1, duration: 0.35, ease: 'back.out(2.5)' });
        this.sparkleBurst(t.root.x, t.root.y);
    }

    /** Trap: flame tile; `eruption` adds the big burst on the killing pick. */
    private revealFlame(t: TowerTile, eruption: boolean): void {
        const g = t.face;
        g.clear()
            .roundRect(-TILE_W / 2, -TILE_H / 2, TILE_W, TILE_H, 12).fill({ color: 0x2a0e0a })
            .roundRect(-TILE_W / 2, -TILE_H / 2, TILE_W, TILE_H, 12).stroke({ width: 3, color: 0xff4d2e, alpha: 0.9 });
        g.moveTo(0, 18)
            .bezierCurveTo(-16, 8, -12, -4, 0, -22)
            .bezierCurveTo(4, -10, 14, -8, 10, 4)
            .bezierCurveTo(16, 8, 8, 16, 0, 18)
            .fill(new FillGradient({
                type: 'linear', start: { x: 0, y: 1 }, end: { x: 0, y: 0 }, textureSpace: 'local',
                colorStops: [{ offset: 0, color: 0xe8421c }, { offset: 0.55, color: 0xff8a3d }, { offset: 1, color: 0xffe98a }],
            }));
        if (eruption) {
            gsap.fromTo(t.root.scale, { x: 1.25, y: 1.25 }, { x: 1, y: 1, duration: 0.4, ease: 'back.out(2)' });
            this.flameBurst(t.root.x, t.root.y);
        }
    }

    private setRowGlow(row: number): void {
        this.rowGlow.visible = true;
        gsap.killTweensOf(this.rowGlow);
        gsap.to(this.rowGlow, { y: this.baseY - row * ROW_GAP, duration: 0.35, ease: 'power2.out' });
        this.rowGlow.alpha = 1;
        gsap.to(this.rowGlow, { alpha: 0.45, duration: 0.7, yoyo: true, repeat: -1, ease: 'sine.inOut' });
    }

    // --- effects -----------------------------------------------------------------

    private star(g: Graphics, r: number, color: number): void {
        const pts: number[] = [];
        for (let i = 0; i < 8; i++) {
            const rad = i % 2 === 0 ? r : r * 0.4;
            const a = (Math.PI * i) / 4 - Math.PI / 2;
            pts.push(Math.cos(a) * rad, Math.sin(a) * rad);
        }
        g.poly(pts).fill({ color });
    }

    private sparkleBurst(x: number, y: number): void {
        for (let i = 0; i < 6; i++) {
            let s = this.sparkles.find((g) => !g.visible);
            if (!s) {
                s = new Graphics();
                s.blendMode = 'add';
                s.visible = false;
                this.fxLayer.addChild(s);
                this.sparkles.push(s);
            }
            s.clear();
            this.star(s, 6 + Math.random() * 8, i % 2 === 0 ? 0xffd54f : 0xffffff);
            s.position.set(x, y);
            s.alpha = 1;
            s.visible = true;
            const a = Math.random() * Math.PI * 2;
            const d = 36 + Math.random() * 60;
            gsap.killTweensOf(s);
            gsap.to(s, {
                x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, alpha: 0,
                duration: 0.5 + Math.random() * 0.3, ease: 'power2.out',
                onComplete: () => { s.visible = false; },
            });
        }
    }

    private flameBurst(x: number, y: number): void {
        for (let i = 0; i < 26; i++) {
            let p = this.flames.find((g) => !g.visible);
            if (!p) {
                p = new Graphics();
                p.blendMode = 'add';
                p.visible = false;
                this.fxLayer.addChild(p);
                this.flames.push(p);
            }
            const colors = [0xffe98a, 0xff8a3d, 0xff4d2e, 0xe8421c];
            p.clear().circle(0, 0, 4 + Math.random() * 9).fill({ color: colors[i % colors.length] });
            p.position.set(x, y);
            p.alpha = 1;
            p.visible = true;
            const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
            const speed = 120 + Math.random() * 320;
            gsap.killTweensOf(p);
            gsap.to(p, {
                x: x + Math.cos(a) * speed * 0.5,
                y: y + Math.sin(a) * speed * 0.5,
                alpha: 0,
                duration: 0.5 + Math.random() * 0.4,
                ease: 'power2.out',
                onComplete: () => { p.visible = false; },
            });
        }
    }

    private coinFountain(x: number, y: number, count: number): void {
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
                .ellipse(0, 0, size, size * 0.8).stroke({ width: 2, color: 0x8a6512 });
            c.position.set(x, y);
            c.alpha = 1;
            c.visible = true;
            const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.8;
            const speed = 280 + Math.random() * 360;
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
        this.banner.alpha = 1;
        this.banner.visible = true;
        gsap.killTweensOf(this.banner);
        gsap.killTweensOf(this.banner.scale);
        gsap.fromTo(this.banner.scale, { x: 0.3, y: 0.3 }, { x: 1, y: 1, duration: 0.45, ease: 'back.out(2.2)' });
        gsap.to(this.banner, { alpha: 0, duration: 0.5, delay: 1.4, onComplete: () => { this.banner.visible = false; } });
    }

    // --- presentation ----------------------------------------------------------------

    private async buildBackground(): Promise<Container> {
        const env = new Container();
        const W = GameConfig.width;
        const H = GameConfig.height;

        // Painted volcanic backdrop (generated by tools/gen-art.mjs).
        const tex = await AssetManager.loadFirstTexture(['tower-bg.png']);
        if (tex) {
            const bg = new Sprite(tex);
            bg.width = W;
            bg.height = H;
            env.addChild(bg);
        } else {
            env.addChild(new Graphics().rect(0, 0, W, H).fill(new FillGradient({
                type: 'linear', start: { x: 0, y: 0 }, end: { x: 0, y: 1 }, textureSpace: 'local',
                colorStops: [{ offset: 0, color: 0x120c1c }, { offset: 0.6, color: 0x1c1016 }, { offset: 1, color: 0x2a0e08 }],
            })));
        }

        // Pulsing lava glow at the foot of the tower.
        const lava = new Graphics().ellipse(W / 2, H + 60, 1100, 320).fill(new FillGradient({
            type: 'radial', center: { x: 0.5, y: 0.5 }, innerRadius: 0, outerCenter: { x: 0.5, y: 0.5 }, outerRadius: 0.5, textureSpace: 'local',
            colorStops: [{ offset: 0, color: 'rgba(255,120,40,0.4)' }, { offset: 1, color: 'rgba(120,40,10,0)' }],
        }));
        lava.blendMode = 'add';
        env.addChild(lava);
        gsap.to(lava, { alpha: 0.6, duration: 1.8, yoyo: true, repeat: -1, ease: 'sine.inOut' });

        // Ember field (animated in update()).
        for (let i = 0; i < 36; i++) {
            this.embers.push({
                x: Math.random() * W, y: Math.random() * H,
                r: Math.random() * 2.6 + 1, vy: 26 + Math.random() * 40, phase: Math.random() * Math.PI * 2,
            });
        }
        this.emberGfx = new Graphics();
        this.emberGfx.blendMode = 'add';
        env.addChild(this.emberGfx);

        const title = new Text({
            text: 'DRAGON TOWER',
            style: {
                fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 44, fontWeight: '900', letterSpacing: 7,
                fill: 0xff8a3d, stroke: { color: 0x2a0e04, width: 6 },
                dropShadow: { color: 0xff4d2e, blur: 12, distance: 0, alpha: 0.7 },
            },
        });
        title.anchor.set(0, 0.5);
        title.position.set(44, 52);
        env.addChild(title);

        this.redFlash = new Graphics().rect(0, 0, W, H).fill(0xff2410);
        this.redFlash.alpha = 0;
        env.addChild(this.redFlash);
        return env;
    }

    private createUI(): void {
        const H = GameConfig.height;
        const cx = 1758; // control panel column

        // Multiplier ladder beside the tower — plaques, not floating text.
        const ladderX = this.towerCx - (3 * (TILE_W + 24)) / 2 - 110;
        for (let r = 0; r < ROWS; r++) {
            const plaque = new Graphics();
            plaque.position.set(ladderX, this.baseY - r * ROW_GAP);
            const label = new Text({
                text: '',
                style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 22, fontWeight: '900', fill: 0x6a5a4c },
            });
            label.anchor.set(0.5);
            plaque.addChild(label);
            this.uiContainer.addChild(plaque);
            this.ladder.push({ plaque, label });
        }

        this.banner = new Text({
            text: '',
            style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 96, fontWeight: '900', fill: 0xffd54f, stroke: { color: 0x2a0e04, width: 11 } },
        });
        this.banner.anchor.set(0.5);
        this.banner.position.set(this.towerCx, 520);
        this.banner.visible = false;
        this.uiContainer.addChild(this.banner);

        // Control panel (matches the blackjack/mines styling).
        this.uiContainer.addChild(new Graphics()
            .roundRect(1618, 140, 280, 880, 26).fill({ color: 0x171018, alpha: 0.96 })
            .roundRect(1618, 140, 280, 880, 26).stroke({ width: 2, color: 0x4a2c1e })
            .roundRect(1628, 150, 260, 860, 20).stroke({ width: 1.5, color: 0xff8a3d, alpha: 0.25 }));

        const section = (txt: string, y: number): void => {
            const t = new Text({ text: txt, style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 17, fontWeight: '900', letterSpacing: 4, fill: 0x8a6a54 } });
            t.anchor.set(0.5);
            t.position.set(cx, y);
            this.uiContainer.addChild(t);
        };
        const divider = (y: number): void => {
            this.uiContainer.addChild(new Graphics().moveTo(1650, y).lineTo(1866, y).stroke({ width: 1.5, color: 0x4a2c1e }));
        };

        section('DIFFICULTY', 196);
        (['easy', 'hard'] as const).forEach((value, i) => {
            const pill = new Graphics();
            pill.position.set(cx + (i === 0 ? -62 : 62), 252);
            pill.eventMode = 'static';
            pill.cursor = 'pointer';
            const label = new Text({ text: value.toUpperCase(), style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 22, fontWeight: '900', fill: 0xffffff } });
            label.anchor.set(0.5);
            pill.addChild(label);
            this.stylePill(pill, label, value === this.diff);
            pill.on('pointerdown', () => {
                if (this.phase === 'playing') { this.shake(5); return; }
                this.diff = value;
                this.rebuildTiles();
                for (const dp of this.diffPills) this.stylePill(dp.pill, dp.label, dp.value === value);
                this.updateLadder();
                if (this.phase === 'idle') this.styleAction(0xb8860b, 0xffd54f, 'START', `bet $${gameStore.getState().bet} · ${value.toUpperCase()}`);
            });
            this.uiContainer.addChild(pill);
            this.diffPills.push({ pill, label, value });
        });
        const diffHint = new Text({ text: 'easy 3 tiles · hard 2 tiles · 1 flame each row', style: { fontFamily: 'Arial, sans-serif', fontSize: 15, fontWeight: 'bold', fill: 0x8a6a54 } });
        diffHint.anchor.set(0.5);
        diffHint.position.set(cx, 304);
        this.uiContainer.addChild(diffHint);

        divider(348);
        section('BET', 384);
        this.betValueText = new Text({ text: `$${gameStore.getState().bet}`, style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 40, fontWeight: '900', fill: 0xffffff } });
        this.betValueText.anchor.set(0.5);
        this.betValueText.position.set(cx, 438);
        this.uiContainer.addChild(this.betValueText);
        const stepBtn = (dx: number, glyph: string, dir: number): void => {
            const b = new Graphics()
                .circle(0, 0, 26).fill({ color: 0x2a1a14 })
                .circle(0, 0, 26).stroke({ width: 2, color: 0x5a3a2a });
            b.position.set(cx + dx, 438);
            b.eventMode = 'static';
            b.cursor = 'pointer';
            b.on('pointerdown', () => {
                if (this.phase === 'playing') return;
                gsap.fromTo(b.scale, { x: 0.85, y: 0.85 }, { x: 1, y: 1, duration: 0.25, ease: 'back.out(3)' });
                const state = gameStore.getState();
                const i = BET_STEPS.findIndex((v) => v >= state.bet);
                const next = BET_STEPS[Math.max(0, Math.min(BET_STEPS.length - 1, (i < 0 ? BET_STEPS.length - 1 : i) + dir))];
                state.setBet(next);
                this.betValueText.text = `$${next}`;
                if (this.phase === 'idle') this.styleAction(0xb8860b, 0xffd54f, 'START', `bet $${next} · ${this.diff.toUpperCase()}`);
            });
            const t = new Text({ text: glyph, style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 28, fontWeight: '900', fill: 0xd8a88a } });
            t.anchor.set(0.5);
            b.addChild(t);
            this.uiContainer.addChild(b);
        };
        stepBtn(-100, '−', -1);
        stepBtn(100, '+', 1);

        divider(516);
        // Morphing action button.
        this.actionButton = new Graphics();
        this.actionButton.position.set(cx, 620);
        this.actionButton.eventMode = 'static';
        this.actionButton.cursor = 'pointer';
        this.actionButton.on('pointerdown', () => {
            gsap.fromTo(this.actionButton.scale, { x: 0.94, y: 0.94 }, { x: 1, y: 1, duration: 0.3, ease: 'back.out(3)' });
            this.action();
        });
        this.actionLabel = new Text({ text: '', style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 32, fontWeight: '900', fill: 0xffffff } });
        this.actionLabel.anchor.set(0.5);
        this.actionLabel.position.set(0, -14);
        this.actionSub = new Text({ text: '', style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 19, fontWeight: '900', fill: 0xffffff } });
        this.actionSub.alpha = 0.85;
        this.actionSub.anchor.set(0.5);
        this.actionSub.position.set(0, 24);
        this.actionButton.addChild(this.actionLabel, this.actionSub);
        this.uiContainer.addChild(this.actionButton);
        this.styleAction(0xb8860b, 0xffd54f, 'START', `bet $${gameStore.getState().bet} · ${this.diff.toUpperCase()}`);

        divider(930);
        this.balanceText = new Text({ text: '', style: { fontFamily: 'Arial, sans-serif', fontSize: 24, fontWeight: 'bold', fill: 0xd8a88a } });
        this.balanceText.anchor.set(0.5);
        this.balanceText.position.set(cx, 968);
        this.uiContainer.addChild(this.balanceText);

        const back = new Text({ text: '‹ MENU', style: { fill: 0xff8a3d, fontSize: 26, fontWeight: 'bold' } });
        back.position.set(44, 86);
        back.eventMode = 'static';
        back.cursor = 'pointer';
        back.on('pointerdown', () => SceneManager.switchScene(new MenuScene()));
        // (back-to-menu removed) this.uiContainer.addChild(back);

        const hint = new Text({ text: 'climb the tower · one flame per row · cash out any time (space)', style: { fill: 0x8a6a54, fontSize: 18, fontStyle: 'italic' } });
        hint.anchor.set(0.5);
        hint.position.set(this.towerCx, H - 14);
        this.uiContainer.addChild(hint);

        const render = (s: ReturnType<typeof gameStore.getState>): void => {
            this.balanceText.text = `Balance  $${Math.round(s.balance * 100) / 100}`;
        };
        render(gameStore.getState());
        gameStore.subscribe(render);
    }

    /** Refresh the per-row multiplier ladder; climbed rows light up gold. */
    private updateLadder(): void {
        for (let r = 0; r < ROWS; r++) {
            const m = rowMult(r + 1, this.diff);
            const { plaque, label } = this.ladder[r];
            label.text = `${m >= 100 ? m.toFixed(0) : m.toFixed(2)}x`;
            const climbed = this.phase !== 'idle' && r < this.row;
            const isNext = this.phase === 'playing' && r === this.row;
            const fill = climbed ? 0x8a5a0c : isNext ? 0x3a2a14 : 0x1c1410;
            const edge = climbed ? 0xffd54f : isNext ? 0xffb74d : 0x4a3a2a;
            plaque.clear()
                .roundRect(-58, -23, 116, 46, 12).fill({ color: fill, alpha: 0.95 })
                .roundRect(-58, -23, 116, 46, 12).stroke({ width: 2.5, color: edge, alpha: climbed || isNext ? 1 : 0.7 });
            label.style.fill = climbed ? 0xfff3d0 : isNext ? 0xffd54f : 0x8a7a64;
            if (isNext) {
                gsap.killTweensOf(plaque.scale);
                gsap.fromTo(plaque.scale, { x: 1.12, y: 1.12 }, { x: 1, y: 1, duration: 0.35, ease: 'back.out(2)' });
            }
        }
    }

    private stylePill(pill: Graphics, label: Text, active: boolean): void {
        pill.clear()
            .roundRect(-56, -24, 112, 48, 22).fill({ color: active ? 0xb8430b : 0x1c1410, alpha: active ? 1 : 0.9 })
            .roundRect(-56, -24, 112, 48, 22).stroke({ width: 2.5, color: active ? 0xffb74d : 0x5a3a2a });
        label.style.fill = active ? 0xffffff : 0xa8907c;
    }

    private styleAction(fill: number, edge: number, label: string, sub: string): void {
        this.actionButton.clear()
            .roundRect(-122, -56, 244, 112, 24).fill(fill)
            .roundRect(-122, -56, 244, 112, 24).stroke({ width: 3, color: edge });
        this.actionLabel.text = label;
        this.actionSub.text = sub;
        if (this.actionLabel.width > 220) this.actionLabel.scale.set(220 / this.actionLabel.width);
        else this.actionLabel.scale.set(1);
        if (this.actionSub.width > 220) this.actionSub.scale.set(220 / this.actionSub.width);
        else this.actionSub.scale.set(1);
    }
}
