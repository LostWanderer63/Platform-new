import { Text, Container, Graphics, FillGradient } from 'pixi.js';
import { gsap } from 'gsap';
import { BaseScene } from './BaseScene';
import { GameConfig } from '../config/GameConfig';
import { gameStore } from '../state/GameState';
import { SceneManager } from '../managers/SceneManager';
import { MenuScene } from './MenuScene';

/**
 * GameScene23 — Slot 23: "Royal Baccarat"
 * ----------------------------------------
 * The Macau high-roller table. Stack chips on PLAYER, BANKER, TIE or the PAIR
 * side bets, then DEAL. Two hands are dealt from the shoe, the fixed third-card
 * rules play out automatically, and every bet on the felt settles at once —
 * Banker pays 0.95:1 (5% commission), Tie 8:1, Pairs 11:1.
 *
 * Production presentation:
 *  - vector cards fly from the shoe and 3D-flip with a squeeze pop
 *  - live point totals, natural 8/9 callouts, winning side glow
 *  - a bead-road history grid (P / B / T) like a real baccarat table
 *  - REBET / CLEAR, chip denominations, coin burst + result banner
 */

const SUITS = ['♠', '♥', '♦', '♣'] as const;
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const;
const BET_STEPS = [1, 2, 5, 10, 20, 50, 100];
const CARD_W = 132;
const CARD_H = 186;

type Side = 'player' | 'banker' | 'tie';

interface PlayingCard { rank: string; suit: string; node: Container; front: Container; back: Container; }
interface Zone { key: string; g: Graphics; chip: Container; chipText: Text; x: number; y: number; w: number; h: number; base: number; edge: number; glow: number; }

function cardValue(rank: string): number {
    if (rank === 'A') return 1;
    if (rank === '10' || rank === 'J' || rank === 'Q' || rank === 'K') return 0;
    return parseInt(rank, 10);
}
const handTotal = (cards: { rank: string }[]): number => cards.reduce((s, c) => s + cardValue(c.rank), 0) % 10;

export class GameScene23 extends BaseScene {
    private readonly tableLayer = new Container();
    private readonly feltLayer = new Container();
    private readonly cardLayer = new Container();
    private readonly fxLayer = new Container();
    private readonly uiContainer = new Container();

    private readonly zones = new Map<string, Zone>();
    private readonly bets = new Map<string, number>();
    private lastBets = new Map<string, number>();
    private dealing = false;

    private deck: { rank: string; suit: string }[] = [];
    private playerCards: PlayingCard[] = [];
    private bankerCards: PlayingCard[] = [];
    private readonly road: Side[] = [];

    private playerTotalText!: Text;
    private bankerTotalText!: Text;
    private banner!: Text;
    private stakedText!: Text;
    private betValueText!: Text;
    private balanceText!: Text;
    private lastWinText!: Text;
    private dealButton!: Graphics;
    private dealLabel!: Text;
    private roadLayer!: Container;
    private roadTally!: Text;
    private helpOverlay!: Container;
    private shoeGlow!: Graphics;
    private readonly coins: Graphics[] = [];
    private readonly calls: gsap.core.Tween[] = [];

    private readonly shoe = { x: 1430, y: 250 };
    private readonly playerCx = 640;
    private readonly bankerCx = 1130;
    private readonly handY = 440;

    private readonly onKeyDown = (e: KeyboardEvent): void => {
        if (e.code === 'Space') { e.preventDefault(); void this.deal(); }
        if (e.code === 'KeyR') this.rebet();
        if (e.code === 'KeyC') this.clearBets();
        // (back-to-menu removed) if (e.code === 'Escape') SceneManager.switchScene(new MenuScene());
    };

    public async init(): Promise<void> {
        this.addChild(this.tableLayer);
        this.addChild(this.feltLayer);
        this.addChild(this.cardLayer);
        this.addChild(this.fxLayer);
        this.addChild(this.uiContainer);
        this.buildTable();
        this.buildFelt();
        this.createUI();
        window.addEventListener('keydown', this.onKeyDown);
    }

    public async start(): Promise<void> {}
    public update(_delta: number): void {}
    public resize(_width: number, _height: number): void {}

    public override async destroyScene(): Promise<void> {
        window.removeEventListener('keydown', this.onKeyDown);
        for (const c of this.calls) c.kill();
        for (const c of [...this.playerCards, ...this.bankerCards]) { gsap.killTweensOf(c.node); gsap.killTweensOf(c.node.position); gsap.killTweensOf(c.node.scale); gsap.killTweensOf(c.front.scale); gsap.killTweensOf(c.back.scale); }
        for (const g of this.coins) gsap.killTweensOf(g);
        gsap.killTweensOf(this.banner); gsap.killTweensOf(this.banner.scale);
        await super.destroyScene();
    }

    // --- betting ---------------------------------------------------------------------

    private totalStaked(): number { let t = 0; for (const v of this.bets.values()) t += v; return t; }

    private placeChip(key: string): void {
        if (this.dealing) return;
        const state = gameStore.getState();
        if (state.balance < this.totalStaked() + state.bet) return;
        this.bets.set(key, (this.bets.get(key) ?? 0) + state.bet);
        this.refreshZone(key); this.refreshStaked();
        gsap.fromTo(this.zones.get(key)!.chip.scale, { x: 0.4, y: 0.4 }, { x: 1, y: 1, duration: 0.25, ease: 'back.out(2.5)' });
    }
    private clearBets(): void {
        if (this.dealing) return;
        for (const k of [...this.bets.keys()]) { this.bets.delete(k); this.refreshZone(k); }
        this.refreshStaked();
    }
    private rebet(): void {
        if (this.dealing || this.lastBets.size === 0) return;
        let need = 0; for (const v of this.lastBets.values()) need += v;
        if (gameStore.getState().balance < need) return;
        this.bets.clear();
        for (const [k, v] of this.lastBets) this.bets.set(k, v);
        for (const k of this.zones.keys()) this.refreshZone(k);
        this.refreshStaked();
    }
    private refreshZone(key: string): void {
        const z = this.zones.get(key); if (!z) return;
        const amt = this.bets.get(key) ?? 0;
        z.chip.visible = amt > 0; z.chip.alpha = 1; z.chipText.text = `$${amt}`;
    }
    private refreshStaked(): void { this.stakedText.text = `Staked  $${this.totalStaked()}`; }

