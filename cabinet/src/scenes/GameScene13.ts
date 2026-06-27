import { Text, Container, Graphics, FillGradient } from 'pixi.js';
import { gsap } from 'gsap';
import { BaseScene } from './BaseScene';
import { GameConfig } from '../config/GameConfig';
import { gameStore } from '../state/GameState';
import { SceneManager } from '../managers/SceneManager';
import { MenuScene } from './MenuScene';

/**
 * GameScene13 — Slot 13: "Jacks or Better"
 * -----------------------------------------
 * Classic video poker — the bar-top machine standard. DEAL five cards, tap
 * the ones to HOLD, then DRAW replacements. A pair of jacks or better pays;
 * royal flush pays 250x.
 *
 * Production touches:
 *  - vector playing cards that fly in and 3D-flip, gold HELD tags
 *  - live pay table in dollars that re-prices as the bet changes
 *  - dealt-hand preview: a paying hand highlights its row before the draw
 *  - winning cards pulse with a gold outline, row flashes, coin burst
 *  - keyboard play: space deals/draws, 1–5 toggle holds
 */

type Phase = 'idle' | 'dealing' | 'hold' | 'drawing' | 'done';

type HandKey =
    | 'royal' | 'straightFlush' | 'four' | 'fullHouse' | 'flush'
    | 'straight' | 'three' | 'twoPair' | 'jacks' | 'none';

const SUITS = ['♠', '♥', '♦', '♣'] as const;
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'] as const;
const BET_STEPS = [1, 2, 5, 10, 20, 50, 100];

const CARD_W = 190;
const CARD_H = 266;
const CARD_Y = 700;
const CARD_CX = 830;
const CARD_GAP = 220;

const PAYTABLE: readonly { key: HandKey; label: string; mult: number }[] = [
    { key: 'royal', label: 'ROYAL FLUSH', mult: 250 },
    { key: 'straightFlush', label: 'STRAIGHT FLUSH', mult: 50 },
    { key: 'four', label: 'FOUR OF A KIND', mult: 25 },
    { key: 'fullHouse', label: 'FULL HOUSE', mult: 9 },
    { key: 'flush', label: 'FLUSH', mult: 6 },
    { key: 'straight', label: 'STRAIGHT', mult: 4 },
    { key: 'three', label: 'THREE OF A KIND', mult: 3 },
    { key: 'twoPair', label: 'TWO PAIR', mult: 2 },
    { key: 'jacks', label: 'JACKS OR BETTER', mult: 1 },
];

interface PlayingCard {
    rank: string;
    suit: string;
    node: Container;
    front: Container;
    back: Container;
    glow: Graphics;
}

/** Poker value: 2–10 at face, J=11 Q=12 K=13 A=14. */
function rankValue(rank: string): number {
    if (rank === 'A') return 14;
    if (rank === 'K') return 13;
    if (rank === 'Q') return 12;
    if (rank === 'J') return 11;
    return parseInt(rank, 10);
}

/** Rank a 5-card hand; winners = indices of the cards that form it. */
function evaluate(cards: { rank: string; suit: string }[]): { key: HandKey; winners: number[] } {
    const byValue = new Map<number, number[]>();
    cards.forEach((c, i) => {
        const v = rankValue(c.rank);
        byValue.set(v, [...(byValue.get(v) ?? []), i]);
    });
    const flush = cards.every((c) => c.suit === cards[0].suit);
    const uniq = [...byValue.keys()].sort((a, b) => a - b);
    // 5 distinct ranks spanning 4, or the wheel (A-2-3-4-5).
    const straight = uniq.length === 5 && (uniq[4] - uniq[0] === 4 || uniq.join(',') === '2,3,4,5,14');
    const groups = [...byValue.values()].sort((a, b) => b.length - a.length);
    const all = [0, 1, 2, 3, 4];

    if (flush && straight && uniq[0] === 10) return { key: 'royal', winners: all };
    if (flush && straight) return { key: 'straightFlush', winners: all };
    if (groups[0].length === 4) return { key: 'four', winners: groups[0] };
    if (groups[0].length === 3 && groups[1].length === 2) return { key: 'fullHouse', winners: all };
    if (flush) return { key: 'flush', winners: all };
    if (straight) return { key: 'straight', winners: all };
    if (groups[0].length === 3) return { key: 'three', winners: groups[0] };
    if (groups[0].length === 2 && groups[1].length === 2) return { key: 'twoPair', winners: [...groups[0], ...groups[1]] };
    const highPair = [...byValue.entries()].find(([v, idx]) => idx.length === 2 && v >= 11);
    if (highPair) return { key: 'jacks', winners: highPair[1] };
    return { key: 'none', winners: [] };
}

