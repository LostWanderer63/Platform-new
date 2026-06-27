import { Text, Container, Graphics, FillGradient } from 'pixi.js';
import { gsap } from 'gsap';
import { BaseScene } from './BaseScene';
import { GameConfig } from '../config/GameConfig';
import { gameStore } from '../state/GameState';
import { SceneManager } from '../managers/SceneManager';
import { MenuScene } from './MenuScene';

/**
 * GameScene19 — Slot 19: "Golden Dragon Sic Bo"
 * ---------------------------------------------
 * The Macau three-dice table. Stack chips anywhere on a full betting felt —
 * Big/Small, exact totals 4–17, single numbers, ANY TRIPLE and the specific
 * triples — then shake the cage. Three dice tumble out and every bet on the
 * board settles at once; winning zones light up and pay their odds.
 *
 * Built from scratch for this game:
 *  - a real multi-bet felt: 30+ clickable zones, each with live chip stacks
 *  - a glass dice cage; dice tumble with face-flicker then settle on the result
 *  - simultaneous evaluation of every placed bet with per-zone win highlights
 *  - REBET (replay last stake), CLEAR, chip-denomination selector
 *  - jade-and-gold dragon table dressing, coin burst + result banner
 */

const BET_STEPS = [1, 2, 5, 10, 20, 50, 100];

/** Profit odds ("X to 1") for an exact three-dice total. */
const TOTAL_ODDS: Record<number, number> = {
    4: 50, 5: 18, 6: 14, 7: 12, 8: 8, 9: 6, 10: 6, 11: 6, 12: 6, 13: 8, 14: 12, 15: 14, 16: 18, 17: 50,
};
const ANY_TRIPLE_ODDS = 30;
const SPECIFIC_TRIPLE_ODDS = 150;

interface Zone {
    key: string;
    g: Graphics;
    chip: Container;
    chipText: Text;
    x: number; y: number; w: number; h: number;
    base: number;       // base fill colour
    edge: number;       // base stroke colour
}

export class GameScene19 extends BaseScene {
    private readonly tableLayer = new Container();
    private readonly feltLayer = new Container();
    private readonly diceLayer = new Container();
    private readonly fxLayer = new Container();
    private readonly uiContainer = new Container();

    private readonly zones = new Map<string, Zone>();
    private readonly bets = new Map<string, number>();
    private lastBets = new Map<string, number>();
    private rolling = false;
    private dice: { node: Container; face: Graphics; value: number }[] = [];

    private resultText!: Text;
    private banner!: Text;
    private stakedText!: Text;
    private betValueText!: Text;
    private balanceText!: Text;
    private lastWinText!: Text;
    private rollButton!: Graphics;
    private rollLabel!: Text;
    private readonly coins: Graphics[] = [];

    private readonly onKeyDown = (e: KeyboardEvent): void => {
        if (e.code === 'Space') { e.preventDefault(); this.roll(); }
        if (e.code === 'KeyR') this.rebet();
        if (e.code === 'KeyC') this.clearBets();
        // (back-to-menu removed) if (e.code === 'Escape') SceneManager.switchScene(new MenuScene());
    };

    public async init(): Promise<void> {
        this.addChild(this.tableLayer);
        this.addChild(this.feltLayer);
        this.addChild(this.diceLayer);
        this.addChild(this.fxLayer);
        this.addChild(this.uiContainer);

        this.buildTable();
        this.buildFelt();
        this.buildDice();
        this.createUI();
        window.addEventListener('keydown', this.onKeyDown);
    }

    public async start(): Promise<void> {}
    public update(_delta: number): void {}
    public resize(_width: number, _height: number): void {}

    public override async destroyScene(): Promise<void> {
        window.removeEventListener('keydown', this.onKeyDown);
        gsap.killTweensOf(this.banner);
        gsap.killTweensOf(this.banner.scale);
        for (const d of this.dice) { gsap.killTweensOf(d.node); gsap.killTweensOf(d.node.scale); }
        for (const c of this.coins) gsap.killTweensOf(c);
        await super.destroyScene();
    }

    // --- betting ---------------------------------------------------------------------

    private totalStaked(): number {
        let t = 0;
        for (const v of this.bets.values()) t += v;
        return t;
    }