    // --- deal / rules ----------------------------------------------------------------

    private async deal(): Promise<void> {
        if (this.dealing) return;
        const staked = this.totalStaked();
        const state = gameStore.getState();
        if (staked <= 0 || state.balance < staked) return;
        state.setBalance(Math.round((state.balance - staked) * 100) / 100);
        state.setWinAmount(0);
        this.lastBets = new Map(this.bets);
        this.dealing = true;
        this.banner.visible = false;
        this.clearTable();
        this.clearHighlights();
        this.styleDeal();
        // Shoe pulse while cards come out.
        gsap.killTweensOf(this.shoeGlow);
        gsap.fromTo(this.shoeGlow, { alpha: 0.35 }, { alpha: 0.1, duration: 0.5, yoyo: true, repeat: 5, ease: 'sine.inOut', onComplete: () => { this.shoeGlow.alpha = 0; } });

        // Fresh shuffled shoe.
        this.deck = [];
        for (const s of SUITS) for (const r of RANKS) this.deck.push({ rank: r, suit: s });
        for (let i = this.deck.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [this.deck[i], this.deck[j]] = [this.deck[j], this.deck[i]]; }

        // Initial four: P, B, P, B.
        await this.dealCard('player', 0);
        await this.dealCard('banker', 0);
        await this.dealCard('player', 0);
        await this.dealCard('banker', 0);
        this.updateTotals();

        const pT = handTotal(this.playerCards);
        const bT = handTotal(this.bankerCards);
        const natural = pT >= 8 || bT >= 8;

        if (!natural) {
            // Player rule.
            let playerThird: number | null = null;
            if (pT <= 5) {
                await this.dealCard('player', 0);
                this.updateTotals();
                playerThird = cardValue(this.playerCards[2].rank);
            }
            // Banker rule.
            const bNow = handTotal(this.bankerCards);
            let bankerDraws = false;
            if (playerThird === null) {
                bankerDraws = bNow <= 5;
            } else {
                if (bNow <= 2) bankerDraws = true;
                else if (bNow === 3) bankerDraws = playerThird !== 8;
                else if (bNow === 4) bankerDraws = playerThird >= 2 && playerThird <= 7;
                else if (bNow === 5) bankerDraws = playerThird >= 4 && playerThird <= 7;
                else if (bNow === 6) bankerDraws = playerThird >= 6 && playerThird <= 7;
                else bankerDraws = false; // 7 stands
            }
            if (bankerDraws) { await this.dealCard('banker', 0); this.updateTotals(); }
        }

        this.calls.push(gsap.delayedCall(0.4, () => this.settle()));
    }

    private settle(): void {
        const state = gameStore.getState();
        const pT = handTotal(this.playerCards);
        const bT = handTotal(this.bankerCards);
        const winner: Side = pT > bT ? 'player' : bT > pT ? 'banker' : 'tie';
        const playerPair = cardValue(this.playerCards[0].rank) === cardValue(this.playerCards[1].rank) && this.playerCards[0].rank === this.playerCards[1].rank;
        const bankerPair = this.bankerCards[0].rank === this.bankerCards[1].rank;

        const award = (key: string, ret: number): number => {
            const stake = this.bets.get(key);
            return stake ? Math.round(stake * ret * 100) / 100 : 0;
        };
        let totalReturn = 0;
        const winners: string[] = [];
        const add = (key: string, ret: number): void => { const r = award(key, ret); if (r > 0) { totalReturn += r; winners.push(key); } };

        if (winner === 'player') add('player', 2);
        else if (winner === 'banker') add('banker', 1.95);
        else { add('player', 1); add('banker', 1); add('tie', 9); } // push P/B, Tie pays 8:1
        if (playerPair) add('ppair', 12);
        if (bankerPair) add('bpair', 12);

        totalReturn = Math.round(totalReturn * 100) / 100;
        if (totalReturn > 0) {
            state.setBalance(Math.round((state.balance + totalReturn) * 100) / 100);
            state.setWinAmount(totalReturn);
            this.lastWinText.text = `$${totalReturn}`;
            gsap.fromTo(this.lastWinText.scale, { x: 1.3, y: 1.3 }, { x: 1, y: 1, duration: 0.3, ease: 'back.out(2)' });
        }
        for (const k of winners) this.highlightWin(k);
        this.highlightHand(winner);
        // Winning chips pulse; losing chips fade back.
        const winSet = new Set(winners);
        for (const [k, z] of this.zones) {
            if (!this.bets.has(k)) continue;
            if (winSet.has(k)) gsap.fromTo(z.chip.scale, { x: 1.35, y: 1.35 }, { x: 1, y: 1, duration: 0.4, ease: 'back.out(2)' });
            else gsap.to(z.chip, { alpha: 0.28, duration: 0.4 });
        }

        const staked = this.totalStaked();
        const profit = Math.round((totalReturn - staked) * 100) / 100;
        const label = winner === 'tie' ? 'TIE' : winner === 'player' ? `PLAYER WINS · ${pT}` : `BANKER WINS · ${bT}`;
        this.showBanner(totalReturn > 0 ? `${label}   +$${profit > 0 ? profit : totalReturn}` : label, winner === 'tie' ? 0x6fe9ff : winner === 'player' ? 0x4aa8ff : 0xffd23d);
        if (totalReturn > 0) this.coinBurst((this.playerCx + this.bankerCx) / 2, this.handY, Math.min(40, 8 + (totalReturn | 0)));

        this.road.push(winner);
        if (this.road.length > 36) this.road.shift();
        this.renderRoad();

        this.calls.push(gsap.delayedCall(2.6, () => {
            this.dealing = false;
            this.clearBets();
            this.clearHighlights();
            this.styleDeal();
        }));
    }

