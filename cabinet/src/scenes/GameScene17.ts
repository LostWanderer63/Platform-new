import { Text, Container, Graphics, Sprite, RenderTexture, FillGradient } from 'pixi.js';
import type { Renderer } from 'pixi.js';
import { gsap } from 'gsap';
import { BaseScene } from './BaseScene';
import { GameConfig } from '../config/GameConfig';
import { gameStore } from '../state/GameState';
import { SceneManager } from '../managers/SceneManager';
import { MenuScene } from './MenuScene';

/**
 * GameScene17 — Slot 17: "Lucky Scratch"
 * ---------------------------------------
 * Instant-win scratch cards — the only game driven by a real drag-to-reveal
 * interaction. Buy a pack of three cards, then physically SCRATCH the foil off
 * each 3×3 panel with the pointer (foil is erased into a live render-texture
 * mask, so the silver actually peels where you drag). Uncover three matching
 * cash amounts on a card and that amount is yours; the pack pays the sum.
 *
 * Built from scratch for this game:
 *  - per-card foil erased through a RenderTexture mask (true scratch feel),
 *    progress-tracked so a card auto-finishes once it's mostly clear
 *  - glossy embossed prize coins that pop + ring when their match completes
 *  - SCRATCH ALL convenience reveal, REVEAL animation, coin burst + confetti
 *  - carnival booth: marquee bulbs, velvet curtain, spotlight, prize ladder
 */

const CARD_W = 392;
const CARD_H = 452;
const CARD_GAP = 70;
const GRID = 3;                 // 3×3 prize cells
const CARDS = 3;
const SCRATCH_RADIUS = 30;
const REVEAL_FRACTION = 0.52;   // auto-finish a card past this scratched ratio
const BUCKETS = 10;             // coverage tracking grid (per axis)
const BET_STEPS = [1, 2, 5, 10, 20, 50, 100];
/** Prize amounts (× bet) seeded into the grids. */
const PRIZES = [1, 2, 3, 5, 10, 20, 50] as const;

interface PrizeCell {
    mult: number;
    coin: Container;
    label: Text;
    ring: Graphics;
}

interface ScratchCard {
    root: Container;
    panel: Container;        // prize content (under the foil)
    cells: PrizeCell[];      // 9 cells, row-major
    winMult: number;         // matched amount × bet multiplier, 0 if none
    winIndices: number[];    // the three matching cells
    foil: Sprite;
    reveal: Graphics;        // scratched area; foil is inverse-masked by it
    covered: boolean[];      // BUCKETS×BUCKETS coverage flags
    coveredCount: number;
    scratching: boolean;
    last: { x: number; y: number } | null;
    revealed: boolean;
    hint: Container;
}

type Phase = 'idle' | 'scratching' | 'done';

export class GameScene17 extends BaseScene {
    private readonly boothLayer = new Container();
    private readonly cardLayer = new Container();
    private readonly fxLayer = new Container();
    private readonly uiContainer = new Container();

    private renderer!: Renderer;
    private cards: ScratchCard[] = [];
    private phase: Phase = 'idle';
    private packWin = 0;
    private packBet = 0;

    private banner!: Text;
    private buyButton!: Graphics;
    private buyLabel!: Text;
    private buySub!: Text;
    private scratchAllBtn!: Graphics;
    private scratchAllLabel!: Text;
    private betValueText!: Text;
    private balanceText!: Text;
    private marqueeBulbs: Graphics[] = [];
    private bulbClock = 0;
    private readonly coins: Graphics[] = [];
    private readonly confetti: Graphics[] = [];

    private readonly onKeyDown = (e: KeyboardEvent): void => {
        if (e.code === 'Space') { e.preventDefault(); if (this.phase === 'idle') this.buyPack(); else this.scratchAll(); }
        // (back-to-menu removed) if (e.code === 'Escape') SceneManager.switchScene(new MenuScene());
    };
    private readonly onPointerUp = (): void => {
        for (const c of this.cards) { c.scratching = false; c.last = null; }
    };

    public async init(): Promise<void> {
        this.renderer = SceneManager.application.renderer;
        this.addChild(this.boothLayer);
        this.addChild(this.cardLayer);
        this.addChild(this.fxLayer);
        this.addChild(this.uiContainer);
        this.buildBooth();
        this.createUI();
        this.layoutEmptySlots();
        window.addEventListener('keydown', this.onKeyDown);
        window.addEventListener('pointerup', this.onPointerUp);
    }

