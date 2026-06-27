import { Text, Container, Graphics, FillGradient } from 'pixi.js';
import { gsap } from 'gsap';
import { BaseScene } from './BaseScene';
import { GameConfig } from '../config/GameConfig';
import { gameStore } from '../state/GameState';
import { SceneManager } from '../managers/SceneManager';
import { MenuScene } from './MenuScene';

/**
 * GameScene8 — Slot 8: "Royal Blackjack"
 * ---------------------------------------
 * The most-played casino card game. Classic single-hand blackjack vs the
 * dealer: DEAL → HIT / STAND / DOUBLE → dealer draws to 17. Blackjack pays
 * 3:2, push refunds the stake.
 *
 * Production touches:
 *  - vector playing cards (rank corners, big suit pips, patterned back)
 *  - cards fly in from the shoe and 3D-flip face-up; dealer hole-card reveal
 *  - green felt table with gold arc lettering and wood rim
 *  - live hand totals, soft-ace handling (A counts 11 or 1)
 *  - WIN / BLACKJACK / PUSH / BUST banners, coin burst on wins, bust shake
 */

type Phase = 'idle' | 'dealing' | 'player' | 'dealer' | 'done';

const SUITS = ['♠', '♥', '♦', '♣'] as const;
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const;
const BET_STEPS = [1, 2, 5, 10, 20, 50, 100];

const CARD_W = 150;
const CARD_H = 210;

interface PlayingCard {
    rank: string;
    suit: string;
    node: Container;
    front: Container;
    back: Container;
}

function rankValue(rank: string): number {
    if (rank === 'A') return 11;
    if (rank === 'K' || rank === 'Q' || rank === 'J') return 10;
    return parseInt(rank, 10);
}

/** Best blackjack total (aces drop from 11 to 1 while busting). */
function handValue(cards: { rank: string }[]): { total: number; soft: boolean } {
    let total = 0;
    let aces = 0;
    for (const c of cards) {
        total += rankValue(c.rank);
        if (c.rank === 'A') aces++;
    }
    while (total > 21 && aces > 0) { total -= 10; aces--; }
    return { total, soft: aces > 0 };
}

export class GameScene8 extends BaseScene {
    private readonly cardLayer = new Container();
    private readonly fxLayer = new Container();
    private readonly uiContainer = new Container();

    private phase: Phase = 'idle';
    private deck: { rank: string; suit: string }[] = [];
    private playerCards: PlayingCard[] = [];
    private dealerCards: PlayingCard[] = [];
    private holeHidden = true;
    private roundBet = 0;
    private doubled = false;

    private readonly shoePos = { x: 1450, y: 215 };
    private readonly dealerY = 300;
    private readonly playerY = 660;
    private readonly handCx = 860;

    private dealerTotalText!: Text;
    private playerTotalText!: Text;
    private banner!: Text;
    private balanceText!: Text;
    private betValueText!: Text;
    private betChip!: Graphics;
    private stakeChip!: Container;
    private stakeChipGfx!: Graphics;
    private stakeChipText!: Text;
    private buttons: { key: string; g: Graphics; label: Text; hint: Text }[] = [];
    private readonly coins: Graphics[] = [];

    private readonly onKeyDown = (e: KeyboardEvent): void => {
        if (e.code === 'Space') {
            e.preventDefault();
            if (this.phase === 'idle') this.deal();
            else if (this.phase === 'player') this.hit();
        }
        if (e.code === 'Enter' && this.phase === 'player') this.stand();
        // (back-to-menu removed) if (e.code === 'Escape') SceneManager.switchScene(new MenuScene());
    };

    public async init(): Promise<void> {
        this.addChild(this.buildTable());
        this.addChild(this.cardLayer);
        this.addChild(this.fxLayer);
        this.addChild(this.uiContainer);
        this.createUI();
        this.setButtons('idle');
        window.addEventListener('keydown', this.onKeyDown);
    }

    public async start(): Promise<void> {}
    public update(_delta: number): void {}
    public resize(_width: number, _height: number): void {}

