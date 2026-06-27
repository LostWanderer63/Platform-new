import { Text, Container, Graphics, FillGradient } from 'pixi.js';
import { gsap } from 'gsap';
import { BaseScene } from './BaseScene';
import { GameConfig } from '../config/GameConfig';
import { gameStore } from '../state/GameState';
import { SceneManager } from '../managers/SceneManager';
import { MenuScene } from './MenuScene';

/**
 * GameScene24 — Slot 24: "Limbo"
 * -------------------------------
 * The crypto-casino "Limbo" original. Pick a TARGET multiplier, launch, and a
 * random multiplier is rolled from a heavy-tailed distribution. Clear your
 * target (rolled ≥ target) and you win bet × target; fall short and the rocket
 * stalls. You set your own risk — higher targets pay more but clear less often.
 *
 * Production presentation:
 *  - a log-scaled neon altitude gauge with a draggable-feeling target line
 *  - a rigged rocket that rides the rolling multiplier up the gauge with a
 *    live flame trail, then bursts through the target or sputters and falls
 *  - an odometer-style multiplier counter that spins up and decelerates
 *  - starfield + parallax nebula, win shockwave + coin storm, roll history
 */

const EDGE = 0.99;
const BET_STEPS = [1, 2, 5, 10, 20, 50, 100];
const TARGETS = [1.25, 1.5, 2, 3, 5, 10, 25, 50, 100, 250, 1000];
const GAUGE_MAX = 1000;     // top of the gauge
const PRESETS = [2, 5, 10, 50];

const GAUGE_X = 470;
const GAUGE_TOP = 196;
const GAUGE_BOT = 940;

export class GameScene24 extends BaseScene {
    private readonly bgLayer = new Container();
    private readonly gaugeLayer = new Container();
    private readonly fxLayer = new Container();
    private readonly uiContainer = new Container();

    private targetIdx = 2;        // default target = 2.00×
    private rolling = false;
    private readonly history: { mult: number; win: boolean }[] = [];

    private targetLine!: Graphics;
    private targetTag!: Container;
    private targetTagText!: Text;
    private rocket!: Container;
    private flame!: Graphics;
    private trail!: Graphics;
    private readonly trailPts: { x: number; y: number; a: number }[] = [];
    private resultText!: Text;
    private resultSub!: Text;
    private banner!: Text;
    private flash!: Graphics;
    private chanceText!: Text;
    private payoutText!: Text;
    private targetValueText!: Text;
    private betValueText!: Text;
    private balanceText!: Text;
    private lastWinText!: Text;
    private playButton!: Graphics;
    private playLabel!: Text;
    private historyRow!: Container;
    private stars!: Graphics;
    private readonly starField: { x: number; y: number; r: number; vy: number; tw: number }[] = [];
    private elapsed = 0;
    private readonly coins: Graphics[] = [];
    private readonly calls: gsap.core.Tween[] = [];
    private readonly roll = { v: 1 };

    private readonly onKeyDown = (e: KeyboardEvent): void => {
        if (e.code === 'Space') { e.preventDefault(); this.play(); }
        if (e.code === 'ArrowUp') this.setTarget(1);
        if (e.code === 'ArrowDown') this.setTarget(-1);
        // (back-to-menu removed) if (e.code === 'Escape') SceneManager.switchScene(new MenuScene());
    };

    public async init(): Promise<void> {
        this.addChild(this.bgLayer);
        this.addChild(this.gaugeLayer);
        this.addChild(this.fxLayer);
        this.addChild(this.uiContainer);
        this.buildSpace();
        this.buildGauge();
        this.buildRocket();
        this.createUI();
        this.refreshTarget();
        this.placeRocket(1);
        window.addEventListener('keydown', this.onKeyDown);
    }

    public async start(): Promise<void> {}

