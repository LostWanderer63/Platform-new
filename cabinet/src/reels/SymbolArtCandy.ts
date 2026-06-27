/**
 * SymbolArtCandy (Slot 15 candy art)
 * ----------------------------------
 * Shaped glossy candies on a TRANSPARENT background — no square tile, no
 * frame. Each candy is a cartoon vector: soft drop shadow, bold white-cream
 * outline, juicy body gradient, hard gloss highlight. Rendered once into a
 * texture by SymbolTextureRegistry; drop-in real PNGs still override.
 */
import { Container, Graphics, FillGradient } from 'pixi.js';
import type { SymbolDefinition } from './ReelConfig';

const ch = (n: number): number => (n < 0 ? 0 : n > 255 ? 255 : n | 0);
const rgb = (c: number): [number, number, number] => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
const hex = (r: number, g: number, b: number): number => (ch(r) << 16) | (ch(g) << 8) | ch(b);
const lighten = (c: number, t: number): number => { const [r, g, b] = rgb(c); return hex(r + (255 - r) * t, g + (255 - g) * t, b + (255 - b) * t); };
const darken = (c: number, t: number): number => { const [r, g, b] = rgb(c); return hex(r * (1 - t), g * (1 - t), b * (1 - t)); };

const OUTLINE = 0xfff6ec;

function bodyGradient(base: number): FillGradient {
    return new FillGradient({
        type: 'radial',
        center: { x: 0.38, y: 0.3 }, innerRadius: 0.05,
        outerCenter: { x: 0.5, y: 0.55 }, outerRadius: 0.75, textureSpace: 'local',
        colorStops: [
            { offset: 0, color: lighten(base, 0.45) },
            { offset: 0.55, color: base },
            { offset: 1, color: darken(base, 0.35) },
        ],
    });
}