    private clearTable(): void {
        for (const c of [...this.playerCards, ...this.bankerCards]) { gsap.killTweensOf(c.node); c.node.destroy({ children: true }); }
        this.playerCards = []; this.bankerCards = [];
        this.playerTotalText.text = ''; this.bankerTotalText.text = '';
    }

    // --- cards -----------------------------------------------------------------------

    private dealCard(to: Side, _d: number): Promise<void> {
        return new Promise((resolve) => {
            const def = this.deck.pop()!;
            const card = this.makeCard(def.rank, def.suit);
            const hand = to === 'player' ? this.playerCards : this.bankerCards;
            hand.push(card);
            const cx = to === 'player' ? this.playerCx : this.bankerCx;
            const spacing = 96;
            this.cardLayer.addChild(card.node);
            card.node.position.set(this.shoe.x, this.shoe.y);
            card.node.rotation = 0.3; card.node.scale.set(0.7);

            hand.forEach((c, i) => {
                const tx = cx + (i - (hand.length - 1) / 2) * spacing;
                if (c !== card) gsap.to(c.node.position, { x: tx, duration: 0.22, ease: 'power2.out' });
            });
            const targetX = cx + (hand.length - 1 - (hand.length - 1) / 2) * spacing;
            gsap.to(card.node.position, { x: targetX, y: this.handY, duration: 0.38, ease: 'power2.out' });
            gsap.to(card.node, { rotation: (Math.random() - 0.5) * 0.05, duration: 0.38, ease: 'power2.out' });
            gsap.to(card.node.scale, { x: 1, y: 1, duration: 0.38, ease: 'power2.out' });
            this.calls.push(gsap.delayedCall(0.32, () => this.flipCard(card)));
            this.calls.push(gsap.delayedCall(0.6, () => resolve()));
        });
    }

    private flipCard(card: PlayingCard): void {
        if (card.front.visible) return;
        gsap.killTweensOf(card.back.scale); gsap.killTweensOf(card.front.scale);
        gsap.timeline()
            .to(card.back.scale, { x: 0, duration: 0.13, ease: 'power2.in' })
            .add(() => { card.back.visible = false; card.front.visible = true; card.front.scale.x = 0; })
            .to(card.front.scale, { x: 1, duration: 0.17, ease: 'back.out(1.8)' })
            .fromTo(card.node.scale, { x: 1.06, y: 1.06 }, { x: 1, y: 1, duration: 0.18, ease: 'sine.out' }, '-=0.1'); // squeeze pop
    }