    public override async destroyScene(): Promise<void> {
        window.removeEventListener('keydown', this.onKeyDown);
        gsap.killTweensOf(this.position);
        for (const c of [...this.playerCards, ...this.dealerCards]) {
            gsap.killTweensOf(c.node);
            gsap.killTweensOf(c.node.position);
            gsap.killTweensOf(c.node.scale);
            gsap.killTweensOf(c.front.scale);
            gsap.killTweensOf(c.back.scale);
        }
        for (const g of this.coins) gsap.killTweensOf(g);
        gsap.killTweensOf(this.banner);
        gsap.killTweensOf(this.banner.scale);
        await super.destroyScene();
    }

    // --- round flow --------------------------------------------------------------

    private deal(): void {
        const state = gameStore.getState();
        if (this.phase !== 'idle' || state.balance < state.bet) return;
        state.setBalance(state.balance - state.bet);
        state.setWinAmount(0);
        this.roundBet = state.bet;
        this.doubled = false;
        this.clearTable();
        this.showStakeChip(this.roundBet);

        // Fresh shuffled deck each round.
        this.deck = [];
        for (const s of SUITS) for (const r of RANKS) this.deck.push({ rank: r, suit: s });
        for (let i = this.deck.length - 1; i > 0; i--) {
            const j = (Math.random() * (i + 1)) | 0;
            [this.deck[i], this.deck[j]] = [this.deck[j], this.deck[i]];
        }

        this.phase = 'dealing';
        this.setButtons('none');
        this.banner.visible = false;

        // P, D(up), P, D(hole) with stagger.
        this.dealCard('player', true, 0);
        this.dealCard('dealer', true, 0.28);
        this.dealCard('player', true, 0.56);
        this.dealCard('dealer', false, 0.84);
        gsap.delayedCall(1.35, () => {
            this.updateTotals();
            const p = handValue(this.playerCards).total;
            const d = handValue(this.dealerCards).total;
            if (p === 21 || d === 21) {
                this.stand(true); // naturals resolve immediately
            } else {
                this.phase = 'player';
                this.setButtons('player');
            }
        });
    }

    private hit(): void {
        if (this.phase !== 'player') return;
        this.dealCard('player', true, 0);
        this.setButtons('none');
        gsap.delayedCall(0.45, () => {
            this.updateTotals();
            const v = handValue(this.playerCards).total;
            if (v > 21) this.finish();
            else if (v === 21) this.stand();
            else {
                this.phase = 'player';
                this.setButtons('player', false); // double no longer allowed
            }
        });
    }

    private double(): void {
        if (this.phase !== 'player' || this.playerCards.length !== 2) return;
        const state = gameStore.getState();
        if (state.balance < this.roundBet) return;
        state.setBalance(state.balance - this.roundBet);
        this.roundBet *= 2;
        this.doubled = true;
        this.showStakeChip(this.roundBet);
        this.dealCard('player', true, 0);
        this.setButtons('none');
        gsap.delayedCall(0.5, () => {
            this.updateTotals();
            if (handValue(this.playerCards).total > 21) this.finish();
            else this.stand();
        });
    }

    private stand(natural = false): void {
        if (this.phase !== 'player' && !natural && this.phase !== 'dealing') return;
        this.phase = 'dealer';
        this.setButtons('none');
        // Reveal the hole card, then dealer draws to 17.
        this.flipCard(this.dealerCards[1]);
        this.holeHidden = false;
        gsap.delayedCall(0.5, () => {
            this.updateTotals();
            this.dealerDraw();
        });
    }

    private dealerDraw(): void {
        const playerTotal = handValue(this.playerCards).total;
        const d = handValue(this.dealerCards).total;
        // Dealer stops on any 17+, or immediately if the player already busted/has natural.
        if (d >= 17 || playerTotal > 21 || (playerTotal === 21 && this.playerCards.length === 2)) {
            this.finish();
            return;
        }
        this.dealCard('dealer', true, 0);
        gsap.delayedCall(0.6, () => {
            this.updateTotals();
            this.dealerDraw();
        });
    }

