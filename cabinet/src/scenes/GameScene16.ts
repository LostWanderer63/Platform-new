import { Text, Container, Graphics, FillGradient } from 'pixi.js';
import { gsap } from 'gsap';
import { BaseScene } from './BaseScene';
import { GameConfig } from '../config/GameConfig';
import { gameStore } from '../state/GameState';
import { SceneManager } from '../managers/SceneManager';
import { MenuScene } from './MenuScene';

/**
 * GameScene16 — Slot 16: "Turbo Derby"
 * -------------------------------------
 * Live race betting — the only game in the lobby with racing characters.
 * Six horses get fresh weighted odds every race; back one, watch the field
 * surge, draft and trade the lead down a full-width track, and collect at
 * your horse's odds if it takes the post. Tight margins end in a slow white
 * PHOTO FINISH flash before the result is called.
 *
 * Built from scratch for this game:
 *  - vector horses with a two-pose gallop cycle, body bob, dust trails
 *  - races are pre-decided by the odds, then choreographed in 8 uneven
 *    speed segments per horse so lead changes happen naturally
 *  - live commentary ticker ("AND THEY'RE OFF!", lead calls, the result)
 *  - grandstand crowd, drifting clouds, bunting, checkered finish gate
 *  - winner's-circle celebration + confetti when your horse comes in
 */

const TRACK_X0 = 360;   // start gate (clears the rail pick cards)
const TRACK_X1 = 1430;  // finish post
const LANE_Y0 = 380;
const LANE_H = 102;
const RACERS = 6;
const SEGMENTS = 8;
const HOUSE_EDGE = 0.95;
const BET_STEPS = [1, 2, 5, 10, 20, 50, 100];

interface RacerDef {
    name: string;
    color: number;
    cap: number;
}

const STABLE: readonly RacerDef[] = [
    { name: 'THUNDERBOLT', color: 0x6b3a1a, cap: 0xff2d55 },
    { name: 'MIDNIGHT',    color: 0x2a2a3a, cap: 0x3aa8ff },
    { name: 'GOLD RUSH',   color: 0xb8862e, cap: 0x4ade6a },
    { name: 'GREY GHOST',  color: 0x9a9aa8, cap: 0xff9234 },
    { name: 'FIREBRAND',   color: 0x8a3020, cap: 0xffd23d },
    { name: 'LUCKY STAR',  color: 0x4a3424, cap: 0x9a4fd4 },
];

interface Racer {
    def: RacerDef;
    node: Container;
    body: Graphics;
    pose: boolean;
    odds: number;
    finishTime: number;
    chip: Container;
    chipBg: Graphics;
    oddsText: Text;
}

type Phase = 'pick' | 'racing' | 'done';

export class GameScene16 extends BaseScene {
    private readonly trackLayer = new Container();
    private readonly dustLayer = new Container();
    private readonly uiContainer = new Container();

    private racers: Racer[] = [];
    private phase: Phase = 'pick';
    private picked = -1;
    private winner = -1;
    private leaderIdx = -1;
    private raceClock = 0;
    private gallopClock = 0;
    private commentClock = 0;
    private readonly history: { idx: number; win: boolean }[] = [];

    private ticker!: Text;
    private banner!: Text;
    private flash!: Graphics;
    private startButton!: Graphics;
    private startLabel!: Text;
    private startSub!: Text;
    private betValueText!: Text;
    private balanceText!: Text;
    private pickText!: Text;
    private historyRow!: Container;
    private readonly dust: Graphics[] = [];
    private readonly confetti: Graphics[] = [];
    private clouds: { node: Graphics; speed: number }[] = [];

    private readonly onKeyDown = (e: KeyboardEvent): void => {
        if (e.code === 'Space') { e.preventDefault(); this.startRace(); }
        const digit = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6'].indexOf(e.code);
        if (digit >= 0) this.pick(digit);
        // (back-to-menu removed) if (e.code === 'Escape') SceneManager.switchScene(new MenuScene());
    };

    public async init(): Promise<void> {
        this.addChild(this.buildTrackside());
        this.addChild(this.trackLayer);
        this.addChild(this.dustLayer);
        this.addChild(this.uiContainer);
        this.buildRacers();
        this.createUI();
        this.newRace(true);
        window.addEventListener('keydown', this.onKeyDown);
    }