export class GameScene13 extends BaseScene {
    private readonly cardLayer = new Container();
    private readonly fxLayer = new Container();
    private readonly uiContainer = new Container();

    private phase: Phase = 'idle';
    private deck: { rank: string; suit: string }[] = [];
    private hand: PlayingCard[] = [];
    private held = [false, false, false, false, false];
    private roundBet = 0;

    private payRows = new Map<HandKey, { bg: Graphics; name: Text; pay: Text; mult: number }>();
    private heldTags: Container[] = [];
    private banner!: Text;
    private flash!: Graphics;
    private mainButton!: Graphics;
    private mainLabel!: Text;
    private mainSub!: Text;
    private betValueText!: Text;
    private lastWinText!: Text;
    private balanceText!: Text;
    private unsubscribe?: () => void;
    private readonly coins: Graphics[] = [];

    private readonly onKeyDown = (e: KeyboardEvent): void => {
        if (e.code === 'Space') {
            e.preventDefault();
            if (this.phase === 'idle') this.deal();
            else if (this.phase === 'hold') this.draw();
        }
        const digit = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'].indexOf(e.code);
        if (digit >= 0) this.toggleHold(digit);
        // (back-to-menu removed) if (e.code === 'Escape') SceneManager.switchScene(new MenuScene());
    };

    public async init(): Promise<void> {
        this.addChild(this.buildBackground());
        this.addChild(this.cardLayer);
        this.addChild(this.fxLayer);
        this.addChild(this.uiContainer);
        this.createUI();
        this.refreshPays();
        window.addEventListener('keydown', this.onKeyDown);
    }

    public async start(): Promise<void> {}
    public update(_delta: number): void {}
    public resize(_width: number, _height: number): void {}

    public override async destroyScene(): Promise<void> {
        window.removeEventListener('keydown', this.onKeyDown);
        this.unsubscribe?.();
        gsap.killTweensOf(this.position);
        for (const c of this.hand) {
            gsap.killTweensOf(c.node);
            gsap.killTweensOf(c.node.position);
            gsap.killTweensOf(c.node.scale);
            gsap.killTweensOf(c.front.scale);
            gsap.killTweensOf(c.back.scale);
        }
        for (const g of this.coins) gsap.killTweensOf(g);
        gsap.killTweensOf(this.banner);
        gsap.killTweensOf(this.banner.scale);
        gsap.killTweensOf(this.flash);
        await super.destroyScene();
    }

    // --- round flow --------------------------------------------------------------

    private deal(): void {
        if (this.phase !== 'idle') return;
        const state = gameStore.getState();
        if (state.balance < state.bet) return;
        state.setBalance(state.balance - state.bet);
        state.setWinAmount(0);
        this.roundBet = state.bet;
        this.clearCards();
        this.banner.visible = false;
        this.highlightRow(null);

        // Fresh shuffled deck each round.
        this.deck = [];
        for (const s of SUITS) for (const r of RANKS) this.deck.push({ rank: r, suit: s });
        for (let i = this.deck.length - 1; i > 0; i--) {
            const j = (Math.random() * (i + 1)) | 0;
            [this.deck[i], this.deck[j]] = [this.deck[j], this.deck[i]];
        }

        this.phase = 'dealing';
        this.styleMain(0x1a3350, 0x3388aa, 'DEALING', '');
        for (let i = 0; i < 5; i++) this.spawnCard(i, i * 0.12);
        gsap.delayedCall(0.12 * 4 + 0.6, () => {
            this.phase = 'hold';
            // Dealt-hand preview: a paying hand lights its row before the draw.
            const dealt = evaluate(this.hand);
            if (dealt.key !== 'none') this.highlightRow(dealt.key, false);
            this.setCardsInteractive(true);
            this.styleMain(0xc4202e, 0xff5a6a, 'DRAW', 'tap cards to hold');
        });
    }

