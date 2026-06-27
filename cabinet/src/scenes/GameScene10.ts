import { Text, Container, Graphics, FillGradient } from 'pixi.js';
import type { FederatedPointerEvent } from 'pixi.js';
import { gsap } from 'gsap';
import { BaseScene } from './BaseScene';
import { GameConfig } from '../config/GameConfig';
import { gameStore } from '../state/GameState';
import { SceneManager } from '../managers/SceneManager';
import { MenuScene } from './MenuScene';

/**
 * GameScene10 — Slot 10: "Lucky Dice"
 * ------------------------------------
 * Stake-style dice — the definitive casino "original". Pick a target with the
 * slider, choose roll UNDER or OVER, and the odds rebalance live: tighter
 * window, bigger multiplier. Roll a 0.00–99.99 number and beat the line.
 *
 * Production touches:
 *  - draggable slider with win/lose zones that recolour per mode
 *  - live readouts: win chance, multiplier, payout — updated as you drag
 *  - digit-flicker roll animation; the marker drops onto the bar where it hit
 *  - tumbling vector die that lands on a face matching the result
 *  - green coin burst on wins, red flash on losses, history chips of rolls
 */

const HOUSE_EDGE = 0.97;
const BET_STEPS = [1, 2, 5, 10, 20, 50, 100];
const MIN_T = 2;
const MAX_T = 98;

type Mode = 'under' | 'over';

export class GameScene10 extends BaseScene {
    private readonly barX = 240;
    private readonly barW = 1100;
    private readonly barY = 620;

    private readonly fxLayer = new Container();
    private readonly uiContainer = new Container();

    private target = 50;
    private mode: Mode = 'under';
    private rolling = false;
    private dragging = false;
    private readonly history: { value: number; win: boolean }[] = [];

    private barFill!: Graphics;
    private handle!: Container;
    private resultText!: Text;
    private resultMarker!: Container;
    private die!: Container;
    private dieFace!: Graphics;
    private chanceText!: Text;
    private multText!: Text;
    private payoutText!: Text;
    private modePills: { pill: Graphics; label: Text; value: Mode }[] = [];
    private rollButton!: Graphics;
    private rollLabel!: Text;
    private rollSub!: Text;
    private betValueText!: Text;
    private balanceText!: Text;
    private banner!: Text;
    private flash!: Graphics;
    private historyRow!: Container;
    private readonly coins: Graphics[] = [];

    private readonly onKeyDown = (e: KeyboardEvent): void => {
        if (e.code === 'Space') { e.preventDefault(); this.roll(); }
        // (back-to-menu removed) if (e.code === 'Escape') SceneManager.switchScene(new MenuScene());
    };
    private readonly onPointerUp = (): void => { this.dragging = false; };

    public async init(): Promise<void> {
        this.addChild(this.buildBackground());
        this.addChild(this.fxLayer);
        this.addChild(this.uiContainer);
        this.createUI();
        this.refreshOdds();
        window.addEventListener('keydown', this.onKeyDown);
        window.addEventListener('pointerup', this.onPointerUp);
    }

    public async start(): Promise<void> {}
    public update(_delta: number): void {}
    public resize(_width: number, _height: number): void {}

    public override async destroyScene(): Promise<void> {
        window.removeEventListener('keydown', this.onKeyDown);
        window.removeEventListener('pointerup', this.onPointerUp);
        gsap.killTweensOf(this.position);
        gsap.killTweensOf(this.die);
        gsap.killTweensOf(this.die.scale);
        gsap.killTweensOf(this.resultMarker);
        gsap.killTweensOf(this.banner);
        gsap.killTweensOf(this.banner.scale);
        gsap.killTweensOf(this.flash);
        for (const c of this.coins) gsap.killTweensOf(c);
        await super.destroyScene();
    }

    // --- odds ---------------------------------------------------------------------

    private chance(): number {
        return this.mode === 'under' ? this.target : 100 - this.target;
    }