    private placeChip(key: string): void {
        if (this.rolling) return;
        const state = gameStore.getState();
        const chip = state.bet;
        if (state.balance < this.totalStaked() + chip) return;
        this.bets.set(key, (this.bets.get(key) ?? 0) + chip);
        this.refreshZone(key);
        this.refreshStaked();
        const z = this.zones.get(key)!;
        gsap.fromTo(z.chip.scale, { x: 0.4, y: 0.4 }, { x: 1, y: 1, duration: 0.25, ease: 'back.out(2.5)' });
    }

    private clearBets(): void {
        if (this.rolling) return;
        for (const key of [...this.bets.keys()]) { this.bets.delete(key); this.refreshZone(key); }
        this.refreshStaked();
    }

    private rebet(): void {
        if (this.rolling || this.lastBets.size === 0) return;
        const state = gameStore.getState();
        let need = 0;
        for (const v of this.lastBets.values()) need += v;
        if (state.balance < need) return;
        this.bets.clear();
        for (const [k, v] of this.lastBets) this.bets.set(k, v);
        for (const key of this.zones.keys()) this.refreshZone(key);
        this.refreshStaked();
    }

    private refreshZone(key: string): void {
        const z = this.zones.get(key);
        if (!z) return;
        const amt = this.bets.get(key) ?? 0;
        z.chip.visible = amt > 0;
        z.chipText.text = `$${amt}`;
    }

    private refreshStaked(): void {
        this.stakedText.text = `Staked  $${this.totalStaked()}`;
    }

    // --- roll flow -------------------------------------------------------------------

    private roll(): void {
        if (this.rolling) return;
        const staked = this.totalStaked();
        const state = gameStore.getState();
        if (staked <= 0 || state.balance < staked) return;
        state.setBalance(Math.round((state.balance - staked) * 100) / 100);
        state.setWinAmount(0);
        this.lastBets = new Map(this.bets);
        this.rolling = true;
        this.banner.visible = false;
        this.resultText.text = '';
        this.clearHighlights();
        this.styleRoll();

        const result = [this.rand6(), this.rand6(), this.rand6()];

        // Tumble each die: spin + bounce, faces flicker, then lock to the result.
        this.dice.forEach((d, i) => {
            gsap.killTweensOf(d.node);
            gsap.killTweensOf(d.node.scale);
            const flick = setInterval(() => this.drawDie(d.face, 1 + ((Math.random() * 6) | 0)), 70);
            gsap.to(d.node, { rotation: (Math.random() < 0.5 ? 1 : -1) * (Math.PI * 4 + Math.random() * Math.PI), duration: 1.2, ease: 'power2.out' });
            gsap.timeline()
                .to(d.node, { y: d.node.y - 60, duration: 0.5, ease: 'power2.out' })
                .to(d.node, { y: d.node.y, duration: 0.7, ease: 'bounce.out' });
            gsap.delayedCall(1.0 + i * 0.12, () => {
                clearInterval(flick);
                d.value = result[i];
                d.node.rotation = 0;
                this.drawDie(d.face, result[i]);
                gsap.fromTo(d.node.scale, { x: 1.25, y: 1.25 }, { x: 1, y: 1, duration: 0.3, ease: 'back.out(2)' });
            });
        });

        gsap.delayedCall(1.5, () => this.settle(result, staked));
    }