    public update(delta: number): void {
        const dt = Math.min(delta / 60, 0.05);
        this.elapsed += dt;
        // Starfield drift + twinkle.
        this.stars.clear();
        for (const s of this.starField) {
            s.y += s.vy * dt;
            if (s.y > GameConfig.height + 4) { s.y = -4; s.x = Math.random() * GameConfig.width; }
            const tw = 0.4 + 0.5 * Math.sin(this.elapsed * 3 + s.tw);
            this.stars.circle(s.x, s.y, s.r).fill({ color: 0xbfe8ff, alpha: tw * 0.7 });
        }
        // Flame flicker while rolling.
        if (this.rolling) {
            const f = 0.7 + Math.random() * 0.5;
            this.flame.scale.set(1, f);
        }
    }

    public resize(_width: number, _height: number): void {}

    public override async destroyScene(): Promise<void> {
        window.removeEventListener('keydown', this.onKeyDown);
        for (const c of this.calls) c.kill();
        gsap.killTweensOf(this.roll); gsap.killTweensOf(this.rocket); gsap.killTweensOf(this.rocket.position);
        gsap.killTweensOf(this.banner); gsap.killTweensOf(this.banner.scale); gsap.killTweensOf(this.flash);
        for (const g of this.coins) gsap.killTweensOf(g);
        await super.destroyScene();
    }

    // --- gauge geometry --------------------------------------------------------------

    private yFor(m: number): number {
        const t = Math.log(Math.max(1, Math.min(GAUGE_MAX, m))) / Math.log(GAUGE_MAX);
        return GAUGE_BOT - t * (GAUGE_BOT - GAUGE_TOP);
    }

    private target(): number { return TARGETS[this.targetIdx]; }

    private setTarget(dir: number): void {
        if (this.rolling) return;
        this.targetIdx = Math.max(0, Math.min(TARGETS.length - 1, this.targetIdx + dir));
        this.refreshTarget();
    }
    private setTargetTo(v: number): void {
        if (this.rolling) return;
        const i = TARGETS.indexOf(v);
        if (i >= 0) { this.targetIdx = i; this.refreshTarget(); }
    }

    private refreshTarget(): void {
        const T = this.target();
        const chance = (EDGE / T) * 100;
        this.targetValueText.text = `${T.toFixed(2)}×`;
        this.chanceText.text = `${chance.toFixed(2)}%`;
        this.payoutText.text = `$${(gameStore.getState().bet * T).toFixed(2)}`;
        const y = this.yFor(T);
        this.targetLine.clear()
            .moveTo(GAUGE_X - 70, y).lineTo(GAUGE_X + 70, y).stroke({ width: 3, color: 0xff5aa8 });
        for (let x = GAUGE_X - 70; x < GAUGE_X + 70; x += 18) this.targetLine.moveTo(x, y).lineTo(x + 9, y).stroke({ width: 3, color: 0xffffff, alpha: 0.4 });
        this.targetTag.position.set(GAUGE_X + 90, y);
        this.targetTagText.text = `TARGET ${T.toFixed(2)}×`;
    }

    // --- play flow -------------------------------------------------------------------

    private play(): void {
        if (this.rolling) return;
        const state = gameStore.getState();
        if (state.balance < state.bet) return;
        state.setBalance(Math.round((state.balance - state.bet) * 100) / 100);
        state.setWinAmount(0);
        this.rolling = true;
        this.banner.visible = false;
        this.stylePlay();

        const T = this.target();
        // Heavy-tailed roll: rolled = EDGE / u  (u uniform 0..1].  P(rolled≥T)=EDGE/T.
        const u = Math.max(1e-6, Math.random());
        const rolled = Math.max(1, Math.round((EDGE / u) * 100) / 100);
        const win = rolled >= T;

        this.trailPts.length = 0;
        this.flame.visible = true;
        this.resultText.style.fill = 0x8fe3ff;

        // Spin the multiplier + fly the rocket up to the rolled value.
        this.roll.v = 1;
        gsap.killTweensOf(this.roll);
        const dur = 1.1 + Math.min(1.2, Math.log(rolled) / Math.log(50));
        gsap.to(this.roll, {
            v: rolled, duration: dur, ease: 'power3.out',
            onUpdate: () => {
                this.resultText.text = `${this.roll.v.toFixed(2)}×`;
                this.placeRocket(this.roll.v);
            },
            onComplete: () => this.settle(rolled, win),
        });
    }

