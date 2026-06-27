/**
 * SymbolArtVegas (Slot 2 tile art)
 * --------------------------------
 * Retro one-armed-bandit tiles: a brushed-chrome bezel, a neon accent ring in
 * the symbol's colour, and a dark glossy panel. Deliberately different from the
 * Olympus marble/gold tiles. Drop-in real PNGs still override these.
 */
import { Container, Graphics, Text, BlurFilter } from 'pixi.js';
import type { SymbolDefinition } from './ReelConfig';

const ch = (n: number): number => (n < 0 ? 0 : n > 255 ? 255 : n | 0);
const rgb = (c: number): [number, number, number] => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
const hex = (r: number, g: number, b: number): number => (ch(r) << 16) | (ch(g) << 8) | ch(b);
const lighten = (c: number, t: number): number => { const [r, g, b] = rgb(c); return hex(r + (255 - r) * t, g + (255 - g) * t, b + (255 - b) * t); };
const darken = (c: number, t: number): number => { const [r, g, b] = rgb(c); return hex(r * (1 - t), g * (1 - t), b * (1 - t)); };

function P(coords: number[], cx: number, cy: number, s: number): number[] {
    const out = new Array<number>(coords.length);
    for (let i = 0; i < coords.length; i += 2) { out[i] = cx + coords[i] * s; out[i + 1] = cy + coords[i + 1] * s; }
    return out;
}

function bigText(node: Container, text: string, cx: number, cy: number, size: number, fill: number): void {
    const t = new Text({
        text,
        style: {
            fontFamily: '"Arial Black", Impact, sans-serif', fontSize: size, fontWeight: '900',
            letterSpacing: text.length > 2 ? 1 : 4, fill,
            stroke: { color: 0x10131c, width: Math.max(3, size * 0.09) },
            dropShadow: { color: 0x000000, blur: 4, distance: 3, alpha: 0.5 },
        },
    });
    t.anchor.set(0.5);
    t.position.set(cx, cy);
    const maxW = size * (text.length > 2 ? 3.4 : 2);
    if (t.width > maxW) t.scale.set(maxW / t.width);
    node.addChild(t);
}