    private makeCard(rank: string, suit: string): PlayingCard {
        const node = new Container();
        const red = suit === '♥' || suit === '♦';
        const ink = red ? 0xd92e3a : 0x1a1f2a;
        const front = new Container();
        front.addChild(new Graphics()
            .roundRect(-CARD_W / 2 + 3, -CARD_H / 2 + 6, CARD_W, CARD_H, 12).fill({ color: 0x000000, alpha: 0.35 })
            .roundRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 12).fill(0xfdfdf6)
            .roundRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 12).stroke({ width: 2.5, color: 0xb9bdc9 }));
        const corner = (cx: number, cy: number, flip: boolean): void => {
            const r = new Text({ text: rank, style: { fontFamily: 'Georgia, serif', fontSize: 30, fontWeight: '900', fill: ink } });
            r.anchor.set(0.5); r.position.set(cx, cy);
            const s = new Text({ text: suit, style: { fontSize: 24, fill: ink } });
            s.anchor.set(0.5); s.position.set(cx, cy + (flip ? -26 : 26));
            if (flip) { r.rotation = Math.PI; s.rotation = Math.PI; }
            front.addChild(r, s);
        };
        corner(-CARD_W / 2 + 22, -CARD_H / 2 + 26, false);
        corner(CARD_W / 2 - 22, CARD_H / 2 - 26, true);
        const pip = new Text({ text: suit, style: { fontSize: 76, fill: ink } });
        pip.anchor.set(0.5); front.addChild(pip);

        const back = new Container();
        back.addChild(new Graphics()
            .roundRect(-CARD_W / 2 + 3, -CARD_H / 2 + 6, CARD_W, CARD_H, 12).fill({ color: 0x000000, alpha: 0.35 })
            .roundRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 12).fill(0xfdfdf6)
            .roundRect(-CARD_W / 2 + 8, -CARD_H / 2 + 8, CARD_W - 16, CARD_H - 16, 9).fill(0x7a1024)
            .roundRect(-CARD_W / 2 + 8, -CARD_H / 2 + 8, CARD_W - 16, CARD_H - 16, 9).stroke({ width: 3, color: 0xd4af37 }));
        const pattern = new Graphics();
        for (let py = -CARD_H / 2 + 20; py < CARD_H / 2 - 12; py += 20) for (let px = -CARD_W / 2 + 20; px < CARD_W / 2 - 12; px += 20) pattern.poly([px, py - 6, px + 6, py, px, py + 6, px - 6, py]).fill({ color: 0xd4af37, alpha: 0.5 });
        back.addChild(pattern);

        front.visible = false;
        node.addChild(back, front);
        return { rank, suit, node, front, back };
    }

    private updateTotals(): void {
        if (this.playerCards.length) { this.playerTotalText.text = `${handTotal(this.playerCards)}`; gsap.fromTo(this.playerTotalText.scale, { x: 1.4, y: 1.4 }, { x: 1, y: 1, duration: 0.25, ease: 'back.out(2)' }); }
        if (this.bankerCards.length) { this.bankerTotalText.text = `${handTotal(this.bankerCards)}`; gsap.fromTo(this.bankerTotalText.scale, { x: 1.4, y: 1.4 }, { x: 1, y: 1, duration: 0.25, ease: 'back.out(2)' }); }
    }

    // --- highlights ------------------------------------------------------------------

    private highlightWin(key: string): void {
        const z = this.zones.get(key); if (!z) return;
        z.g.clear()
            .roundRect(z.x, z.y, z.w, z.h, 12).fill({ color: z.glow })
            .roundRect(z.x, z.y, z.w, z.h, 12).stroke({ width: 4, color: 0xffffff });
        gsap.fromTo(z.g, { alpha: 0.5 }, { alpha: 1, duration: 0.2, yoyo: true, repeat: 5, ease: 'sine.inOut' });
    }
    private highlightHand(winner: Side): void {
        if (winner === 'tie') {
            // Tie: pulse both totals.
            for (const t of [this.playerTotalText, this.bankerTotalText]) gsap.fromTo(t.scale, { x: 1.3, y: 1.3 }, { x: 1, y: 1, duration: 0.4, ease: 'back.out(2)' });
            return;
        }
        const cards = winner === 'player' ? this.playerCards : this.bankerCards;
        for (const c of cards) {
            const ring = new Graphics().roundRect(-CARD_W / 2 - 6, -CARD_H / 2 - 6, CARD_W + 12, CARD_H + 12, 16).stroke({ width: 5, color: 0xffd23d, alpha: 0.95 });
            c.node.addChildAt(ring, 0);
            gsap.fromTo(ring, { alpha: 0 }, { alpha: 0.95, duration: 0.25, yoyo: true, repeat: 5, ease: 'sine.inOut' });
            gsap.fromTo(c.node.scale, { x: 1.1, y: 1.1 }, { x: 1, y: 1, duration: 0.3, ease: 'back.out(2)' });
        }
    }
    private clearHighlights(): void { for (const z of this.zones.values()) this.drawZone(z); }

    // --- felt / table ----------------------------------------------------------------

    private addZone(key: string, x: number, y: number, w: number, h: number, base: number, edge: number, glow: number): Zone {
        const g = new Graphics();
        g.eventMode = 'static'; g.cursor = 'pointer';
        g.on('pointerdown', () => this.placeChip(key));
        this.feltLayer.addChild(g);
        const chip = new Container();
        chip.position.set(x + w - 26, y + h - 26);
        chip.addChild(new Graphics().circle(0, 0, 21).fill({ color: 0xd4361f }).circle(0, 0, 21).stroke({ width: 3, color: 0xfff6ec }).circle(0, 0, 13).stroke({ width: 2, color: 0xfff6ec, alpha: 0.7 }));
        const chipText = new Text({ text: '', style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 16, fontWeight: '900', fill: 0xffffff } });
        chipText.anchor.set(0.5); chip.addChild(chipText); chip.visible = false; this.feltLayer.addChild(chip);
        const z: Zone = { key, g, chip, chipText, x, y, w, h, base, edge, glow };
        this.drawZone(z); this.zones.set(key, z);
        return z;
    }
    private drawZone(z: Zone): void {
        z.g.clear().roundRect(z.x, z.y, z.w, z.h, 12).fill({ color: z.base }).roundRect(z.x, z.y, z.w, z.h, 12).stroke({ width: 2.5, color: z.edge });
    }
    private feltLabel(text: string, x: number, y: number, size: number, fill: number): void {
        const t = new Text({ text, style: { fontFamily: 'Georgia, serif', fontSize: size, fontWeight: '900', letterSpacing: 2, fill } });
        t.anchor.set(0.5); t.position.set(x, y); this.feltLayer.addChild(t);
    }

    private buildFelt(): void {
        const y = 720;
        // PLAYER | TIE | BANKER main bets.
        this.addZone('player', 120, y, 460, 150, 0x123a6a, 0x4aa8ff, 0x1f6abf);
        this.feltLabel('PLAYER', 350, y + 54, 40, 0xbfe0ff); this.feltLabel('pays 1 : 1', 350, y + 100, 22, 0x8ac0ff);
        this.addZone('tie', 600, y, 360, 150, 0x0c5a34, 0x4ade6a, 0x1f8a3c);
        this.feltLabel('TIE', 780, y + 54, 40, 0xbfe8c8); this.feltLabel('pays 8 : 1', 780, y + 100, 22, 0x8ad8a0);
        this.addZone('banker', 980, y, 460, 150, 0x6a1414, 0xff7a6a, 0xc41f1f);
        this.feltLabel('BANKER', 1210, y + 54, 40, 0xffd0c4); this.feltLabel('pays 0.95 : 1', 1210, y + 100, 22, 0xffb0a0);
        // Pair side bets.
        this.addZone('ppair', 120, y - 96, 220, 78, 0x10284a, 0x4aa8ff, 0x1f6abf);
        this.feltLabel('P PAIR  11:1', 230, y - 57, 20, 0x8ac0ff);
        this.addZone('bpair', 1220, y - 96, 220, 78, 0x4a1010, 0xff7a6a, 0xc41f1f);
        this.feltLabel('B PAIR  11:1', 1330, y - 57, 20, 0xffb0a0);
    }

    private buildTable(): void {
        const W = GameConfig.width;
        const H = GameConfig.height;
        this.tableLayer.addChild(new Graphics().rect(0, 0, W, H).fill(new FillGradient({
            type: 'linear', start: { x: 0, y: 0 }, end: { x: 0, y: 1 }, textureSpace: 'local',
            colorStops: [{ offset: 0, color: 0x10241a }, { offset: 1, color: 0x06120c }],
        })));
        // Warm overhead spotlight behind the table.
        this.tableLayer.addChild(new Graphics().ellipse(810, 470, 900, 560).fill(new FillGradient({
            type: 'radial', center: { x: 0.5, y: 0.5 }, innerRadius: 0, outerCenter: { x: 0.5, y: 0.5 }, outerRadius: 0.5, textureSpace: 'local',
            colorStops: [{ offset: 0, color: 'rgba(255,225,150,0.16)' }, { offset: 1, color: 'rgba(255,200,90,0)' }],
        })));
        // Wood rim + felt.
        this.tableLayer.addChild(new Graphics()
            .roundRect(40, 110, 1540, 930, 30).fill(new FillGradient({
                type: 'radial', center: { x: 0.5, y: 0.4 }, innerRadius: 0.05, outerCenter: { x: 0.5, y: 0.5 }, outerRadius: 0.8, textureSpace: 'local',
                colorStops: [{ offset: 0, color: 0x14764a }, { offset: 0.7, color: 0x0e5a38 }, { offset: 1, color: 0x093a24 }],
            }))
            .roundRect(40, 110, 1540, 930, 30).stroke({ width: 16, color: 0x3a2410 })
            .roundRect(48, 118, 1524, 914, 26).stroke({ width: 5, color: 0x6a4420 })
            .roundRect(58, 128, 1504, 894, 22).stroke({ width: 3, color: 0xd4af37, alpha: 0.75 }));
        // Faint felt texture rings + centre monogram.
        const felt = new Graphics();
        for (let r = 120; r < 520; r += 60) felt.ellipse(810, 470, r * 1.4, r).stroke({ width: 1, color: 0xffffff, alpha: 0.025 });
        this.tableLayer.addChild(felt);
        const mono = new Text({ text: '♦', style: { fontFamily: 'Georgia, serif', fontSize: 260, fill: 0xffffff } });
        mono.anchor.set(0.5); mono.alpha = 0.035; mono.position.set(810, 470); this.tableLayer.addChild(mono);
        // Gold corner flourishes.
        const corners = new Graphics();
        for (const [cxp, cyp, sx, sy] of [[80, 150, 1, 1], [1540, 150, -1, 1], [80, 1000, 1, -1], [1540, 1000, -1, -1]] as const) {
            corners.moveTo(cxp, cyp + sy * 60).lineTo(cxp, cyp).lineTo(cxp + sx * 60, cyp).stroke({ width: 3, color: 0xd4af37, alpha: 0.6 });
            corners.circle(cxp + sx * 14, cyp + sy * 14, 5).fill({ color: 0xd4af37, alpha: 0.6 });
        }
        this.tableLayer.addChild(corners);
        // Arc rule text on the felt.
        const arc = new Text({ text: 'COMMISSION  5%  ON  BANKER', style: { fontFamily: 'Georgia, serif', fontSize: 22, fontWeight: 'bold', letterSpacing: 6, fill: 0xd4af37 } });
        arc.anchor.set(0.5); arc.alpha = 0.5; arc.position.set(810, 640); this.tableLayer.addChild(arc);

        // Hand zones outlines.
        const outline = new Graphics();
        for (const cx of [this.playerCx, this.bankerCx]) outline.roundRect(cx - 190, this.handY - CARD_H / 2 - 16, 380, CARD_H + 32, 16).stroke({ width: 2.5, color: 0xd4af37, alpha: 0.35 });
        this.tableLayer.addChild(outline);

        // Shoe + deal glow.
        this.shoeGlow = new Graphics().roundRect(this.shoe.x - 80, this.shoe.y - 90, 170, 190, 18).fill({ color: 0xffd23d });
        this.shoeGlow.blendMode = 'add'; this.shoeGlow.alpha = 0;
        this.tableLayer.addChild(this.shoeGlow);
        this.tableLayer.addChild(new Graphics()
            .roundRect(this.shoe.x - 70, this.shoe.y - 80, 150, 170, 14).fill(0x2a1a0c)
            .roundRect(this.shoe.x - 70, this.shoe.y - 80, 150, 170, 14).stroke({ width: 4, color: 0xd4af37 })
            .roundRect(this.shoe.x - 56, this.shoe.y - 66, 122, 132, 10).fill(0x7a1024)
            .roundRect(this.shoe.x - 56, this.shoe.y - 66, 122, 132, 10).stroke({ width: 2, color: 0xd4af37, alpha: 0.5 }));

        const title = new Text({ text: 'ROYAL BACCARAT', style: {
            fontFamily: 'Georgia, "Times New Roman", serif', fontSize: 42, fontWeight: '900', letterSpacing: 4,
            fill: 0xffd23d, stroke: { color: 0x0a2414, width: 6 }, dropShadow: { color: 0xd4af37, blur: 10, distance: 0, alpha: 0.5 },
        } });
        title.anchor.set(0, 0.5); title.position.set(70, 64); this.tableLayer.addChild(title);

        this.playerTotalText = new Text({ text: '', style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 46, fontWeight: '900', fill: 0xbfe0ff, stroke: { color: 0x0a2414, width: 7 } } });
        this.playerTotalText.anchor.set(0.5); this.playerTotalText.position.set(this.playerCx, this.handY - CARD_H / 2 - 56);
        this.tableLayer.addChild(this.playerTotalText);
        this.bankerTotalText = new Text({ text: '', style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 46, fontWeight: '900', fill: 0xffd0c4, stroke: { color: 0x0a2414, width: 7 } } });
        this.bankerTotalText.anchor.set(0.5); this.bankerTotalText.position.set(this.bankerCx, this.handY - CARD_H / 2 - 56);
        this.tableLayer.addChild(this.bankerTotalText);
        this.feltLabelTable('PLAYER', this.playerCx, this.handY + CARD_H / 2 + 36, 0x8ac0ff);
        this.feltLabelTable('BANKER', this.bankerCx, this.handY + CARD_H / 2 + 36, 0xffb0a0);
    }
    private feltLabelTable(text: string, x: number, y: number, fill: number): void {
        const t = new Text({ text, style: { fontFamily: 'Georgia, serif', fontSize: 24, fontWeight: 'bold', letterSpacing: 3, fill } });
        t.anchor.set(0.5); t.position.set(x, y); this.tableLayer.addChild(t);
    }

    // --- road + UI -------------------------------------------------------------------

    private renderRoad(): void {
        this.roadLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
        const cols = 12; const cell = 25;
        let pW = 0; let bW = 0; let tW = 0;
        this.road.forEach((r, i) => {
            if (r === 'player') pW++; else if (r === 'banker') bW++; else tW++;
            const c = i % cols; const row = (i / cols) | 0;
            const color = r === 'player' ? 0x4aa8ff : r === 'banker' ? 0xff5a4e : 0x4ade6a;
            const g = new Graphics()
                .circle(0, 1, 10).fill({ color: 0x000000, alpha: 0.3 })
                .circle(0, 0, 10).fill({ color })
                .circle(0, 0, 10).stroke({ width: 2, color: 0xffffff, alpha: 0.5 });
            g.position.set(c * cell, row * cell);
            const t = new Text({ text: r === 'player' ? 'P' : r === 'banker' ? 'B' : 'T', style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 12, fontWeight: '900', fill: 0xffffff } });
            t.anchor.set(0.5); g.addChild(t);
            if (i === this.road.length - 1) gsap.fromTo(g.scale, { x: 0.3, y: 0.3 }, { x: 1, y: 1, duration: 0.3, ease: 'back.out(2.5)' });
            this.roadLayer.addChild(g);
        });
        this.roadTally.text = `P ${pW}   B ${bW}   T ${tW}`;
    }

    private createUI(): void {
        const cx = 1758;
        this.banner = new Text({ text: '', style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 64, fontWeight: '900', fill: 0xffd23d, stroke: { color: 0x0a2414, width: 10 } } });
        this.banner.anchor.set(0.5); this.banner.position.set(810, 250); this.banner.visible = false;
        this.uiContainer.addChild(this.banner);

        // Bead road (above the pair bets, clear of the felt zones).
        const roadBg = new Graphics().roundRect(96, 148, 366, 132, 14).fill({ color: 0x06180e, alpha: 0.78 }).roundRect(96, 148, 366, 132, 14).stroke({ width: 2, color: 0x2a5a3a });
        this.uiContainer.addChild(roadBg);
        const roadTitle = new Text({ text: 'BEAD ROAD', style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 14, fontWeight: '900', letterSpacing: 2, fill: 0x6a9a7a } });
        roadTitle.position.set(110, 156); this.uiContainer.addChild(roadTitle);
        this.roadTally = new Text({ text: 'P 0   B 0   T 0', style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 14, fontWeight: '900', fill: 0xd4af37 } });
        this.roadTally.anchor.set(1, 0); this.roadTally.position.set(448, 156); this.uiContainer.addChild(this.roadTally);
        this.roadLayer = new Container(); this.roadLayer.position.set(122, 196); this.uiContainer.addChild(this.roadLayer);

        this.uiContainer.addChild(new Graphics()
            .roundRect(1618, 140, 280, 880, 26).fill({ color: 0x0a1a12, alpha: 0.96 })
            .roundRect(1618, 140, 280, 880, 26).stroke({ width: 3, color: 0x2c6a44 })
            .roundRect(1628, 150, 260, 860, 20).stroke({ width: 1.5, color: 0xd4af37, alpha: 0.3 }));
        const section = (txt: string, y: number): void => {
            const t = new Text({ text: txt, style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 16, fontWeight: '900', letterSpacing: 3, fill: 0x88c0a0 } });
            t.anchor.set(0.5); t.position.set(cx, y); this.uiContainer.addChild(t);
        };
        section('CHIP', 196);
        this.betValueText = new Text({ text: `$${gameStore.getState().bet}`, style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 34, fontWeight: '900', fill: 0xffffff } });
        this.betValueText.anchor.set(0.5); this.betValueText.position.set(cx, 250); this.uiContainer.addChild(this.betValueText);
        const stepBtn = (dx: number, glyph: string, dir: number): void => {
            const b = new Graphics().circle(0, 0, 26).fill({ color: 0x123a24 }).circle(0, 0, 26).stroke({ width: 2, color: 0x2c6a44 });
            b.position.set(cx + dx, 250); b.eventMode = 'static'; b.cursor = 'pointer';
            b.on('pointerdown', () => {
                if (this.dealing) return;
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
        this.stakedText = new Text({ text: 'Staked  $0', style: { fontFamily: 'Arial, sans-serif', fontSize: 20, fontWeight: 'bold', fill: 0xd4af37 } });
        this.stakedText.anchor.set(0.5); this.stakedText.position.set(cx, 312); this.uiContainer.addChild(this.stakedText);

        this.dealButton = new Graphics();
        this.dealButton.position.set(cx, 420); this.dealButton.eventMode = 'static'; this.dealButton.cursor = 'pointer';
        this.dealButton.on('pointerdown', () => { gsap.fromTo(this.dealButton.scale, { x: 0.94, y: 0.94 }, { x: 1, y: 1, duration: 0.3, ease: 'back.out(3)' }); void this.deal(); });
        this.dealLabel = new Text({ text: '', style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 34, fontWeight: '900', fill: 0xffffff } });
        this.dealLabel.anchor.set(0.5); this.dealButton.addChild(this.dealLabel); this.uiContainer.addChild(this.dealButton);
        this.styleDeal();

        const actionBtn = (label: string, y: number, fill: number, edge: number, fn: () => void): void => {
            const b = new Graphics().roundRect(-110, -34, 220, 68, 18).fill(fill).roundRect(-110, -34, 220, 68, 18).stroke({ width: 3, color: edge });
            b.position.set(cx, y); b.eventMode = 'static'; b.cursor = 'pointer';
            b.on('pointerdown', () => { gsap.fromTo(b.scale, { x: 0.93, y: 0.93 }, { x: 1, y: 1, duration: 0.25, ease: 'back.out(3)' }); fn(); });
            const t = new Text({ text: label, style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 24, fontWeight: '900', fill: 0xffffff } });
            t.anchor.set(0.5); b.addChild(t); this.uiContainer.addChild(b);
        };
        actionBtn('REBET', 540, 0x1f6a8a, 0x6fe9ff, () => this.rebet());
        actionBtn('CLEAR', 620, 0x6a1414, 0xff7a6a, () => this.clearBets());

        section('LAST WIN', 710);
        this.lastWinText = new Text({ text: '$0', style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 40, fontWeight: '900', fill: 0xffd23d } });
        this.lastWinText.anchor.set(0.5); this.lastWinText.position.set(cx, 760); this.uiContainer.addChild(this.lastWinText);
        this.balanceText = new Text({ text: '', style: { fontFamily: 'Arial, sans-serif', fontSize: 22, fontWeight: 'bold', fill: 0x88c0a0 } });
        this.balanceText.anchor.set(0.5); this.balanceText.position.set(cx, 980); this.uiContainer.addChild(this.balanceText);

        const back = new Text({ text: '‹ MENU', style: { fill: 0xffd23d, fontSize: 26, fontWeight: 'bold' } });
        back.position.set(70, 116); back.eventMode = 'static'; back.cursor = 'pointer';
        back.on('pointerdown', () => SceneManager.switchScene(new MenuScene()));
        // (back-to-menu removed) this.uiContainer.addChild(back);
        const hint = new Text({ text: 'stack chips on player · tie · banker (or the pairs) · deal · all bets settle at once', style: { fill: 0x6a9a7a, fontSize: 18, fontStyle: 'italic' } });
        hint.anchor.set(0.5); hint.position.set(810, GameConfig.height - 16); this.uiContainer.addChild(hint);

        // HOW TO PLAY button (top-right of the felt).
        const help = new Graphics().circle(0, 0, 24).fill({ color: 0x0a2414 }).circle(0, 0, 24).stroke({ width: 3, color: 0xd4af37 });
        help.position.set(1536, 150); help.eventMode = 'static'; help.cursor = 'pointer';
        const helpQ = new Text({ text: '?', style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 28, fontWeight: '900', fill: 0xffd23d } });
        helpQ.anchor.set(0.5); help.addChild(helpQ);
        help.on('pointerdown', () => this.toggleHelp(true));
        this.uiContainer.addChild(help);
        const helpTag = new Text({ text: 'HOW TO PLAY', style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 13, fontWeight: '900', letterSpacing: 1, fill: 0xd4af37 } });
        helpTag.anchor.set(1, 0.5); helpTag.position.set(1504, 150); this.uiContainer.addChild(helpTag);

        const render = (s: ReturnType<typeof gameStore.getState>): void => { this.balanceText.text = `Balance  $${Math.round(s.balance * 100) / 100}`; };
        render(gameStore.getState()); gameStore.subscribe(render);

        this.buildHelp();
    }

    private buildHelp(): void {
        const W = GameConfig.width; const H = GameConfig.height;
        this.helpOverlay = new Container();
        this.helpOverlay.visible = false;
        // Dim backdrop (click to close).
        const dim = new Graphics().rect(0, 0, W, H).fill({ color: 0x000000, alpha: 0.72 });
        dim.eventMode = 'static'; dim.cursor = 'pointer';
        dim.on('pointerdown', () => this.toggleHelp(false));
        this.helpOverlay.addChild(dim);
        // Panel.
        const pw = 1040; const ph = 660; const px = (W - pw) / 2; const py = (H - ph) / 2;
        this.helpOverlay.addChild(new Graphics()
            .roundRect(px, py, pw, ph, 28).fill(new FillGradient({
                type: 'linear', start: { x: 0, y: 0 }, end: { x: 0, y: 1 }, textureSpace: 'local',
                colorStops: [{ offset: 0, color: 0x10402a }, { offset: 1, color: 0x07251a }],
            }))
            .roundRect(px, py, pw, ph, 28).stroke({ width: 5, color: 0xd4af37 })
            .roundRect(px + 12, py + 12, pw - 24, ph - 24, 20).stroke({ width: 2, color: 0xd4af37, alpha: 0.4 }));
        const title = new Text({ text: 'HOW TO PLAY  ·  BACCARAT', style: { fontFamily: 'Georgia, serif', fontSize: 44, fontWeight: '900', letterSpacing: 3, fill: 0xffd23d, stroke: { color: 0x06180e, width: 5 } } });
        title.anchor.set(0.5); title.position.set(W / 2, py + 56); this.helpOverlay.addChild(title);

        const rules = [
            ['THE GOAL', 'Bet on which hand lands closest to 9 — PLAYER or BANKER — or that they TIE.'],
            ['CARD VALUES', 'A = 1,  2–9 = face value,  10 / J / Q / K = 0.  Only the last digit of a hand counts (e.g. 7 + 6 = 13 → 3).'],
            ['THE DEAL', 'Two cards to each hand. A first-two-card total of 8 or 9 is a "natural" and ends the hand. Otherwise the fixed third-card rules draw automatically — no decisions to make.'],
            ['PAYOUTS', 'PLAYER  pays 1 : 1.    BANKER pays 0.95 : 1 (5% commission).    TIE pays 8 : 1.   On a tie, Player & Banker bets are returned (push).'],
            ['SIDE BETS', 'P PAIR / B PAIR pay 11 : 1 if that hand\'s first two cards are the same rank.'],
            ['HOW TO BET', 'Pick a chip value, tap the zones to stack chips, then DEAL. REBET replays your last stake; CLEAR removes all bets. The BEAD ROAD logs past results.'],
        ];
        let yy = py + 116;
        for (const [h, body] of rules) {
            const hh = new Text({ text: h, style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 22, fontWeight: '900', letterSpacing: 2, fill: 0x6fe9b0 } });
            hh.position.set(px + 56, yy); this.helpOverlay.addChild(hh);
            const bb = new Text({ text: body, style: { fontFamily: 'Arial, sans-serif', fontSize: 21, fill: 0xe6f4ec, wordWrap: true, wordWrapWidth: pw - 112, lineHeight: 28 } });
            bb.position.set(px + 56, yy + 30); this.helpOverlay.addChild(bb);
            yy += 34 + Math.ceil(bb.height / 28) * 28 + 14;
        }
        // Close button.
        const close = new Graphics().roundRect(W / 2 - 110, py + ph - 64, 220, 52, 16).fill(0x1d8a4c).roundRect(W / 2 - 110, py + ph - 64, 220, 52, 16).stroke({ width: 3, color: 0x4ade6a });
        close.eventMode = 'static'; close.cursor = 'pointer';
        close.on('pointerdown', () => this.toggleHelp(false));
        const closeT = new Text({ text: 'GOT IT', style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 24, fontWeight: '900', fill: 0xffffff } });
        closeT.anchor.set(0.5); closeT.position.set(W / 2, py + ph - 38); close.addChild(closeT);
        this.helpOverlay.addChild(close);

        this.uiContainer.addChild(this.helpOverlay);
    }

    private toggleHelp(show: boolean): void {
        this.helpOverlay.visible = show;
        if (show) {
            this.helpOverlay.alpha = 0;
            gsap.to(this.helpOverlay, { alpha: 1, duration: 0.25 });
            gsap.fromTo(this.helpOverlay.scale, { x: 0.98, y: 0.98 }, { x: 1, y: 1, duration: 0.3, ease: 'back.out(1.6)' });
            this.helpOverlay.pivot.set(GameConfig.width / 2, GameConfig.height / 2);
            this.helpOverlay.position.set(GameConfig.width / 2, GameConfig.height / 2);
        }
    }

    private styleDeal(): void {
        const ready = !this.dealing;
        this.dealButton.clear()
            .roundRect(-120, -52, 240, 104, 24).fill(ready ? 0x1d8a4c : 0x123a24)
            .roundRect(-120, -52, 240, 104, 24).stroke({ width: 3, color: ready ? 0x4ade6a : 0x2c6a44 });
        this.dealLabel.text = ready ? 'DEAL' : 'DEALING…';
        this.dealButton.cursor = ready ? 'pointer' : 'default';
    }

    private showBanner(msg: string, tint: number): void {
        this.banner.text = msg; this.banner.style.fill = tint;
        this.banner.style.dropShadow = { color: tint, blur: 22, distance: 0, alpha: 0.8, angle: Math.PI / 6 };
        this.banner.alpha = 1; this.banner.visible = true;
        gsap.killTweensOf(this.banner); gsap.killTweensOf(this.banner.scale);
        gsap.fromTo(this.banner.scale, { x: 0.3, y: 0.3 }, { x: 1, y: 1, duration: 0.45, ease: 'back.out(2.2)' });
        gsap.to(this.banner, { alpha: 0, duration: 0.5, delay: 2.0, onComplete: () => { this.banner.visible = false; } });
    }

    private coinBurst(x: number, y: number, count: number): void {
        for (let i = 0; i < count; i++) {
            let c = this.coins.find((g) => !g.visible);
            if (!c) { c = new Graphics(); c.visible = false; this.fxLayer.addChild(c); this.coins.push(c); }
            const size = 7 + Math.random() * 8;
            c.clear().ellipse(0, 0, size, size * 0.8).fill({ color: 0xffd54f }).ellipse(0, 0, size, size * 0.8).stroke({ width: 2, color: 0x8a6512 }).ellipse(-size * 0.3, -size * 0.25, size * 0.3, size * 0.18).fill({ color: 0xfff6cf, alpha: 0.9 });
            c.position.set(x, y); c.alpha = 1; c.scale.set(1); c.visible = true;
            const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
            const sp = 240 + Math.random() * 320;
            gsap.killTweensOf(c); gsap.killTweensOf(c.scale);
            gsap.to(c, { x: x + Math.cos(a) * sp * 0.5, y: y + Math.sin(a) * sp * 0.5 + 380, alpha: 0, duration: 1.0 + Math.random() * 0.4, ease: 'power1.in', onComplete: () => { c.visible = false; } });
            gsap.to(c.scale, { x: 0.3, duration: 0.2, yoyo: true, repeat: 6, ease: 'sine.inOut' });
        }
    }
}