    public async start(): Promise<void> {}

    public update(delta: number): void {
        const dt = Math.min(delta / 60, 0.05);
        this.gallopClock += dt;

        for (const c of this.clouds) {
            c.node.x += c.speed * dt;
            if (c.node.x > GameConfig.width + 240) c.node.x = -260;
        }

        // Gallop cycle + dust while the field is running.
        if (this.phase === 'racing') {
            this.raceClock += dt;
            this.commentClock += dt;
            for (let i = 0; i < this.racers.length; i++) {
                const r = this.racers[i];
                r.node.y = this.laneY(i) + Math.sin(this.gallopClock * 22 + i * 1.3) * 3.4;
                const newPose = ((this.gallopClock * 11 + i) | 0) % 2 === 0;
                if (newPose !== r.pose) {
                    r.pose = newPose;
                    this.drawHorse(r.body, r.def, newPose);
                }
                if (Math.random() < 0.3) this.puffDust(r.node.x - 58, this.laneY(i) + 34);
            }
            if (this.commentClock > 0.45) {
                this.commentClock = 0;
                this.callTheRace();
            }
        } else {
            // Idle at the gate: gentle breathing.
            for (let i = 0; i < this.racers.length; i++) {
                this.racers[i].node.y = this.laneY(i) + Math.sin(this.gallopClock * 3 + i) * 1.6;
            }
        }
    }

    public resize(_width: number, _height: number): void {}

    public override async destroyScene(): Promise<void> {
        window.removeEventListener('keydown', this.onKeyDown);
        for (const r of this.racers) {
            gsap.killTweensOf(r.node);
            gsap.killTweensOf(r.node.position);
            gsap.killTweensOf(r.node.scale);
        }
        for (const g of [...this.dust, ...this.confetti]) gsap.killTweensOf(g);
        gsap.killTweensOf(this.banner);
        gsap.killTweensOf(this.banner.scale);
        gsap.killTweensOf(this.flash);
        gsap.killTweensOf(this.ticker);
        await super.destroyScene();
    }

    // --- race setup ------------------------------------------------------------

    private laneY(i: number): number {
        return LANE_Y0 + i * LANE_H;
    }

    /** Fresh odds + gate positions. `first` skips the walk-back animation. */
    private newRace(first: boolean): void {
        this.phase = 'pick';
        this.winner = -1;
        this.leaderIdx = -1;
        this.raceClock = 0;

        // Random strengths → win probabilities → decimal odds (with house edge).
        const strengths = this.racers.map(() => 0.4 + Math.random());
        const total = strengths.reduce((a, b) => a + b, 0);
        this.racers.forEach((r, i) => {
            const p = strengths[i] / total;
            r.odds = Math.max(1.5, Math.round((HOUSE_EDGE / p) * 10) / 10);
            r.oddsText.text = `x${r.odds.toFixed(1)}`;
            this.styleChip(i);
            gsap.killTweensOf(r.node.position);
            if (first) r.node.position.set(TRACK_X0, this.laneY(i));
            else gsap.to(r.node.position, { x: TRACK_X0, duration: 0.7, ease: 'power2.inOut' });
        });
        this.styleStart();
    }

    private pick(i: number): void {
        if (this.phase === 'racing' || i < 0 || i >= RACERS) return;
        this.picked = i;
        for (let k = 0; k < RACERS; k++) this.styleChip(k);
        this.pickText.text = `backing ${this.racers[i].def.name}`;
        this.styleStart();
        gsap.fromTo(this.racers[i].chip.scale, { x: 1.08, y: 1.08 }, { x: 1, y: 1, duration: 0.25, ease: 'back.out(2)' });
    }

    // --- the race ----------------------------------------------------------------