    public async start(): Promise<void> {}

    public update(delta: number): void {
        const dt = Math.min(delta / 60, 0.05);
        this.bulbClock += dt;
        // Chasing marquee bulbs.
        this.marqueeBulbs.forEach((b, i) => {
            const on = ((this.bulbClock * 6) | 0) % this.marqueeBulbs.length;
            const lit = (i % 8) === (on % 8);
            b.alpha = lit ? 1 : 0.35;
        });
    }

    public resize(_width: number, _height: number): void {}

    public override async destroyScene(): Promise<void> {
        window.removeEventListener('keydown', this.onKeyDown);
        window.removeEventListener('pointerup', this.onPointerUp);
        for (const c of this.cards) this.disposeCard(c);
        for (const g of [...this.coins, ...this.confetti]) gsap.killTweensOf(g);
        gsap.killTweensOf(this.banner);
        gsap.killTweensOf(this.banner.scale);
        await super.destroyScene();
    }

    // --- pack lifecycle --------------------------------------------------------

    private cardX(i: number): number {
        const totalW = CARD_W * CARDS + CARD_GAP * (CARDS - 1);
        const startX = (GameConfig.width - 280 - totalW) / 2 + 20;
        return startX + i * (CARD_W + CARD_GAP);
    }
    private readonly cardY = 300;