    private settle(dice: number[], staked: number): void {
        const state = gameStore.getState();
        const sum = dice[0] + dice[1] + dice[2];
        const counts = [0, 0, 0, 0, 0, 0, 0];
        for (const d of dice) counts[d]++;
        const triple = counts.indexOf(3) > 0 ? counts.indexOf(3) : 0; // value of triple, else 0
        this.resultText.text = `${dice[0]} + ${dice[1]} + ${dice[2]}  =  ${sum}`;

        let totalReturn = 0;
        const winners: string[] = [];
        const award = (key: string, odds: number): void => {
            const stake = this.bets.get(key);
            if (!stake) return;
            totalReturn += stake * (odds + 1);
            winners.push(key);
        };

        // Big / Small (lose on any triple).
        if (!triple) {
            if (sum >= 11 && sum <= 17) award('big', 1);
            if (sum >= 4 && sum <= 10) award('small', 1);
        }
        // Exact total.
        award(`total-${sum}`, TOTAL_ODDS[sum] ?? 0);
        // Singles 1–6 (pay by how many dice show the number).
        for (let n = 1; n <= 6; n++) if (counts[n] > 0) award(`single-${n}`, counts[n]);
        // Triples.
        if (triple) {
            award('anytriple', ANY_TRIPLE_ODDS);
            award(`triple-${triple}`, SPECIFIC_TRIPLE_ODDS);
        }

        totalReturn = Math.round(totalReturn * 100) / 100;
        if (totalReturn > 0) {
            state.setBalance(Math.round((state.balance + totalReturn) * 100) / 100);
            state.setWinAmount(totalReturn);
            this.lastWinText.text = `$${totalReturn}`;
            gsap.fromTo(this.lastWinText.scale, { x: 1.3, y: 1.3 }, { x: 1, y: 1, duration: 0.3, ease: 'back.out(2)' });
        }
        for (const key of winners) this.highlightWin(key);

        const profit = Math.round((totalReturn - staked) * 100) / 100;
        if (totalReturn > 0) {
            this.showBanner(`WIN $${totalReturn}` + (profit > 0 ? `  (+$${profit})` : ''), 0xffd23d);
            this.coinBurst(760, 230, Math.min(40, 8 + (totalReturn | 0)));
        } else {
            this.showBanner('NO WIN', 0xaab4c4);
        }

        // Clear the board for the next round.
        gsap.delayedCall(2.4, () => {
            this.rolling = false;
            this.clearBets();
            this.clearHighlights();
            this.styleRoll();
        });
    }

    private rand6(): number {
        return 1 + ((Math.random() * 6) | 0);
    }

    private highlightWin(key: string): void {
        const z = this.zones.get(key);
        if (!z) return;
        z.g.clear()
            .roundRect(z.x, z.y, z.w, z.h, 12).fill({ color: 0x1f8a3c })
            .roundRect(z.x, z.y, z.w, z.h, 12).stroke({ width: 4, color: 0x7dffb0 });
        gsap.fromTo(z.g, { alpha: 0.5 }, { alpha: 1, duration: 0.2, yoyo: true, repeat: 5, ease: 'sine.inOut' });
    }

    private clearHighlights(): void {
        for (const z of this.zones.values()) this.drawZone(z);
    }

    // --- dice ------------------------------------------------------------------------

    private buildDice(): void {
        const baseX = 640;
        const y = 230;
        for (let i = 0; i < 3; i++) {
            const node = new Container();
            node.position.set(baseX + i * 130, y);
            const face = new Graphics();
            node.addChild(face);
            this.drawDie(face, i + 2);
            this.diceLayer.addChild(node);
            this.dice.push({ node, face, value: i + 2 });
        }
    }

    private drawDie(g: Graphics, face: number): void {
        const S = 96;
        g.clear()
            .roundRect(-S / 2 + 4, -S / 2 + 7, S, S, 18).fill({ color: 0x000000, alpha: 0.4 })
            .roundRect(-S / 2, -S / 2, S, S, 18).fill(new FillGradient({
                type: 'linear', start: { x: 0, y: 0 }, end: { x: 1, y: 1 }, textureSpace: 'local',
                colorStops: [{ offset: 0, color: 0xfff8f0 }, { offset: 0.5, color: 0xffeedd }, { offset: 1, color: 0xd8c4b0 }],
            }))
            .roundRect(-S / 2, -S / 2, S, S, 18).stroke({ width: 3, color: 0xc4a890 });
        const pip = (px: number, py: number): void => {
            g.circle(px * 26 + 2, py * 26 + 2, 9).fill({ color: 0x000000, alpha: 0.15 });
            g.circle(px * 26, py * 26, 9).fill({ color: 0xb01828 });          // red one would be nice; use dark red pips
            g.circle(px * 26 - 3, py * 26 - 3, 3).fill({ color: 0xff6a78, alpha: 0.7 });
        };
        const f = Math.max(1, Math.min(6, face));
        if (f % 2 === 1) pip(0, 0);
        if (f >= 2) { pip(-1, -1); pip(1, 1); }
        if (f >= 4) { pip(1, -1); pip(-1, 1); }
        if (f === 6) { pip(-1, 0); pip(1, 0); }
    }