    private startRace(): void {
        const state = gameStore.getState();
        if (this.phase === 'racing' || this.picked < 0 || state.balance < state.bet) return;
        if (this.phase === 'done') this.newRace(false);
        state.setBalance(state.balance - state.bet);
        state.setWinAmount(0);
        this.banner.visible = false;

        // Decide the result from the odds, then choreograph everyone to it.
        const probs = this.racers.map((r) => HOUSE_EDGE / r.odds);
        const pTotal = probs.reduce((a, b) => a + b, 0);
        let roll = Math.random() * pTotal;
        this.winner = 0;
        for (let i = 0; i < RACERS; i++) {
            roll -= probs[i];
            if (roll < 0) { this.winner = i; break; }
        }

        // Finish times: winner first, runner-up close (photo-finish chance), rest spread.
        const base = 6.0 + Math.random() * 0.5;
        const order = [...Array(RACERS).keys()].filter((i) => i !== this.winner).sort(() => Math.random() - 0.5);
        this.racers[this.winner].finishTime = base;
        order.forEach((idx, k) => {
            this.racers[idx].finishTime = base + (k === 0 ? 0.05 + Math.random() * 0.3 : 0.3 + k * 0.28 + Math.random() * 0.35);
        });

        // 8 uneven speed segments per horse → surges and natural lead swaps.
        const span = TRACK_X1 - TRACK_X0;
        for (const r of this.racers) {
            const weights: number[] = [];
            let sum = 0;
            for (let s = 0; s < SEGMENTS; s++) { const w = 0.6 + Math.random(); weights.push(w); sum += w; }
            const tl = gsap.timeline();
            gsap.killTweensOf(r.node.position);
            for (let s = 0; s < SEGMENTS; s++) {
                tl.to(r.node.position, {
                    x: TRACK_X0 + (span * (s + 1)) / SEGMENTS,
                    duration: (weights[s] / sum) * r.finishTime,
                    ease: 'none',
                });
            }
        }

        this.phase = 'racing';
        this.styleStart();
        this.showTicker("AND THEY'RE OFF!", 0xfff6ec);
        gsap.delayedCall(base + 0.05, () => this.photoFinish());
    }

    /** Live lead call while the field runs. */
    private callTheRace(): void {
        let lead = 0;
        for (let i = 1; i < RACERS; i++) {
            if (this.racers[i].node.x > this.racers[lead].node.x) lead = i;
        }
        if (lead !== this.leaderIdx && this.racers[lead].node.x > TRACK_X0 + 120 && this.racers[lead].node.x < TRACK_X1 - 140) {
            this.leaderIdx = lead;
            this.showTicker(`${this.racers[lead].def.name} TAKES THE LEAD!`, this.racers[lead].def.cap);
        }
    }

    private photoFinish(): void {
        // Margin to the runner-up decides whether the flash fires.
        const sorted = [...this.racers].sort((a, b) => a.finishTime - b.finishTime);
        const tight = sorted[1].finishTime - sorted[0].finishTime < 0.14;
        if (tight) {
            this.showTicker('PHOTO FINISH!', 0xffffff);
            gsap.killTweensOf(this.flash);
            gsap.timeline()
                .set(this.flash, { alpha: 0.9 })
                .to(this.flash, { alpha: 0, duration: 0.7, ease: 'power2.out' });
        }
        gsap.delayedCall(tight ? 1.1 : 0.4, () => this.settle());
    }

    private settle(): void {
        const state = gameStore.getState();
        this.phase = 'done';
        const win = this.picked === this.winner;
        const champ = this.racers[this.winner];

        this.history.unshift({ idx: this.winner, win });
        if (this.history.length > 8) this.history.pop();
        this.renderHistory();

        // Winner's-circle bounce.
        gsap.fromTo(champ.node.scale, { x: 1.18, y: 1.18 }, { x: 1, y: 1, duration: 0.6, ease: 'elastic.out(1.2, 0.5)' });

        if (win) {
            const payout = Math.round(state.bet * champ.odds * 100) / 100;
            state.setBalance(Math.round((state.balance + payout) * 100) / 100);
            state.setWinAmount(payout);
            this.showBanner(`${champ.def.name} WINS!  +$${payout}`, 0x4ade6a);
            this.confettiBlast(46);
        } else {
            this.showBanner(`${champ.def.name} WINS`, 0xaab4c4);
        }
        this.showTicker(`${champ.def.name} TAKES THE POST AT x${champ.odds.toFixed(1)}`, champ.def.cap);
        this.styleStart();
    }

    // --- horses --------------------------------------------------------------------