    private multiplier(): number {
        return (HOUSE_EDGE * 100) / this.chance();
    }

    private refreshOdds(): void {
        const state = gameStore.getState();
        this.chanceText.text = `${this.chance().toFixed(0)}%`;
        this.multText.text = `${this.multiplier().toFixed(4).replace(/0+$/, '').replace(/\.$/, '')}x`;
        this.payoutText.text = `$${(state.bet * this.multiplier()).toFixed(2)}`;
        this.drawBar();
        this.handle.position.x = this.barX + (this.target / 100) * this.barW;
        this.rollSub.text = `${this.mode === 'under' ? 'roll under' : 'roll over'} ${this.target}`;
    }

    private setTarget(t: number): void {
        this.target = Math.max(MIN_T, Math.min(MAX_T, Math.round(t)));
        this.refreshOdds();
    }

    // --- roll flow ------------------------------------------------------------------

    private roll(): void {
        if (this.rolling) return;
        const state = gameStore.getState();
        if (state.balance < state.bet) return;
        state.setBalance(state.balance - state.bet);
        state.setWinAmount(0);
        this.rolling = true;
        this.banner.visible = false;
        this.resultMarker.visible = false;
        this.styleRoll(0x1a3350, 0x3388aa, 'ROLLING');

        const value = Math.floor(Math.random() * 10000) / 100; // 0.00–99.99
        const win = this.mode === 'under' ? value < this.target : value > this.target;

        // Digit flicker while the die tumbles.
        const flicker = setInterval(() => {
            this.resultText.text = (Math.random() * 100).toFixed(2);
        }, 50);
        gsap.killTweensOf(this.die);
        gsap.killTweensOf(this.die.scale);
        gsap.timeline()
            .to(this.die, { rotation: Math.PI * 6 + Math.random() * Math.PI, duration: 1.1, ease: 'power2.out' })
            .fromTo(this.die.scale, { x: 0.85, y: 0.85 }, { x: 1, y: 1, duration: 1.1, ease: 'elastic.out(1, 0.5)' }, 0);
        const swapper = setInterval(() => this.drawDieFace(1 + ((Math.random() * 6) | 0)), 120);

        gsap.delayedCall(1.15, () => {
            clearInterval(flicker);
            clearInterval(swapper);
            this.settle(value, win);
        });
    }

    private settle(value: number, win: boolean): void {
        const state = gameStore.getState();
        this.rolling = false;
        this.resultText.text = value.toFixed(2);
        this.resultText.style.fill = win ? 0x00ff6a : 0xff2d5e;
        gsap.fromTo(this.resultText.scale, { x: 1.3, y: 1.3 }, { x: 1, y: 1, duration: 0.4, ease: 'back.out(2)' });
        this.drawDieFace(1 + ((value / 16.667) | 0)); // face loosely tracks the roll
        this.die.rotation = 0;

        // Marker drops onto the bar where the roll landed.
        const mx = this.barX + (value / 100) * this.barW;
        this.resultMarker.position.set(mx, this.barY - 64);
        this.resultMarker.visible = true;
        (this.resultMarker.getChildAt(1) as Text).text = value.toFixed(2);
        (this.resultMarker.getChildAt(1) as Text).style.fill = win ? 0x00ff6a : 0xff2d5e;
        gsap.killTweensOf(this.resultMarker);
        gsap.fromTo(this.resultMarker, { y: this.barY - 110, alpha: 0 }, { y: this.barY - 64, alpha: 1, duration: 0.3, ease: 'bounce.out' });

        this.history.unshift({ value, win });
        if (this.history.length > 10) this.history.pop();
        this.renderHistory();

        if (win) {
            const payout = Math.round(state.bet * this.multiplier() * 100) / 100;
            state.setBalance(Math.round((state.balance + payout) * 100) / 100);
            state.setWinAmount(payout);
            this.showBanner(`+$${payout}`, 0x00ff6a);
            this.coinBurst(this.barX + this.barW / 2, 360, Math.min(34, 8 + (this.multiplier() | 0) * 2));
            this.styleRoll(0x00cc55, 0x00ff6a, 'ROLL');
        } else {
            gsap.killTweensOf(this.flash);
            gsap.timeline()
                .set(this.flash, { alpha: 0.22 })
                .to(this.flash, { alpha: 0, duration: 0.5, ease: 'power2.out' });
            this.styleRoll(0x00cc55, 0x00ff6a, 'ROLL');
        }
        this.refreshOdds();
    }