    private settle(rolled: number, win: boolean): void {
        const state = gameStore.getState();
        this.rolling = false;
        this.resultText.text = `${rolled >= GAUGE_MAX ? '1000+' : rolled.toFixed(2)}×`;
        this.flame.visible = false;

        if (win) {
            const T = this.target();
            const payout = Math.round(state.bet * T * 100) / 100;
            state.setBalance(Math.round((state.balance + payout) * 100) / 100);
            state.setWinAmount(payout);
            this.resultText.style.fill = 0x4dff9e;
            this.resultSub.text = `cleared ${T.toFixed(2)}×`;
            this.resultSub.style.fill = 0x4dff9e;
            this.lastWinText.text = `$${payout}`;
            gsap.fromTo(this.lastWinText.scale, { x: 1.3, y: 1.3 }, { x: 1, y: 1, duration: 0.3, ease: 'back.out(2)' });
            this.showBanner(`WIN  +$${payout}`, 0x4dff9e);
            this.winBurst();
            this.coinStorm(Math.min(40, 8 + (payout | 0)));
            // Rocket bursts upward through the target.
            gsap.to(this.rocket.position, { y: this.rocket.position.y - 40, duration: 0.5, yoyo: true, repeat: 1, ease: 'sine.inOut' });
        } else {
            this.resultText.style.fill = 0xff5a6a;
            this.resultSub.text = `missed ${this.target().toFixed(2)}×`;
            this.resultSub.style.fill = 0xff5a6a;
            // Sputter + drop.
            gsap.to(this.rocket, { rotation: 0.5, duration: 0.5, ease: 'power1.in' });
            gsap.to(this.rocket.position, { y: this.rocket.position.y + 60, alpha: 0.7, duration: 0.6, ease: 'power2.in' });
            gsap.killTweensOf(this.flash);
            gsap.timeline().set(this.flash, { alpha: 0.2 }).to(this.flash, { alpha: 0, duration: 0.5, ease: 'power2.out' });
            this.showBanner('MISSED', 0xff5a6a);
        }

        this.history.unshift({ mult: rolled, win });
        if (this.history.length > 12) this.history.pop();
        this.renderHistory();

        this.calls.push(gsap.delayedCall(win ? 1.6 : 1.2, () => {
            gsap.to(this.rocket, { rotation: 0, alpha: 1, duration: 0.3 });
            this.placeRocket(1);
            this.resultSub.text = 'set a target & launch';
            this.resultSub.style.fill = 0x8fb0d8;
            this.stylePlay();
        }));
    }

    // --- rocket ----------------------------------------------------------------------

    private placeRocket(m: number): void {
        const y = this.yFor(m);
        this.rocket.position.set(GAUGE_X, y);
        // Trail.
        this.trailPts.push({ x: GAUGE_X + (Math.random() - 0.5) * 6, y: y + 36, a: 1 });
        if (this.trailPts.length > 26) this.trailPts.shift();
        this.trail.clear();
        for (let i = 0; i < this.trailPts.length; i++) {
            const p = this.trailPts[i];
            p.a *= 0.9;
            const w = 10 * (i / this.trailPts.length);
            this.trail.circle(p.x, p.y, w).fill({ color: 0x6fe9ff, alpha: p.a * 0.5 });
        }
    }

