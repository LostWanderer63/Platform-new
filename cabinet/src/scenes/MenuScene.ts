import { Text, Container, Graphics, FillGradient } from 'pixi.js';
import { gsap } from 'gsap';
import { BaseScene } from './BaseScene';
import { SceneManager } from '../managers/SceneManager';
import { GameScene } from './GameScene';
import { GameScene2 } from './GameScene2';
import { GameScene3 } from './GameScene3';
import { GameScene4 } from './GameScene4';
import { GameScene5 } from './GameScene5';
import { GameScene6 } from './GameScene6';
import { GameScene7 } from './GameScene7';
import { GameScene8 } from './GameScene8';
import { GameScene9 } from './GameScene9';
import { GameScene10 } from './GameScene10';
import { GameScene11 } from './GameScene11';
import { GameScene12 } from './GameScene12';
import { GameScene13 } from './GameScene13';
import { GameScene14 } from './GameScene14';
import { GameScene15 } from './GameScene15';
import { GameScene16 } from './GameScene16';
import { GameScene17 } from './GameScene17';
import { GameScene18 } from './GameScene18';
import { GameScene19 } from './GameScene19';
import { GameScene20 } from './GameScene20';
import { GameScene21 } from './GameScene21';
import { GameScene22 } from './GameScene22';
import { GameScene23 } from './GameScene23';
import { GameConfig } from '../config/GameConfig';

interface SlotChoice {
    readonly title: string;
    readonly subtitle: string;
    readonly icon: string;
    readonly color: number;
    readonly accent: number;
    readonly make: () => BaseScene;
}

export const SLOTS: readonly SlotChoice[] = [
    { title: 'WRATH OF OLYMPUS', subtitle: '5×4 · Greek gods · reels', icon: '⚡', color: 0x1b2a6b, accent: 0xffe082, make: () => new GameScene() },
    { title: 'LUCKY 7s', subtitle: '3×3 · Vegas cabinet + handle', icon: '7', color: 0xb71c1c, accent: 0xffd54f, make: () => new GameScene2() },
    { title: 'GEMSTORM', subtitle: '6×5 · tumble / cascade', icon: '◆', color: 0x00695c, accent: 0x80deea, make: () => new GameScene3() },
    { title: "PHARAOH'S FORTUNE", subtitle: '5×3 · Egyptian riches', icon: '☥', color: 0x5d4015, accent: 0xffcc66, make: () => new GameScene4() },
    { title: 'NEON PLINKO', subtitle: 'plinko · drop & multiply', icon: '◉', color: 0x0e3a5c, accent: 0x6fe9ff, make: () => new GameScene5() },
    { title: 'ROCKET CRASH', subtitle: 'crash · cash out in time', icon: '▲', color: 0x4a1024, accent: 0xff5a7e, make: () => new GameScene6() },
    { title: 'CRYSTAL MINES', subtitle: 'mines · gems vs bombs', icon: '✦', color: 0x0d3320, accent: 0x7dffb0, make: () => new GameScene7() },
    { title: 'ROYAL BLACKJACK', subtitle: '21 · beat the dealer', icon: '♠', color: 0x0c3a22, accent: 0xd4af37, make: () => new GameScene8() },
    { title: 'DRAGON TOWER', subtitle: 'tower climb · up to 496×', icon: '♜', color: 0x3a1408, accent: 0xff8a3d, make: () => new GameScene9() },
    { title: 'LUCKY DICE', subtitle: 'dice · pick your odds', icon: '⚄', color: 0x0c2e16, accent: 0x5be32a, make: () => new GameScene10() },
    { title: 'NEON KENO', subtitle: 'keno · live ball machine', icon: '◍', color: 0x0c2034, accent: 0x6fe9ff, make: () => new GameScene11() },
    { title: 'CYBER COIN FLIP', subtitle: '50/50 flip · streak multi', icon: '◎', color: 0x240e32, accent: 0x00ffcc, make: () => new GameScene12() },
    { title: 'JACKS OR BETTER', subtitle: 'video poker · hold & draw', icon: '♣', color: 0x16336b, accent: 0xffd24a, make: () => new GameScene13() },
    { title: 'FORTUNE COINS', subtitle: '5×3 · hold & win respins', icon: '⊛', color: 0x5e100c, accent: 0xffd54f, make: () => new GameScene14() },
    { title: 'SUGAR STORM', subtitle: '6×5 · tumble · bomb multi', icon: '❤', color: 0x8a2a5a, accent: 0xffd23d, make: () => new GameScene15() },
    { title: 'TURBO DERBY', subtitle: 'race betting · live odds', icon: '⚑', color: 0x14323a, accent: 0x4ade6a, make: () => new GameScene16() },
    { title: 'LUCKY SCRATCH', subtitle: 'scratch cards · match 3', icon: '✶', color: 0x4a0c30, accent: 0xffd23d, make: () => new GameScene17() },
    { title: 'REEF HUNTER', subtitle: 'fish shooter · aim & fire', icon: '❥', color: 0x073a5e, accent: 0x6fe9ff, make: () => new GameScene18() },
    { title: 'DRAGON SIC BO', subtitle: '3-dice table · multi-bet', icon: '⚅', color: 0x0a4f2e, accent: 0xffd23d, make: () => new GameScene19() },
    { title: 'ROYAL MEGAWAYS', subtitle: '6 reels · 117,649 ways · cascades', icon: '♛', color: 0x3a1466, accent: 0xc9a8ff, make: () => new GameScene20() },
    { title: 'BINGO BLITZ', subtitle: '90-ball · live blower · full house', icon: '◍', color: 0x1a2450, accent: 0xff8a2a, make: () => new GameScene21() },
    { title: 'JUNGLE SWING', subtitle: 'rope climb · cash out before you fall', icon: '🐵', color: 0x14501e, accent: 0xffe082, make: () => new GameScene22() },
    { title: 'ROYAL BACCARAT', subtitle: 'player · banker · tie · pairs', icon: '♦', color: 0x0e5a38, accent: 0xffd23d, make: () => new GameScene23() },
];