/** 5-point star points (outer radius r), origin (cx, cy). */
function starPoints(cx: number, cy: number, r: number): number[] {
    const pts: number[] = [];
    for (let i = 0; i < 10; i++) {
        const rad = i % 2 === 0 ? r : r * 0.5;
        const a = -Math.PI / 2 + (Math.PI * i) / 5;
        pts.push(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
    }
    return pts;
}

/** Classic heart path on `g` (fill applied by caller chain). */
function heartPath(g: Graphics, cx: number, cy: number, s: number): Graphics {
    g.moveTo(cx, cy + 0.36 * s)
        .bezierCurveTo(cx - 0.55 * s, cy + 0.02 * s, cx - 0.42 * s, cy - 0.42 * s, cx, cy - 0.16 * s)
        .bezierCurveTo(cx + 0.42 * s, cy - 0.42 * s, cx + 0.55 * s, cy + 0.02 * s, cx, cy + 0.36 * s)
        .closePath();
    return g;
}

/** Render one candy into `node`. `w`×`h` is the texture cell. */
export function drawCandy(node: Container, def: SymbolDefinition, w: number, h: number): void {
    const s = Math.min(w, h);
    const cx = w / 2;
    const cy = h / 2;
    const base = def.color ?? 0xff5a78;
    const accent = def.accent ?? 0xffffff;
    const ow = s * 0.045; // cartoon outline width

    // Soft contact shadow under every candy.
    node.addChild(new Graphics().ellipse(cx, cy + 0.4 * s, 0.34 * s, 0.09 * s).fill({ color: 0x5a2a4a, alpha: 0.28 }));

    const g = new Graphics();
    node.addChild(g);

    switch (def.emblem) {
        case 'banana': {
            // Crescent gummy.
            const path = (gg: Graphics): Graphics => gg
                .moveTo(cx - 0.34 * s, cy - 0.18 * s)
                .quadraticCurveTo(cx - 0.04 * s, cy + 0.42 * s, cx + 0.36 * s, cy + 0.12 * s)
                .quadraticCurveTo(cx + 0.42 * s, cy + 0.28 * s, cx + 0.18 * s, cy + 0.36 * s)
                .quadraticCurveTo(cx - 0.34 * s, cy + 0.42 * s, cx - 0.44 * s, cy - 0.08 * s)
                .quadraticCurveTo(cx - 0.46 * s, cy - 0.24 * s, cx - 0.34 * s, cy - 0.18 * s)
                .closePath();
            path(g).stroke({ width: ow * 2.4, color: OUTLINE, join: 'round' });
            path(g).fill(bodyGradient(base));
            g.ellipse(cx - 0.22 * s, cy + 0.02 * s, 0.08 * s, 0.04 * s).fill({ color: 0xffffff, alpha: 0.75 });
            break;
        }

        case 'grape': {
            // Berry cluster.
            const berries: Array<[number, number, number]> = [
                [-0.16, -0.18, 0.15], [0.14, -0.2, 0.14], [-0.02, 0.0, 0.16],
                [-0.26, 0.06, 0.13], [0.24, 0.04, 0.13], [-0.1, 0.24, 0.14], [0.12, 0.26, 0.13],
            ];
            for (const [bx, by, br] of berries) g.circle(cx + bx * s, cy + by * s, br * s + ow * 1.4).fill({ color: OUTLINE });
            for (const [bx, by, br] of berries) {
                g.circle(cx + bx * s, cy + by * s, br * s).fill(bodyGradient(base));
                g.circle(cx + bx * s - br * s * 0.3, cy + by * s - br * s * 0.3, br * s * 0.3).fill({ color: 0xffffff, alpha: 0.5 });
            }
            g.ellipse(cx + 0.06 * s, cy - 0.36 * s, 0.1 * s, 0.05 * s).fill({ color: 0x4ade6a });
            break;
        }

        case 'watermelon': {
            // Slice: rind arc + flesh + seeds.
            const wedge = (gg: Graphics, grow: number): Graphics => gg
                .moveTo(cx - 0.42 * s - grow, cy - 0.06 * s)
                .arc(cx, cy - 0.06 * s, 0.42 * s + grow, Math.PI, 0)
                .lineTo(cx, cy + 0.38 * s + grow)
                .closePath();
            wedge(g, ow * 1.6).fill({ color: OUTLINE });
            wedge(g, 0).fill({ color: 0x2faa4a });
            g.moveTo(cx - 0.34 * s, cy - 0.06 * s)
                .arc(cx, cy - 0.06 * s, 0.34 * s, Math.PI, 0)
                .lineTo(cx, cy + 0.3 * s)
                .closePath()
                .fill(bodyGradient(base));
            for (const [sx, sy] of [[-0.14, 0.0], [0.1, 0.04], [-0.02, -0.14], [0.2, -0.1]] as const) {
                g.ellipse(cx + sx * s, cy + sy * s, 0.025 * s, 0.04 * s).fill({ color: 0x3a1424 });
            }
            break;
        }

        case 'jelly': {
            // Sugared cube.
            const r = 0.16 * s;
            g.roundRect(cx - 0.32 * s - ow * 1.6, cy - 0.32 * s - ow * 1.6, 0.64 * s + ow * 3.2, 0.64 * s + ow * 3.2, r).fill({ color: OUTLINE });
            g.roundRect(cx - 0.32 * s, cy - 0.32 * s, 0.64 * s, 0.64 * s, r).fill(bodyGradient(base));
            g.roundRect(cx - 0.22 * s, cy - 0.22 * s, 0.44 * s, 0.44 * s, r * 0.6).stroke({ width: ow, color: accent, alpha: 0.6 });
            for (let i = 0; i < 9; i++) { // sugar grains
                const a = (Math.PI * 2 * i) / 9 + 0.4;
                g.circle(cx + Math.cos(a) * 0.26 * s, cy + Math.sin(a) * 0.26 * s, 0.018 * s).fill({ color: 0xffffff, alpha: 0.85 });
            }
            break;
        }

        case 'ring': {
            // Citrus gummy ring.
            g.circle(cx, cy, 0.4 * s + ow * 1.6).fill({ color: OUTLINE });
            g.circle(cx, cy, 0.4 * s).fill(bodyGradient(base));
            g.circle(cx, cy, 0.18 * s).fill({ color: OUTLINE });
            g.circle(cx, cy, 0.18 * s - ow * 1.4).fill({ color: 0xffe9c4, alpha: 0.25 });
            for (let i = 0; i < 8; i++) { // segment lines
                const a = (Math.PI * 2 * i) / 8;
                g.moveTo(cx + Math.cos(a) * 0.2 * s, cy + Math.sin(a) * 0.2 * s)
                    .lineTo(cx + Math.cos(a) * 0.38 * s, cy + Math.sin(a) * 0.38 * s)
                    .stroke({ width: ow * 0.8, color: lighten(base, 0.4), alpha: 0.8 });
            }
            break;
        }

        case 'star': {
            g.poly(starPoints(cx, cy, 0.46 * s + ow * 1.8)).fill({ color: OUTLINE });
            g.poly(starPoints(cx, cy, 0.46 * s)).fill(bodyGradient(base));
            g.poly(starPoints(cx, cy - 0.02 * s, 0.24 * s)).fill({ color: lighten(base, 0.35), alpha: 0.8 });
            break;
        }

        case 'heart': {
            heartPath(g, cx, cy + 0.02 * s, 1.06 * s).stroke({ width: ow * 2.4, color: OUTLINE, join: 'round' });
            heartPath(g, cx, cy + 0.02 * s, 1.06 * s).fill(bodyGradient(base));
            break;
        }

        case 'lollipop': {
            // Swirl lolly on a stick — the bonus scatter.
            g.roundRect(cx - 0.035 * s, cy + 0.1 * s, 0.07 * s, 0.42 * s, 0.035 * s).fill({ color: OUTLINE });
            g.circle(cx, cy - 0.08 * s, 0.36 * s + ow * 1.6).fill({ color: OUTLINE });
            g.circle(cx, cy - 0.08 * s, 0.36 * s).fill(bodyGradient(base));
            // Spiral.
            let rr = 0.05 * s;
            let a = 0;
            g.moveTo(cx, cy - 0.08 * s);
            while (rr < 0.33 * s) {
                a += 0.4;
                rr += 0.011 * s;
                g.lineTo(cx + Math.cos(a) * rr, cy - 0.08 * s + Math.sin(a) * rr);
            }
            g.stroke({ width: ow * 1.6, color: 0xfff3a0, cap: 'round' });
            // Bow on the stick.
            g.ellipse(cx - 0.09 * s, cy + 0.16 * s, 0.07 * s, 0.045 * s).fill({ color: 0x3aa8ff });
            g.ellipse(cx + 0.09 * s, cy + 0.16 * s, 0.07 * s, 0.045 * s).fill({ color: 0x3aa8ff });
            g.circle(cx, cy + 0.16 * s, 0.035 * s).fill({ color: 0xb3e0ff });
            break;
        }

        case 'bomb': {
            // Rainbow multiplier ball (value text overlaid at runtime).
            g.circle(cx, cy, 0.42 * s + ow * 1.6).fill({ color: OUTLINE });
            const stripes = [0xff3a6a, 0xff9234, 0xffd23d, 0x4ade6a, 0x3aa8ff, 0x9a4fd4];
            const R = 0.42 * s;
            stripes.forEach((color, i) => {
                const y0 = -R + (2 * R * i) / stripes.length;
                const y1 = -R + (2 * R * (i + 1)) / stripes.length;
                const half = (y: number): number => Math.sqrt(Math.max(0, R * R - y * y));
                // Horizontal band clipped to the circle by sampling edge widths.
                g.moveTo(cx - half(y0), cy + y0);
                for (let t = 0; t <= 8; t++) { const y = y0 + ((y1 - y0) * t) / 8; g.lineTo(cx - half(y), cy + y); }
                for (let t = 8; t >= 0; t--) { const y = y0 + ((y1 - y0) * t) / 8; g.lineTo(cx + half(y), cy + y); }
                g.closePath().fill({ color });
            });
            g.circle(cx, cy, R).stroke({ width: ow * 1.2, color: 0xffffff, alpha: 0.55 });
            g.ellipse(cx - 0.14 * s, cy - 0.18 * s, 0.12 * s, 0.07 * s).fill({ color: 0xffffff, alpha: 0.65 });
            break;
        }

        default:
            g.circle(cx, cy, 0.4 * s).fill(bodyGradient(base));
            break;
    }

    // Shared hard gloss highlight, top-left.
    node.addChild(new Graphics()
        .ellipse(cx - 0.16 * s, cy - 0.22 * s, 0.11 * s, 0.06 * s)
        .fill({ color: 0xffffff, alpha: 0.5 }));
}