    private buildRocket(): void {
        this.trail = new Graphics();
        this.fxLayer.addChild(this.trail);

        this.rocket = new Container();
        this.flame = new Graphics();
        // Flame.
        this.flame.moveTo(-12, 28).quadraticCurveTo(0, 78, 12, 28).quadraticCurveTo(0, 44, -12, 28).fill({ color: 0xffd23d });
        this.flame.moveTo(-7, 28).quadraticCurveTo(0, 60, 7, 28).quadraticCurveTo(0, 40, -7, 28).fill({ color: 0xff6a3d });
        this.flame.visible = false;
        this.rocket.addChild(this.flame);
        // Body.
        const b = new Graphics();
        b.moveTo(0, -44).quadraticCurveTo(20, -10, 18, 30).lineTo(-18, 30).quadraticCurveTo(-20, -10, 0, -44).fill(new FillGradient({
            type: 'linear', start: { x: 0, y: 0 }, end: { x: 1, y: 0 }, textureSpace: 'local',
            colorStops: [{ offset: 0, color: 0xeaf6ff }, { offset: 0.5, color: 0xbfd4e8 }, { offset: 1, color: 0x7a90a8 }],
        }));
        b.moveTo(0, -44).quadraticCurveTo(20, -10, 18, 30).lineTo(-18, 30).quadraticCurveTo(-20, -10, 0, -44).stroke({ width: 2, color: 0x3a4a5a });
        // Nose + window.
        b.moveTo(0, -44).quadraticCurveTo(12, -22, 10, -6).lineTo(-10, -6).quadraticCurveTo(-12, -22, 0, -44).fill({ color: 0xff5a6a });
        b.circle(0, 4, 9).fill({ color: 0x2a5a8a }).circle(0, 4, 9).stroke({ width: 3, color: 0xffd23d }).circle(-3, 1, 3).fill({ color: 0xbfe8ff });
        // Fins.
        b.moveTo(-18, 14).lineTo(-32, 36).lineTo(-18, 30).fill({ color: 0xff5a6a });
        b.moveTo(18, 14).lineTo(32, 36).lineTo(18, 30).fill({ color: 0xff5a6a });
        this.rocket.addChild(b);
        this.fxLayer.addChild(this.rocket);
    }

    // --- environment + gauge ----------------------------------------------------------

    private buildSpace(): void {
        const W = GameConfig.width; const H = GameConfig.height;
        this.bgLayer.addChild(new Graphics().rect(0, 0, W, H).fill(new FillGradient({
            type: 'linear', start: { x: 0, y: 0 }, end: { x: 0, y: 1 }, textureSpace: 'local',
            colorStops: [{ offset: 0, color: 0x0a0820 }, { offset: 0.5, color: 0x100a2e }, { offset: 1, color: 0x05030f }],
        })));
        // Nebula blooms.
        for (const [x, y, r, c] of [[420, 300, 460, 0x3a1a6a], [1100, 700, 520, 0x1a3a6a], [800, 180, 360, 0x6a1a4a]] as const) {
            this.bgLayer.addChild(new Graphics().ellipse(x, y, r, r * 0.8).fill(new FillGradient({
                type: 'radial', center: { x: 0.5, y: 0.5 }, innerRadius: 0, outerCenter: { x: 0.5, y: 0.5 }, outerRadius: 0.5, textureSpace: 'local',
                colorStops: [{ offset: 0, color: c }, { offset: 1, color: 0x05030f }],
            })));
        }
        this.stars = new Graphics();
        this.bgLayer.addChild(this.stars);
        for (let i = 0; i < 120; i++) this.starField.push({ x: Math.random() * W, y: Math.random() * H, r: Math.random() * 1.8 + 0.4, vy: 6 + Math.random() * 18, tw: Math.random() * Math.PI * 2 });

        this.flash = new Graphics().rect(0, 0, W, H).fill(0xff2440);
        this.flash.alpha = 0; this.bgLayer.addChild(this.flash);

        const title = new Text({ text: 'LIMBO', style: {
            fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 52, fontWeight: '900', letterSpacing: 10,
            fill: 0x8fe3ff, stroke: { color: 0x06122a, width: 7 }, dropShadow: { color: 0x6fe9ff, blur: 22, distance: 0, alpha: 0.8 },
        } });
        title.anchor.set(0, 0.5); title.position.set(60, 70); this.bgLayer.addChild(title);
    }