    /** Ghost slots so the booth reads before the first purchase. */
    private layoutEmptySlots(): void {
        for (let i = 0; i < CARDS; i++) {
            const g = new Graphics()
                .roundRect(this.cardX(i), this.cardY, CARD_W, CARD_H, 26).fill({ color: 0x2a1438, alpha: 0.4 })
                .roundRect(this.cardX(i), this.cardY, CARD_W, CARD_H, 26).stroke({ width: 3, color: 0xffd23d, alpha: 0.35 });
            const t = new Text({ text: '?', style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 120, fontWeight: '900', fill: 0xffd23d } });
            t.anchor.set(0.5);
            t.alpha = 0.25;
            t.position.set(this.cardX(i) + CARD_W / 2, this.cardY + CARD_H / 2);
            g.addChild(t);
            this.cardLayer.addChild(g);
        }
    }

    private buyPack(): void {
        const state = gameStore.getState();
        this.packBet = state.bet;
        const cost = this.packBet * CARDS;
        if (this.phase === 'scratching' || state.balance < cost) return;
        state.setBalance(Math.round((state.balance - cost) * 100) / 100);
        state.setWinAmount(0);
        this.phase = 'scratching';
        this.packWin = 0;
        this.banner.visible = false;

        // Clear previous cards / ghost slots.
        for (const c of this.cards) this.disposeCard(c);
        this.cards = [];
        this.cardLayer.removeChildren().forEach((c) => c.destroy({ children: true }));

        for (let i = 0; i < CARDS; i++) {
            const card = this.buildCard(i);
            this.cards.push(card);
            gsap.fromTo(card.root, { y: this.cardY - 40, alpha: 0 }, { y: this.cardY, alpha: 1, duration: 0.4, delay: i * 0.12, ease: 'back.out(1.6)' });
        }
        this.styleBuy();
        this.styleScratchAll(true);
    }

    private settlePack(): void {
        if (this.phase === 'done') return;
        this.phase = 'done';
        const state = gameStore.getState();
        if (this.packWin > 0) {
            const win = Math.round(this.packWin * 100) / 100;
            state.setBalance(Math.round((state.balance + win) * 100) / 100);
            state.setWinAmount(win);
            this.showBanner(`YOU WON $${win}!`, 0x4ade6a);
            this.coinBurst(GameConfig.width / 2 - 140, 540, 40);
            this.confettiBlast(50);
        } else {
            this.showBanner('NO MATCH — TRY AGAIN', 0xaab4c4);
        }
        this.styleBuy();
        this.styleScratchAll(false);
    }

    private maybeSettle(): void {
        if (this.cards.length > 0 && this.cards.every((c) => c.revealed)) {
            gsap.delayedCall(0.5, () => this.settlePack());
        }
    }

    // --- card construction ------------------------------------------------------

    /** Decide a card's 3×3 grid: ~40% carry a winning triple. */
    private rollGrid(): { mults: number[]; winMult: number; winIndices: number[] } {
        const mults: number[] = [];
        const win = Math.random() < 0.42;
        let winMult = 0;
        let winIndices: number[] = [];

        if (win) {
            winMult = PRIZES[(Math.random() * PRIZES.length) | 0];
            const all = [...Array(GRID * GRID).keys()].sort(() => Math.random() - 0.5);
            winIndices = all.slice(0, 3);
            for (let i = 0; i < GRID * GRID; i++) mults.push(0);
            for (const idx of winIndices) mults[idx] = winMult;
            // Fill the rest so no OTHER amount appears 3+ times (single winner).
            const counts = new Map<number, number>([[winMult, 3]]);
            for (let i = 0; i < GRID * GRID; i++) {
                if (mults[i] !== 0) continue;
                let pick = 0;
                do { pick = PRIZES[(Math.random() * PRIZES.length) | 0]; }
                while ((counts.get(pick) ?? 0) >= 2);
                mults[i] = pick;
                counts.set(pick, (counts.get(pick) ?? 0) + 1);
            }
        } else {
            // Losing card: no amount may reach 3.
            const counts = new Map<number, number>();
            for (let i = 0; i < GRID * GRID; i++) {
                let pick = 0;
                do { pick = PRIZES[(Math.random() * PRIZES.length) | 0]; }
                while ((counts.get(pick) ?? 0) >= 2);
                mults.push(pick);
                counts.set(pick, (counts.get(pick) ?? 0) + 1);
            }
        }
        return { mults, winMult, winIndices };
    }

    private buildCard(i: number): ScratchCard {
        const root = new Container();
        root.position.set(this.cardX(i), this.cardY);
        this.cardLayer.addChild(root);

        // Card body.
        root.addChild(new Graphics()
            .roundRect(0, 0, CARD_W, CARD_H, 26).fill({ color: 0x000000, alpha: 0.35 })
            .roundRect(-4, -4, CARD_W, CARD_H, 26).fill(new FillGradient({
                type: 'linear', start: { x: 0, y: 0 }, end: { x: 0, y: 1 }, textureSpace: 'local',
                colorStops: [{ offset: 0, color: 0xfff6ec }, { offset: 1, color: 0xffe2b8 }],
            }))
            .roundRect(-4, -4, CARD_W, CARD_H, 26).stroke({ width: 5, color: 0xd4af37 }));
        const head = new Text({ text: 'MATCH 3 & WIN', style: {
            fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 26, fontWeight: '900', letterSpacing: 2,
            fill: 0xc2287a,
        } });
        head.anchor.set(0.5);
        head.position.set(CARD_W / 2 - 4, 36);
        root.addChild(head);

        // Opaque silver foil the prizes hide behind (drawn first, underneath).
        const foil = new Sprite(this.foilTexture());
        foil.position.set(0, 60);
        foil.width = CARD_W;
        foil.height = CARD_H - 60;
        root.addChild(foil);

        // Scratch hint over the foil.
        const hint = new Container();
        hint.position.set(CARD_W / 2 - 4, (CARD_H - 60) / 2 + 60);
        const coinIcon = new Graphics();
        this.drawPrizeCoin(coinIcon, 26);
        coinIcon.position.set(0, -34);
        const hintT = new Text({ text: 'SCRATCH HERE', style: {
            fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 24, fontWeight: '900', letterSpacing: 2,
            fill: 0xffffff, stroke: { color: 0x6a2a5a, width: 5 },
        } });
        hintT.anchor.set(0.5);
        hint.addChild(coinIcon, hintT);
        root.addChild(hint);
        gsap.to(hint, { alpha: 0.45, duration: 0.8, yoyo: true, repeat: -1, ease: 'sine.inOut' });

        // Prize grid on TOP, shown only where the player has scratched. Every dab
        // adds a filled circle to `reveal`, the panel's mask — so the prizes
        // appear under the pointer while the foil stays put everywhere else.
        const { mults, winMult, winIndices } = this.rollGrid();
        const reveal = new Graphics();
        reveal.position.set(0, 60);
        root.addChild(reveal);

        const panel = new Container();
        root.addChild(panel);
        panel.setMask({ mask: reveal });

        const cells: PrizeCell[] = [];
        const cell = (CARD_W - 36) / GRID;
        const ox = 14;
        const oy = 70;
        for (let r = 0; r < GRID; r++) {
            for (let c = 0; c < GRID; c++) {
                const idx = r * GRID + c;
                const cxp = ox + c * cell + cell / 2;
                const cyp = oy + r * cell + cell / 2;
                const coin = new Container();
                coin.position.set(cxp, cyp);
                const cg = new Graphics();
                this.drawPrizeCoin(cg, cell * 0.4);
                const ring = new Graphics()
                    .circle(0, 0, cell * 0.46).stroke({ width: 6, color: 0x4ade6a, alpha: 0.95 });
                ring.visible = false;
                const label = new Text({ text: `$${mults[idx] * this.packBet}`, style: {
                    fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 30, fontWeight: '900',
                    fill: 0x6a3a06, stroke: { color: 0xffe9a8, width: 3 },
                } });
                label.anchor.set(0.5);
                coin.addChild(cg, ring, label);
                panel.addChild(coin);
                cells.push({ mult: mults[idx], coin, label, ring });
            }
        }

        const card: ScratchCard = {
            root, panel, cells, winMult, winIndices,
            foil, reveal,
            covered: new Array(BUCKETS * BUCKETS).fill(false), coveredCount: 0,
            scratching: false, last: null, revealed: false, hint,
        };

        // Pointer scratching on the foil region.
        foil.eventMode = 'static';
        foil.cursor = 'pointer';
        foil.on('pointerdown', (e) => {
            if (card.revealed) return;
            card.scratching = true;
            const p = foil.toLocal(e.global);
            this.scratchAt(card, p.x, p.y);
            card.last = { x: p.x, y: p.y };
            if (card.hint.visible) { gsap.killTweensOf(card.hint); card.hint.visible = false; }
        });
        foil.on('globalpointermove', (e) => {
            if (!card.scratching || card.revealed) return;
            const p = foil.toLocal(e.global);
            // Interpolate from the last point so fast drags leave no gaps.
            if (card.last) {
                const dx = p.x - card.last.x;
                const dy = p.y - card.last.y;
                const steps = Math.max(1, Math.hypot(dx, dy) / (SCRATCH_RADIUS * 0.5));
                for (let s = 1; s <= steps; s++) this.scratchAt(card, card.last.x + (dx * s) / steps, card.last.y + (dy * s) / steps);
            } else {
                this.scratchAt(card, p.x, p.y);
            }
            card.last = { x: p.x, y: p.y };
        });
        return card;
    }

    /** Add one scratched dab to the card's reveal mask + track coverage. */
    private scratchAt(card: ScratchCard, x: number, y: number): void {
        const fh = CARD_H - 60;
        if (x < 0 || x > CARD_W || y < 0 || y > fh) return;
        card.reveal.circle(x, y, SCRATCH_RADIUS).fill(0xffffff);

        const bx = Math.min(BUCKETS - 1, Math.max(0, (x / CARD_W * BUCKETS) | 0));
        const by = Math.min(BUCKETS - 1, Math.max(0, (y / fh * BUCKETS) | 0));
        const key = by * BUCKETS + bx;
        if (!card.covered[key]) {
            card.covered[key] = true;
            card.coveredCount++;
            if (card.coveredCount / (BUCKETS * BUCKETS) >= REVEAL_FRACTION) this.revealCard(card);
        }
    }

    /** Peel the rest of the foil and resolve the card's match. */
    private revealCard(card: ScratchCard): void {
        if (card.revealed) return;
        card.revealed = true;
        card.scratching = false;
        gsap.killTweensOf(card.hint);
        card.hint.visible = false;
        // Drop the mask so the whole grid shows, and fade the foil away.
        card.panel.mask = null;
        gsap.to(card.foil, { alpha: 0, duration: 0.4, ease: 'power2.out', onComplete: () => { card.foil.visible = false; } });

        if (card.winMult > 0) {
            this.packWin += card.winMult * this.packBet;
            gsap.delayedCall(0.35, () => {
                card.winIndices.forEach((idx, k) => {
                    const pc = card.cells[idx];
                    pc.ring.visible = true;
                    gsap.fromTo(pc.coin.scale, { x: 1, y: 1 }, { x: 1.25, y: 1.25, duration: 0.22, yoyo: true, repeat: 1, delay: k * 0.12, ease: 'sine.inOut' });
                    gsap.fromTo(pc.ring, { alpha: 0 }, { alpha: 1, duration: 0.2, delay: k * 0.12 });
                });
                const c = card.root.position;
                this.coinBurst(c.x + CARD_W / 2, c.y + CARD_H / 2, 16);
            });
        }
        this.maybeSettle();
    }

    private scratchAll(): void {
        if (this.phase !== 'scratching') return;
        let d = 0;
        for (const card of this.cards) {
            if (card.revealed) continue;
            gsap.delayedCall(d, () => this.revealCard(card));
            d += 0.45;
        }
    }

    private disposeCard(card: ScratchCard): void {
        gsap.killTweensOf(card.hint);
        gsap.killTweensOf(card.foil);
        for (const pc of card.cells) gsap.killTweensOf(pc.coin.scale);
        card.root.destroy({ children: true });
    }

    // --- art --------------------------------------------------------------------------

    /** Embossed gold prize coin. */
    private drawPrizeCoin(g: Graphics, r: number): void {
        g.clear()
            .circle(0, r * 0.1, r).fill({ color: 0x000000, alpha: 0.25 })
            .circle(0, 0, r).fill(new FillGradient({
                type: 'radial', center: { x: 0.4, y: 0.35 }, innerRadius: 0.05, outerCenter: { x: 0.5, y: 0.5 }, outerRadius: 0.6, textureSpace: 'local',
                colorStops: [{ offset: 0, color: 0xfff3c4 }, { offset: 0.6, color: 0xf0b428 }, { offset: 1, color: 0xb07a12 }],
            }))
            .circle(0, 0, r).stroke({ width: r * 0.1, color: 0x8a5e10 })
            .circle(0, 0, r * 0.82).stroke({ width: r * 0.05, color: 0xfff3d0, alpha: 0.7 });
    }

    /** Silver scratch-foil texture with a diagonal sheen + question marks. */
    private foilTexture(): RenderTexture {
        const w = CARD_W;
        const h = CARD_H - 60;
        const node = new Container();
        node.addChild(new Graphics()
            .rect(0, 0, w, h).fill(new FillGradient({
                type: 'linear', start: { x: 0, y: 0 }, end: { x: 1, y: 1 }, textureSpace: 'local',
                colorStops: [
                    { offset: 0, color: 0xc4c8d2 }, { offset: 0.25, color: 0x9aa0ae },
                    { offset: 0.5, color: 0xd8dce6 }, { offset: 0.75, color: 0x9aa0ae }, { offset: 1, color: 0xb4b8c4 },
                ],
            })));
        // Embossed sparkle marks.
        const marks = new Graphics();
        for (let y = 24; y < h; y += 64) {
            for (let x = 24 + ((y / 64) % 2) * 32; x < w; x += 64) {
                marks.poly([x, y - 9, x + 3, y - 3, x + 9, y, x + 3, y + 3, x, y + 9, x - 3, y + 3, x - 9, y, x - 3, y - 3])
                    .fill({ color: 0x7e8492, alpha: 0.5 });
            }
        }
        node.addChild(marks);
        const rt = RenderTexture.create({ width: w, height: h, resolution: 2 });
        this.renderer.render({ container: node, target: rt, clear: true });
        node.destroy({ children: true });
        return rt;
    }

    private buildBooth(): void {
        const W = GameConfig.width;
        const H = GameConfig.height;

        // Deep velvet backdrop.
        this.boothLayer.addChild(new Graphics().rect(0, 0, W, H).fill(new FillGradient({
            type: 'linear', start: { x: 0, y: 0 }, end: { x: 0, y: 1 }, textureSpace: 'local',
            colorStops: [{ offset: 0, color: 0x3a0e2e }, { offset: 0.6, color: 0x24091e }, { offset: 1, color: 0x140510 }],
        })));

        // Curtain folds.
        const curtain = new Graphics();
        for (let x = 0; x < W; x += 120) {
            curtain.poly([x, 0, x + 120, 0, x + 90, H, x + 30, H]).fill({ color: 0x4a1038, alpha: 0.35 });
            curtain.moveTo(x + 60, 0).lineTo(x + 60, H).stroke({ width: 2, color: 0x12040e, alpha: 0.3 });
        }
        this.boothLayer.addChild(curtain);

        // Spotlight pool behind the cards.
        this.boothLayer.addChild(new Graphics().ellipse(W / 2 - 140, 540, 760, 460).fill(new FillGradient({
            type: 'radial', center: { x: 0.5, y: 0.5 }, innerRadius: 0, outerCenter: { x: 0.5, y: 0.5 }, outerRadius: 0.5, textureSpace: 'local',
            colorStops: [{ offset: 0, color: 'rgba(255,220,140,0.25)' }, { offset: 1, color: 'rgba(255,200,100,0)' }],
        })));

        // Marquee header board.
        this.boothLayer.addChild(new Graphics()
            .roundRect(W / 2 - 700, 40, 1120, 150, 24).fill(new FillGradient({
                type: 'linear', start: { x: 0, y: 0 }, end: { x: 0, y: 1 }, textureSpace: 'local',
                colorStops: [{ offset: 0, color: 0x7a1450 }, { offset: 1, color: 0x4a0c30 }],
            }))
            .roundRect(W / 2 - 700, 40, 1120, 150, 24).stroke({ width: 5, color: 0xffd23d }));
        const title = new Text({ text: 'LUCKY SCRATCH', style: {
            fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 78, fontWeight: '900', letterSpacing: 6,
            fill: 0xffd23d, stroke: { color: 0x3a0820, width: 9 },
            dropShadow: { color: 0xff4fa0, blur: 18, distance: 0, alpha: 0.7 },
        } });
        title.anchor.set(0.5);
        title.position.set(W / 2 - 140, 115);
        this.boothLayer.addChild(title);

        // Chasing marquee bulbs around the header.
        const bulbs = new Graphics();
        this.boothLayer.addChild(bulbs);
        const addBulb = (x: number, y: number): void => {
            const b = new Graphics().circle(x, y, 7).fill({ color: 0xfff3a0 });
            this.boothLayer.addChild(b);
            this.marqueeBulbs.push(b);
        };
        for (let x = W / 2 - 690; x <= W / 2 + 420; x += 46) { addBulb(x, 52); addBulb(x, 178); }
        for (let y = 64; y <= 166; y += 41) { addBulb(W / 2 - 700, y); addBulb(W / 2 + 420, y); }
    }

    private createUI(): void {
        const W = GameConfig.width;
        const cx = 1758;

        this.banner = new Text({ text: '', style: {
            fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 76, fontWeight: '900',
            fill: 0x4ade6a, stroke: { color: 0x123a1a, width: 11 },
        } });
        this.banner.anchor.set(0.5);
        this.banner.position.set((W - 280) / 2, 250);
        this.banner.visible = false;
        this.uiContainer.addChild(this.banner);

        // Right control panel.
        this.uiContainer.addChild(new Graphics()
            .roundRect(1618, 140, 280, 880, 26).fill({ color: 0x2a0e22, alpha: 0.95 })
            .roundRect(1618, 140, 280, 880, 26).stroke({ width: 3, color: 0x7a1450 })
            .roundRect(1628, 150, 260, 860, 20).stroke({ width: 1.5, color: 0xffd23d, alpha: 0.3 }));

        const section = (txt: string, y: number): void => {
            const t = new Text({ text: txt, style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 16, fontWeight: '900', letterSpacing: 3, fill: 0xd87ab0 } });
            t.anchor.set(0.5);
            t.position.set(cx, y);
            this.uiContainer.addChild(t);
        };

        section('STAKE / CARD', 196);
        this.betValueText = new Text({ text: `$${gameStore.getState().bet}`, style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 34, fontWeight: '900', fill: 0xffffff } });
        this.betValueText.anchor.set(0.5);
        this.betValueText.position.set(cx, 250);
        this.uiContainer.addChild(this.betValueText);
        const stepBtn = (dx: number, glyph: string, dir: number): void => {
            const b = new Graphics()
                .circle(0, 0, 26).fill({ color: 0x4a1038 })
                .circle(0, 0, 26).stroke({ width: 2, color: 0x7a1450 });
            b.position.set(cx + dx, 250);
            b.eventMode = 'static';
            b.cursor = 'pointer';
            b.on('pointerdown', () => {
                if (this.phase === 'scratching') return;
                gsap.fromTo(b.scale, { x: 0.85, y: 0.85 }, { x: 1, y: 1, duration: 0.25, ease: 'back.out(3)' });
                const state = gameStore.getState();
                const i = BET_STEPS.findIndex((v) => v >= state.bet);
                const next = BET_STEPS[Math.max(0, Math.min(BET_STEPS.length - 1, (i < 0 ? BET_STEPS.length - 1 : i) + dir))];
                state.setBet(next);
                this.betValueText.text = `$${next}`;
                this.styleBuy();
            });
            const t = new Text({ text: glyph, style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 28, fontWeight: '900', fill: 0xff8ac4 } });
            t.anchor.set(0.5);
            b.addChild(t);
            this.uiContainer.addChild(b);
        };
        stepBtn(-80, '−', -1);
        stepBtn(80, '+', 1);

        // BUY PACK.
        this.buyButton = new Graphics();
        this.buyButton.position.set(cx, 400);
        this.buyButton.eventMode = 'static';
        this.buyButton.cursor = 'pointer';
        this.buyButton.on('pointerdown', () => {
            gsap.fromTo(this.buyButton.scale, { x: 0.94, y: 0.94 }, { x: 1, y: 1, duration: 0.3, ease: 'back.out(3)' });
            this.buyPack();
        });
        this.buyLabel = new Text({ text: '', style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 30, fontWeight: '900', fill: 0xffffff } });
        this.buyLabel.anchor.set(0.5);
        this.buyLabel.position.set(0, -16);
        this.buySub = new Text({ text: '', style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 16, fontWeight: '900', fill: 0xffffff } });
        this.buySub.alpha = 0.85;
        this.buySub.anchor.set(0.5);
        this.buySub.position.set(0, 24);
        this.buyButton.addChild(this.buyLabel, this.buySub);
        this.uiContainer.addChild(this.buyButton);
        this.styleBuy();

        // SCRATCH ALL.
        section('REVEAL', 552);
        this.scratchAllBtn = new Graphics();
        this.scratchAllBtn.position.set(cx, 620);
        this.scratchAllBtn.eventMode = 'static';
        this.scratchAllBtn.cursor = 'pointer';
        this.scratchAllBtn.on('pointerdown', () => {
            gsap.fromTo(this.scratchAllBtn.scale, { x: 0.94, y: 0.94 }, { x: 1, y: 1, duration: 0.3, ease: 'back.out(3)' });
            this.scratchAll();
        });
        this.scratchAllLabel = new Text({ text: 'SCRATCH ALL', style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 24, fontWeight: '900', fill: 0xffffff } });
        this.scratchAllLabel.anchor.set(0.5);
        this.scratchAllBtn.addChild(this.scratchAllLabel);
        this.uiContainer.addChild(this.scratchAllBtn);
        this.styleScratchAll(false);

        // Prize ladder.
        section('TOP PRIZES', 730);
        const ladder = new Container();
        ladder.position.set(cx, 760);
        [50, 20, 10].forEach((m, i) => {
            const row = new Text({ text: `match 3 ×  →  $${m} per $1`, style: { fontFamily: 'Arial, sans-serif', fontSize: 17, fontWeight: 'bold', fill: i === 0 ? 0xffd23d : 0xd87ab0 } });
            row.anchor.set(0.5);
            row.position.set(0, i * 30);
            ladder.addChild(row);
        });
        this.uiContainer.addChild(ladder);

        this.balanceText = new Text({ text: '', style: { fontFamily: 'Arial, sans-serif', fontSize: 22, fontWeight: 'bold', fill: 0xff8ac4 } });
        this.balanceText.anchor.set(0.5);
        this.balanceText.position.set(cx, 968);
        this.uiContainer.addChild(this.balanceText);

        const back = new Text({ text: '‹ MENU', style: { fill: 0xffd23d, fontSize: 26, fontWeight: 'bold' } });
        back.position.set(44, 230);
        back.eventMode = 'static';
        back.cursor = 'pointer';
        back.on('pointerdown', () => SceneManager.switchScene(new MenuScene()));
        // (back-to-menu removed) this.uiContainer.addChild(back);

        const hint = new Text({ text: 'buy a pack · drag to scratch each card · match three equal amounts to win that prize', style: { fill: 0xb87aa0, fontSize: 19, fontStyle: 'italic' } });
        hint.anchor.set(0.5);
        hint.position.set((W - 280) / 2, GameConfig.height - 20);
        this.uiContainer.addChild(hint);

        const render = (s: ReturnType<typeof gameStore.getState>): void => {
            this.balanceText.text = `Balance  $${Math.round(s.balance * 100) / 100}`;
        };
        render(gameStore.getState());
        gameStore.subscribe(render);
    }

    private styleBuy(): void {
        const bet = gameStore.getState().bet;
        const active = this.phase !== 'scratching';
        this.buyButton.clear()
            .roundRect(-112, -52, 224, 104, 24).fill(active ? 0xc2287a : 0x4a1038)
            .roundRect(-112, -52, 224, 104, 24).stroke({ width: 3, color: active ? 0xff8ac4 : 0x6a2a52 });
        this.buyLabel.text = this.phase === 'idle' ? 'BUY PACK' : this.phase === 'done' ? 'NEW PACK' : 'SCRATCHING';
        this.buySub.text = `${CARDS} cards · $${bet * CARDS}`;
        this.buyButton.cursor = active ? 'pointer' : 'default';
    }

    private styleScratchAll(enabled: boolean): void {
        this.scratchAllBtn.clear()
            .roundRect(-110, -38, 220, 76, 20).fill({ color: enabled ? 0xffb02e : 0x4a3018, alpha: enabled ? 1 : 0.5 })
            .roundRect(-110, -38, 220, 76, 20).stroke({ width: 3, color: enabled ? 0xffe066 : 0x6a4a28, alpha: enabled ? 1 : 0.5 });
        this.scratchAllLabel.alpha = enabled ? 1 : 0.4;
        this.scratchAllBtn.eventMode = enabled ? 'static' : 'none';
        this.scratchAllBtn.cursor = enabled ? 'pointer' : 'default';
    }

    private showBanner(msg: string, tint: number): void {
        this.banner.text = msg;
        this.banner.style.fill = tint;
        this.banner.style.dropShadow = { color: tint, blur: 24, distance: 0, alpha: 0.85, angle: Math.PI / 6 };
        this.banner.alpha = 1;
        this.banner.visible = true;
        gsap.killTweensOf(this.banner);
        gsap.killTweensOf(this.banner.scale);
        gsap.fromTo(this.banner.scale, { x: 0.3, y: 0.3 }, { x: 1, y: 1, duration: 0.45, ease: 'back.out(2.2)' });
        gsap.to(this.banner, { alpha: 0, duration: 0.5, delay: 2.4, onComplete: () => { this.banner.visible = false; } });
    }

    // --- fx ---------------------------------------------------------------------------

    private coinBurst(x: number, y: number, count: number): void {
        for (let i = 0; i < count; i++) {
            let c = this.coins.find((g) => !g.visible);
            if (!c) {
                c = new Graphics();
                c.visible = false;
                this.fxLayer.addChild(c);
                this.coins.push(c);
            }
            const size = 8 + Math.random() * 9;
            c.clear()
                .ellipse(0, 0, size, size * 0.8).fill({ color: 0xffd54f })
                .ellipse(0, 0, size, size * 0.8).stroke({ width: 2, color: 0x8a6512 })
                .ellipse(-size * 0.3, -size * 0.25, size * 0.3, size * 0.18).fill({ color: 0xfff6cf, alpha: 0.9 });
            c.position.set(x, y);
            c.alpha = 1;
            c.scale.set(1);
            c.visible = true;
            const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.0;
            const speed = 280 + Math.random() * 380;
            gsap.killTweensOf(c);
            gsap.killTweensOf(c.scale);
            gsap.to(c, {
                x: x + Math.cos(a) * speed * 0.6,
                y: y + Math.sin(a) * speed * 0.6 + 460,
                alpha: 0,
                duration: 1.0 + Math.random() * 0.5,
                delay: Math.random() * 0.2,
                ease: 'power1.in',
                onComplete: () => { c.visible = false; },
            });
            gsap.to(c.scale, { x: 0.3, duration: 0.2, yoyo: true, repeat: 7, ease: 'sine.inOut' });
        }
    }

    private confettiBlast(count: number): void {
        const colors = [0xff2d55, 0xff9234, 0xffd23d, 0x4ade6a, 0x3aa8ff, 0x9a4fd4, 0xff4fa0];
        const W = GameConfig.width;
        for (let i = 0; i < count; i++) {
            let p = this.confetti.find((g) => !g.visible);
            if (!p) {
                p = new Graphics();
                p.visible = false;
                this.fxLayer.addChild(p);
                this.confetti.push(p);
            }
            p.clear().roundRect(-7, -4, 14, 8, 2).fill({ color: colors[(Math.random() * colors.length) | 0] });
            p.position.set(Math.random() * (W - 280), -20 - Math.random() * 160);
            p.rotation = Math.random() * Math.PI;
            p.alpha = 1;
            p.visible = true;
            gsap.killTweensOf(p);
            gsap.to(p, {
                y: GameConfig.height + 30,
                x: p.x + (Math.random() - 0.5) * 240,
                rotation: p.rotation + 6 + Math.random() * 6,
                duration: 1.7 + Math.random() * 1.2,
                delay: Math.random() * 0.5,
                ease: 'power1.in',
                onComplete: () => { p.visible = false; },
            });
        }
    }
}
