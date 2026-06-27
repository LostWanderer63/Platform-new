import { Text, Container, Graphics, FillGradient } from 'pixi.js';
import { AdvancedBloomFilter } from 'pixi-filters';
import { gsap } from 'gsap';
import { BaseScene } from './BaseScene';
import { GameConfig } from '../config/GameConfig';
import { gameStore } from '../state/GameState';
import { SceneManager } from '../managers/SceneManager';
import { MenuScene } from './MenuScene';

/**
 * GameScene12 — Slot 12: "Alchemy Flip"
 * -------------------------------------
 * A mystical alchemical transmutation game. Pick SOL (Gold Sun) or LUNA (Silver Moon),
 * and flip the transmutation coin. Correct guesses advance you along a series of 10
 * glass alchemical beakers filling with bubbling elemental liquids. Cash out at any
 * step to transmute your winnings, or risk it all for the final Philosopher's Stone (900x!).
 *
 * Production touches:
 *  - Procedural wood table background with glowing alchemical engravings
 *  - Simulated 3D parabolic coin flip showing detailed Sol sun rays and Luna crescent starry sky
 *  - Glass flask progress bar with dynamic bubbling liquid animations
 *  - Golden elixir coins and elemental smoke bursts
 */

const BET_STEPS = [1, 2, 5, 10, 20, 50, 100];
const MULTIPLIERS = [1.96, 3.88, 7.68, 15.20, 30.00, 59.00, 116.00, 228.00, 450.00, 900.00];
const FLASK_COLORS = [
    0xd32f2f, // Fire (Red)
    0xe65100, // Earth (Orange)
    0x00796b, // Mercury (Teal)
    0x2e7d32, // Venus/Copper (Green)
    0xd84315, // Mars/Iron (Rusty Red)
    0x1565c0, // Jupiter/Tin (Blue)
    0x4a148c, // Saturn/Lead (Purple)
    0x00bcd4, // Moon/Silver (Light Blue)
    0xffb300, // Sun/Gold (Amber)
    0xff1744  // Philosopher's Stone (Radiant Crimson!)
];

export class GameScene12 extends BaseScene {
    private readonly cx = 1580; // control column center x

    // Layers
    private readonly bgLayer = new Container();
    private readonly neonLayer = new Container();
    private readonly fxLayer = new Container();
    private readonly uiContainer = new Container();

    // Game state variables
    private streak = 0;
    private activeChoice: 'heads' | 'tails' = 'heads';
    private accumulatedWinnings = 0;
    private phase: 'idle' | 'flipping' | 'streak_active' = 'idle';
    private rolling = false;
    private coinFlipProgress = 0;
    private elapsed = 0;

    // Component pools
    private readonly coins: Graphics[] = [];
    private readonly sparkles: Graphics[] = [];
    private readonly history: { resultSide: number; win: boolean }[] = [];
    private readonly flaskBubbles: { gfx: Graphics; parent: Container; speed: number; x: number; y: number }[] = [];

    // UI Elements
    private coinContainer!: Container;
    private coinInner!: Container;
    private headsFace!: Graphics;
    private tailsFace!: Graphics;
    private shadow!: Graphics;
    private flash!: Graphics;
    private bloom!: AdvancedBloomFilter;
    
    private infoText!: Text;
    private balanceText!: Text;
    private betValueText!: Text;
    private banner!: Text;
    
    private headsBtnBg!: Graphics;
    private headsBtnLabel!: Text;
    private tailsBtnBg!: Graphics;
    private tailsBtnLabel!: Text;
    private playButton!: Graphics;
    private playLabel!: Text;
    private playSub!: Text;
    private cashoutButton!: Graphics;
    private cashoutLabel!: Text;
    
    private streakBar!: Graphics;
    private readonly streakNodes: Container[] = [];
    private historyRow!: Container;

    private readonly onKeyDown = (e: KeyboardEvent): void => {
        if (e.code === 'Space') {
            e.preventDefault();
            this.handleAction();
        }
        if (e.code === 'Escape') {
            SceneManager.switchScene(new MenuScene());
        }
    };

    public async init(): Promise<void> {
        // Build layers
        this.addChild(this.bgLayer);
        this.addChild(this.neonLayer);
        this.addChild(this.fxLayer);
        this.addChild(this.uiContainer);

        // Advanced bloom for glowing alchemical runes
        this.bloom = new AdvancedBloomFilter({ threshold: 0.4, bloomScale: 1.2, brightness: 1.0, blur: 5, quality: 4 });
        this.neonLayer.filters = [this.bloom];

        // Draw visuals
        this.drawBackground();
        this.drawCoinSystem();
        this.drawStreakMeter();
        this.drawControls();

        window.addEventListener('keydown', this.onKeyDown);
    }

    public async start(): Promise<void> {}

    public update(delta: number): void {
        this.elapsed += delta / 60;

        // Animate bubbles in beakers
        for (const b of this.flaskBubbles) {
            const flaskIndex = this.streakNodes.indexOf(b.parent);
            // Bubbles flow in filled beakers or the active target beaker
            if (flaskIndex <= this.streak) {
                b.gfx.visible = true;
                b.y -= b.speed * delta * 0.8;
                // Wrap at the surface of the beaker liquid
                if (b.y < -12) {
                    b.y = 22;
                    b.x = (Math.random() - 0.5) * 20;
                }
                b.gfx.position.set(b.x, b.y);
            } else {
                b.gfx.visible = false;
            }
        }
    }

    public resize(_width: number, _height: number): void {}