    private buildGauge(): void {
        // Track.
        this.gaugeLayer.addChild(new Graphics()
            .roundRect(GAUGE_X - 30, GAUGE_TOP - 20, 60, GAUGE_BOT - GAUGE_TOP + 40, 30).fill({ color: 0x0a1430, alpha: 0.8 })
            .roundRect(GAUGE_X - 30, GAUGE_TOP - 20, 60, GAUGE_BOT - GAUGE_TOP + 40, 30).stroke({ width: 3, color: 0x2a4a8a }));
        // Neon inner glow line.
        const glow = new Graphics().roundRect(GAUGE_X - 8, GAUGE_TOP - 10, 16, GAUGE_BOT - GAUGE_TOP + 20, 8).fill({ color: 0x6fe9ff, alpha: 0.12 });
        glow.blendMode = 'add'; this.gaugeLayer.addChild(glow);

        // Log-scale ticks.
        const ticks = new Graphics();
        for (const m of [1, 1.5, 2, 3, 5, 10, 25, 50, 100, 250, 1000]) {
            const y = this.yFor(m);
            ticks.moveTo(GAUGE_X - 30, y).lineTo(GAUGE_X - 48, y).stroke({ width: 2, color: 0x4a6a9a });
            const lbl = new Text({ text: `${m}×`, style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 18, fontWeight: '900', fill: 0x7a9ad8 } });
            lbl.anchor.set(1, 0.5); lbl.position.set(GAUGE_X - 54, y); this.gaugeLayer.addChild(lbl);
        }
        this.gaugeLayer.addChild(ticks);