function paintEmblem(node: Container, g: Graphics, emblem: string, accent: number, cx: number, cy: number, s: number, label: string): void {
    switch (emblem) {
        case 'cherry': {
            g.moveTo(cx + 0.02 * s, cy - 0.46 * s)
                .bezierCurveTo(cx - 0.2 * s, cy - 0.3 * s, cx - 0.34 * s, cy + 0.06 * s, cx - 0.24 * s, cy + 0.18 * s)
                .moveTo(cx + 0.02 * s, cy - 0.46 * s)
                .bezierCurveTo(cx + 0.24 * s, cy - 0.28 * s, cx + 0.34 * s, cy + 0.08 * s, cx + 0.26 * s, cy + 0.2 * s)
                .stroke({ width: s * 0.05, color: 0x2f7d32 });
            g.ellipse(cx + 0.12 * s, cy - 0.44 * s, 0.14 * s, 0.07 * s).fill({ color: 0x43a047 }); // leaf
            g.circle(cx - 0.22 * s, cy + 0.3 * s, 0.2 * s).fill({ color: 0xd32f2f })
                .circle(cx - 0.28 * s, cy + 0.24 * s, 0.05 * s).fill({ color: 0xffb3ba });
            g.circle(cx + 0.24 * s, cy + 0.32 * s, 0.2 * s).fill({ color: 0xe53935 })
                .circle(cx + 0.18 * s, cy + 0.26 * s, 0.05 * s).fill({ color: 0xffb3ba });
            break;
        }
        case 'bell':
            g.poly(P([-0.32, 0.28, -0.26, 0.0, -0.16, -0.26, 0.16, -0.26, 0.26, 0.0, 0.32, 0.28], cx, cy, s)).fill({ color: accent });
            g.rect(cx - 0.36 * s, cy + 0.26 * s, 0.72 * s, 0.08 * s).fill({ color: darken(accent, 0.25) });
            g.circle(cx, cy + 0.42 * s, 0.08 * s).fill({ color: darken(accent, 0.3) });
            g.circle(cx, cy - 0.3 * s, 0.06 * s).fill({ color: darken(accent, 0.2) });
            g.ellipse(cx - 0.1 * s, cy - 0.05 * s, 0.05 * s, 0.16 * s).fill({ color: lighten(accent, 0.4), alpha: 0.6 }); // sheen
            break;
        case 'coin':
            g.circle(cx, cy, 0.42 * s).fill({ color: darken(accent, 0.15) })
                .circle(cx, cy, 0.42 * s).stroke({ width: s * 0.05, color: lighten(accent, 0.3) })
                .circle(cx, cy, 0.32 * s).stroke({ width: s * 0.03, color: darken(accent, 0.35) });
            bigText(node, '$', cx, cy + 0.02 * s, s * 0.5, darken(accent, 0.45));
            break;
        case 'diamond':
            g.poly(P([0, -0.44, -0.4, -0.1, 0, 0.46, 0.4, -0.1], cx, cy, s)).fill({ color: accent });
            g.poly(P([0, -0.44, -0.4, -0.1, 0, -0.1], cx, cy, s)).fill({ color: lighten(accent, 0.45) });
            g.poly(P([0, -0.44, 0.4, -0.1, 0, -0.1], cx, cy, s)).fill({ color: lighten(accent, 0.2) });
            g.moveTo(cx - 0.4 * s, cy - 0.1 * s).lineTo(cx + 0.4 * s, cy - 0.1 * s)
                .moveTo(cx, cy - 0.44 * s).lineTo(cx, cy + 0.46 * s)
                .stroke({ width: s * 0.02, color: 0xffffff, alpha: 0.5 });
            break;
        case 'bar':
            for (let i = 0; i < 3; i++) {
                const y = cy + (i - 1) * 0.26 * s;
                g.roundRect(cx - 0.4 * s, y - 0.1 * s, 0.8 * s, 0.2 * s, 0.05 * s).fill({ color: accent })
                    .roundRect(cx - 0.4 * s, y - 0.1 * s, 0.8 * s, 0.2 * s, 0.05 * s).stroke({ width: s * 0.015, color: darken(accent, 0.4) });
            }
            bigText(node, 'BAR', cx, cy, s * 0.16, 0x10131c);
            break;
        case 'seven':
            bigText(node, '7', cx, cy, s * 0.95, accent);
            break;
        case 'wild':
            // star burst behind the word
            {
                const pts: number[] = [];
                for (let i = 0; i < 16; i++) {
                    const r = i % 2 === 0 ? 0.5 * s : 0.24 * s;
                    const a = (Math.PI * i) / 8 - Math.PI / 2;
                    pts.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
                }
                g.poly(pts).fill({ color: darken(accent, 0.15) });
            }
            bigText(node, label, cx, cy, s * 0.26, 0x10131c);
            break;
        case 'bonus':
            g.circle(cx, cy, 0.44 * s).fill({ color: darken(accent, 0.2) })
                .circle(cx, cy, 0.44 * s).stroke({ width: s * 0.05, color: lighten(accent, 0.35) });
            bigText(node, 'BONUS', cx, cy, s * 0.22, 0xffffff);
            break;
        default:
            bigText(node, label, cx, cy, s * 0.5, accent);
            break;
    }
}

/**
 * Render one Vegas tile — FRAMELESS. The symbol sits directly on the dark reel
 * drum (transparent tile background) so the reels read as one continuous curved
 * cylinder rather than a grid of square cards. A soft dark shadow gives the
 * emblem depth against the drum.
 */
export function drawVegasTile(node: Container, def: SymbolDefinition, w: number, h: number): void {
    const accent = def.accent;
    const s = Math.min(w, h) * 0.62; // larger emblem to fill the frameless cell

    // Soft drop shadow behind the emblem.
    const shadow = new Graphics();
    node.addChild(shadow);
    paintEmblem(node, shadow, def.emblem ?? '', darken(accent, 0.7), w / 2 + s * 0.03, h / 2 + s * 0.04, s, def.label);
    const shadowBlur = new BlurFilter({ strength: 6, quality: 2 });
    shadow.filters = [shadowBlur];
    shadow.alpha = 0.5;

    // Emblem face.
    const g = new Graphics();
    node.addChild(g);
    paintEmblem(node, g, def.emblem ?? '', accent, w / 2, h / 2, s, def.label);
}