const ch = (n: number): number => (n < 0 ? 0 : n > 255 ? 255 : n | 0);
const rgb = (c: number): [number, number, number] => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
const hex = (r: number, g: number, b: number): number => (ch(r) << 16) | (ch(g) << 8) | ch(b);
const lighten = (c: number, t: number): number => { const [r, g, b] = rgb(c); return hex(r + (255 - r) * t, g + (255 - g) * t, b + (255 - b) * t); };
const darken = (c: number, t: number): number => { const [r, g, b] = rgb(c); return hex(r * (1 - t), g * (1 - t), b * (1 - t)); };

export class MenuScene extends BaseScene {
    /** Objects with live gsap tweens (card scale / glow / chevron), killed on exit. */
    private readonly animated: object[] = [];

    constructor() {
        super();
        const W = GameConfig.width;
        const H = GameConfig.height;

        // Deep gradient backdrop + faint vignette.
        this.addChild(new Graphics().rect(0, 0, W, H).fill(new FillGradient({
            type: 'linear', start: { x: 0, y: 0 }, end: { x: 0, y: 1 }, textureSpace: 'local',
            colorStops: [{ offset: 0, color: 0x141426 }, { offset: 0.5, color: 0x0c0c1a }, { offset: 1, color: 0x07070f }],
        })));
        this.addChild(new Graphics().ellipse(W / 2, 120, W * 0.55, 340).fill(new FillGradient({
            type: 'radial', center: { x: 0.5, y: 0.5 }, innerRadius: 0, outerCenter: { x: 0.5, y: 0.5 }, outerRadius: 0.5, textureSpace: 'local',
            colorStops: [{ offset: 0, color: 'rgba(255,215,0,0.10)' }, { offset: 1, color: 'rgba(255,215,0,0)' }],
        })));

        const title = new Text({
            text: 'SELECT A GAME',
            style: {
                fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 70, fontWeight: '900', letterSpacing: 6,
                fill: 0xffd700, stroke: { color: 0x2a2208, width: 7 },
                dropShadow: { color: 0xffd700, blur: 24, distance: 0, alpha: 0.5 },
            },
        });
        title.anchor.set(0.5);
        title.position.set(W / 2, 78);
        this.addChild(title);

        const sub = new Text({
            text: `${SLOTS.length} GAMES  ·  TAP TO PLAY`,
            style: { fontFamily: 'Arial, sans-serif', fontSize: 22, fontWeight: 'bold', letterSpacing: 4, fill: 0x8a8ab0 },
        });
        sub.anchor.set(0.5);
        sub.position.set(W / 2, 130);
        this.addChild(sub);

        // 4-column grid; a short last row is centred.
        const cols = 4;
        const gap = 26;
        const sideMargin = 60;
        const topMargin = 184;
        const cardW = (W - 2 * sideMargin - gap * (cols - 1)) / cols;
        const rows = Math.ceil(SLOTS.length / cols);
        const cardH = Math.min(168, (H - topMargin - 40 - gap * (rows - 1)) / rows);
        const startX = sideMargin;

        SLOTS.forEach((slot, i) => {
            const row = Math.floor(i / cols);
            const inRow = Math.min(cols, SLOTS.length - row * cols);
            const rowOffset = ((cols - inRow) * (cardW + gap)) / 2;
            const x = startX + rowOffset + (i % cols) * (cardW + gap);
            const y = topMargin + row * (cardH + gap);
            this.addChild(this.buildCard(slot, i, x, y, cardW, cardH));
        });
    }