        // Target line + tag.
        this.targetLine = new Graphics();
        this.gaugeLayer.addChild(this.targetLine);
        this.targetTag = new Container();
        const tagBg = new Graphics().roundRect(0, -18, 168, 36, 18).fill({ color: 0x3a0a28, alpha: 0.95 }).roundRect(0, -18, 168, 36, 18).stroke({ width: 2, color: 0xff5aa8 });
        this.targetTagText = new Text({ text: '', style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 18, fontWeight: '900', fill: 0xffb0d8 } });
        this.targetTagText.anchor.set(0, 0.5); this.targetTagText.position.set(14, 0);
        this.targetTag.addChild(tagBg, this.targetTagText);
        this.gaugeLayer.addChild(this.targetTag);
    }

    // --- UI --------------------------------------------------------------------------

    private createUI(): void {
        const cx = 1758;

        // Big rolled multiplier readout (centre-top of the play area).
        this.resultText = new Text({ text: '1.00×', style: {
            fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 150, fontWeight: '900',
            fill: 0x8fe3ff, stroke: { color: 0x06122a, width: 10 }, dropShadow: { color: 0x6fe9ff, blur: 22, distance: 0, alpha: 0.5 },
        } });
        this.resultText.anchor.set(0.5); this.resultText.position.set(1010, 330); this.uiContainer.addChild(this.resultText);
        this.resultSub = new Text({ text: 'set a target & launch', style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 26, fontWeight: '900', fill: 0x8fb0d8 } });
        this.resultSub.anchor.set(0.5); this.resultSub.position.set(1010, 420); this.uiContainer.addChild(this.resultSub);

        this.banner = new Text({ text: '', style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 86, fontWeight: '900', fill: 0x4dff9e, stroke: { color: 0x06122a, width: 11 } } });
        this.banner.anchor.set(0.5); this.banner.position.set(1010, 560); this.banner.visible = false; this.uiContainer.addChild(this.banner);

        // Roll history (top right of play area).
        this.historyRow = new Container(); this.historyRow.position.set(740, 130); this.uiContainer.addChild(this.historyRow);

        // Panel.
        this.uiContainer.addChild(new Graphics()
            .roundRect(1618, 140, 280, 880, 26).fill({ color: 0x0a0c20, alpha: 0.96 })
            .roundRect(1618, 140, 280, 880, 26).stroke({ width: 3, color: 0x2a3a8a })
            .roundRect(1628, 150, 260, 860, 20).stroke({ width: 1.5, color: 0x6fe9ff, alpha: 0.3 }));
        const section = (txt: string, y: number): void => {
            const t = new Text({ text: txt, style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 16, fontWeight: '900', letterSpacing: 3, fill: 0x7a9ad8 } });
            t.anchor.set(0.5); t.position.set(cx, y); this.uiContainer.addChild(t);
        };

        section('BET', 188);
        this.betValueText = new Text({ text: `$${gameStore.getState().bet}`, style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 32, fontWeight: '900', fill: 0xffffff } });
        this.betValueText.anchor.set(0.5); this.betValueText.position.set(cx, 234); this.uiContainer.addChild(this.betValueText);
        const betBtn = (dx: number, glyph: string, dir: number): void => {
            const b = new Graphics().circle(0, 0, 24).fill({ color: 0x16204a }).circle(0, 0, 24).stroke({ width: 2, color: 0x2a3a8a });
            b.position.set(cx + dx, 234); b.eventMode = 'static'; b.cursor = 'pointer';
            b.on('pointerdown', () => {
                if (this.rolling) return;
                gsap.fromTo(b.scale, { x: 0.85, y: 0.85 }, { x: 1, y: 1, duration: 0.25, ease: 'back.out(3)' });
                const s = gameStore.getState();
                const i = BET_STEPS.findIndex((v) => v >= s.bet);
                s.setBet(BET_STEPS[Math.max(0, Math.min(BET_STEPS.length - 1, (i < 0 ? BET_STEPS.length - 1 : i) + dir))]);
                this.betValueText.text = `$${gameStore.getState().bet}`; this.refreshTarget();
            });
            const t = new Text({ text: glyph, style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 26, fontWeight: '900', fill: 0x8fb0ff } });
            t.anchor.set(0.5); b.addChild(t); this.uiContainer.addChild(b);
        };
        betBtn(-78, '−', -1); betBtn(78, '+', 1);

        section('TARGET MULTIPLIER', 300);
        this.targetValueText = new Text({ text: '', style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 40, fontWeight: '900', fill: 0xff8ad8 } });
        this.targetValueText.anchor.set(0.5); this.targetValueText.position.set(cx, 348); this.uiContainer.addChild(this.targetValueText);
        const tgtBtn = (dx: number, glyph: string, dir: number): void => {
            const b = new Graphics().circle(0, 0, 24).fill({ color: 0x2a0a20 }).circle(0, 0, 24).stroke({ width: 2, color: 0x8a2a5a });
            b.position.set(cx + dx, 348); b.eventMode = 'static'; b.cursor = 'pointer';
            b.on('pointerdown', () => { gsap.fromTo(b.scale, { x: 0.85, y: 0.85 }, { x: 1, y: 1, duration: 0.25, ease: 'back.out(3)' }); this.setTarget(dir); });
            const t = new Text({ text: glyph, style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 26, fontWeight: '900', fill: 0xff8ad8 } });
            t.anchor.set(0.5); b.addChild(t); this.uiContainer.addChild(b);
        };
        tgtBtn(-86, '−', -1); tgtBtn(86, '+', 1);
        // Preset chips.
        PRESETS.forEach((p, i) => {
            const w = 56; const gap = 8; const totalW = PRESETS.length * w + (PRESETS.length - 1) * gap;
            const x = cx - totalW / 2 + i * (w + gap) + w / 2;
            const b = new Graphics().roundRect(-w / 2, -16, w, 32, 10).fill({ color: 0x16204a }).roundRect(-w / 2, -16, w, 32, 10).stroke({ width: 2, color: 0x2a3a8a });
            b.position.set(x, 400); b.eventMode = 'static'; b.cursor = 'pointer';
            b.on('pointerdown', () => { gsap.fromTo(b.scale, { x: 0.85, y: 0.85 }, { x: 1, y: 1, duration: 0.25, ease: 'back.out(3)' }); this.setTargetTo(p); });
            const t = new Text({ text: `${p}×`, style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 18, fontWeight: '900', fill: 0x8fb0ff } });
            t.anchor.set(0.5); b.addChild(t); this.uiContainer.addChild(b);
        });

        // Win chance + payout readouts.
        const readout = (label: string, y: number): Text => {
            const l = new Text({ text: label, style: { fontFamily: 'Arial, sans-serif', fontSize: 16, fontWeight: 'bold', fill: 0x7a9ad8 } });
            l.anchor.set(0, 0.5); l.position.set(cx - 110, y); this.uiContainer.addChild(l);
            const v = new Text({ text: '', style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 24, fontWeight: '900', fill: 0xffffff } });
            v.anchor.set(1, 0.5); v.position.set(cx + 110, y); this.uiContainer.addChild(v); return v;
        };
        section('ODDS', 452);
        this.chanceText = readout('win chance', 490);
        this.payoutText = readout('payout', 524);

        // PLAY.
        this.playButton = new Graphics();
        this.playButton.position.set(cx, 612); this.playButton.eventMode = 'static'; this.playButton.cursor = 'pointer';
        this.playButton.on('pointerdown', () => { gsap.fromTo(this.playButton.scale, { x: 0.94, y: 0.94 }, { x: 1, y: 1, duration: 0.3, ease: 'back.out(3)' }); this.play(); });
        this.playLabel = new Text({ text: 'LAUNCH', style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 34, fontWeight: '900', fill: 0xffffff } });
        this.playLabel.anchor.set(0.5); this.playButton.addChild(this.playLabel); this.uiContainer.addChild(this.playButton);
        this.stylePlay();

        section('LAST WIN', 720);
        this.lastWinText = new Text({ text: '$0', style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 40, fontWeight: '900', fill: 0x4dff9e } });
        this.lastWinText.anchor.set(0.5); this.lastWinText.position.set(cx, 768); this.uiContainer.addChild(this.lastWinText);

        const hint = new Text({ text: 'pick a target · higher target pays more but clears less often · space to launch', style: { fontFamily: 'Arial, sans-serif', fontSize: 16, fontWeight: 'bold', fill: 0x5a7ab0, align: 'center', wordWrap: true, wordWrapWidth: 250 } });
        hint.anchor.set(0.5); hint.position.set(cx, 860); this.uiContainer.addChild(hint);

        this.balanceText = new Text({ text: '', style: { fontFamily: 'Arial, sans-serif', fontSize: 22, fontWeight: 'bold', fill: 0x8fb0ff } });
        this.balanceText.anchor.set(0.5); this.balanceText.position.set(cx, 980); this.uiContainer.addChild(this.balanceText);

        const back = new Text({ text: '‹ MENU', style: { fill: 0x6fe9ff, fontSize: 26, fontWeight: 'bold' } });
        back.position.set(60, 116); back.eventMode = 'static'; back.cursor = 'pointer';
        back.on('pointerdown', () => SceneManager.switchScene(new MenuScene()));
        // (back-to-menu removed) this.uiContainer.addChild(back);

        const render = (s: ReturnType<typeof gameStore.getState>): void => { this.balanceText.text = `Balance  $${Math.round(s.balance * 100) / 100}`; };
        render(gameStore.getState()); gameStore.subscribe(render);
    }

    private renderHistory(): void {
        this.historyRow.removeChildren().forEach((c) => c.destroy({ children: true }));
        this.history.forEach((h, i) => {
            const color = h.win ? 0x4dff9e : 0xff5a6a;
            const chip = new Container();
            chip.addChild(new Graphics().roundRect(-44, -16, 88, 32, 16).fill({ color: 0x0c142e, alpha: 0.9 }).roundRect(-44, -16, 88, 32, 16).stroke({ width: 2, color }));
            const t = new Text({ text: `${h.mult >= 1000 ? '1k+' : h.mult.toFixed(2)}×`, style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 16, fontWeight: '900', fill: color } });
            t.anchor.set(0.5); chip.addChild(t); chip.position.set(i * 98, 0);
            if (i === 0) gsap.fromTo(chip.scale, { x: 0.3, y: 0.3 }, { x: 1, y: 1, duration: 0.3, ease: 'back.out(2.5)' });
            this.historyRow.addChild(chip);
        });
    }

    private stylePlay(): void {
        const ready = !this.rolling;
        this.playButton.clear()
            .roundRect(-120, -52, 240, 104, 24).fill(ready ? 0x1f7ad8 : 0x16204a)
            .roundRect(-120, -52, 240, 104, 24).stroke({ width: 3, color: ready ? 0x6fe9ff : 0x2a3a8a });
        this.playLabel.text = ready ? 'LAUNCH' : 'ROLLING…';
        this.playButton.cursor = ready ? 'pointer' : 'default';
    }

    private showBanner(msg: string, tint: number): void {
        this.banner.text = msg; this.banner.style.fill = tint;
        this.banner.style.dropShadow = { color: tint, blur: 26, distance: 0, alpha: 0.85, angle: Math.PI / 6 };
        this.banner.alpha = 1; this.banner.visible = true;
        gsap.killTweensOf(this.banner); gsap.killTweensOf(this.banner.scale);
        gsap.fromTo(this.banner.scale, { x: 0.3, y: 0.3 }, { x: 1, y: 1, duration: 0.45, ease: 'back.out(2.2)' });
        gsap.to(this.banner, { alpha: 0, duration: 0.5, delay: 1.4, onComplete: () => { this.banner.visible = false; } });
    }

    private winBurst(): void {
        const ring = new Graphics().circle(0, 0, 60).stroke({ width: 10, color: 0x4dff9e });
        ring.blendMode = 'add'; ring.position.set(GAUGE_X, this.rocket.position.y); ring.scale.set(0.3);
        this.fxLayer.addChild(ring);
        gsap.to(ring.scale, { x: 8, y: 8, duration: 0.7, ease: 'power2.out' });
        gsap.to(ring, { alpha: 0, duration: 0.7, ease: 'power2.out', onComplete: () => ring.destroy() });
    }

    private coinStorm(count: number): void {
        for (let i = 0; i < count; i++) {
            let c = this.coins.find((g) => !g.visible);
            if (!c) { c = new Graphics(); c.visible = false; this.fxLayer.addChild(c); this.coins.push(c); }
            const size = 8 + Math.random() * 8;
            c.clear().ellipse(0, 0, size, size * 0.8).fill({ color: 0xffd54f }).ellipse(0, 0, size, size * 0.8).stroke({ width: 2, color: 0x8a6512 }).ellipse(-size * 0.3, -size * 0.25, size * 0.3, size * 0.18).fill({ color: 0xfff6cf, alpha: 0.9 });
            const sx = 700 + Math.random() * 700;
            c.position.set(sx, -40); c.alpha = 1; c.scale.set(1); c.visible = true;
            gsap.killTweensOf(c); gsap.killTweensOf(c.scale);
            gsap.to(c, { y: GameConfig.height + 60, x: sx + (Math.random() - 0.5) * 160, rotation: (Math.random() - 0.5) * 8, duration: 1.4 + Math.random(), delay: Math.random() * 0.4, ease: 'power1.in', onComplete: () => { c.visible = false; } });
            gsap.to(c.scale, { x: 0.25, duration: 0.22, yoyo: true, repeat: 8, ease: 'sine.inOut' });
        }
    }
}