    /** Mini die used as an icon on single/triple bet zones. */
    private drawMiniDie(g: Graphics, face: number, s: number, tint = 0x1a1a2e): void {
        g.roundRect(-s / 2, -s / 2, s, s, s * 0.18).fill({ color: 0xfff8f0 }).stroke({ width: 2, color: 0xc4a890 });
        const u = s * 0.27;
        const pip = (px: number, py: number): void => { g.circle(px * u, py * u, s * 0.1).fill({ color: tint }); };
        const f = Math.max(1, Math.min(6, face));
        if (f % 2 === 1) pip(0, 0);
        if (f >= 2) { pip(-1, -1); pip(1, 1); }
        if (f >= 4) { pip(1, -1); pip(-1, 1); }
        if (f === 6) { pip(-1, 0); pip(1, 0); }
    }

    // --- felt construction -----------------------------------------------------------

    private addZone(key: string, x: number, y: number, w: number, h: number, base: number, edge: number): Zone {
        const g = new Graphics();
        g.eventMode = 'static';
        g.cursor = 'pointer';
        g.on('pointerdown', () => this.placeChip(key));
        this.feltLayer.addChild(g);

        const chip = new Container();
        chip.position.set(x + w - 22, y + h - 22);
        const chipG = new Graphics()
            .circle(0, 0, 19).fill({ color: 0xd4361f })
            .circle(0, 0, 19).stroke({ width: 3, color: 0xfff6ec })
            .circle(0, 0, 12).stroke({ width: 2, color: 0xfff6ec, alpha: 0.7 });
        const chipText = new Text({ text: '', style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 15, fontWeight: '900', fill: 0xffffff } });
        chipText.anchor.set(0.5);
        chip.addChild(chipG, chipText);
        chip.visible = false;
        this.feltLayer.addChild(chip);

