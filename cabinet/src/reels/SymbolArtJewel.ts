/**
 * SymbolArtJewel (Slot 3 tile art)
 * --------------------------------
 * Faceted gemstones, frameless, on transparent — so they read as loose jewels
 * tumbling on the board. A bright top facet + dark lower facet + rim highlight
 * give each gem volume.
 */
import { Container, Graphics, Text } from 'pixi.js';
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

function star(g: Graphics, cx: number, cy: number, points: number, outer: number, inner: number, color: number): void {
    const pts: number[] = [];
    for (let i = 0; i < points * 2; i++) {
        const r = i % 2 === 0 ? outer : inner;
        const a = (Math.PI * i) / points - Math.PI / 2;
        pts.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    g.poly(pts).fill({ color });
}

/** Draw a cut gemstone (hexagonal brilliant) in `color` at (cx,cy), size s. */
function gem(g: Graphics, cx: number, cy: number, s: number, color: number): void {
    // Outer hexagonal stone.
    const outline = P([0, -0.5, 0.46, -0.22, 0.46, 0.22, 0, 0.5, -0.46, 0.22, -0.46, -0.22], cx, cy, s);
    g.poly(outline).fill({ color });
    // Table (top flat facet) bright.
    g.poly(P([0, -0.28, 0.26, -0.12, 0.26, 0.12, 0, 0.28, -0.26, 0.12, -0.26, -0.12], cx, cy, s)).fill({ color: lighten(color, 0.4) });
    // Upper crown facets brighter, lower pavilion darker.
    g.poly(P([0, -0.5, 0.46, -0.22, 0.26, -0.12, 0, -0.28], cx, cy, s)).fill({ color: lighten(color, 0.6) });
    g.poly(P([0, 0.5, 0.46, 0.22, 0.26, 0.12, 0, 0.28], cx, cy, s)).fill({ color: darken(color, 0.35) });
    g.poly(P([0, 0.5, -0.46, 0.22, -0.26, 0.12, 0, 0.28], cx, cy, s)).fill({ color: darken(color, 0.2) });
    // Facet edges.
    g.poly(outline).stroke({ width: s * 0.025, color: darken(color, 0.45), alpha: 0.6 });
    // Sparkle highlight.
    g.circle(cx - 0.12 * s, cy - 0.16 * s, s * 0.05).fill({ color: 0xffffff, alpha: 0.85 });
}

export function drawJewelTile(node: Container, def: SymbolDefinition, w: number, h: number): void {
    const cx = w / 2;
    const cy = h / 2;
    const s = Math.min(w, h) * 0.62;

    if (def.emblem === 'star') {
        star(node.addChild(new Graphics()) as Graphics, cx, cy, 6, s * 0.55, s * 0.24, def.color);
        const inner = new Graphics();
        star(inner, cx, cy, 6, s * 0.4, s * 0.17, lighten(def.color, 0.5));
        node.addChild(inner);
        return;
    }

    const g = new Graphics();
    node.addChild(g);
    gem(g, cx, cy, s, def.color);

    if (def.emblem === 'wildgem') {
        // Iridescent wild: extra rainbow rim + "W".
        g.poly(P([0, -0.5, 0.46, -0.22, 0.46, 0.22, 0, 0.5, -0.46, 0.22, -0.46, -0.22], cx, cy, s))
            .stroke({ width: s * 0.05, color: def.accent });
        const t = new Text({
            text: 'W',
            style: { fontFamily: 'Georgia, serif', fontSize: s * 0.5, fontWeight: '900', fill: 0x6a1b9a, stroke: { color: 0xffffff, width: s * 0.04 } },
        });
        t.anchor.set(0.5); t.position.set(cx, cy);
        node.addChild(t);
    }
}