    private draw(): void {
        if (this.phase !== 'hold') return;
        this.phase = 'drawing';
        this.setCardsInteractive(false);
        this.styleMain(0x1a3350, 0x3388aa, 'DRAWING', '');

        let swapped = 0;
        for (let i = 0; i < 5; i++) {
            if (this.held[i]) continue;
            const old = this.hand[i];
            const delay = swapped * 0.12;
            gsap.killTweensOf(old.node.position);
            gsap.to(old.node.position, {
                y: GameConfig.height + CARD_H,
                duration: 0.28,
                delay,
                ease: 'power2.in',
                onComplete: () => old.node.destroy({ children: true }),
            });
            this.spawnCard(i, delay + 0.2);
            swapped++;
        }
        const settleDelay = swapped === 0 ? 0.15 : (swapped - 1) * 0.12 + 0.2 + 0.75;
        gsap.delayedCall(settleDelay, () => this.settle());
    }

    private settle(): void {
        const state = gameStore.getState();
        const result = evaluate(this.hand);
        const row = PAYTABLE.find((r) => r.key === result.key);

        for (let i = 0; i < 5; i++) {
            this.held[i] = false;
            this.heldTags[i].visible = false;
            this.hand[i].glow.visible = false;
        }

        if (row) {
            const payout = row.mult * this.roundBet;
            state.setBalance(state.balance + payout);
            state.setWinAmount(payout);
            this.lastWinText.text = `$${payout}`;
            this.highlightRow(result.key, true);
            this.showBanner(`${row.label}  +$${payout}`, 0xffd24a);
            this.coinBurst(CARD_CX, CARD_Y - 200, Math.min(40, 12 + row.mult));
            for (const i of result.winners) {
                const card = this.hand[i];
                card.glow.visible = true;
                gsap.fromTo(card.node.scale, { x: 1, y: 1 }, { x: 1.1, y: 1.1, duration: 0.22, yoyo: true, repeat: 3, ease: 'sine.inOut' });
            }
        } else {
            this.lastWinText.text = '$0';
            this.highlightRow(null);
            this.showBanner('NO WIN', 0x8a99ae);
            gsap.killTweensOf(this.flash);
            gsap.timeline()
                .set(this.flash, { alpha: 0.18 })
                .to(this.flash, { alpha: 0, duration: 0.5, ease: 'power2.out' });
        }

        this.phase = 'done';
        gsap.delayedCall(1.2, () => {
            this.phase = 'idle';
            this.styleMain(0x00aa44, 0x00e060, 'DEAL', 'space to deal');
        });
    }

    private clearCards(): void {
        for (const c of this.hand) {
            gsap.killTweensOf(c.node);
            gsap.killTweensOf(c.node.position);
            c.node.destroy({ children: true });
        }
        this.hand = [];
        this.held = [false, false, false, false, false];
        for (const tag of this.heldTags) tag.visible = false;
    }

    // --- cards ---------------------------------------------------------------------

    private spawnCard(slot: number, delay: number): void {
        const def = this.deck.pop()!;
        const card = this.makeCard(def.rank, def.suit);
        this.hand[slot] = card;
        this.cardLayer.addChild(card.node);

        const tx = CARD_CX + (slot - 2) * CARD_GAP;
        card.node.position.set(tx, GameConfig.height + CARD_H);
        card.node.scale.set(0.85);
        card.node.cursor = 'pointer';
        card.node.eventMode = 'none';
        card.node.on('pointerdown', () => this.toggleHold(slot));

        gsap.to(card.node.position, { y: CARD_Y, duration: 0.38, delay, ease: 'power2.out' });
        gsap.to(card.node.scale, { x: 1, y: 1, duration: 0.38, delay, ease: 'power2.out' });
        gsap.delayedCall(delay + 0.3, () => this.flipCard(card));
    }