    private buildCard(slot: SlotChoice, index: number, x: number, y: number, w: number, h: number): Container {
        const card = new Container();
        card.position.set(x, y);
        // Pivot at centre so hover-scale grows from the middle.
        card.pivot.set(w / 2, h / 2);
        card.position.set(x + w / 2, y + h / 2);

        const r = 22;

        // Outer accent glow (revealed on hover).
        const glow = new Graphics()
            .roundRect(-7, -7, w + 14, h + 14, r + 6).fill({ color: slot.accent });
        glow.blendMode = 'add';
        glow.alpha = 0;
        card.addChild(glow);

        // Panel: vertical gradient + drop shadow + accent border.
        const panel = new Graphics();
        const drawPanel = (hover: boolean): void => {
            panel.clear()
                .roundRect(0, 8, w, h, r).fill({ color: 0x000000, alpha: 0.45 })   // shadow
                .roundRect(0, 0, w, h, r).fill(new FillGradient({
                    type: 'linear', start: { x: 0, y: 0 }, end: { x: 0, y: 1 }, textureSpace: 'local',
                    colorStops: [
                        { offset: 0, color: lighten(slot.color, hover ? 0.34 : 0.22) },
                        { offset: 0.55, color: slot.color },
                        { offset: 1, color: darken(slot.color, 0.4) },
                    ],
                }))
                .roundRect(0, 0, w, h, r).stroke({ width: hover ? 4 : 2.5, color: slot.accent, alpha: hover ? 1 : 0.85 });
            // Top sheen.
            panel.roundRect(6, 6, w - 12, h * 0.4, r * 0.7).fill({ color: 0xffffff, alpha: 0.07 });
        };
        card.addChild(panel);

        // Number badge, left.
        const bx = 24 + 50;
        const by = h / 2;
        const badge = new Graphics()
            .circle(bx, by + 3, 48).fill({ color: 0x000000, alpha: 0.35 })
            .circle(bx, by, 48).fill(new FillGradient({
                type: 'radial', center: { x: 0.4, y: 0.35 }, innerRadius: 0.05, outerCenter: { x: 0.5, y: 0.5 }, outerRadius: 0.6, textureSpace: 'local',
                colorStops: [{ offset: 0, color: lighten(slot.accent, 0.3) }, { offset: 1, color: darken(slot.accent, 0.25) }],
            }))
            .circle(bx, by, 48).stroke({ width: 3, color: lighten(slot.accent, 0.4) })
            .circle(bx, by, 40).stroke({ width: 1.5, color: 0xffffff, alpha: 0.3 });
        card.addChild(badge);

        const glyph = new Text({ text: slot.icon, style: { fontFamily: 'Georgia, serif', fontSize: 40, fontWeight: '900', fill: darken(slot.color, 0.1) } });
        glyph.anchor.set(0.5);
        glyph.position.set(bx, by - 12);
        if (glyph.width > 56) glyph.scale.set(56 / glyph.width);
        const num = new Text({ text: `SLOT ${index + 1}`, style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 13, fontWeight: '900', letterSpacing: 1, fill: darken(slot.color, 0.2) } });
        num.anchor.set(0.5);
        num.position.set(bx, by + 26);
        card.addChild(glyph, num);

        // Title + subtitle, right of the badge.
        const textX = 24 + 100 + 18;
        const maxTextW = w - textX - 22;
        const title = new Text({ text: slot.title, style: { fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 30, fontWeight: '900', fill: slot.accent, stroke: { color: darken(slot.color, 0.6), width: 3 } } });
        title.anchor.set(0, 0.5);
        title.position.set(textX, by - 18);
        if (title.width > maxTextW) title.scale.set(maxTextW / title.width);

        const sub = new Text({ text: slot.subtitle, style: { fontFamily: 'Arial, sans-serif', fontSize: 18, fontWeight: 'bold', fill: 0xe6e6f2 } });
        sub.anchor.set(0, 0.5);
        sub.position.set(textX, by + 20);
        if (sub.width > maxTextW) sub.scale.set(maxTextW / sub.width);

        // PLAY chevron.
        const play = new Text({ text: '▶', style: { fontFamily: 'Arial, sans-serif', fontSize: 20, fill: slot.accent } });
        play.anchor.set(0.5);
        play.position.set(w - 26, by);
        play.alpha = 0.55;
        card.addChild(title, sub, play);

        drawPanel(false);

        card.eventMode = 'static';
        card.cursor = 'pointer';
        const setHover = (hover: boolean): void => {
            drawPanel(hover);
            gsap.killTweensOf(card.scale);
            gsap.killTweensOf(glow);
            gsap.killTweensOf(play);
            gsap.to(card.scale, { x: hover ? 1.04 : 1, y: hover ? 1.04 : 1, duration: 0.22, ease: 'power2.out' });
            gsap.to(glow, { alpha: hover ? 0.32 : 0, duration: 0.22 });
            gsap.to(play, { alpha: hover ? 1 : 0.55, x: hover ? w - 20 : w - 26, duration: 0.22 });
        };
        this.animated.push(card.scale, glow, play);
        card.on('pointerover', () => setHover(true));
        card.on('pointerout', () => setHover(false));
        card.on('pointerdown', () => {
            gsap.fromTo(card.scale, { x: 0.97, y: 0.97 }, { x: 1, y: 1, duration: 0.18, ease: 'power2.out',
                onComplete: () => SceneManager.switchScene(slot.make()) });
        });
        return card;
    }

    public override async destroyScene(): Promise<void> {
        for (const a of this.animated) gsap.killTweensOf(a);
        await super.destroyScene();
    }

    public async init(): Promise<void> {}
    public async start(): Promise<void> {}
    public update(_delta: number): void {}
    public resize(_width: number, _height: number): void {}
}