    private buildRacers(): void {
        for (let i = 0; i < RACERS; i++) {
            const def = STABLE[i];
            const node = new Container();
            const body = new Graphics();
            node.addChild(body);
            this.drawHorse(body, def, false);
            node.position.set(TRACK_X0, this.laneY(i));
            this.trackLayer.addChild(node);

            // Pick chip at the rail: number, name, live odds.
            const chip = new Container();
            chip.position.set(175, this.laneY(i));
            const chipBg = new Graphics();
            chip.addChild(chipBg);
            const num = new Text({ text: `${i + 1}`, style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 22, fontWeight: '900', fill: 0xffffff } });
            num.anchor.set(0.5);
            num.position.set(-104, 0);
            const name = new Text({ text: def.name, style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 17, fontWeight: '900', fill: 0xffffff } });
            name.anchor.set(0, 0.5);
            name.position.set(-86, 0);
            const oddsText = new Text({ text: '', style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 19, fontWeight: '900', fill: 0xffd23d } });
            oddsText.anchor.set(1, 0.5);
            oddsText.position.set(118, 0);
            chip.addChild(num, name, oddsText);
            chip.eventMode = 'static';
            chip.cursor = 'pointer';
            const idx = i;
            chip.on('pointerdown', () => this.pick(idx));
            this.uiContainer.addChild(chip);

            this.racers.push({ def, node, body, pose: false, odds: 2, finishTime: 0, chip, chipBg, oddsText });
        }
    }

    /** Side-view galloping horse + jockey. Two leg poses make the cycle. */
    private drawHorse(g: Graphics, def: RacerDef, pose: boolean): void {
        const c = def.color;
        const dark = ((c >> 1) & 0x7f7f7f);
        g.clear();
        // Shadow.
        g.ellipse(0, 38, 52, 9).fill({ color: 0x143a14, alpha: 0.35 });
        // Legs (front + back pair swap between poses).
        const legs: number[][] = pose
            ? [[-34, 2, -46, 34], [-26, 4, -16, 36], [22, 4, 14, 36], [32, 2, 46, 32]]
            : [[-34, 2, -22, 36], [-26, 4, -40, 32], [22, 4, 36, 34], [32, 2, 20, 36]];
        for (const [x0, y0, x1, y1] of legs) {
            g.moveTo(x0, y0).lineTo(x1, y1).stroke({ width: 8, color: dark, cap: 'round' });
        }
        // Tail.
        g.moveTo(-42, -10).quadraticCurveTo(-62, -2 + (pose ? 6 : -4), -56, 16).stroke({ width: 6, color: dark, cap: 'round' });
        // Body.
        g.ellipse(0, -6, 44, 20).fill({ color: c });
        // Neck + head.
        g.poly([22, -16, 50, -42, 62, -36, 40, -6]).fill({ color: c });
        g.ellipse(58, -40, 13, 8).fill({ color: c });
        g.poly([68, -42, 78, -38, 68, -34]).fill({ color: dark });           // muzzle
        g.circle(60, -43, 2.2).fill({ color: 0x101010 });                     // eye
        g.poly([50, -48, 54, -56, 58, -47]).fill({ color: dark });            // ear
        // Mane.
        g.moveTo(46, -46).quadraticCurveTo(34, -34, 26, -18).stroke({ width: 5, color: dark, cap: 'round' });
        // Jockey: torso, head, cap in stable colours.
        g.ellipse(-2, -32, 11, 14).fill({ color: def.cap });
        g.circle(4, -48, 8).fill({ color: 0xe8b88a });
        g.moveTo(2, -56).quadraticCurveTo(10, -60, 14, -52).lineTo(2, -52).fill({ color: def.cap }); // cap
        g.moveTo(6, -28).lineTo(26, -20).stroke({ width: 5, color: def.cap, cap: 'round' });          // arms to reins
        g.moveTo(26, -20).lineTo(54, -38).stroke({ width: 2, color: 0x3a2a1a });                      // rein
        // Saddle.
        g.ellipse(-4, -16, 13, 6).fill({ color: 0x3a2a1a });
        // Number bib.
        g.circle(-24, -10, 9).fill({ color: 0xfff6ec });
    }

    // --- fx ----------------------------------------------------------------------------

    private puffDust(x: number, y: number): void {
        let p = this.dust.find((g) => !g.visible);
        if (!p) {
            p = new Graphics();
            p.visible = false;
            this.dustLayer.addChild(p);
            this.dust.push(p);
        }
        const r = 4 + Math.random() * 7;
        p.clear().circle(0, 0, r).fill({ color: 0xd8c8a8, alpha: 0.5 });
        p.position.set(x, y);
        p.alpha = 0.7;
        p.scale.set(0.6);
        p.visible = true;
        gsap.killTweensOf(p);
        gsap.killTweensOf(p.scale);
        gsap.to(p, { x: x - 30 - Math.random() * 30, y: y - 8 - Math.random() * 12, alpha: 0, duration: 0.5, ease: 'power1.out', onComplete: () => { p.visible = false; } });
        gsap.to(p.scale, { x: 1.6, y: 1.6, duration: 0.5 });
    }

    private confettiBlast(count: number): void {
        const colors = [0xff2d55, 0xff9234, 0xffd23d, 0x4ade6a, 0x3aa8ff, 0x9a4fd4];
        const W = GameConfig.width;
        for (let i = 0; i < count; i++) {
            let p = this.confetti.find((g) => !g.visible);
            if (!p) {
                p = new Graphics();
                p.visible = false;
                this.uiContainer.addChild(p);
                this.confetti.push(p);
            }
            p.clear().roundRect(-6, -4, 12, 8, 2).fill({ color: colors[(Math.random() * colors.length) | 0] });
            p.position.set(Math.random() * W, -20 - Math.random() * 160);
            p.rotation = Math.random() * Math.PI;
            p.alpha = 1;
            p.visible = true;
            gsap.killTweensOf(p);
            gsap.to(p, {
                y: GameConfig.height + 30,
                x: p.x + (Math.random() - 0.5) * 220,
                rotation: p.rotation + 6 + Math.random() * 6,
                duration: 1.6 + Math.random() * 1.2,
                delay: Math.random() * 0.4,
                ease: 'power1.in',
                onComplete: () => { p.visible = false; },
            });
        }
    }

    private showTicker(msg: string, tint: number): void {
        this.ticker.text = msg;
        this.ticker.style.fill = tint;
        gsap.killTweensOf(this.ticker);
        gsap.fromTo(this.ticker, { alpha: 0 }, { alpha: 1, duration: 0.18 });
        gsap.fromTo(this.ticker.scale, { x: 1.12, y: 1.12 }, { x: 1, y: 1, duration: 0.3, ease: 'back.out(2)' });
    }

    private showBanner(msg: string, tint: number): void {
        this.banner.text = msg;
        this.banner.style.fill = tint;
        this.banner.style.dropShadow = { color: tint, blur: 22, distance: 0, alpha: 0.8, angle: Math.PI / 6 };
        this.banner.alpha = 1;
        this.banner.visible = true;
        gsap.killTweensOf(this.banner);
        gsap.killTweensOf(this.banner.scale);
        gsap.fromTo(this.banner.scale, { x: 0.3, y: 0.3 }, { x: 1, y: 1, duration: 0.45, ease: 'back.out(2.2)' });
        gsap.to(this.banner, { alpha: 0, duration: 0.5, delay: 2.0, onComplete: () => { this.banner.visible = false; } });
    }

    private renderHistory(): void {
        this.historyRow.removeChildren().forEach((c) => c.destroy({ children: true }));
        this.history.forEach((h, i) => {
            const def = STABLE[h.idx];
            const chip = new Container();
            chip.addChild(new Graphics()
                .circle(0, 0, 22).fill({ color: def.cap })
                .circle(0, 0, 22).stroke({ width: 3, color: h.win ? 0x4ade6a : 0x2a2a3a }));
            const t = new Text({ text: `${h.idx + 1}`, style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 20, fontWeight: '900', fill: 0xffffff } });
            t.anchor.set(0.5);
            chip.addChild(t);
            chip.position.set(i * 54, 0);
            if (i === 0) gsap.fromTo(chip.scale, { x: 0.3, y: 0.3 }, { x: 1, y: 1, duration: 0.3, ease: 'back.out(2.5)' });
            this.historyRow.addChild(chip);
        });
    }

    // --- presentation ------------------------------------------------------------------

    private vgrad(stops: { offset: number; color: number }[]): FillGradient {
        return new FillGradient({ type: 'linear', start: { x: 0, y: 0 }, end: { x: 0, y: 1 }, textureSpace: 'local', colorStops: stops });
    }

    /** Race day: sky, grandstand crowd, bunting, rails, striped turf, finish gate. */
    private buildTrackside(): Container {
        const env = new Container();
        const W = GameConfig.width;
        const H = GameConfig.height;

        // Afternoon sky.
        env.addChild(new Graphics().rect(0, 0, W, H).fill(this.vgrad([
            { offset: 0, color: 0x7ec8f7 }, { offset: 0.5, color: 0xb8e0fa }, { offset: 1, color: 0xd8eefc },
        ])));

        // Drifting clouds.
        for (const [y, sc, speed] of [[80, 1, 22], [150, 0.7, 34], [60, 0.5, 46]] as const) {
            const g = new Graphics();
            for (const [ox, oy, r] of [[-60, 0, 34], [-6, -16, 44], [44, -2, 36]] as const) {
                g.circle(ox * sc, oy * sc, r * sc).fill({ color: 0xffffff, alpha: 0.85 });
            }
            g.position.set(Math.random() * W, y);
            env.addChild(g);
            this.clouds.push({ node: g, speed });
        }

        // Grandstand: roof, pillars, three rows of crowd dots.
        env.addChild(new Graphics()
            .rect(60, 150, W - 420, 130).fill(this.vgrad([{ offset: 0, color: 0x4a5a74 }, { offset: 1, color: 0x2e3a50 }]))
            .poly([40, 150, W - 340, 150, W - 380, 110, 80, 110]).fill({ color: 0xd8e4f0 })
            .rect(60, 276, W - 420, 10).fill({ color: 0x223046 }));
        const crowd = new Graphics();
        const crowdTints = [0xffd23d, 0xff5a78, 0x4ade6a, 0x3aa8ff, 0xe8b88a, 0xff9234, 0x9a4fd4, 0xfff6ec];
        for (let row = 0; row < 3; row++) {
            for (let x = 84; x < W - 380; x += 22) {
                crowd.circle(x + (row % 2) * 9, 182 + row * 32, 8).fill({ color: crowdTints[((x / 22) | 0 + row * 3) % crowdTints.length], alpha: 0.9 });
            }
        }
        env.addChild(crowd);

        // Bunting line across the top of the stand.
        const bunt = new Graphics();
        for (let x = 60; x < W - 380; x += 44) {
            bunt.poly([x, 104, x + 22, 104, x + 11, 128]).fill({ color: crowdTints[((x / 44) | 0) % crowdTints.length] });
        }
        bunt.moveTo(60, 104).lineTo(W - 380, 104).stroke({ width: 3, color: 0x4a3a2a });
        env.addChild(bunt);

        // Turf: alternating lane stripes + white rails.
        env.addChild(new Graphics().rect(0, 300, W, H - 300).fill(this.vgrad([
            { offset: 0, color: 0x3f9e4d }, { offset: 1, color: 0x2a7a38 },
        ])));
        const stripes = new Graphics();
        for (let i = 0; i < RACERS; i++) {
            if (i % 2 === 0) stripes.rect(0, this.laneY(i) - LANE_H / 2 + 6, W, LANE_H).fill({ color: 0x2f8a3e, alpha: 0.55 });
            stripes.moveTo(110, this.laneY(i) + LANE_H / 2 - 44).lineTo(W - 380, this.laneY(i) + LANE_H / 2 - 44)
                .stroke({ width: 2, color: 0xffffff, alpha: 0.25 });
        }
        env.addChild(stripes);
        env.addChild(new Graphics()
            .rect(0, 312, W, 8).fill({ color: 0xf4f4ec })
            .rect(0, 330, W, 4).fill({ color: 0xf4f4ec, alpha: 0.7 })
            .rect(0, LANE_Y0 + RACERS * LANE_H - 36, W, 8).fill({ color: 0xf4f4ec }));

        // Start line + checkered finish gate.
        env.addChild(new Graphics()
            .rect(TRACK_X0 - 56, 340, 6, RACERS * LANE_H + 24).fill({ color: 0xffffff, alpha: 0.8 }));
        const gate = new Graphics()
            .rect(TRACK_X1 + 56, 318, 10, RACERS * LANE_H + 66).fill({ color: 0xc8c8d0 })
            .rect(TRACK_X1 + 96, 318, 10, RACERS * LANE_H + 66).fill({ color: 0xc8c8d0 });
        for (let y = 0; y < RACERS * LANE_H + 40; y += 24) {
            for (let k = 0; k < 2; k++) {
                gate.rect(TRACK_X1 + 66 + k * 15, 330 + y, 15, 12).fill({ color: (y / 24 + k) % 2 === 0 ? 0x18181c : 0xf4f4ec });
            }
        }
        gate.poly([TRACK_X1 + 51, 318, TRACK_X1 + 111, 318, TRACK_X1 + 81, 290]).fill({ color: 0xd02438 });
        env.addChild(gate);

        const title = new Text({
            text: 'TURBO DERBY',
            style: {
                fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 50, fontWeight: '900', letterSpacing: 6,
                fill: 0xfff6ec, stroke: { color: 0x18404a, width: 8 },
                dropShadow: { color: 0x18404a, blur: 0, distance: 4, alpha: 0.5, angle: Math.PI / 3 },
            },
        });
        title.anchor.set(0, 0.5);
        title.position.set(44, 50);
        env.addChild(title);

        this.flash = new Graphics().rect(0, 0, W, H).fill(0xffffff);
        this.flash.alpha = 0;
        env.addChild(this.flash);
        return env;
    }

    private createUI(): void {
        const cx = 1758; // control column

        // Commentary ticker between the stand and the track.
        this.ticker = new Text({
            text: 'PICK YOUR RUNNER',
            style: {
                fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 34, fontWeight: '900', letterSpacing: 3,
                fill: 0xfff6ec, stroke: { color: 0x18404a, width: 7 },
            },
        });
        this.ticker.anchor.set(0.5);
        this.ticker.position.set((TRACK_X0 + TRACK_X1) / 2, 318);
        this.uiContainer.addChild(this.ticker);

        this.banner = new Text({
            text: '',
            style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 76, fontWeight: '900', fill: 0x4ade6a, stroke: { color: 0x123a1a, width: 11 } },
        });
        this.banner.anchor.set(0.5);
        this.banner.position.set((TRACK_X0 + TRACK_X1) / 2, 640);
        this.banner.visible = false;
        this.uiContainer.addChild(this.banner);

        // Right control panel.
        this.uiContainer.addChild(new Graphics()
            .roundRect(1618, 140, 280, 880, 26).fill({ color: 0x14323a, alpha: 0.94 })
            .roundRect(1618, 140, 280, 880, 26).stroke({ width: 3, color: 0x2a5a64 })
            .roundRect(1628, 150, 260, 860, 20).stroke({ width: 1.5, color: 0xffd23d, alpha: 0.3 }));

        const section = (txt: string, y: number): void => {
            const t = new Text({ text: txt, style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 16, fontWeight: '900', letterSpacing: 3, fill: 0x7ab8c4 } });
            t.anchor.set(0.5);
            t.position.set(cx, y);
            this.uiContainer.addChild(t);
        };

        section('BET', 196);
        this.betValueText = new Text({ text: `$${gameStore.getState().bet}`, style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 34, fontWeight: '900', fill: 0xffffff } });
        this.betValueText.anchor.set(0.5);
        this.betValueText.position.set(cx, 250);
        this.uiContainer.addChild(this.betValueText);
        const stepBtn = (dx: number, glyph: string, dir: number): void => {
            const b = new Graphics()
                .circle(0, 0, 26).fill({ color: 0x1c4450 })
                .circle(0, 0, 26).stroke({ width: 2, color: 0x2a5a64 });
            b.position.set(cx + dx, 250);
            b.eventMode = 'static';
            b.cursor = 'pointer';
            b.on('pointerdown', () => {
                if (this.phase === 'racing') return;
                gsap.fromTo(b.scale, { x: 0.85, y: 0.85 }, { x: 1, y: 1, duration: 0.25, ease: 'back.out(3)' });
                const state = gameStore.getState();
                const i = BET_STEPS.findIndex((v) => v >= state.bet);
                const next = BET_STEPS[Math.max(0, Math.min(BET_STEPS.length - 1, (i < 0 ? BET_STEPS.length - 1 : i) + dir))];
                state.setBet(next);
                this.betValueText.text = `$${next}`;
            });
            const t = new Text({ text: glyph, style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 28, fontWeight: '900', fill: 0x9adcE8 } });
            t.anchor.set(0.5);
            b.addChild(t);
            this.uiContainer.addChild(b);
        };
        stepBtn(-80, '−', -1);
        stepBtn(80, '+', 1);

        this.pickText = new Text({ text: 'tap a runner card to back it', style: { fontFamily: 'Arial, sans-serif', fontSize: 16, fontWeight: 'bold', fill: 0x7ab8c4 } });
        this.pickText.anchor.set(0.5);
        this.pickText.position.set(cx, 330);
        this.uiContainer.addChild(this.pickText);

        this.startButton = new Graphics();
        this.startButton.position.set(cx, 460);
        this.startButton.eventMode = 'static';
        this.startButton.cursor = 'pointer';
        this.startButton.on('pointerdown', () => {
            gsap.fromTo(this.startButton.scale, { x: 0.94, y: 0.94 }, { x: 1, y: 1, duration: 0.3, ease: 'back.out(3)' });
            this.startRace();
        });
        this.startLabel = new Text({ text: '', style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 32, fontWeight: '900', fill: 0xffffff } });
        this.startLabel.anchor.set(0.5);
        this.startLabel.position.set(0, -14);
        this.startSub = new Text({ text: '', style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 15, fontWeight: '900', fill: 0xffffff } });
        this.startSub.alpha = 0.85;
        this.startSub.anchor.set(0.5);
        this.startSub.position.set(0, 26);
        this.startButton.addChild(this.startLabel, this.startSub);
        this.uiContainer.addChild(this.startButton);

        section('LAST WINNERS', 600);
        this.historyRow = new Container();
        this.historyRow.position.set(cx - 110, 648);
        this.uiContainer.addChild(this.historyRow);

        this.balanceText = new Text({ text: '', style: { fontFamily: 'Arial, sans-serif', fontSize: 22, fontWeight: 'bold', fill: 0x9adcE8 } });
        this.balanceText.anchor.set(0.5);
        this.balanceText.position.set(cx, 968);
        this.uiContainer.addChild(this.balanceText);

        const back = new Text({ text: '‹ MENU', style: { fill: 0xfff6ec, fontSize: 26, fontWeight: 'bold', stroke: { color: 0x18404a, width: 4 } } });
        back.position.set(44, 84);
        back.eventMode = 'static';
        back.cursor = 'pointer';
        back.on('pointerdown', () => SceneManager.switchScene(new MenuScene()));
        // (back-to-menu removed) this.uiContainer.addChild(back);

        const hint = new Text({ text: 'back a runner (keys 1–6) · fresh odds every race · space to start', style: { fill: 0x2a5a34, fontSize: 19, fontStyle: 'italic', fontWeight: 'bold' } });
        hint.anchor.set(0.5);
        hint.position.set((TRACK_X0 + TRACK_X1) / 2, GameConfig.height - 18);
        this.uiContainer.addChild(hint);

        const render = (s: ReturnType<typeof gameStore.getState>): void => {
            this.balanceText.text = `Balance  $${Math.round(s.balance * 100) / 100}`;
        };
        render(gameStore.getState());
        gameStore.subscribe(render);
    }

    private styleChip(i: number): void {
        const r = this.racers[i];
        const active = this.picked === i;
        r.chipBg.clear()
            .roundRect(-120, -28, 252, 56, 16).fill({ color: active ? 0x1c5a2a : 0x14323a, alpha: 0.92 })
            .roundRect(-120, -28, 252, 56, 16).stroke({ width: active ? 4 : 2.5, color: active ? 0xffd23d : r.def.cap })
            .circle(-104, 0, 15).fill({ color: r.def.cap });
    }

    private styleStart(): void {
        const ready = this.picked >= 0 && this.phase !== 'racing';
        const fill = this.phase === 'racing' ? 0x1a3350 : ready ? 0x1f8a3c : 0x2a4a52;
        const edge = this.phase === 'racing' ? 0x3388aa : ready ? 0x4ade6a : 0x3a6a74;
        this.startButton.clear()
            .roundRect(-110, -54, 220, 108, 24).fill(fill)
            .roundRect(-110, -54, 220, 108, 24).stroke({ width: 3, color: edge });
        this.startLabel.text = this.phase === 'racing' ? 'RACING' : 'START';
        this.startSub.text = this.phase === 'racing' ? 'they run!' : this.picked >= 0 ? `win pays x${this.racers[this.picked].odds.toFixed(1)}` : 'pick a runner first';
        this.startButton.cursor = ready ? 'pointer' : 'default';
    }
}