        const z: Zone = { key, g, chip, chipText, x, y, w, h, base, edge };
        this.drawZone(z);
        this.zones.set(key, z);
        return z;
    }

    private drawZone(z: Zone): void {
        z.g.clear()
            .roundRect(z.x, z.y, z.w, z.h, 12).fill({ color: z.base })
            .roundRect(z.x, z.y, z.w, z.h, 12).stroke({ width: 2.5, color: z.edge });
    }

    private feltLabel(text: string, x: number, y: number, size: number, fill: number, weight: '900' | 'bold' = '900'): Text {
        const t = new Text({ text, style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: size, fontWeight: weight, fill, letterSpacing: 1 } });
        t.anchor.set(0.5);
        t.position.set(x, y);
        this.feltLayer.addChild(t);
        return t;
    }

    private buildFelt(): void {
        const GREEN = 0x0c5a34;
        const DGREEN = 0x0a3f26;
        const GOLD = 0xd4af37;

        // SMALL / BIG across the top of the felt.
        const topY = 360;
        const half = 700;
        this.addZone('small', 70, topY, half, 96, DGREEN, GOLD);
        this.feltLabel('SMALL', 70 + half / 2, topY + 34, 40, 0xffffff);
        this.feltLabel('4–10  ·  pays 1:1  ·  loses on any triple', 70 + half / 2, topY + 70, 18, 0xbfe8c8, 'bold');
        this.addZone('big', 70 + half + 20, topY, half, 96, DGREEN, GOLD);
        this.feltLabel('BIG', 70 + half + 20 + half / 2, topY + 34, 40, 0xffffff);
        this.feltLabel('11–17  ·  pays 1:1  ·  loses on any triple', 70 + half + 20 + half / 2, topY + 70, 18, 0xbfe8c8, 'bold');

        // Exact totals 4–17 (two rows of seven).
        this.feltLabel('EXACT TOTAL', 760, 492, 22, GOLD);
        const totW = 200;
        const totH = 64;
        const startX = 70;
        const totals = [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17];
        totals.forEach((t, i) => {
            const col = i % 7;
            const row = (i / 7) | 0;
            const x = startX + col * (totW + 8);
            const y = 512 + row * (totH + 8);
            this.addZone(`total-${t}`, x, y, totW, totH, GREEN, GOLD);
            this.feltLabel(`${t}`, x + 40, y + totH / 2, 30, 0xffffff);
            this.feltLabel(`${TOTAL_ODDS[t]}:1`, x + totW - 52, y + totH / 2, 20, 0xffe082);
        });

        // Single numbers 1–6.
        this.feltLabel('SINGLE DICE   (1 / 2 / 3 to 1)', 470, 672, 22, GOLD);
        const sW = 150;
        for (let n = 1; n <= 6; n++) {
            const x = 70 + (n - 1) * (sW + 8);
            const y = 692;
            this.addZone(`single-${n}`, x, y, sW, 84, GREEN, GOLD);
            const die = new Graphics();
            die.position.set(x + 44, y + 42);
            this.drawMiniDie(die, n, 48);
            this.feltLayer.addChild(die);
            this.feltLabel('1·2·3', x + sW - 40, y + 42, 18, 0xffe082);
        }

        // Any triple + specific triples.
        this.feltLabel('TRIPLES', 300, 800, 22, GOLD);
        this.addZone('anytriple', 70, 820, 300, 96, DGREEN, 0xff5a4e);
        this.feltLabel('ANY TRIPLE', 220, 850, 26, 0xffffff);
        this.feltLabel(`${ANY_TRIPLE_ODDS}:1`, 220, 884, 20, 0xff9d6a);
        for (let n = 1; n <= 6; n++) {
            const x = 390 + (n - 1) * (158 + 8);
            const y = 820;
            this.addZone(`triple-${n}`, x, y, 158, 96, GREEN, 0xff5a4e);
            const die = new Graphics();
            die.position.set(x + 50, y + 40);
            this.drawMiniDie(die, n, 44);
            this.feltLayer.addChild(die);
            this.feltLabel(`${SPECIFIC_TRIPLE_ODDS}:1`, x + 79, y + 76, 16, 0xff9d6a);
        }
    }

    // --- table dressing + UI ----------------------------------------------------------

    private buildTable(): void {
        const W = GameConfig.width;
        const H = GameConfig.height;

        this.tableLayer.addChild(new Graphics().rect(0, 0, W, H).fill(new FillGradient({
            type: 'linear', start: { x: 0, y: 0 }, end: { x: 0, y: 1 }, textureSpace: 'local',
            colorStops: [{ offset: 0, color: 0x2a0f12 }, { offset: 1, color: 0x120608 }],
        })));

        // Lacquered table top.
        this.tableLayer.addChild(new Graphics()
            .roundRect(40, 90, 1540, 960, 30).fill(new FillGradient({
                type: 'radial', center: { x: 0.5, y: 0.4 }, innerRadius: 0.05, outerCenter: { x: 0.5, y: 0.5 }, outerRadius: 0.8, textureSpace: 'local',
                colorStops: [{ offset: 0, color: 0x0e6a3e }, { offset: 0.7, color: 0x0a4f2e }, { offset: 1, color: 0x07371f }],
            }))
            .roundRect(40, 90, 1540, 960, 30).stroke({ width: 14, color: 0x4a2c14 })
            .roundRect(56, 106, 1508, 928, 22).stroke({ width: 3, color: 0xd4af37, alpha: 0.7 }));

        // Dice cage (glass dome) behind the dice.
        this.tableLayer.addChild(new Graphics()
            .ellipse(770, 235, 280, 150).fill({ color: 0x0a3f26, alpha: 0.5 })
            .ellipse(770, 235, 280, 150).stroke({ width: 4, color: 0xd4af37, alpha: 0.6 })
            .ellipse(770, 215, 250, 120).fill({ color: 0xbfe8ff, alpha: 0.06 })
            .ellipse(770, 215, 250, 120).stroke({ width: 2, color: 0xbfe8ff, alpha: 0.2 }));

        const title = new Text({ text: 'GOLDEN DRAGON SIC BO', style: {
            fontFamily: 'Georgia, "Times New Roman", serif', fontSize: 40, fontWeight: '900', letterSpacing: 4,
            fill: 0xffd23d, stroke: { color: 0x3a1008, width: 6 },
            dropShadow: { color: 0xff5a4e, blur: 14, distance: 0, alpha: 0.5 },
        } });
        title.anchor.set(0, 0.5);
        title.position.set(70, 56);
        this.tableLayer.addChild(title);

        this.resultText = new Text({ text: '', style: {
            fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 30, fontWeight: '900',
            fill: 0xffffff, stroke: { color: 0x07371f, width: 6 },
        } });
        this.resultText.anchor.set(0.5);
        this.resultText.position.set(1160, 235);
        this.tableLayer.addChild(this.resultText);
    }

    private createUI(): void {
        const cx = 1758;

        this.uiContainer.addChild(new Graphics()
            .roundRect(1618, 140, 280, 880, 26).fill({ color: 0x1a0a0c, alpha: 0.96 })
            .roundRect(1618, 140, 280, 880, 26).stroke({ width: 3, color: 0x7a1414 })
            .roundRect(1628, 150, 260, 860, 20).stroke({ width: 1.5, color: 0xffd23d, alpha: 0.3 }));

        this.banner = new Text({ text: '', style: {
            fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 70, fontWeight: '900',
            fill: 0xffd23d, stroke: { color: 0x3a1008, width: 10 },
        } });
        this.banner.anchor.set(0.5);
        this.banner.position.set(810, 235);
        this.banner.visible = false;
        this.uiContainer.addChild(this.banner);

        const section = (txt: string, y: number): void => {
            const t = new Text({ text: txt, style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 16, fontWeight: '900', letterSpacing: 3, fill: 0xd88a8a } });
            t.anchor.set(0.5);
            t.position.set(cx, y);
            this.uiContainer.addChild(t);
        };

        section('CHIP', 196);
        this.betValueText = new Text({ text: `$${gameStore.getState().bet}`, style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 34, fontWeight: '900', fill: 0xffffff } });
        this.betValueText.anchor.set(0.5);
        this.betValueText.position.set(cx, 250);
        this.uiContainer.addChild(this.betValueText);
        const stepBtn = (dx: number, glyph: string, dir: number): void => {
            const b = new Graphics().circle(0, 0, 26).fill({ color: 0x3a1010 }).circle(0, 0, 26).stroke({ width: 2, color: 0x7a1414 });
            b.position.set(cx + dx, 250);
            b.eventMode = 'static';
            b.cursor = 'pointer';
            b.on('pointerdown', () => {
                if (this.rolling) return;
                gsap.fromTo(b.scale, { x: 0.85, y: 0.85 }, { x: 1, y: 1, duration: 0.25, ease: 'back.out(3)' });
                const state = gameStore.getState();
                const i = BET_STEPS.findIndex((v) => v >= state.bet);
                const next = BET_STEPS[Math.max(0, Math.min(BET_STEPS.length - 1, (i < 0 ? BET_STEPS.length - 1 : i) + dir))];
                state.setBet(next);
                this.betValueText.text = `$${next}`;
            });
            const t = new Text({ text: glyph, style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 28, fontWeight: '900', fill: 0xff8a8a } });
            t.anchor.set(0.5);
            b.addChild(t);
            this.uiContainer.addChild(b);
        };
        stepBtn(-80, '−', -1);
        stepBtn(80, '+', 1);

        this.stakedText = new Text({ text: 'Staked  $0', style: { fontFamily: 'Arial, sans-serif', fontSize: 20, fontWeight: 'bold', fill: 0xffe082 } });
        this.stakedText.anchor.set(0.5);
        this.stakedText.position.set(cx, 312);
        this.uiContainer.addChild(this.stakedText);

        // SHAKE / ROLL.
        this.rollButton = new Graphics();
        this.rollButton.position.set(cx, 420);
        this.rollButton.eventMode = 'static';
        this.rollButton.cursor = 'pointer';
        this.rollButton.on('pointerdown', () => {
            gsap.fromTo(this.rollButton.scale, { x: 0.94, y: 0.94 }, { x: 1, y: 1, duration: 0.3, ease: 'back.out(3)' });
            this.roll();
        });
        this.rollLabel = new Text({ text: '', style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 32, fontWeight: '900', fill: 0xffffff } });
        this.rollLabel.anchor.set(0.5);
        this.rollButton.addChild(this.rollLabel);
        this.uiContainer.addChild(this.rollButton);
        this.styleRoll();

        // REBET + CLEAR.
        const actionBtn = (label: string, y: number, fill: number, edge: number, fn: () => void): void => {
            const b = new Graphics()
                .roundRect(-110, -34, 220, 68, 18).fill(fill)
                .roundRect(-110, -34, 220, 68, 18).stroke({ width: 3, color: edge });
            b.position.set(cx, y);
            b.eventMode = 'static';
            b.cursor = 'pointer';
            b.on('pointerdown', () => { gsap.fromTo(b.scale, { x: 0.93, y: 0.93 }, { x: 1, y: 1, duration: 0.25, ease: 'back.out(3)' }); fn(); });
            const t = new Text({ text: label, style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 24, fontWeight: '900', fill: 0xffffff } });
            t.anchor.set(0.5);
            b.addChild(t);
            this.uiContainer.addChild(b);
        };
        actionBtn('REBET', 540, 0x1f6a8a, 0x6fe9ff, () => this.rebet());
        actionBtn('CLEAR', 620, 0x6a1414, 0xff7a6a, () => this.clearBets());

        section('LAST WIN', 700);
        this.lastWinText = new Text({ text: '$0', style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 40, fontWeight: '900', fill: 0xffd23d } });
        this.lastWinText.anchor.set(0.5);
        this.lastWinText.position.set(cx, 750);
        this.uiContainer.addChild(this.lastWinText);

        this.balanceText = new Text({ text: '', style: { fontFamily: 'Arial, sans-serif', fontSize: 22, fontWeight: 'bold', fill: 0xff8a8a } });
        this.balanceText.anchor.set(0.5);
        this.balanceText.position.set(cx, 980);
        this.uiContainer.addChild(this.balanceText);

        const back = new Text({ text: '‹ MENU', style: { fill: 0xffd23d, fontSize: 26, fontWeight: 'bold' } });
        back.position.set(1632, 96);
        back.eventMode = 'static';
        back.cursor = 'pointer';
        back.on('pointerdown', () => SceneManager.switchScene(new MenuScene()));
        // (back-to-menu removed) this.uiContainer.addChild(back);

        const hint = new Text({ text: 'stack chips on any zones · shake the cage · every bet on the board settles at once', style: { fill: 0x8ac0a0, fontSize: 18, fontStyle: 'italic' } });
        hint.anchor.set(0.5);
        hint.position.set(810, GameConfig.height - 16);
        this.uiContainer.addChild(hint);

        const render = (s: ReturnType<typeof gameStore.getState>): void => {
            this.balanceText.text = `Balance  $${Math.round(s.balance * 100) / 100}`;
        };
        render(gameStore.getState());
        gameStore.subscribe(render);
    }

    private styleRoll(): void {
        const ready = !this.rolling;
        this.rollButton.clear()
            .roundRect(-120, -52, 240, 104, 24).fill(ready ? 0xc41f1f : 0x4a1010)
            .roundRect(-120, -52, 240, 104, 24).stroke({ width: 3, color: ready ? 0xff7a6a : 0x7a1414 });
        this.rollLabel.text = ready ? 'SHAKE' : 'ROLLING…';
        this.rollButton.cursor = ready ? 'pointer' : 'default';
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
        gsap.to(this.banner, { alpha: 0, duration: 0.5, delay: 1.9, onComplete: () => { this.banner.visible = false; } });
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
            const speed = 240 + Math.random() * 340;
            gsap.killTweensOf(c);
            gsap.killTweensOf(c.scale);
            gsap.to(c, { x: x + Math.cos(a) * speed * 0.5, y: y + Math.sin(a) * speed * 0.5 + 380, alpha: 0, duration: 1.0 + Math.random() * 0.4, ease: 'power1.in', onComplete: () => { c.visible = false; } });
            gsap.to(c.scale, { x: 0.3, duration: 0.2, yoyo: true, repeat: 6, ease: 'sine.inOut' });
        }
    }
}