    private toggleHold(slot: number): void {
        if (this.phase !== 'hold' || !this.hand[slot]) return;
        this.held[slot] = !this.held[slot];
        const on = this.held[slot];
        this.heldTags[slot].visible = on;
        this.hand[slot].glow.visible = on;
        if (on) {
            gsap.fromTo(this.heldTags[slot].scale, { x: 0.4, y: 0.4 }, { x: 1, y: 1, duration: 0.25, ease: 'back.out(2.5)' });
        }
        gsap.fromTo(this.hand[slot].node.scale, { x: 0.95, y: 0.95 }, { x: 1, y: 1, duration: 0.2, ease: 'back.out(2)' });
    }

    private setCardsInteractive(on: boolean): void {
        for (const c of this.hand) c.node.eventMode = on ? 'static' : 'none';
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
            .roundRect(-CARD_W / 2 + 3, -CARD_H / 2 + 6, CARD_W, CARD_H, 16).fill({ color: 0x000000, alpha: 0.35 }) // shadow
            .roundRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 16).fill(0xfdfdf6)
            .roundRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 16).stroke({ width: 2.5, color: 0xb9bdc9 }));
        const corner = (cx: number, cy: number, flip: boolean): void => {
            const r = new Text({ text: rank, style: { fontFamily: 'Georgia, serif', fontSize: 42, fontWeight: '900', fill: ink } });
            r.anchor.set(0.5);
            r.position.set(cx, cy);
            const s = new Text({ text: suit, style: { fontSize: 32, fill: ink } });
            s.anchor.set(0.5);
            s.position.set(cx, cy + (flip ? -36 : 36));
            if (flip) { r.rotation = Math.PI; s.rotation = Math.PI; }
            front.addChild(r, s);
        };
        corner(-CARD_W / 2 + 32, -CARD_H / 2 + 36, false);
        corner(CARD_W / 2 - 32, CARD_H / 2 - 36, true);
        const pip = new Text({ text: suit, style: { fontSize: 104, fill: ink } });
        pip.anchor.set(0.5);
        front.addChild(pip);

        const back = new Container();
        back.addChild(new Graphics()
            .roundRect(-CARD_W / 2 + 3, -CARD_H / 2 + 6, CARD_W, CARD_H, 16).fill({ color: 0x000000, alpha: 0.35 })
            .roundRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 16).fill(0xfdfdf6)
            .roundRect(-CARD_W / 2 + 9, -CARD_H / 2 + 9, CARD_W - 18, CARD_H - 18, 12).fill(0x16336b)
            .roundRect(-CARD_W / 2 + 9, -CARD_H / 2 + 9, CARD_W - 18, CARD_H - 18, 12).stroke({ width: 3, color: 0xffd24a }));
        const pattern = new Graphics();
        for (let py = -CARD_H / 2 + 26; py < CARD_H / 2 - 18; py += 26) {
            for (let px = -CARD_W / 2 + 26; px < CARD_W / 2 - 18; px += 26) {
                pattern.poly([px, py - 8, px + 8, py, px, py + 8, px - 8, py]).fill({ color: 0xffd24a, alpha: 0.45 });
            }
        }
        back.addChild(pattern);

        // Gold outline shown while held and on winning cards.
        const glow = new Graphics()
            .roundRect(-CARD_W / 2 - 7, -CARD_H / 2 - 7, CARD_W + 14, CARD_H + 14, 20).stroke({ width: 6, color: 0xffd24a, alpha: 0.95 });
        glow.visible = false;

        front.visible = false;
        node.addChild(back, front, glow);
        return { rank, suit, node, front, back, glow };
    }

    // --- pay table -------------------------------------------------------------------

    private refreshPays(): void {
        const bet = this.phase === 'idle' ? gameStore.getState().bet : this.roundBet;
        for (const { pay, mult } of this.payRows.values()) pay.text = `$${mult * bet}`;
    }

    /** null clears; flashing pulses the row after a winning draw. */
    private highlightRow(key: HandKey | null, flashing = false): void {
        for (const [k, row] of this.payRows) {
            gsap.killTweensOf(row.bg);
            const active = k === key;
            row.bg.alpha = active ? 1 : 0;
            row.name.style.fill = active ? 0x16336b : 0xd8e4ff;
            row.pay.style.fill = active ? 0x16336b : 0xffd24a;
            if (active && flashing) {
                gsap.fromTo(row.bg, { alpha: 0.3 }, { alpha: 1, duration: 0.18, yoyo: true, repeat: 5, ease: 'sine.inOut' });
            }
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
                .ellipse(0, 0, size, size * 0.8).fill({ color: 0xffd24a })
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

    private showBanner(msg: string, tint: number): void {
        this.banner.text = msg;
        this.banner.style.fill = tint;
        this.banner.style.dropShadow = { color: tint, blur: 24, distance: 0, alpha: 0.8, angle: Math.PI / 6 };
        this.banner.alpha = 1;
        this.banner.visible = true;
        gsap.killTweensOf(this.banner);
        gsap.killTweensOf(this.banner.scale);
        gsap.fromTo(this.banner.scale, { x: 0.3, y: 0.3 }, { x: 1, y: 1, duration: 0.45, ease: 'back.out(2.2)' });
        gsap.to(this.banner, { alpha: 0, duration: 0.5, delay: 1.6, onComplete: () => { this.banner.visible = false; } });
    }

    // --- presentation --------------------------------------------------------------------

    private buildBackground(): Container {
        const env = new Container();
        const W = GameConfig.width;
        const H = GameConfig.height;

        // Bar-top cabinet behind the screen.
        env.addChild(new Graphics().rect(0, 0, W, H).fill(new FillGradient({
            type: 'linear', start: { x: 0, y: 0 }, end: { x: 0, y: 1 }, textureSpace: 'local',
            colorStops: [{ offset: 0, color: 0x101426 }, { offset: 0.6, color: 0x0a0e1c }, { offset: 1, color: 0x05070f }],
        })));

        // Giant translucent suit pips drifting in the backdrop.
        const ghost = (ch: string, x: number, y: number, size: number, rot: number, alpha: number): void => {
            const t = new Text({ text: ch, style: { fontSize: size, fill: 0x2a3a6a } });
            t.anchor.set(0.5);
            t.position.set(x, y);
            t.rotation = rot;
            t.alpha = alpha;
            env.addChild(t);
        };
        ghost('♠', 180, 280, 240, 0.3, 0.4);
        ghost('♥', 1500, 200, 180, -0.25, 0.35);
        ghost('♦', 340, 920, 200, -0.4, 0.35);
        ghost('♣', 1560, 880, 260, 0.35, 0.4);

        // Machine screen: deep blue CRT panel the table and cards sit on.
        env.addChild(new Graphics()
            .roundRect(200, 88, 1264, 944, 30).fill(new FillGradient({
                type: 'linear', start: { x: 0, y: 0 }, end: { x: 0, y: 1 }, textureSpace: 'local',
                colorStops: [{ offset: 0, color: 0x10245c }, { offset: 0.55, color: 0x0c1a44 }, { offset: 1, color: 0x081230 }],
            }))
            .roundRect(200, 88, 1264, 944, 30).stroke({ width: 6, color: 0x2a3a6a })
            .roundRect(212, 100, 1240, 920, 24).stroke({ width: 2, color: 0xffd24a, alpha: 0.3 }));

        // Empty card outlines so the layout reads before the first deal.
        const slots = new Graphics();
        for (let i = 0; i < 5; i++) {
            const x = CARD_CX + (i - 2) * CARD_GAP;
            slots.roundRect(x - CARD_W / 2, CARD_Y - CARD_H / 2, CARD_W, CARD_H, 16).stroke({ width: 2.5, color: 0xffd24a, alpha: 0.3 });
        }
        env.addChild(slots);

        const title = new Text({
            text: 'JACKS OR BETTER',
            style: {
                fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 46, fontWeight: '900', letterSpacing: 6,
                fill: 0xffd24a, stroke: { color: 0x1a1204, width: 6 },
                dropShadow: { color: 0xffd24a, blur: 20, distance: 0, alpha: 0.8 },
            },
        });
        title.anchor.set(0, 0.5);
        title.position.set(44, 52);
        env.addChild(title);

        this.flash = new Graphics().rect(0, 0, W, H).fill(0xff2440);
        this.flash.alpha = 0;
        env.addChild(this.flash);
        return env;
    }

    private createUI(): void {
        const H = GameConfig.height;
        const cx = 1758; // control panel column

        // Pay table across the top of the screen.
        this.uiContainer.addChild(new Graphics()
            .roundRect(240, 116, 1180, 408, 22).fill({ color: 0x081028, alpha: 0.85 })
            .roundRect(240, 116, 1180, 408, 22).stroke({ width: 2.5, color: 0xffd24a, alpha: 0.5 }));
        PAYTABLE.forEach((row, i) => {
            const y = 158 + i * 42;
            const bg = new Graphics()
                .roundRect(254, y - 18, 1152, 36, 10).fill({ color: 0xffd24a });
            bg.alpha = 0;
            this.uiContainer.addChild(bg);
            const name = new Text({ text: row.label, style: {
                fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 24, fontWeight: '900', letterSpacing: 2, fill: 0xd8e4ff,
            } });
            name.anchor.set(0, 0.5);
            name.position.set(296, y);
            const pay = new Text({ text: '', style: {
                fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 24, fontWeight: '900', fill: 0xffd24a,
            } });
            pay.anchor.set(1, 0.5);
            pay.position.set(1364, y);
            this.uiContainer.addChild(name, pay);
            this.payRows.set(row.key, { bg, name, pay, mult: row.mult });
        });

        this.banner = new Text({
            text: '',
            style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 84, fontWeight: '900', fill: 0xffd24a, stroke: { color: 0x1a1204, width: 12 } },
        });
        this.banner.anchor.set(0.5);
        this.banner.position.set(CARD_CX, 700);
        this.banner.visible = false;
        this.uiContainer.addChild(this.banner);

        // HELD tags above each card slot.
        for (let i = 0; i < 5; i++) {
            const tag = new Container();
            tag.position.set(CARD_CX + (i - 2) * CARD_GAP, CARD_Y - CARD_H / 2 - 38);
            tag.addChild(new Graphics()
                .roundRect(-52, -22, 104, 44, 12).fill(0xffd24a)
                .roundRect(-52, -22, 104, 44, 12).stroke({ width: 2.5, color: 0x8a6512 }));
            const t = new Text({ text: 'HELD', style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 24, fontWeight: '900', letterSpacing: 2, fill: 0x16336b } });
            t.anchor.set(0.5);
            tag.addChild(t);
            tag.visible = false;
            this.uiContainer.addChild(tag);
            this.heldTags.push(tag);
        }

        // --- right control panel -------------------------------------------------
        this.uiContainer.addChild(new Graphics()
            .roundRect(1618, 140, 280, 880, 26).fill({ color: 0x10131f, alpha: 0.96 })
            .roundRect(1618, 140, 280, 880, 26).stroke({ width: 2, color: 0x2a3a6a })
            .roundRect(1628, 150, 260, 860, 20).stroke({ width: 1.5, color: 0xffd24a, alpha: 0.25 }));

        const section = (txt: string, y: number): void => {
            const t = new Text({ text: txt, style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 16, fontWeight: '900', letterSpacing: 3, fill: 0x8a9ac4 } });
            t.anchor.set(0.5);
            t.position.set(cx, y);
            this.uiContainer.addChild(t);
        };
        const divider = (y: number): void => {
            this.uiContainer.addChild(new Graphics().moveTo(1650, y).lineTo(1866, y).stroke({ width: 1.5, color: 0x2a3a6a }));
        };

        section('BET', 196);
        this.betValueText = new Text({ text: `$${gameStore.getState().bet}`, style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 34, fontWeight: '900', fill: 0xffffff } });
        this.betValueText.anchor.set(0.5);
        this.betValueText.position.set(cx, 250);
        this.uiContainer.addChild(this.betValueText);
        const stepBtn = (dx: number, glyph: string, dir: number): void => {
            const b = new Graphics()
                .circle(0, 0, 26).fill({ color: 0x1a2138 })
                .circle(0, 0, 26).stroke({ width: 2, color: 0x2a3a6a });
            b.position.set(cx + dx, 250);
            b.eventMode = 'static';
            b.cursor = 'pointer';
            b.on('pointerdown', () => {
                if (this.phase !== 'idle') return;
                gsap.fromTo(b.scale, { x: 0.85, y: 0.85 }, { x: 1, y: 1, duration: 0.25, ease: 'back.out(3)' });
                const state = gameStore.getState();
                const i = BET_STEPS.findIndex((v) => v >= state.bet);
                const next = BET_STEPS[Math.max(0, Math.min(BET_STEPS.length - 1, (i < 0 ? BET_STEPS.length - 1 : i) + dir))];
                state.setBet(next);
                this.betValueText.text = `$${next}`;
                this.refreshPays();
            });
            const t = new Text({ text: glyph, style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 28, fontWeight: '900', fill: 0xaac4ff } });
            t.anchor.set(0.5);
            b.addChild(t);
            this.uiContainer.addChild(b);
        };
        stepBtn(-80, '−', -1);
        stepBtn(80, '+', 1);

        divider(330);
        this.mainButton = new Graphics();
        this.mainButton.position.set(cx, 446);
        this.mainButton.eventMode = 'static';
        this.mainButton.cursor = 'pointer';
        this.mainButton.on('pointerdown', () => {
            gsap.fromTo(this.mainButton.scale, { x: 0.94, y: 0.94 }, { x: 1, y: 1, duration: 0.3, ease: 'back.out(3)' });
            if (this.phase === 'idle') this.deal();
            else if (this.phase === 'hold') this.draw();
        });
        this.mainLabel = new Text({ text: '', style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 34, fontWeight: '900', fill: 0xffffff } });
        this.mainLabel.anchor.set(0.5);
        this.mainLabel.position.set(0, -14);
        this.mainSub = new Text({ text: '', style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 15, fontWeight: '900', fill: 0xffffff } });
        this.mainSub.alpha = 0.85;
        this.mainSub.anchor.set(0.5);
        this.mainSub.position.set(0, 26);
        this.mainButton.addChild(this.mainLabel, this.mainSub);
        this.uiContainer.addChild(this.mainButton);
        this.styleMain(0x00aa44, 0x00e060, 'DEAL', 'space to deal');

        divider(580);
        section('LAST WIN', 620);
        this.lastWinText = new Text({ text: '$0', style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 40, fontWeight: '900', fill: 0xffd24a } });
        this.lastWinText.anchor.set(0.5);
        this.lastWinText.position.set(cx, 676);
        this.uiContainer.addChild(this.lastWinText);

        divider(930);
        this.balanceText = new Text({ text: '', style: { fontFamily: 'Arial, sans-serif', fontSize: 22, fontWeight: 'bold', fill: 0xaac4ff } });
        this.balanceText.anchor.set(0.5);
        this.balanceText.position.set(cx, 968);
        this.uiContainer.addChild(this.balanceText);

        const back = new Text({ text: '‹ MENU', style: { fill: 0xffd24a, fontSize: 26, fontWeight: 'bold' } });
        back.position.set(44, 86);
        back.eventMode = 'static';
        back.cursor = 'pointer';
        back.on('pointerdown', () => SceneManager.switchScene(new MenuScene()));
        // (back-to-menu removed) this.uiContainer.addChild(back);

        const hint = new Text({ text: 'tap cards (or keys 1–5) to hold · space deals & draws · pair of jacks or better pays', style: { fill: 0x8a9ac4, fontSize: 18, fontStyle: 'italic' } });
        hint.anchor.set(0.5);
        hint.position.set(CARD_CX, H - 16);
        this.uiContainer.addChild(hint);

        const render = (s: ReturnType<typeof gameStore.getState>): void => {
            this.balanceText.text = `Balance  $${Math.round(s.balance * 100) / 100}`;
        };
        render(gameStore.getState());
        this.unsubscribe = gameStore.subscribe(render);
    }

    private styleMain(fill: number, edge: number, label: string, sub: string): void {
        this.mainButton.clear()
            .roundRect(-110, -54, 220, 108, 24).fill(fill)
            .roundRect(-110, -54, 220, 108, 24).stroke({ width: 3, color: edge });
        this.mainLabel.text = label;
        this.mainSub.text = sub;
    }
}