    private finish(): void {
        this.phase = 'done';
        if (this.holeHidden) {
            this.flipCard(this.dealerCards[1]);
            this.holeHidden = false;
        }
        this.updateTotals();

        const state = gameStore.getState();
        const p = handValue(this.playerCards).total;
        const d = handValue(this.dealerCards).total;
        const playerBJ = p === 21 && this.playerCards.length === 2 && !this.doubled;
        const dealerBJ = d === 21 && this.dealerCards.length === 2;

        let payout = 0;
        let msg = '';
        let tint = 0xffd54f;
        if (p > 21) { msg = 'BUST'; tint = 0xff4d6d; this.shake(14); }
        else if (playerBJ && !dealerBJ) { payout = this.roundBet * 2.5; msg = 'BLACKJACK!'; tint = 0xffd54f; }
        else if (dealerBJ && !playerBJ) { msg = 'DEALER BLACKJACK'; tint = 0xff4d6d; }
        else if (d > 21 || p > d) { payout = this.roundBet * 2; msg = `WIN $${Math.floor(payout)}`; tint = 0x5be32a; }
        else if (p === d) { payout = this.roundBet; msg = 'PUSH'; tint = 0xaab4c4; }
        else { msg = 'DEALER WINS'; tint = 0xff4d6d; }

        if (payout > 0) {
            const rounded = Math.floor(payout);
            state.setBalance(state.balance + rounded);
            if (rounded > this.roundBet) {
                state.setWinAmount(rounded);
                this.coinBurst(this.handCx, this.playerY, Math.min(36, 10 + (rounded / 10) | 0));
            }
        }
        this.showBanner(msg, tint);
        gsap.delayedCall(1.8, () => {
            this.phase = 'idle';
            this.setButtons('idle');
        });
    }

    private clearTable(): void {
        for (const c of [...this.playerCards, ...this.dealerCards]) {
            gsap.killTweensOf(c.node);
            gsap.killTweensOf(c.node.position);
            c.node.destroy({ children: true });
        }
        this.playerCards = [];
        this.dealerCards = [];
        this.holeHidden = true;
        this.dealerTotalText.text = '';
        this.playerTotalText.text = '';
        this.hideStakeChip();
    }

    // --- cards ---------------------------------------------------------------------

    private dealCard(to: 'player' | 'dealer', faceUp: boolean, delay: number): void {
        const def = this.deck.pop()!;
        const card = this.makeCard(def.rank, def.suit);
        const hand = to === 'player' ? this.playerCards : this.dealerCards;
        hand.push(card);

        const y = to === 'player' ? this.playerY : this.dealerY;
        this.cardLayer.addChild(card.node);
        card.node.position.set(this.shoePos.x, this.shoePos.y);
        card.node.rotation = 0.35;
        card.node.scale.set(0.7);

        // Re-centre the whole hand as it grows.
        const spacing = 108;
        hand.forEach((c, i) => {
            const tx = this.handCx + (i - (hand.length - 1) / 2) * spacing;
            if (c !== card) gsap.to(c.node.position, { x: tx, duration: 0.25, delay, ease: 'power2.out' });
        });
        const targetX = this.handCx + (hand.length - 1 - (hand.length - 1) / 2) * spacing;

        gsap.to(card.node.position, { x: targetX, y, duration: 0.4, delay, ease: 'power2.out' });
        gsap.to(card.node, { rotation: (Math.random() - 0.5) * 0.06, duration: 0.4, delay, ease: 'power2.out' });
        gsap.to(card.node.scale, { x: 1, y: 1, duration: 0.4, delay, ease: 'power2.out' });
        if (faceUp) gsap.delayedCall(delay + 0.28, () => this.flipCard(card));
    }