    // --- slider -------------------------------------------------------------------------

    private drawBar(): void {
        const g = this.barFill;
        const splitX = (this.target / 100) * this.barW;
        const winColor = 0x00cc55;
        const loseColor = 0xe0163a;
        const leftCol = this.mode === 'under' ? winColor : loseColor;
        const rightCol = this.mode === 'under' ? loseColor : winColor;
        g.clear()
            .roundRect(-8, -16, this.barW + 16, 32, 16).fill({ color: 0x0c1018 })
            .roundRect(-8, -16, this.barW + 16, 32, 16).stroke({ width: 2.5, color: 0x2a3450 })
            .roundRect(0, -10, splitX, 20, 10).fill({ color: leftCol })
            .roundRect(splitX, -10, this.barW - splitX, 20, 10).fill({ color: rightCol });
        // Scale ticks 0/25/50/75/100.
        for (let i = 0; i <= 4; i++) {
            const tx = (this.barW * i) / 4;
            g.moveTo(tx, 22).lineTo(tx, 30).stroke({ width: 2, color: 0x4a5a74 });
        }
    }

    private sliderEvent(e: FederatedPointerEvent): void {
        const local = this.barFill.toLocal(e.global);
        this.setTarget((local.x / this.barW) * 100);
    }

    // --- die ----------------------------------------------------------------------------

    private drawDieFace(face: number): void {
        const g = this.dieFace;
        const S = 140;
        g.clear()
            // Shadow
            .roundRect(-S / 2 + 5, -S / 2 + 9, S, S, 28).fill({ color: 0x000000, alpha: 0.5 })
            // Main die body — warm ivory gradient
            .roundRect(-S / 2, -S / 2, S, S, 28).fill(new FillGradient({
                type: 'linear', start: { x: 0, y: 0 }, end: { x: 1, y: 1 }, textureSpace: 'local',
                colorStops: [
                    { offset: 0, color: 0xfff8f0 },
                    { offset: 0.3, color: 0xffeedd },
                    { offset: 0.6, color: 0xe8ddd0 },
                    { offset: 1, color: 0xc8b8a8 },
                ],
            }))
            // Bright edge stroke
            .roundRect(-S / 2, -S / 2, S, S, 28).stroke({ width: 4, color: 0xd4c4b0 })
            // Inner highlight
            .roundRect(-S / 2 + 6, -S / 2 + 6, S - 12, S - 12, 22).stroke({ width: 2, color: 0xffffff, alpha: 0.4 });
        const pip = (x: number, y: number): void => {
            // Pip shadow
            g.circle(x * 36 + 2, y * 36 + 2, 13).fill({ color: 0x000000, alpha: 0.2 });
            // Pip body — deep charcoal
            g.circle(x * 36, y * 36, 13).fill({ color: 0x1a1a2e });
            // Pip highlight catch
            g.circle(x * 36 - 4, y * 36 - 4, 4.5).fill({ color: 0x6a6a8a, alpha: 0.7 });
        };
        const f = Math.max(1, Math.min(6, face));
        if (f % 2 === 1) pip(0, 0);
        if (f >= 2) { pip(-1, -1); pip(1, 1); }
        if (f >= 4) { pip(1, -1); pip(-1, 1); }
        if (f === 6) { pip(-1, 0); pip(1, 0); }
    }