    public override async destroyScene(): Promise<void> {
        window.removeEventListener('keydown', this.onKeyDown);
        gsap.killTweensOf(this);
        gsap.killTweensOf(this.position);
        gsap.killTweensOf(this.coinContainer);
        gsap.killTweensOf(this.coinContainer.scale);
        gsap.killTweensOf(this.shadow);
        gsap.killTweensOf(this.shadow.scale);
        gsap.killTweensOf(this.banner);
        gsap.killTweensOf(this.banner.scale);
        gsap.killTweensOf(this.flash);
        for (const c of this.coins) gsap.killTweensOf(c);
        for (const s of this.sparkles) gsap.killTweensOf(s);
        for (const node of this.streakNodes) gsap.killTweensOf(node.scale);
        this.neonLayer.filters = [];
        await super.destroyScene();
    }

    // --- coin rendering -------------------------------------------------------------

    private drawCoinSystem(): void {
        const cx = 790;
        const cy = 480;

        // Shadow below coin
        this.shadow = new Graphics();
        this.shadow.position.set(cx, 660);
        // Fuzzy transparent wood-stain shadow
        this.shadow
            .ellipse(0, 0, 110, 22).fill({ color: 0x070301, alpha: 0.65 })
            .ellipse(0, 0, 130, 28).fill({ color: 0x070301, alpha: 0.35 })
            .ellipse(0, 0, 150, 36).fill({ color: 0x070301, alpha: 0.15 });
        this.bgLayer.addChild(this.shadow);

        // Coin container (holds position + altitude)
        this.coinContainer = new Container();
        this.coinContainer.position.set(cx, cy);
        this.neonLayer.addChild(this.coinContainer);

        // Coin inner (holds skew and rotation during flip)
        this.coinInner = new Container();
        this.coinContainer.addChild(this.coinInner);

        // Draw HEADS Face (Sol - Gold Sun)
        const solGrad = new FillGradient({
            type: 'linear', start: { x: 0, y: -110 }, end: { x: 0, y: 110 }, textureSpace: 'local',
            colorStops: [
                { offset: 0, color: 0xfff0b3 },
                { offset: 0.3, color: 0xffcc00 },
                { offset: 0.7, color: 0xd49b00 },
                { offset: 1, color: 0x8a5a00 }
            ]
        });

        this.headsFace = new Graphics();
        this.headsFace.circle(0, 0, 110).fill(solGrad);
        this.headsFace.circle(0, 0, 110).stroke({ width: 6, color: 0x5c3c00 });
        this.headsFace.circle(0, 0, 102).stroke({ width: 1.5, color: 0xffffff, alpha: 0.45 });

        // Draw 8 stylized sun rays
        const rayLen = 96;
        const baseW = 16;
        for (let i = 0; i < 8; i++) {
            const angle = (i * Math.PI) / 4;
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);
            const perpCos = -sin;
            const perpSin = cos;
            
            const tipX = cos * rayLen;
            const tipY = sin * rayLen;
            const leftX = cos * 45 + perpCos * baseW;
            const leftY = sin * 45 + perpSin * baseW;
            const rightX = cos * 45 - perpCos * baseW;
            const rightY = sin * 45 - perpSin * baseW;
            
            this.headsFace.moveTo(leftX, leftY).lineTo(tipX, tipY).lineTo(rightX, rightY).closePath()
                .fill(solGrad).stroke({ width: 2, color: 0x5c3c00 });
        }

        // Sun center face
        this.headsFace.circle(0, 0, 48).fill({ color: 0xffd54f }).stroke({ width: 3, color: 0x5c3c00 });
        // Eyes (sleeping/mystical)
        this.headsFace.moveTo(-20, -8).bezierCurveTo(-14, -14, -6, -14, 0, -8).stroke({ width: 2.5, color: 0x4e2d00 })
            .moveTo(0, -8).bezierCurveTo(6, -14, 14, -14, 20, -8).stroke({ width: 2.5, color: 0x4e2d00 });
        // Nose
        this.headsFace.moveTo(0, -8).lineTo(-3, 10).lineTo(3, 10).stroke({ width: 2.5, color: 0x4e2d00 });
        // Smile
        this.headsFace.moveTo(-12, 18).bezierCurveTo(-6, 26, 6, 26, 12, 18).stroke({ width: 3, color: 0x4e2d00 });

        // Label Sol
        const solLabel = new Text({ text: 'SOL', style: { fontFamily: '"Times New Roman", Georgia, serif', fontSize: 18, fill: 0xfff3cc, fontWeight: 'bold' } });
        solLabel.anchor.set(0.5);
        solLabel.position.set(0, -74);
        this.headsFace.addChild(solLabel);
        this.coinInner.addChild(this.headsFace);

        // Draw TAILS Face (Luna - Silver Moon)
        const lunaGrad = new FillGradient({
            type: 'linear', start: { x: 0, y: -110 }, end: { x: 0, y: 110 }, textureSpace: 'local',
            colorStops: [
                { offset: 0, color: 0xffffff },
                { offset: 0.3, color: 0xe0e0e0 },
                { offset: 0.7, color: 0x9e9e9e },
                { offset: 1, color: 0x5e5e5e }
            ]
        });

        this.tailsFace = new Graphics();
        this.tailsFace.circle(0, 0, 110).fill(lunaGrad);
        this.tailsFace.circle(0, 0, 110).stroke({ width: 6, color: 0x3d3d3d });
        this.tailsFace.circle(0, 0, 102).stroke({ width: 1.5, color: 0xffffff, alpha: 0.5 });
        
        // Midnight sky center
        this.tailsFace.circle(0, 0, 92).fill(0x0a101d);

        // Faint starry sky
        const stars = [
            { x: 35, y: -45, r: 3 }, { x: 65, y: -20, r: 2 }, { x: 48, y: 15, r: 2.5 },
            { x: 58, y: 48, r: 1.5 }, { x: 28, y: 58, r: 2 }, { x: 12, y: -65, r: 1.5 }
        ];
        for (const s of stars) {
            this.tailsFace.circle(s.x, s.y, s.r).fill(0xffffff);
        }