    /** 3D flip from back to front. */
    private flipCard(card: PlayingCard): void {
        if (card.front.visible) return;
        gsap.killTweensOf(card.back.scale);
        gsap.killTweensOf(card.front.scale);
        gsap.timeline()
            .to(card.back.scale, { x: 0, duration: 0.12, ease: 'power2.in' })
            .add(() => {
                card.back.visible = false;
                card.front.visible = true;
                card.front.scale.x = 0;
            })
            .to(card.front.scale, { x: 1, duration: 0.16, ease: 'back.out(1.8)' });
    }

    /** Vector playing card: white face with corner ranks + big pip, ornate back. */
    private makeCard(rank: string, suit: string): PlayingCard {
        const node = new Container();
        const red = suit === '♥' || suit === '♦';
        const ink = red ? 0xd92e3a : 0x1a1f2a;

        const front = new Container();
        front.addChild(new Graphics()
            .roundRect(-CARD_W / 2 + 3, -CARD_H / 2 + 6, CARD_W, CARD_H, 14).fill({ color: 0x000000, alpha: 0.35 }) // shadow
            .roundRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 14).fill(0xfdfdf6)
            .roundRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 14).stroke({ width: 2.5, color: 0xb9bdc9 }));
        const corner = (cx: number, cy: number, flip: boolean): void => {
            const r = new Text({ text: rank, style: { fontFamily: 'Georgia, serif', fontSize: 34, fontWeight: '900', fill: ink } });
            r.anchor.set(0.5);
            r.position.set(cx, cy);
            const s = new Text({ text: suit, style: { fontSize: 26, fill: ink } });
            s.anchor.set(0.5);
            s.position.set(cx, cy + (flip ? -30 : 30));
            if (flip) { r.rotation = Math.PI; s.rotation = Math.PI; }
            front.addChild(r, s);
        };
        corner(-CARD_W / 2 + 26, -CARD_H / 2 + 30, false);
        corner(CARD_W / 2 - 26, CARD_H / 2 - 30, true);
        const pip = new Text({ text: suit, style: { fontSize: 84, fill: ink } });
        pip.anchor.set(0.5);
        front.addChild(pip);

        const back = new Container();
        back.addChild(new Graphics()
            .roundRect(-CARD_W / 2 + 3, -CARD_H / 2 + 6, CARD_W, CARD_H, 14).fill({ color: 0x000000, alpha: 0.35 })
            .roundRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 14).fill(0xfdfdf6)
            .roundRect(-CARD_W / 2 + 8, -CARD_H / 2 + 8, CARD_W - 16, CARD_H - 16, 10).fill(0x7a1024)
            .roundRect(-CARD_W / 2 + 8, -CARD_H / 2 + 8, CARD_W - 16, CARD_H - 16, 10).stroke({ width: 3, color: 0xd4af37 }));
        const pattern = new Graphics();
        for (let py = -CARD_H / 2 + 22; py < CARD_H / 2 - 14; py += 22) {
            for (let px = -CARD_W / 2 + 22; px < CARD_W / 2 - 14; px += 22) {
                pattern.poly([px, py - 7, px + 7, py, px, py + 7, px - 7, py]).fill({ color: 0xd4af37, alpha: 0.5 });
            }
        }
        back.addChild(pattern);

        front.visible = false;
        node.addChild(back, front);
        return { rank, suit, node, front, back };
    }

    private updateTotals(): void {
        const p = handValue(this.playerCards);
        this.playerTotalText.text = this.playerCards.length ? `YOU · ${p.total}${p.soft ? ' (soft)' : ''}` : '';
        if (this.holeHidden && this.dealerCards.length >= 1) {
            const up = handValue([this.dealerCards[0]]);
            this.dealerTotalText.text = `DEALER · ${up.total} + ?`;
        } else if (this.dealerCards.length) {
            this.dealerTotalText.text = `DEALER · ${handValue(this.dealerCards).total}`;
        }
    }

    // --- effects -----------------------------------------------------------------------

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
        gsap.to(this.banner, { alpha: 0, duration: 0.5, delay: 1.5, onComplete: () => { this.banner.visible = false; } });
    }

    // --- presentation --------------------------------------------------------------------

    private buildTable(): Container {
        const env = new Container();
        const W = GameConfig.width;
        const H = GameConfig.height;

        // Room behind the table.
        env.addChild(new Graphics().rect(0, 0, W, H).fill(new FillGradient({
            type: 'linear', start: { x: 0, y: 0 }, end: { x: 0, y: 1 }, textureSpace: 'local',
            colorStops: [{ offset: 0, color: 0x141019 }, { offset: 1, color: 0x07050a }],
        })));

        // Felt: big rounded table surface with a radial light pool.
        env.addChild(new Graphics()
            .roundRect(90, 140, 1480, 880, 200).fill(new FillGradient({
                type: 'radial', center: { x: 0.5, y: 0.42 }, innerRadius: 0.05, outerCenter: { x: 0.5, y: 0.5 }, outerRadius: 0.8, textureSpace: 'local',
                colorStops: [{ offset: 0, color: 0x1d7a4c }, { offset: 0.65, color: 0x115c38 }, { offset: 1, color: 0x093a23 }],
            }))
            .roundRect(90, 140, 1480, 880, 200).stroke({ width: 18, color: 0x4a2c14 })
            .roundRect(108, 158, 1444, 844, 184).stroke({ width: 4, color: 0xd4af37, alpha: 0.7 }));

        // Player betting circle on the felt — the stake chip lands here.
        env.addChild(new Graphics()
            .circle(470, this.playerY, 68).stroke({ width: 4, color: 0xd4af37, alpha: 0.65 })
            .circle(470, this.playerY, 58).stroke({ width: 2, color: 0xd4af37, alpha: 0.35 }));
        const betCircleLabel = new Text({
            text: 'BET',
            style: { fontFamily: 'Georgia, serif', fontSize: 22, fontWeight: 'bold', letterSpacing: 4, fill: 0xd4af37 },
        });
        betCircleLabel.anchor.set(0.5);
        betCircleLabel.alpha = 0.55;
        betCircleLabel.position.set(470, this.playerY);
        env.addChild(betCircleLabel);

        // Gold arc lettering across the felt.
        const arc = new Text({
            text: 'BLACKJACK PAYS 3 TO 2  ·  DEALER STANDS ON 17',
            style: { fontFamily: 'Georgia, serif', fontSize: 28, fontWeight: 'bold', letterSpacing: 4, fill: 0xd4af37 },
        });
        arc.anchor.set(0.5);
        arc.position.set(this.handCx, 488);
        arc.alpha = 0.85;
        env.addChild(arc);

        // Card outlines where hands land.
        const slots = new Graphics();
        for (const y of [this.dealerY, this.playerY]) {
            slots.roundRect(this.handCx - CARD_W / 2 - 58, y - CARD_H / 2, CARD_W, CARD_H, 14).stroke({ width: 2.5, color: 0xd4af37, alpha: 0.35 });
            slots.roundRect(this.handCx - CARD_W / 2 + 58, y - CARD_H / 2, CARD_W, CARD_H, 14).stroke({ width: 2.5, color: 0xd4af37, alpha: 0.35 });
        }
        env.addChild(slots);

        // Shoe top-right.
        env.addChild(new Graphics()
            .roundRect(this.shoePos.x - 80, this.shoePos.y - 90, 170, 190, 16).fill(0x2a1a0c)
            .roundRect(this.shoePos.x - 80, this.shoePos.y - 90, 170, 190, 16).stroke({ width: 4, color: 0xd4af37 })
            .roundRect(this.shoePos.x - 66, this.shoePos.y - 76, 142, 150, 10).fill(0x7a1024)
            .roundRect(this.shoePos.x - 66, this.shoePos.y - 76, 142, 150, 10).stroke({ width: 3, color: 0xd4af37, alpha: 0.7 }));

        const title = new Text({
            text: 'ROYAL BLACKJACK',
            style: {
                fontFamily: 'Georgia, serif', fontSize: 44, fontWeight: '900', letterSpacing: 6,
                fill: 0xd4af37, stroke: { color: 0x1a0f04, width: 6 },
                dropShadow: { color: 0xd4af37, blur: 10, distance: 0, alpha: 0.5 },
            },
        });
        title.anchor.set(0, 0.5);
        title.position.set(44, 52);
        env.addChild(title);
        return env;
    }

    private createUI(): void {
        const H = GameConfig.height;

        this.dealerTotalText = new Text({ text: '', style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 28, fontWeight: '900', letterSpacing: 2, fill: 0xfff3d0, stroke: { color: 0x07230f, width: 5 } } });
        this.dealerTotalText.anchor.set(0.5);
        this.dealerTotalText.position.set(this.handCx, this.dealerY - 150);
        this.uiContainer.addChild(this.dealerTotalText);

        this.playerTotalText = new Text({ text: '', style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 28, fontWeight: '900', letterSpacing: 2, fill: 0xfff3d0, stroke: { color: 0x07230f, width: 5 } } });
        this.playerTotalText.anchor.set(0.5);
        this.playerTotalText.position.set(this.handCx, this.playerY + 150);
        this.uiContainer.addChild(this.playerTotalText);

        this.banner = new Text({
            text: '',
            style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 110, fontWeight: '900', fill: 0xffd54f, stroke: { color: 0x07230f, width: 12 } },
        });
        this.banner.anchor.set(0.5);
        this.banner.position.set(this.handCx, 488);
        this.banner.visible = false;
        this.uiContainer.addChild(this.banner);

        // Stake chip that lands in the betting circle while a hand is live.
        this.stakeChip = new Container();
        this.stakeChip.position.set(470, this.playerY);
        this.stakeChipGfx = new Graphics();
        this.stakeChipText = new Text({ text: '', style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 26, fontWeight: '900', fill: 0xffffff, stroke: { color: 0x000000, width: 4 } } });
        this.stakeChipText.anchor.set(0.5);
        this.stakeChip.addChild(this.stakeChipGfx, this.stakeChipText);
        this.stakeChip.visible = false;
        this.uiContainer.addChild(this.stakeChip);

        // --- right control panel -------------------------------------------------
        const cx = 1758; // panel centre column
        this.uiContainer.addChild(new Graphics()
            .roundRect(1618, 140, 280, 880, 26).fill({ color: 0x101712, alpha: 0.96 })
            .roundRect(1618, 140, 280, 880, 26).stroke({ width: 2, color: 0x2c4a36 })
            .roundRect(1628, 150, 260, 860, 20).stroke({ width: 1.5, color: 0xd4af37, alpha: 0.25 }));

        const section = (txt: string, y: number): void => {
            const t = new Text({ text: txt, style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 17, fontWeight: '900', letterSpacing: 4, fill: 0x6a8a74 } });
            t.anchor.set(0.5);
            t.position.set(cx, y);
            this.uiContainer.addChild(t);
        };
        const divider = (y: number): void => {
            this.uiContainer.addChild(new Graphics()
                .moveTo(1650, y).lineTo(1866, y).stroke({ width: 1.5, color: 0x2c4a36 }));
        };

        // Bet section: a real casino chip whose colour follows the denomination.
        section('YOUR BET', 196);
        this.betChip = new Graphics();
        this.betChip.position.set(cx, 292);
        this.uiContainer.addChild(this.betChip);
        this.betValueText = new Text({ text: '', style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 30, fontWeight: '900', fill: 0xffffff, stroke: { color: 0x000000, width: 4 } } });
        this.betValueText.anchor.set(0.5);
        this.betValueText.position.set(cx, 292);
        this.uiContainer.addChild(this.betValueText);
        this.renderBetChip();

        const stepBtn = (dx: number, glyph: string, dir: number): void => {
            const b = new Graphics()
                .circle(0, 0, 26).fill({ color: 0x1a2a1e })
                .circle(0, 0, 26).stroke({ width: 2, color: 0x3a5a42 });
            b.position.set(cx + dx, 292);
            b.eventMode = 'static';
            b.cursor = 'pointer';
            b.on('pointerdown', () => {
                if (this.phase !== 'idle') return;
                gsap.fromTo(b.scale, { x: 0.85, y: 0.85 }, { x: 1, y: 1, duration: 0.25, ease: 'back.out(3)' });
                const state = gameStore.getState();
                const i = BET_STEPS.findIndex((v) => v >= state.bet);
                const next = BET_STEPS[Math.max(0, Math.min(BET_STEPS.length - 1, (i < 0 ? BET_STEPS.length - 1 : i) + dir))];
                state.setBet(next);
                this.renderBetChip();
            });
            const t = new Text({ text: glyph, style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 28, fontWeight: '900', fill: 0x9fd8c0 } });
            t.anchor.set(0.5);
            b.addChild(t);
            this.uiContainer.addChild(b);
        };
        stepBtn(-100, '−', -1);
        stepBtn(100, '+', 1);

        divider(386);
        section('ACTIONS', 420);

        const mkButton = (key: string, hintTxt: string, y: number): void => {
            const g = new Graphics();
            g.position.set(cx, y);
            g.eventMode = 'static';
            g.cursor = 'pointer';
            const label = new Text({ text: key, style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 30, fontWeight: '900', fill: 0xffffff } });
            label.anchor.set(0.5);
            label.position.set(0, -12);
            const hint = new Text({ text: hintTxt, style: { fontFamily: 'Arial, sans-serif', fontSize: 16, fontWeight: 'bold', letterSpacing: 1, fill: 0xffffff } });
            hint.anchor.set(0.5);
            hint.alpha = 0.55;
            hint.position.set(0, 22);
            g.addChild(label, hint);
            g.on('pointerdown', () => {
                gsap.fromTo(g.scale, { x: 0.93, y: 0.93 }, { x: 1, y: 1, duration: 0.25, ease: 'back.out(3)' });
                if (key === 'DEAL') this.deal();
                else if (key === 'HIT') this.hit();
                else if (key === 'STAND') this.stand();
                else if (key === 'DOUBLE') this.double();
            });
            this.uiContainer.addChild(g);
            this.buttons.push({ key, g, label, hint });
        };
        mkButton('DEAL', 'space', 490);
        mkButton('HIT', 'space', 612);
        mkButton('STAND', 'enter', 734);
        mkButton('DOUBLE', 'first two cards', 856);

        divider(930);
        this.balanceText = new Text({ text: '', style: { fontFamily: 'Arial, sans-serif', fontSize: 24, fontWeight: 'bold', fill: 0x9fd8c0 } });
        this.balanceText.anchor.set(0.5);
        this.balanceText.position.set(cx, 968);
        this.uiContainer.addChild(this.balanceText);

        const back = new Text({ text: '‹ MENU', style: { fill: 0xd4af37, fontSize: 26, fontWeight: 'bold' } });
        back.position.set(44, 86);
        back.eventMode = 'static';
        back.cursor = 'pointer';
        back.on('pointerdown', () => SceneManager.switchScene(new MenuScene()));
        // (back-to-menu removed) this.uiContainer.addChild(back);

        const hint = new Text({ text: 'blackjack pays 3:2 · dealer stands on 17', style: { fill: 0x6a8a74, fontSize: 18, fontStyle: 'italic' } });
        hint.anchor.set(0.5);
        hint.position.set(this.handCx, H - 16);
        this.uiContainer.addChild(hint);

        const render = (s: ReturnType<typeof gameStore.getState>): void => {
            this.balanceText.text = `Balance  $${Math.round(s.balance * 100) / 100}`;
        };
        render(gameStore.getState());
        gameStore.subscribe(render);
    }

    /** Casino chip colours by denomination (white→red→blue→green→purple→black). */
    private chipColor(bet: number): number {
        if (bet >= 100) return 0x23262e;
        if (bet >= 50) return 0x7a3bb8;
        if (bet >= 20) return 0x1f8a4c;
        if (bet >= 10) return 0x2456c4;
        if (bet >= 5) return 0xc42434;
        return 0x8a99a8;
    }

    /** Draw a poker chip: base colour, white edge dashes, inner ring. */
    private drawChip(g: Graphics, r: number, color: number): void {
        g.clear()
            .circle(0, r * 0.08, r).fill({ color: 0x000000, alpha: 0.4 }) // soft shadow
            .circle(0, 0, r).fill({ color })
            .circle(0, 0, r).stroke({ width: r * 0.06, color: 0x000000, alpha: 0.45 });
        for (let i = 0; i < 8; i++) {
            const a = (Math.PI * 2 * i) / 8;
            g.arc(0, 0, r * 0.86, a - 0.17, a + 0.17).stroke({ width: r * 0.26, color: 0xf4f4ec, alpha: 0.95 });
        }
        g.circle(0, 0, r * 0.62).stroke({ width: r * 0.07, color: 0xf4f4ec, alpha: 0.85 })
            .circle(0, 0, r * 0.55).fill({ color, alpha: 1 })
            .circle(0, 0, r * 0.55).fill({ color: 0xffffff, alpha: 0.08 })
            .ellipse(-r * 0.25, -r * 0.3, r * 0.3, r * 0.16).fill({ color: 0xffffff, alpha: 0.18 });
    }

    private renderBetChip(): void {
        const bet = gameStore.getState().bet;
        this.drawChip(this.betChip, 58, this.chipColor(bet));
        this.betValueText.text = `$${bet}`;
    }

    /** Place/refresh the stake chip in the betting circle. */
    private showStakeChip(amount: number): void {
        this.drawChip(this.stakeChipGfx, 50, this.chipColor(amount));
        if (this.doubled) {
            // Second chip peeking out under the stack.
            const under = new Graphics();
            this.drawChip(under, 50, this.chipColor(this.roundBet / 2));
            under.position.set(10, 10);
            this.stakeChip.addChildAt(under, 0);
        }
        this.stakeChipText.text = `$${amount}`;
        this.stakeChip.visible = true;
        gsap.killTweensOf(this.stakeChip.scale);
        gsap.fromTo(this.stakeChip.scale, { x: 0.3, y: 0.3 }, { x: 1, y: 1, duration: 0.35, ease: 'back.out(2.5)' });
    }

    private hideStakeChip(): void {
        this.stakeChip.visible = false;
        // Drop any stacked under-chips from a double.
        while (this.stakeChip.children.length > 2) this.stakeChip.removeChildAt(0).destroy();
    }

    /** Enable/disable + restyle the action buttons per phase. */
    private setButtons(mode: 'idle' | 'player' | 'none', allowDouble = true): void {
        const state = gameStore.getState();
        for (const { key, g, label, hint } of this.buttons) {
            let enabled = false;
            let fill = 0x1a2a1e;
            let edge = 0x3a5a42;
            if (mode === 'idle' && key === 'DEAL') { enabled = true; fill = 0x28a909; edge = 0x5be32a; }
            if (mode === 'player') {
                if (key === 'HIT') { enabled = true; fill = 0x0e7c8a; edge = 0x6fe9ff; }
                if (key === 'STAND') { enabled = true; fill = 0xb02438; edge = 0xff7a8e; }
                if (key === 'DOUBLE' && allowDouble && this.playerCards.length === 2 && state.balance >= this.roundBet) {
                    enabled = true; fill = 0xb8860b; edge = 0xffd54f;
                }
            }
            g.clear()
                .roundRect(-116, -50, 232, 100, 20).fill({ color: fill, alpha: enabled ? 1 : 0.35 })
                .roundRect(-116, -50, 232, 100, 20).stroke({ width: 3, color: edge, alpha: enabled ? 1 : 0.35 });
            label.alpha = enabled ? 1 : 0.4;
            hint.alpha = enabled ? 0.55 : 0.2;
            g.eventMode = enabled ? 'static' : 'none';
            g.cursor = enabled ? 'pointer' : 'default';
        }
    }
}