    // --- effects ---------------------------------------------------------------------------

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
                .ellipse(0, 0, size, size * 0.8).fill({ color: 0xffe066 })
                .ellipse(0, 0, size, size * 0.8).stroke({ width: 2, color: 0xcc8800 });
            c.position.set(x, y);
            c.alpha = 1;
            c.visible = true;
            const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.0;
            const speed = 260 + Math.random() * 360;
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
        this.banner.style.stroke = { color: 0x003318, width: 14 };
        this.banner.style.dropShadow = { color: tint, blur: 28, distance: 0, alpha: 0.85, angle: Math.PI / 6 };
        this.banner.alpha = 1;
        this.banner.visible = true;
        gsap.killTweensOf(this.banner);
        gsap.killTweensOf(this.banner.scale);
        gsap.fromTo(this.banner.scale, { x: 0.3, y: 0.3 }, { x: 1, y: 1, duration: 0.4, ease: 'back.out(2.2)' });
        gsap.to(this.banner, { alpha: 0, duration: 0.5, delay: 1.2, onComplete: () => { this.banner.visible = false; } });
    }

    private renderHistory(): void {
        this.historyRow.removeChildren().forEach((c) => c.destroy({ children: true }));
        this.history.forEach((h, i) => {
            const chip = new Container();
            const color = h.win ? 0x00ff6a : 0xff2d5e;
            const bgColor = h.win ? 0x0a2818 : 0x28101a;
            const chipG = new Graphics()
                // Outer shadow
                .roundRect(-45, -18, 90, 40, 20).fill({ color: 0x000000, alpha: 0.4 })
                // Main bg with gradient feel
                .roundRect(-46, -20, 92, 40, 20).fill(new FillGradient({
                    type: 'linear', start: { x: 0, y: 0 }, end: { x: 0, y: 1 }, textureSpace: 'local',
                    colorStops: [
                        { offset: 0, color: 0x1e2636 },
                        { offset: 0.5, color: bgColor },
                        { offset: 1, color: 0x0c1018 },
                    ],
                }))
                // Colored border
                .roundRect(-46, -20, 92, 40, 20).stroke({ width: 2.5, color })
                // Inner glow line
                .roundRect(-42, -16, 84, 32, 16).stroke({ width: 1, color, alpha: 0.3 });
            chip.addChild(chipG);
            const label = new Text({ text: h.value.toFixed(2), style: {
                fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 18, fontWeight: '900',
                fill: color,
                dropShadow: { color, blur: 8, distance: 0, alpha: 0.6 },
            } });
            label.anchor.set(0.5);
            chip.addChild(label);
            chip.position.set(i * 100, 0);
            if (i === 0) gsap.fromTo(chip.scale, { x: 0.3, y: 0.3 }, { x: 1, y: 1, duration: 0.3, ease: 'back.out(2.5)' });
            this.historyRow.addChild(chip);
        });
    }

    // --- presentation ------------------------------------------------------------------------

    private buildBackground(): Container {
        const env = new Container();
        const W = GameConfig.width;
        const H = GameConfig.height;
        env.addChild(new Graphics().rect(0, 0, W, H).fill(new FillGradient({
            type: 'linear', start: { x: 0, y: 0 }, end: { x: 0, y: 1 }, textureSpace: 'local',
            colorStops: [{ offset: 0, color: 0x101a2e }, { offset: 0.6, color: 0x0a1020 }, { offset: 1, color: 0x05080f }],
        })));

        // Giant translucent dice drifting in the backdrop.
        const ghostDie = (x: number, y: number, s: number, rot: number, alpha: number): void => {
            const g = new Graphics()
                .roundRect(-s / 2, -s / 2, s, s, s * 0.2).stroke({ width: 4, color: 0x2a4a6a, alpha });
            for (const [px, py] of [[-0.25, -0.25], [0.25, 0.25], [0, 0]]) {
                g.circle(px * s, py * s, s * 0.07).fill({ color: 0x2a4a6a, alpha });
            }
            g.position.set(x, y);
            g.rotation = rot;
            env.addChild(g);
        };
        ghostDie(220, 260, 220, 0.4, 0.5);
        ghostDie(1560, 820, 300, -0.3, 0.4);
        ghostDie(1700, 280, 150, 0.8, 0.45);
        ghostDie(420, 900, 170, -0.6, 0.4);

        // Soft centre glow.
        env.addChild(new Graphics().ellipse(W / 2 - 130, 480, 720, 420).fill(new FillGradient({
            type: 'radial', center: { x: 0.5, y: 0.5 }, innerRadius: 0, outerCenter: { x: 0.5, y: 0.5 }, outerRadius: 0.5, textureSpace: 'local',
            colorStops: [{ offset: 0, color: 'rgba(0,255,106,0.18)' }, { offset: 1, color: 'rgba(0,255,106,0)' }],
        })));

        const title = new Text({
            text: 'LUCKY DICE',
            style: {
                fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 46, fontWeight: '900', letterSpacing: 8,
                fill: 0x00ff6a, stroke: { color: 0x003318, width: 6 },
                dropShadow: { color: 0x00ff6a, blur: 22, distance: 0, alpha: 0.85 },
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

        // Big result number + tumbling die.
        this.resultText = new Text({
            text: '00.00',
            style: {
                fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 150, fontWeight: '900',
                fill: 0xffffff, stroke: { color: 0x0a1020, width: 10 },
                dropShadow: { color: 0x00ccff, blur: 18, distance: 0, alpha: 0.4 },
            },
        });
        this.resultText.anchor.set(0.5);
        this.resultText.position.set(this.barX + this.barW / 2 - 120, 330);
        this.uiContainer.addChild(this.resultText);

        this.die = new Container();
        this.die.position.set(this.barX + this.barW / 2 + 300, 330);
        this.dieFace = new Graphics();
        this.die.addChild(this.dieFace);
        this.drawDieFace(4);
        this.uiContainer.addChild(this.die);

        this.banner = new Text({
            text: '',
            style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 90, fontWeight: '900', fill: 0x00ff6a, stroke: { color: 0x003318, width: 14 }, dropShadow: { color: 0x00ff6a, blur: 28, distance: 0, alpha: 0.85 } },
        });
        this.banner.anchor.set(0.5);
        this.banner.position.set(this.barX + this.barW / 2, 170);
        this.banner.visible = false;
        this.uiContainer.addChild(this.banner);

        // Slider bar + handle + result marker.
        this.barFill = new Graphics();
        this.barFill.position.set(this.barX, this.barY);
        this.barFill.eventMode = 'static';
        this.barFill.cursor = 'pointer';
        this.barFill.hitArea = { contains: (x: number, y: number) => x >= -20 && x <= this.barW + 20 && y >= -44 && y <= 44 };
        this.barFill.on('pointerdown', (e) => { if (!this.rolling) { this.dragging = true; this.sliderEvent(e); } });
        this.barFill.on('pointermove', (e) => { if (this.dragging && !this.rolling) this.sliderEvent(e); });
        this.uiContainer.addChild(this.barFill);

        this.handle = new Container();
        const handleG = new Graphics()
            .roundRect(-17, -34, 34, 68, 12).fill(new FillGradient({
                type: 'linear', start: { x: 0, y: 0 }, end: { x: 0, y: 1 }, textureSpace: 'local',
                colorStops: [{ offset: 0, color: 0xffffff }, { offset: 0.5, color: 0xc8d4e4 }, { offset: 1, color: 0x8a99ae }],
            }))
            .roundRect(-17, -34, 34, 68, 12).stroke({ width: 3, color: 0x3a4663 });
        for (const ly of [-12, 0, 12]) handleG.moveTo(-8, ly).lineTo(8, ly).stroke({ width: 2.5, color: 0x5a6678 });
        this.handle.addChild(handleG);
        this.handle.position.set(this.barX + (this.target / 100) * this.barW, this.barY);
        this.handle.eventMode = 'none';
        this.uiContainer.addChild(this.handle);

        this.resultMarker = new Container();
        const markerG = new Graphics()
            // Arrow pointer
            .poly([-12, -10, 12, -10, 0, 14]).fill(new FillGradient({
                type: 'linear', start: { x: 0, y: 0 }, end: { x: 0, y: 1 }, textureSpace: 'local',
                colorStops: [{ offset: 0, color: 0xffffff }, { offset: 1, color: 0xaabbcc }],
            }))
            // Pill bg with gradient
            .roundRect(-48, -50, 96, 40, 12).fill(new FillGradient({
                type: 'linear', start: { x: 0, y: 0 }, end: { x: 0, y: 1 }, textureSpace: 'local',
                colorStops: [
                    { offset: 0, color: 0x1e2a3e },
                    { offset: 0.5, color: 0x14202e },
                    { offset: 1, color: 0x0c1420 },
                ],
            }))
            .roundRect(-48, -50, 96, 40, 12).stroke({ width: 2.5, color: 0x5a7a9a })
            // Inner highlight
            .roundRect(-44, -46, 88, 32, 8).stroke({ width: 1, color: 0x6a8aaa, alpha: 0.25 });
        const markerT = new Text({ text: '', style: {
            fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 19, fontWeight: '900',
            fill: 0xffffff,
            dropShadow: { color: 0x00ccff, blur: 6, distance: 0, alpha: 0.5 },
        } });
        markerT.anchor.set(0.5);
        markerT.position.set(0, -30);
        this.resultMarker.addChild(markerG, markerT);
        this.resultMarker.visible = false;
        this.uiContainer.addChild(this.resultMarker);

        // Bar end labels.
        for (const [v, lx] of [[0, this.barX], [100, this.barX + this.barW]] as const) {
            const t = new Text({ text: `${v}`, style: {
                fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 22, fontWeight: '900',
                fill: 0x7a9ab4,
                dropShadow: { color: 0x000000, blur: 4, distance: 0, alpha: 0.5 },
            } });
            t.anchor.set(0.5);
            t.position.set(lx, this.barY + 52);
            this.uiContainer.addChild(t);
        }

        // Readout cards under the slider: chance / multiplier / payout.
        const card = (label: string, x: number): Text => {
            this.uiContainer.addChild(new Graphics()
                // Card shadow
                .roundRect(x - 148, 720, 300, 120, 18).fill({ color: 0x000000, alpha: 0.35 })
                // Card bg gradient
                .roundRect(x - 150, 716, 300, 120, 18).fill(new FillGradient({
                    type: 'linear', start: { x: 0, y: 0 }, end: { x: 0, y: 1 }, textureSpace: 'local',
                    colorStops: [
                        { offset: 0, color: 0x151e30 },
                        { offset: 0.5, color: 0x101828 },
                        { offset: 1, color: 0x0a1018 },
                    ],
                }))
                // Outer border
                .roundRect(x - 150, 716, 300, 120, 18).stroke({ width: 2, color: 0x2a4060 })
                // Inner glow border
                .roundRect(x - 144, 722, 288, 108, 14).stroke({ width: 1, color: 0x00ff6a, alpha: 0.12 }));
            const l = new Text({ text: label, style: {
                fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 17, fontWeight: '900', letterSpacing: 3,
                fill: 0x88aacc,
                dropShadow: { color: 0x88aacc, blur: 6, distance: 0, alpha: 0.3 },
            } });
            l.anchor.set(0.5);
            l.position.set(x, 748);
            this.uiContainer.addChild(l);
            const v = new Text({ text: '', style: {
                fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 38, fontWeight: '900',
                fill: 0xffffff,
                dropShadow: { color: 0x00ccff, blur: 8, distance: 0, alpha: 0.35 },
            } });
            v.anchor.set(0.5);
            v.position.set(x, 800);
            this.uiContainer.addChild(v);
            return v;
        };
        this.chanceText = card('WIN CHANCE', this.barX + 170);
        this.multText = card('MULTIPLIER', this.barX + this.barW / 2);
        this.payoutText = card('PAYOUT ON WIN', this.barX + this.barW - 170);

        // --- control panel (consistent with the other table games) ---
        this.uiContainer.addChild(new Graphics()
            .roundRect(1618, 140, 280, 880, 26).fill({ color: 0x0e1810, alpha: 0.96 })
            .roundRect(1618, 140, 280, 880, 26).stroke({ width: 2, color: 0x1a6b3a })
            .roundRect(1628, 150, 260, 860, 20).stroke({ width: 1.5, color: 0x00ff6a, alpha: 0.25 }));

        const section = (txt: string, y: number): void => {
            const t = new Text({ text: txt, style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 16, fontWeight: '900', letterSpacing: 2, fill: 0x66ddaa } });
            t.anchor.set(0.5);
            t.position.set(cx, y);
            this.uiContainer.addChild(t);
        };
        const divider = (y: number): void => {
            this.uiContainer.addChild(new Graphics().moveTo(1650, y).lineTo(1866, y).stroke({ width: 1.5, color: 0x1a6b3a }));
        };

        section('MODE', 196);
        (['under', 'over'] as const).forEach((value, i) => {
            const pill = new Graphics();
            pill.position.set(cx + (i === 0 ? -62 : 62), 252);
            pill.eventMode = 'static';
            pill.cursor = 'pointer';
            const label = new Text({ text: value.toUpperCase(), style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 18, fontWeight: '900', fill: 0xffffff } });
            label.anchor.set(0.5);
            pill.addChild(label);
            this.stylePill(pill, label, value === this.mode);
            pill.on('pointerdown', () => {
                if (this.rolling) return;
                this.mode = value;
                for (const mp of this.modePills) this.stylePill(mp.pill, mp.label, mp.value === value);
                this.refreshOdds();
            });
            this.uiContainer.addChild(pill);
            this.modePills.push({ pill, label, value });
        });

        // Target nudge buttons.
        const nudge = (dx: number, glyph: string, dir: number): void => {
            const b = new Graphics()
                .circle(0, 0, 24).fill({ color: 0x14241a })
                .circle(0, 0, 24).stroke({ width: 2, color: 0x1a6b3a });
            b.position.set(cx + dx, 318);
            b.eventMode = 'static';
            b.cursor = 'pointer';
            b.on('pointerdown', () => {
                if (this.rolling) return;
                gsap.fromTo(b.scale, { x: 0.85, y: 0.85 }, { x: 1, y: 1, duration: 0.25, ease: 'back.out(3)' });
                this.setTarget(this.target + dir);
            });
            const t = new Text({ text: glyph, style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 24, fontWeight: '900', fill: 0x66ffbb } });
            t.anchor.set(0.5);
            b.addChild(t);
            this.uiContainer.addChild(b);
        };
        nudge(-62, '−', -1);
        nudge(62, '+', 1);
        const nudgeLabel = new Text({ text: 'target ±1', style: { fontFamily: 'Arial, sans-serif', fontSize: 15, fontWeight: 'bold', fill: 0x66ddaa } });
        nudgeLabel.anchor.set(0.5);
        nudgeLabel.position.set(cx, 358);
        this.uiContainer.addChild(nudgeLabel);

        divider(396);
        section('BET', 432);
        this.betValueText = new Text({ text: `$${gameStore.getState().bet}`, style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 34, fontWeight: '900', fill: 0xffffff } });
        this.betValueText.anchor.set(0.5);
        this.betValueText.position.set(cx, 486);
        this.uiContainer.addChild(this.betValueText);
        const stepBtn = (dx: number, glyph: string, dir: number): void => {
            const b = new Graphics()
                .circle(0, 0, 26).fill({ color: 0x14241a })
                .circle(0, 0, 26).stroke({ width: 2, color: 0x1a6b3a });
            b.position.set(cx + dx, 486);
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
                this.refreshOdds();
            });
            const t = new Text({ text: glyph, style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 28, fontWeight: '900', fill: 0x66ffbb } });
            t.anchor.set(0.5);
            b.addChild(t);
            this.uiContainer.addChild(b);
        };
        stepBtn(-80, '−', -1);
        stepBtn(80, '+', 1);

        divider(564);
        this.rollButton = new Graphics();
        this.rollButton.position.set(cx, 668);
        this.rollButton.eventMode = 'static';
        this.rollButton.cursor = 'pointer';
        this.rollButton.on('pointerdown', () => {
            gsap.fromTo(this.rollButton.scale, { x: 0.94, y: 0.94 }, { x: 1, y: 1, duration: 0.3, ease: 'back.out(3)' });
            this.roll();
        });
        this.rollLabel = new Text({ text: '', style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 32, fontWeight: '900', fill: 0xffffff } });
        this.rollLabel.anchor.set(0.5);
        this.rollLabel.position.set(0, -14);
        this.rollSub = new Text({ text: '', style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 15, fontWeight: '900', fill: 0xffffff } });
        this.rollSub.alpha = 0.85;
        this.rollSub.anchor.set(0.5);
        this.rollSub.position.set(0, 26);
        this.rollButton.addChild(this.rollLabel, this.rollSub);
        this.uiContainer.addChild(this.rollButton);
        this.styleRoll(0x00cc55, 0x00ff6a, 'ROLL');

        divider(930);
        this.balanceText = new Text({ text: '', style: { fontFamily: 'Arial, sans-serif', fontSize: 20, fontWeight: 'bold', fill: 0x66ffbb } });
        this.balanceText.anchor.set(0.5);
        this.balanceText.position.set(cx, 968);
        this.uiContainer.addChild(this.balanceText);

        // History chips top-centre.
        this.historyRow = new Container();
        this.historyRow.position.set(560, 52);
        this.uiContainer.addChild(this.historyRow);

        const back = new Text({ text: '‹ MENU', style: { fill: 0x00ff6a, fontSize: 26, fontWeight: 'bold' } });
        back.position.set(44, 86);
        back.eventMode = 'static';
        back.cursor = 'pointer';
        back.on('pointerdown', () => SceneManager.switchScene(new MenuScene()));
        // (back-to-menu removed) this.uiContainer.addChild(back);

        const hint = new Text({ text: 'drag the slider · tighter window = bigger multiplier · space to roll', style: { fill: 0x66ddaa, fontSize: 18, fontStyle: 'italic' } });
        hint.anchor.set(0.5);
        hint.position.set(this.barX + this.barW / 2, H - 16);
        this.uiContainer.addChild(hint);

        const render = (s: ReturnType<typeof gameStore.getState>): void => {
            this.balanceText.text = `Balance  $${Math.round(s.balance * 100) / 100}`;
        };
        render(gameStore.getState());
        gameStore.subscribe(render);
    }

    private stylePill(pill: Graphics, label: Text, active: boolean): void {
        pill.clear()
            .roundRect(-56, -24, 112, 48, 22).fill({ color: active ? 0x00cc55 : 0x101c14, alpha: active ? 1 : 0.9 })
            .roundRect(-56, -24, 112, 48, 22).stroke({ width: 2.5, color: active ? 0x00ff6a : 0x1a6b3a });
        label.style.fill = active ? 0xffffff : 0x88ddbb;
    }

    private styleRoll(fill: number, edge: number, label: string): void {
        this.rollButton.clear()
            .roundRect(-110, -54, 220, 108, 24).fill(fill)
            .roundRect(-110, -54, 220, 108, 24).stroke({ width: 3, color: edge });
        this.rollLabel.text = label;
    }
}