        // Silver crescent moon face
        this.tailsFace.moveTo(-20, -76)
            .bezierCurveTo(42, -66, 42, 66, -20, 76)
            .bezierCurveTo(0, 56, 12, 28, 12, 0)
            .bezierCurveTo(12, -28, 0, -56, -20, -76)
            .fill(lunaGrad)
            .stroke({ width: 2.5, color: 0x3d3d3d });

        // Moon details
        this.tailsFace.moveTo(-2, -16).bezierCurveTo(1, -20, 6, -20, 9, -16).stroke({ width: 2, color: 0x222222 }); // eye
        this.tailsFace.moveTo(7, 4).bezierCurveTo(10, 8, 4, 11, 1, 9).stroke({ width: 2, color: 0x222222 }); // mouth

        // Label Luna
        const lunaLabel = new Text({ text: 'LUNA', style: { fontFamily: '"Times New Roman", Georgia, serif', fontSize: 18, fill: 0xe0e8ff, fontWeight: 'bold' } });
        lunaLabel.anchor.set(0.5);
        lunaLabel.position.set(0, -74);
        this.tailsFace.addChild(lunaLabel);
        
        this.tailsFace.visible = false;
        this.coinInner.addChild(this.tailsFace);
    }

    // --- progress beakers -----------------------------------------------------------

    private drawStreakMeter(): void {
        const barX = 240;
        const barW = 1100;
        const barY = 880;

        // horizontal copper tube connecting beakers
        this.streakBar = new Graphics();
        this.neonLayer.addChild(this.streakBar);

        // Nodes setup
        for (let i = 0; i < MULTIPLIERS.length; i++) {
            const nx = barX + (i / (MULTIPLIERS.length - 1)) * barW;
            const node = new Container();
            node.position.set(nx, barY);
            
            const nodeBg = new Graphics();
            const label = new Text({ 
                text: `${MULTIPLIERS[i]}x`, 
                style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 13, fontWeight: '900', fill: 0xffffff } 
            });
            label.anchor.set(0.5);
            label.position.set(0, -60); // positioned above the beaker

            // Bubble container inside flask
            const bubbleContainer = new Container();
            
            node.addChild(nodeBg, label, bubbleContainer);
            this.neonLayer.addChild(node);
            this.streakNodes.push(node);

            // Seed bubble positions
            for (let b = 0; b < 3; b++) {
                const bgfx = new Graphics().circle(0, 0, 1.5 + Math.random() * 2).fill({ color: 0xffffff, alpha: 0.6 });
                bgfx.position.set((Math.random() - 0.5) * 16, 20 - Math.random() * 25);
                bubbleContainer.addChild(bgfx);
                this.flaskBubbles.push({
                    gfx: bgfx,
                    parent: node,
                    speed: 0.3 + Math.random() * 0.4,
                    x: bgfx.position.x,
                    y: bgfx.position.y
                });
            }
        }
        
        this.updateStreakMeterGfx();
    }

    private updateStreakMeterGfx(): void {
        const barX = 240;
        const barW = 1100;
        const barY = 880;

        // Copper connector pipe
        this.streakBar.clear()
            .roundRect(barX - 10, barY, barW + 20, 6, 3).fill(0x703e1b)
            .roundRect(barX - 10, barY, barW + 20, 6, 3).stroke({ width: 1.5, color: 0x3d1d07 });

        // Redraw flasks
        for (let i = 0; i < MULTIPLIERS.length; i++) {
            const node = this.streakNodes[i];
            const nodeBg = node.getChildAt(0) as Graphics;
            const label = node.getChildAt(1) as Text;
            nodeBg.clear();

            const isAchieved = i < this.streak;
            const isActive = i === this.streak;
            const glassColor = isActive ? (this.activeChoice === 'heads' ? 0xffb300 : 0xff1744) : 0x8a6eb8;
            const glassAlpha = isAchieved || isActive ? 0.95 : 0.4;

            // 1. Draw Glass Flask Outline
            nodeBg
                .roundRect(-7, -22, 14, 16, 3).stroke({ width: 2, color: glassColor, alpha: glassAlpha }) // neck outline
                .circle(0, 8, 22).stroke({ width: 2, color: glassColor, alpha: glassAlpha }); // base outline

            if (isAchieved) {
                // Filled with colored element elixir
                const color = FLASK_COLORS[i];
                nodeBg
                    .circle(0, 8, 19).fill(color)
                    .rect(-5, -12, 10, 20).fill(color)
                    // glass reflection catch
                    .arc(-15, 8, 17, Math.PI * 0.8, Math.PI * 1.2).stroke({ width: 1.5, color: 0xffffff, alpha: 0.4 });
                
                label.style.fill = 0xffe680;
                label.style.fontSize = 13;
                node.scale.set(1);
            } else if (isActive) {
                // Next target flask is active & half-filled with active selection color
                const color = this.activeChoice === 'heads' ? 0xffb300 : 0xff1744;
                nodeBg
                    .circle(0, 8, 19).fill({ color, alpha: 0.45 })
                    .rect(-5, 0, 10, 8).fill({ color, alpha: 0.45 })
                    .arc(-15, 8, 17, Math.PI * 0.8, Math.PI * 1.2).stroke({ width: 1.5, color: 0xffffff, alpha: 0.3 });
                
                label.style.fill = color;
                label.style.fontSize = 15;

                // Target pulse scale
                gsap.killTweensOf(node.scale);
                gsap.fromTo(node.scale, { x: 0.92, y: 0.92 }, { x: 1.12, y: 1.12, duration: 0.9, yoyo: true, repeat: -1, ease: 'sine.inOut' });
            } else {
                // Future empty flask
                nodeBg.arc(-15, 8, 17, Math.PI * 0.8, Math.PI * 1.2).stroke({ width: 1.5, color: 0xffffff, alpha: 0.1 });
                label.style.fill = 0x8a7060;
                label.style.fontSize = 12;
                node.scale.set(1);
                gsap.killTweensOf(node.scale);
            }
        }
    }

    // --- control panel -------------------------------------------------------------

    private drawControls(): void {
        // Side selector HEADS (Sol - Gold Sun)
        const headsBtn = new Container();
        headsBtn.position.set(this.cx - 100, 280);
        headsBtn.eventMode = 'static';
        headsBtn.cursor = 'pointer';
        headsBtn.on('pointerdown', () => this.selectSide('heads'));

        this.headsBtnBg = new Graphics();
        headsBtn.addChild(this.headsBtnBg);

        // Draw heads talisman icon
        const hIcon = new Graphics()
            .circle(0, -20, 34).fill(0x332200)
            .circle(0, -20, 34).stroke({ width: 3, color: 0xffd54f })
            // Sun ray circles
            .circle(0, -20, 16).fill(0xffa000);
        headsBtn.addChild(hIcon);

        this.headsBtnLabel = new Text({ text: 'SOL', style: { fontFamily: '"Times New Roman", Georgia, serif', fontSize: 22, fontWeight: 'bold', fill: 0xffffff } });
        this.headsBtnLabel.anchor.set(0.5);
        this.headsBtnLabel.position.set(0, 36);
        const headsVal = new Text({ text: 'PAY 1.96x', style: { fontFamily: 'Arial', fontSize: 13, fontWeight: 'bold', fill: 0xffd54f } });
        headsVal.anchor.set(0.5);
        headsVal.position.set(0, 60);
        headsBtn.addChild(this.headsBtnLabel, headsVal);
        this.uiContainer.addChild(headsBtn);

        // Side selector TAILS (Luna - Silver Moon)
        const tailsBtn = new Container();
        tailsBtn.position.set(this.cx + 100, 280);
        tailsBtn.eventMode = 'static';
        tailsBtn.cursor = 'pointer';
        tailsBtn.on('pointerdown', () => this.selectSide('tails'));

        this.tailsBtnBg = new Graphics();
        tailsBtn.addChild(this.tailsBtnBg);

        // Draw tails talisman icon
        const tIcon = new Graphics()
            .circle(0, -20, 34).fill(0x111625)
            .circle(0, -20, 34).stroke({ width: 3, color: 0xc0c0c0 })
            // moon crescent overlay
            .arc(4, -20, 16, Math.PI * 0.5, Math.PI * 1.5).stroke({ width: 4.5, color: 0xc0c0c0 });
        tailsBtn.addChild(tIcon);

        this.tailsBtnLabel = new Text({ text: 'LUNA', style: { fontFamily: '"Times New Roman", Georgia, serif', fontSize: 22, fontWeight: 'bold', fill: 0xffffff } });
        this.tailsBtnLabel.anchor.set(0.5);
        this.tailsBtnLabel.position.set(0, 36);
        const tailsVal = new Text({ text: 'PAY 1.96x', style: { fontFamily: 'Arial', fontSize: 13, fontWeight: 'bold', fill: 0xb3e5fc } });
        tailsVal.anchor.set(0.5);
        tailsVal.position.set(0, 60);
        tailsBtn.addChild(this.tailsBtnLabel, tailsVal);
        this.uiContainer.addChild(tailsBtn);

        this.updateSideBtnGfx();

        // Bet Adjustment Row
        const betLabel = new Text({ text: 'TRANSMUTATION CORES', style: { fontFamily: '"Times New Roman", Georgia, serif', fontSize: 14, fontWeight: 'bold', fill: 0xbfa08a } });
        betLabel.anchor.set(0.5);
        betLabel.position.set(this.cx, 440);
        this.uiContainer.addChild(betLabel);

        this.betValueText = new Text({ text: '', style: { fontFamily: '"Times New Roman", Georgia, serif', fontSize: 28, fontWeight: 'bold', fill: 0xffffff } });
        this.betValueText.anchor.set(0.5);
        this.betValueText.position.set(this.cx, 490);
        this.uiContainer.addChild(this.betValueText);

        const minusBtn = new Graphics()
            .roundRect(-24, -24, 48, 48, 12).fill(0x321a0a)
            .roundRect(-24, -24, 48, 48, 12).stroke({ width: 2.5, color: 0x6e3c1a });
        minusBtn.position.set(this.cx - 90, 490);
        const minusText = new Text({ text: '−', style: { fill: 0xffffff, fontSize: 24, fontWeight: 'bold' } });
        minusText.anchor.set(0.5);
        minusBtn.addChild(minusText);
        minusBtn.eventMode = 'static';
        minusBtn.cursor = 'pointer';
        minusBtn.on('pointerdown', () => {
            if (this.phase !== 'idle') return;
            const state = gameStore.getState();
            const idx = BET_STEPS.indexOf(state.bet);
            if (idx > 0) {
                state.setBet(BET_STEPS[idx - 1]);
                this.refreshUI();
            }
        });
        this.uiContainer.addChild(minusBtn);

        const plusBtn = new Graphics()
            .roundRect(-24, -24, 48, 48, 12).fill(0x321a0a)
            .roundRect(-24, -24, 48, 48, 12).stroke({ width: 2.5, color: 0x6e3c1a });
        plusBtn.position.set(this.cx + 90, 490);
        const plusText = new Text({ text: '+', style: { fill: 0xffffff, fontSize: 24, fontWeight: 'bold' } });
        plusText.anchor.set(0.5);
        plusBtn.addChild(plusText);
        plusBtn.eventMode = 'static';
        plusBtn.cursor = 'pointer';
        plusBtn.on('pointerdown', () => {
            if (this.phase !== 'idle') return;
            const state = gameStore.getState();
            const idx = BET_STEPS.indexOf(state.bet);
            if (idx < BET_STEPS.length - 1) {
                state.setBet(BET_STEPS[idx + 1]);
                this.refreshUI();
            }
        });
        this.uiContainer.addChild(plusBtn);

        // PLAY button (Antique brass mechanism)
        this.playButton = new Graphics();
        this.playButton.position.set(this.cx, 730);
        this.playButton.eventMode = 'static';
        this.playButton.cursor = 'pointer';
        this.playButton.on('pointerdown', () => {
            gsap.fromTo(this.playButton.scale, { x: 0.94, y: 0.94 }, { x: 1, y: 1, duration: 0.3, ease: 'back.out(3)' });
            this.handleAction();
        });
        this.playLabel = new Text({ text: '', style: { fontFamily: '"Times New Roman", Georgia, serif', fontSize: 28, fontWeight: 'bold', fill: 0xffffff } });
        this.playLabel.anchor.set(0.5);
        this.playLabel.position.set(0, -14);
        this.playSub = new Text({ text: '', style: { fontFamily: 'Georgia, serif', fontSize: 13, fontStyle: 'italic', fill: 0xffffff } });
        this.playSub.alpha = 0.85;
        this.playSub.anchor.set(0.5);
        this.playSub.position.set(0, 24);
        this.playButton.addChild(this.playLabel, this.playSub);
        this.uiContainer.addChild(this.playButton);

        // CASHOUT button (Philosopher's Stone - glowing red crystal)
        this.cashoutButton = new Graphics();
        this.cashoutButton.position.set(this.cx, 850);
        this.cashoutButton.eventMode = 'static';
        this.cashoutButton.cursor = 'pointer';
        this.cashoutButton.on('pointerdown', () => {
            gsap.fromTo(this.cashoutButton.scale, { x: 0.94, y: 0.94 }, { x: 1, y: 1, duration: 0.3, ease: 'back.out(3)' });
            this.cashout();
        });
        this.cashoutLabel = new Text({ text: '', style: { fontFamily: '"Times New Roman", Georgia, serif', fontSize: 24, fontWeight: 'bold', fill: 0xffffff } });
        this.cashoutLabel.anchor.set(0.5);
        this.cashoutButton.addChild(this.cashoutLabel);
        this.uiContainer.addChild(this.cashoutButton);

        // Information text
        this.infoText = new Text({ text: '', style: { fontFamily: 'Georgia, serif', fontSize: 16, fontStyle: 'italic', fill: 0xc4b7a2 } });
        this.infoText.anchor.set(0.5);
        this.infoText.position.set(this.cx, 180);
        this.uiContainer.addChild(this.infoText);

        // Balance display
        this.balanceText = new Text({ text: '', style: { fontFamily: '"Times New Roman", Georgia, serif', fontSize: 20, fontWeight: 'bold', fill: 0xffe0b3 } });
        this.balanceText.anchor.set(0.5);
        this.balanceText.position.set(this.cx, 985);
        this.uiContainer.addChild(this.balanceText);

        // Setup store binding
        const render = (s: ReturnType<typeof gameStore.getState>): void => {
            this.balanceText.text = `Gold Reserves  $${Math.round(s.balance * 100) / 100}`;
        };
        render(gameStore.getState());
        gameStore.subscribe(render);

        this.refreshUI();
    }

    private updateSideBtnGfx(): void {
        const isHeads = this.activeChoice === 'heads';
        
        // Heads background redraw (Antique leather with gold highlight)
        this.headsBtnBg.clear()
            .roundRect(-80, -90, 160, 180, 24).fill(isHeads ? 0x472d00 : 0x1f140c)
            .roundRect(-80, -90, 160, 180, 24).stroke(isHeads ? { width: 4.5, color: 0xffd54f } : { width: 2, color: 0x47321e });
        this.headsBtnLabel.style.fill = isHeads ? 0xffd54f : 0xc7b79e;

        // Tails background redraw (Antique leather with silver highlight)
        this.tailsBtnBg.clear()
            .roundRect(-80, -90, 160, 180, 24).fill(!isHeads ? 0x1c2438 : 0x1f140c)
            .roundRect(-80, -90, 160, 180, 24).stroke(!isHeads ? { width: 4.5, color: 0xc0c0c0 } : { width: 2, color: 0x47321e });
        this.tailsBtnLabel.style.fill = !isHeads ? 0xb3e5fc : 0xc7b79e;
    }

    private selectSide(side: 'heads' | 'tails'): void {
        if (this.phase === 'flipping') return;
        this.activeChoice = side;
        this.updateSideBtnGfx();
        this.updateStreakMeterGfx();
        this.refreshUI();
    }

    private refreshUI(): void {
        const state = gameStore.getState();
        this.betValueText.text = `$${state.bet.toFixed(2)}`;

        if (this.phase === 'idle') {
            this.infoText.text = `SELECT SOL OR LUNA TALISMAN  ·  STREAK: ${this.streak}`;
            this.stylePlayBtn(0x523013, 0xffd54f, 'TRANSMUTE', `burn $${state.bet}`);
            this.cashoutButton.visible = false;
        } else if (this.phase === 'streak_active') {
            const nextMultiplier = MULTIPLIERS[this.streak];
            const nextWin = state.bet * nextMultiplier;
            this.infoText.text = `ELIXIR STREAK: ${this.streak} TRANSMUTATIONS  ·  RISK FOR ${nextMultiplier}x`;
            this.stylePlayBtn(0x3d0016, 0xff1744, 'TRANSMUTE NEXT', `risk $${this.accumulatedWinnings.toFixed(2)}  →  win $${nextWin.toFixed(2)}`);
            
            // Draw Cash Out button (Philosopher's Stone theme)
            this.cashoutButton.visible = true;
            this.cashoutButton.clear()
                .roundRect(-160, -32, 320, 64, 16).fill(0xbf172a)
                .roundRect(-160, -32, 320, 64, 16).stroke({ width: 2.5, color: 0xff5c6c });
            this.cashoutLabel.text = `BANK ELIXIR $${this.accumulatedWinnings.toFixed(2)}`;
        } else if (this.phase === 'flipping') {
            this.infoText.text = `TRANSMUTING METAL STAGE ${this.streak + 1}...`;
            this.stylePlayBtn(0x1a120c, 0x473223, 'FUSING', 'Tossing Talisman...');
            this.cashoutButton.visible = false;
        }
    }

    private stylePlayBtn(fill: number, edge: number, label: string, sub: string): void {
        this.playButton.clear()
            .roundRect(-160, -48, 320, 96, 20).fill(fill)
            .roundRect(-160, -48, 320, 96, 20).stroke({ width: 3, color: edge });
        this.playLabel.text = label;
        this.playSub.text = sub;
        if (this.playSub.width > 280) this.playSub.scale.set(280 / this.playSub.width);
        else this.playSub.scale.set(1);
    }

    // --- play logic -----------------------------------------------------------------

    private handleAction(): void {
        if (this.rolling) return;

        const state = gameStore.getState();
        
        if (this.phase === 'idle') {
            if (state.balance < state.bet) return;
            state.setBalance(state.balance - state.bet);
            state.setWinAmount(0);
            this.streak = 0;
            this.accumulatedWinnings = state.bet;
        }

        this.phase = 'flipping';
        this.rolling = true;
        this.refreshUI();
        this.banner.visible = false;

        const outcome = Math.random() < 0.5 ? 0 : 1;
        const correctGuess = (this.activeChoice === 'heads' && outcome === 0) ||
                             (this.activeChoice === 'tails' && outcome === 1);

        const startY = 480;
        const peakY = 160;
        const duration = 1.6;

        const tl = gsap.timeline({
            onComplete: () => {
                this.settleOutcome(outcome, correctGuess);
            }
        });

        // Parabolic jump
        tl.to(this.coinContainer, { y: peakY, duration: duration / 2, ease: 'power2.out' })
          .to(this.coinContainer, { y: startY, duration: duration / 2, ease: 'power2.in' });

        // Shadow changes sizes
        gsap.to(this.shadow, { alpha: 0.15, duration: duration / 2, ease: 'power2.out' });
        gsap.to(this.shadow.scale, { x: 0.3, y: 0.3, duration: duration / 2, ease: 'power2.out' });
        
        gsap.to(this.shadow, { alpha: 0.65, delay: duration / 2, duration: duration / 2, ease: 'power2.in' });
        gsap.to(this.shadow.scale, { x: 1.0, y: 1.0, delay: duration / 2, duration: duration / 2, ease: 'power2.in' });

        this.coinFlipProgress = 0;
        const spins = 12 + outcome;

        tl.to(this, {
            coinFlipProgress: spins,
            duration: duration,
            ease: 'power1.inOut',
            onUpdate: () => {
                const progress = this.coinFlipProgress;
                const scaleY = Math.cos(progress * Math.PI);
                this.coinInner.scale.y = scaleY;

                // Tumble parameters
                this.coinInner.rotation = progress * Math.PI * 0.13;
                this.coinInner.skew.x = Math.sin(progress * Math.PI * 0.5) * 0.16;

                const facesHeads = scaleY >= 0;
                this.headsFace.visible = facesHeads;
                this.tailsFace.visible = !facesHeads;

                if (facesHeads) {
                    this.headsFace.scale.y = 1;
                } else {
                    this.tailsFace.scale.y = -1;
                }
            }
        }, 0);
    }

    private settleOutcome(outcome: number, win: boolean): void {
        this.rolling = false;

        this.coinInner.rotation = 0;
        this.coinInner.skew.x = 0;
        this.coinInner.scale.y = outcome === 0 ? 1 : -1;
        this.headsFace.visible = (outcome === 0);
        this.tailsFace.visible = (outcome === 1);
        if (outcome === 0) this.headsFace.scale.y = 1;
        else this.tailsFace.scale.y = -1;

        // heavy drop bounce
        gsap.killTweensOf(this.coinContainer.scale);
        gsap.timeline()
            .fromTo(this.coinContainer.scale, { x: 1.25, y: 0.75 }, { x: 1.0, y: 1.0, duration: 0.65, ease: 'elastic.out(1.1, 0.4)' });

        const state = gameStore.getState();

        this.history.unshift({ resultSide: outcome, win });
        if (this.history.length > 10) this.history.pop();
        this.renderHistory();

        if (win) {
            this.streak += 1;
            const mult = MULTIPLIERS[this.streak - 1];
            this.accumulatedWinnings = state.bet * mult;

            // Alchemical vapor particles matching elixir flask
            const vaporColor = FLASK_COLORS[this.streak - 1];
            this.sparkleBurst(790, 480, vaporColor);
            
            if (this.streak >= MULTIPLIERS.length) {
                this.showBanner('PHILOSOPHER STONE!', 0xffd700);
                this.cashout();
            } else {
                this.phase = 'streak_active';
                this.showBanner(`FUSED! STREAK ${this.streak}`, vaporColor);
            }
        } else {
            // Loss
            this.streak = 0;
            this.accumulatedWinnings = 0;
            this.phase = 'idle';

            // Soot flash + camera rumble
            this.triggerLossEffects();
            this.showBanner(`IMPURE ELIXIR`, 0xa02000);
        }

        this.updateStreakMeterGfx();
        this.refreshUI();
    }

    private cashout(): void {
        if (this.streak === 0 || this.phase === 'flipping') return;

        const state = gameStore.getState();
        const payout = Math.round(this.accumulatedWinnings * 100) / 100;
        
        state.setBalance(Math.round((state.balance + payout) * 100) / 100);
        state.setWinAmount(payout);

        // Gold coin eruption
        this.coinBurst(790, 480, Math.min(45, 12 + this.streak * 3));
        this.showBanner(`GOLD +$${payout.toFixed(2)}`, 0xffb300);

        this.streak = 0;
        this.accumulatedWinnings = 0;
        this.phase = 'idle';

        this.updateStreakMeterGfx();
        this.refreshUI();
    }

    // --- visual effects -------------------------------------------------------------

    private sparkleBurst(x: number, y: number, color: number): void {
        const count = 35;
        for (let i = 0; i < count; i++) {
            let s = this.sparkles.find((g) => !g.visible);
            if (!s) {
                s = new Graphics();
                s.visible = false;
                this.fxLayer.addChild(s);
                this.sparkles.push(s);
            }
            const size = 6 + Math.random() * 8;
            s.clear()
                .circle(0, 0, size).fill({ color })
                .circle(0, 0, size + 2).stroke({ width: 1.5, color: 0xffffff, alpha: 0.5 });
            
            s.position.set(x, y);
            s.alpha = 1;
            s.visible = true;

            const angle = Math.random() * Math.PI * 2;
            const dist = 100 + Math.random() * 240;
            const speed = 0.9 + Math.random() * 0.7;

            gsap.killTweensOf(s);
            gsap.to(s, {
                x: x + Math.cos(angle) * dist,
                y: y + Math.sin(angle) * dist,
                alpha: 0,
                duration: speed,
                ease: 'power2.out',
                onComplete: () => { s.visible = false; }
            });
        }
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
            const size = 9 + Math.random() * 8;
            c.clear()
                .ellipse(0, 0, size, size * 0.85).fill({ color: 0xffd700 })
                .ellipse(0, 0, size, size * 0.85).stroke({ width: 2, color: 0xcc8800 })
                .circle(-size/3, -size/3, size/4).fill({ color: 0xffffff, alpha: 0.6 });
            
            c.position.set(x, y);
            c.alpha = 1;
            c.visible = true;

            // Arc spray
            const angle = -Math.PI / 4 + (Math.random() - 0.5) * 0.7;
            const speed = 450 + Math.random() * 380;

            gsap.killTweensOf(c);
            gsap.killTweensOf(c.scale);
            gsap.to(c, {
                x: x + Math.cos(angle) * speed * 1.3,
                y: y + Math.sin(angle) * speed * 1.3 + 300,
                alpha: 0,
                duration: 1.3 + Math.random() * 0.5,
                ease: 'power1.out',
                onComplete: () => { c.visible = false; }
            });
            gsap.to(c.scale, { x: 0.2, duration: 0.16, yoyo: true, repeat: 8, ease: 'sine.inOut' });
        }
    }

    private triggerLossEffects(): void {
        // Red flash (soot fire)
        gsap.killTweensOf(this.flash);
        gsap.timeline()
            .set(this.flash, { alpha: 0.35 })
            .to(this.flash, { alpha: 0, duration: 0.7, ease: 'power2.out' });

        // screen rumble
        gsap.killTweensOf(this.position);
        gsap.timeline()
            .to(this, { x: -16, duration: 0.05, ease: 'sine.inOut' })
            .to(this, { x: 16, duration: 0.05, ease: 'sine.inOut' })
            .to(this, { x: -10, duration: 0.05, ease: 'sine.inOut' })
            .to(this, { x: 10, duration: 0.05, ease: 'sine.inOut' })
            .to(this, { x: -5, duration: 0.05, ease: 'sine.inOut' })
            .to(this, { x: 5, duration: 0.05, ease: 'sine.inOut' })
            .to(this, { x: 0, duration: 0.05, ease: 'sine.inOut' });
            
        // soot smoke puff (using sparkles pool but with black soot colors)
        this.sparkleBurst(790, 480, 0x241a15);
        this.sparkleBurst(790, 480, 0x0f0b08);
    }

    private showBanner(msg: string, tint: number): void {
        this.banner.text = msg;
        this.banner.style.fill = tint;
        this.banner.style.stroke = { color: 0x05030a, width: 12 };
        this.banner.style.dropShadow = { color: tint, blur: 26, distance: 0, alpha: 0.85, angle: Math.PI / 6 };
        this.banner.alpha = 1;
        this.banner.visible = true;

        gsap.killTweensOf(this.banner);
        gsap.killTweensOf(this.banner.scale);
        gsap.fromTo(this.banner.scale, { x: 0.3, y: 0.3 }, { x: 1, y: 1, duration: 0.45, ease: 'back.out(2.2)' });
        gsap.to(this.banner, { alpha: 0, duration: 0.5, delay: 1.3, onComplete: () => { this.banner.visible = false; } });
    }

    private renderHistory(): void {
        this.historyRow.removeChildren().forEach((c) => c.destroy({ children: true }));
        
        this.history.forEach((h, i) => {
            const chip = new Container();
            const color = h.win ? 0xffd54f : 0xff1744; // gold or silver/pink
            const textVal = h.resultSide === 0 ? 'SOL' : 'LUNA';
            const bgColor = h.win ? 0x3d2700 : 0x3d0016;
            
            const bgGfx = new Graphics()
                .roundRect(-42, -18, 84, 36, 18).fill({ color: 0x000000, alpha: 0.45 })
                .roundRect(-44, -20, 88, 40, 20).fill(new FillGradient({
                    type: 'linear', start: { x: 0, y: 0 }, end: { x: 0, y: 1 }, textureSpace: 'local',
                    colorStops: [
                        { offset: 0, color: 0x321a0a },
                        { offset: 0.5, color: bgColor },
                        { offset: 1, color: 0x1f0c04 },
                    ],
                }))
                .roundRect(-44, -20, 88, 40, 20).stroke({ width: 2.5, color })
                .roundRect(-40, -16, 80, 32, 16).stroke({ width: 1, color, alpha: 0.3 });

            const label = new Text({
                text: textVal,
                style: {
                    fontFamily: '"Times New Roman", Georgia, serif', fontSize: 13, fontWeight: '900',
                    fill: color,
                    dropShadow: { color, blur: 6, distance: 0, alpha: 0.5, angle: Math.PI / 6 }
                }
            });
            label.anchor.set(0.5);

            chip.addChild(bgGfx, label);
            chip.position.set(i * 96, 0);

            if (i === 0) {
                gsap.fromTo(chip.scale, { x: 0.3, y: 0.3 }, { x: 1, y: 1, duration: 0.3, ease: 'back.out(2.5)' });
            }

            this.historyRow.addChild(chip);
        });
    }

    // --- presentation background ----------------------------------------------------

    private drawBackground(): void {
        const W = GameConfig.width;
        const H = GameConfig.height;

        // Rich mahogany wood plank background
        const bgGfx = new Graphics();
        bgGfx.rect(0, 0, W, H).fill(0x1c0f07);

        const plankW = 240;
        for (let x = 0; x < W; x += plankW) {
            const c = [0x1f1107, 0x180d05, 0x251408][(x / plankW) % 3];
            bgGfx.rect(x, 0, plankW - 8, H).fill(c);
            bgGfx.rect(x + plankW - 8, 0, 8, H).fill(0x070301); // gap

            // Faint grain lines
            bgGfx.moveTo(x + 30, 0).lineTo(x + 30, H).stroke({ width: 1, color: 0x2d1b0d, alpha: 0.2 })
                 .moveTo(x + 100, 0).lineTo(x + 100, H).stroke({ width: 1.5, color: 0x110702, alpha: 0.35 })
                 .moveTo(x + 180, 0).lineTo(x + 180, H).stroke({ width: 1, color: 0x2e1a0b, alpha: 0.25 });
        }
        
        // Engraved amber alchemical runes
        bgGfx.circle(160, 600, 48).stroke({ width: 2, color: 0xff8800, alpha: 0.15 })
             .circle(160, 600, 40).stroke({ width: 1, color: 0xff8800, alpha: 0.1 })
             .circle(1360, 240, 60).stroke({ width: 2, color: 0xffaa00, alpha: 0.15 })
             .circle(1360, 240, 48).stroke({ width: 1, color: 0xffaa00, alpha: 0.1 });
        
        // astrological triangle glyph left
        bgGfx.moveTo(160, 565).lineTo(195, 620).lineTo(125, 620).closePath().stroke({ width: 1.5, color: 0xff8800, alpha: 0.15 });

        this.bgLayer.addChild(bgGfx);

        // Soft candlelit highlights
        const centerGlow = new Graphics().ellipse(790, 480, 560, 400).fill(new FillGradient({
            type: 'radial', center: { x: 0.5, y: 0.5 }, innerRadius: 0, outerCenter: { x: 0.5, y: 0.5 }, outerRadius: 0.5, textureSpace: 'local',
            colorStops: [
                { offset: 0, color: 'rgba(255, 140, 0, 0.15)' },
                { offset: 1, color: 'rgba(255, 140, 0, 0)' }
            ]
        }));
        this.bgLayer.addChild(centerGlow);

        // Ornate Title
        const title = new Text({
            text: 'ALCHEMY FLIP',
            style: {
                fontFamily: '"Times New Roman", Georgia, serif', fontSize: 44, fontWeight: 'bold', letterSpacing: 6,
                fill: 0xffd54f, stroke: { color: 0x211100, width: 6 },
                dropShadow: { color: 0xffa000, blur: 20, distance: 0, alpha: 0.75, angle: Math.PI / 6 },
            },
        });
        title.anchor.set(0, 0.5);
        title.position.set(44, 52);
        this.bgLayer.addChild(title);

        // Banner text overlay (wins, cashouts)
        this.banner = new Text({
            text: '',
            style: {
                fontFamily: '"Times New Roman", Georgia, serif', fontSize: 68, fontWeight: 'bold',
                fill: 0xffffff, stroke: { color: 0x000000, width: 14 }
            }
        });
        this.banner.anchor.set(0.5);
        this.banner.position.set(790, 480);
        this.banner.visible = false;
        this.uiContainer.addChild(this.banner);

        // Flash screen graphic (soot burst)
        this.flash = new Graphics().rect(0, 0, W, H).fill(0x5c1508);
        this.flash.alpha = 0;
        this.bgLayer.addChild(this.flash);

        // Menu button
        const back = new Text({ text: '‹ MENU', style: { fill: 0xffd54f, fontSize: 26, fontWeight: 'bold' } });
        back.position.set(44, 86);
        back.eventMode = 'static';
        back.cursor = 'pointer';
        back.on('pointerdown', () => SceneManager.switchScene(new MenuScene()));
        // (back-to-menu removed) this.uiContainer.addChild(back);

        // Bottom instruction hint
        const hint = new Text({ 
            text: 'predict sol or luna talismans · fill elemental flasks to progress · bank elixir at any stage (space to transmute)', 
            style: { fill: 0xbfa085, fontSize: 18, fontStyle: 'italic' } 
        });
        hint.anchor.set(0.5);
        hint.position.set(790, H - 16);
        this.uiContainer.addChild(hint);

        // History chips container
        this.historyRow = new Container();
        this.historyRow.position.set(580, 52);
        this.uiContainer.addChild(this.historyRow);
    }
}
