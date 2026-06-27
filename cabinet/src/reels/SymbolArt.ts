/**
 * SymbolArt
 * ---------
 * Procedural "ancient Olympus" tile renderer. Each symbol is drawn as a carved
 * relic: a metal frame (gold / silver / bronze / stone by tier), a marble panel
 * with a radial sheen, ornate corner studs + laurel flourishes, and a carved
 * emblem (bolt, trident, helm, crown, sword, gem, wreath, orb) with an engraved
 * drop-shadow for depth.
 *
 * Everything is vector Graphics so it bakes crisply into a RenderTexture at any
 * resolution. Swap this for a real art atlas later — only `drawTile` is called.
 */
import { Container, Graphics, Text, FillGradient } from 'pixi.js';
import type { SymbolDefinition } from './ReelConfig';

/* --- colour helpers (operate on 0xRRGGBB) ------------------------------- */
const ch = (n: number): number => (n < 0 ? 0 : n > 255 ? 255 : n | 0);
const rgb = (c: number): [number, number, number] => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
const hex = (r: number, g: number, b: number): number => (ch(r) << 16) | (ch(g) << 8) | ch(b);
const lighten = (c: number, t: number): number => {
    const [r, g, b] = rgb(c);
    return hex(r + (255 - r) * t, g + (255 - g) * t, b + (255 - b) * t);
};
const darken = (c: number, t: number): number => {
    const [r, g, b] = rgb(c);
    return hex(r * (1 - t), g * (1 - t), b * (1 - t));
};

interface Metal { light: number; mid: number; dark: number; }

function metalForTier(tier: number): Metal {
    switch (tier) {
        case 4:  return { light: 0xffe9a8, mid: 0xd4af37, dark: 0x7a5f12 }; // gold
        case 3:  return { light: 0xf4f8fc, mid: 0xb6c2cf, dark: 0x67737f }; // silver
        case 2:  return { light: 0xf3cf95, mid: 0xc0813f, dark: 0x6b431b }; // bronze
        default: return { light: 0xdbe1e8, mid: 0x97a2ad, dark: 0x55606b }; // stone
    }
}

/** Vertical metallic gradient for the frame. */
function metalGradient(m: Metal): FillGradient {
    return new FillGradient({
        type: 'linear',
        start: { x: 0, y: 0 },
        end: { x: 0, y: 1 },
        textureSpace: 'local',
        colorStops: [
            { offset: 0, color: m.light },
            { offset: 0.42, color: m.mid },
            { offset: 0.5, color: m.light },
            { offset: 1, color: m.dark },
        ],
    });
}

/** Radial marble sheen for the panel, derived from the symbol's base colour. */
function marbleGradient(base: number): FillGradient {
    return new FillGradient({
        type: 'radial',
        center: { x: 0.5, y: 0.4 },
        innerRadius: 0.04,
        outerCenter: { x: 0.5, y: 0.55 },
        outerRadius: 0.78,
        textureSpace: 'local',
        colorStops: [
            { offset: 0, color: lighten(base, 0.5) },
            { offset: 0.55, color: base },
            { offset: 1, color: darken(base, 0.4) },
        ],
    });
}

/** Map normalised emblem coords [x0,y0,x1,y1,...] (origin centre) to pixels. */
function P(coords: number[], cx: number, cy: number, s: number): number[] {
    const out = new Array<number>(coords.length);
    for (let i = 0; i < coords.length; i += 2) {
        out[i] = cx + coords[i] * s;
        out[i + 1] = cy + coords[i + 1] * s;
    }
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

/* --- emblems ------------------------------------------------------------ */
/** Paint one emblem into `g`, centred at (cx,cy), sized ~s, filled `color`. */
function paintEmblem(g: Graphics, emblem: string, cx: number, cy: number, s: number, color: number, edge: number, label: string): void {
    const lw = s * 0.09;
    switch (emblem) {
        case 'lightning':
            g.poly(P([-0.18, -0.5, 0.22, -0.5, -0.02, -0.08, 0.24, -0.08, -0.22, 0.52, -0.02, 0.06, -0.3, 0.06], cx, cy, s)).fill({ color });
            break;

        case 'trident':
            // three prongs + shaft, with barbed tips for a clear silhouette
            g.moveTo(cx - 0.3 * s, cy - 0.46 * s).lineTo(cx - 0.3 * s, cy - 0.1 * s)
                .moveTo(cx + 0.3 * s, cy - 0.46 * s).lineTo(cx + 0.3 * s, cy - 0.1 * s)
                .moveTo(cx, cy - 0.52 * s).lineTo(cx, cy + 0.52 * s)
                .moveTo(cx - 0.3 * s, cy - 0.1 * s).lineTo(cx + 0.3 * s, cy - 0.1 * s)
                .stroke({ width: lw, color, cap: 'round', join: 'round' });
            g.poly(P([-0.3, -0.56, -0.44, -0.4, -0.3, -0.38], cx, cy, s)).fill({ color });
            g.poly(P([0.3, -0.56, 0.44, -0.4, 0.3, -0.38], cx, cy, s)).fill({ color });
            g.poly(P([0, -0.6, -0.07, -0.48, 0.07, -0.48], cx, cy, s)).fill({ color });
            star(g, cx, cy + 0.52 * s, 4, s * 0.08, s * 0.03, color);
            break;

        case 'helmet':
            g.poly(P([-0.02, -0.46, 0.14, -0.68, 0.44, -0.6, 0.3, -0.32, 0.06, -0.3], cx, cy, s)).fill({ color }); // plume crest
            g.ellipse(cx, cy - 0.04 * s, 0.34 * s, 0.46 * s).fill({ color });                                       // dome
            g.poly(P([-0.34, 0, -0.22, 0.42, -0.1, 0.42, -0.16, 0], cx, cy, s)).fill({ color });                    // cheek guard
            g.rect(cx - 0.22 * s, cy - 0.16 * s, 0.44 * s, 0.06 * s).fill({ color: edge });                         // brow
            g.rect(cx - 0.2 * s, cy - 0.07 * s, 0.13 * s, 0.07 * s).fill({ color: edge });                          // eye L
            g.rect(cx + 0.07 * s, cy - 0.07 * s, 0.13 * s, 0.07 * s).fill({ color: edge });                         // eye R
            g.rect(cx - 0.04 * s, cy - 0.07 * s, 0.08 * s, 0.4 * s).fill({ color: edge });                          // nose guard
            break;

        case 'crown':
            g.poly(P([-0.42, 0.18, -0.42, -0.12, -0.2, 0.06, 0, -0.38, 0.2, 0.06, 0.42, -0.12, 0.42, 0.18], cx, cy, s)).fill({ color });
            g.rect(cx - 0.42 * s, cy + 0.16 * s, 0.84 * s, 0.16 * s).fill({ color });
            star(g, cx, cy - 0.18 * s, 4, s * 0.07, s * 0.03, edge);
            g.circle(cx - 0.28 * s, cy + 0.24 * s, s * 0.05).fill({ color: edge });
            g.circle(cx + 0.28 * s, cy + 0.24 * s, s * 0.05).fill({ color: edge });
            break;

        case 'sword':
            g.poly(P([0, -0.52, -0.08, -0.34, -0.06, 0.16, 0.06, 0.16, 0.08, -0.34], cx, cy, s)).fill({ color }); // blade
            g.rect(cx - 0.24 * s, cy + 0.13 * s, 0.48 * s, 0.07 * s).fill({ color });                              // guard
            g.rect(cx - 0.045 * s, cy + 0.2 * s, 0.09 * s, 0.22 * s).fill({ color: edge });                        // grip
            g.circle(cx, cy + 0.46 * s, s * 0.06).fill({ color });                                                 // pommel
            break;

        case 'gem':
            g.poly(P([0, -0.42, -0.4, -0.12, 0, 0.48, 0.4, -0.12], cx, cy, s)).fill({ color });
            g.moveTo(cx - 0.4 * s, cy - 0.12 * s).lineTo(cx + 0.4 * s, cy - 0.12 * s)
                .moveTo(cx - 0.4 * s, cy - 0.12 * s).lineTo(cx, cy - 0.42 * s)
                .moveTo(cx + 0.4 * s, cy - 0.12 * s).lineTo(cx, cy - 0.42 * s)
                .moveTo(cx - 0.4 * s, cy - 0.12 * s).lineTo(cx, cy + 0.48 * s)
                .moveTo(cx + 0.4 * s, cy - 0.12 * s).lineTo(cx, cy + 0.48 * s)
                .stroke({ width: s * 0.02, color: edge, alpha: 0.5 });
            break;

        case 'laurel': {
            const rad = 0.46 * s;
            const cyl = cy + 0.04 * s;
            for (let i = 0; i < 6; i++) {
                const aL = Math.PI * 0.55 + i * 0.17;
                const aR = Math.PI * 0.45 - i * 0.17;
                g.ellipse(cx + Math.cos(aL) * rad, cyl + Math.sin(aL) * rad, 0.1 * s, 0.05 * s).fill({ color });
                g.ellipse(cx + Math.cos(aR) * rad, cyl + Math.sin(aR) * rad, 0.1 * s, 0.05 * s).fill({ color });
            }
            g.arc(cx, cyl, rad, Math.PI * 0.45, Math.PI * 1.55).stroke({ width: s * 0.025, color, alpha: 0.55 });
            g.arc(cx, cyl, rad, -Math.PI * 0.55, Math.PI * 0.45).stroke({ width: s * 0.025, color, alpha: 0.55 });
            star(g, cx, cy - 0.04 * s, 5, s * 0.19, s * 0.08, color);
            break;
        }

        case 'orb':
            g.circle(cx, cy, 0.4 * s).fill({ color });
            g.circle(cx, cy, 0.4 * s).stroke({ width: s * 0.05, color: edge });
            g.poly(P([-0.12, -0.34, 0.14, -0.34, -0.02, -0.04, 0.16, -0.04, -0.14, 0.36, -0.02, 0.02, -0.2, 0.02], cx, cy, s)).fill({ color: edge });
            break;

        default: // styled glyph fallback
            g.poly(P([-0.3, -0.4, 0.3, -0.4, 0.3, 0.4, -0.3, 0.4], cx, cy, s * 0.0)).fill({ color });
            void label;
            break;
    }
}

/* --- public ------------------------------------------------------------- */
/** Render one ornate tile into `node`. */
export function drawTile(node: Container, def: SymbolDefinition, w: number, h: number): void {
    const tier = def.tier ?? 1;
    const metal = metalForTier(tier);
    const r = Math.min(w, h) * 0.16;
    const ft = Math.min(w, h) * 0.11; // frame thickness

    // 1) Metal frame base (full tile).
    node.addChild(new Graphics().roundRect(0, 0, w, h, r).fill(metalGradient(metal)));

    // 2) Inset marble panel + engraved bevel.
    const panel = new Graphics()
        .roundRect(ft, ft, w - 2 * ft, h - 2 * ft, r * 0.65)
        .fill(marbleGradient(def.color))
        .roundRect(ft, ft, w - 2 * ft, h - 2 * ft, r * 0.65)
        .stroke({ width: Math.max(2, ft * 0.22), color: darken(metal.dark, 0.2), alpha: 0.7 })
        .roundRect(ft * 1.4, ft * 1.4, w - 2.8 * ft, h - 2.8 * ft, r * 0.5)
        .stroke({ width: 2, color: lighten(metal.light, 0.2), alpha: 0.35 });
    node.addChild(panel);

    // 2b) Depth: inner vignette (darker toward the panel edges).
    const pw = w - 2 * ft;
    const ph = h - 2 * ft;
    node.addChild(new Graphics()
        .roundRect(ft, ft, pw, ph, r * 0.65)
        .fill(new FillGradient({
            type: 'radial', center: { x: 0.5, y: 0.5 }, innerRadius: 0.18, outerCenter: { x: 0.5, y: 0.5 }, outerRadius: 0.72, textureSpace: 'local',
            colorStops: [{ offset: 0, color: 'rgba(0,0,0,0)' }, { offset: 1, color: 'rgba(0,0,0,0.5)' }],
        })));

    // 2c) Glossy sheen across the upper half (glass/polished look).
    node.addChild(new Graphics()
        .ellipse(w / 2, ft + ph * 0.16, pw * 0.42, ph * 0.18)
        .fill({ color: 0xffffff, alpha: 0.12 }));

    // 3) Frame decor: corner studs + top/bottom laurel flourishes.
    const decor = new Graphics();
    const studR = ft * 0.42;
    const inset = ft * 0.9;
    for (const [sx, sy] of [[inset, inset], [w - inset, inset], [inset, h - inset], [w - inset, h - inset]]) {
        decor.circle(sx, sy, studR).fill({ color: metal.dark })
            .circle(sx, sy, studR * 0.62).fill({ color: metal.light });
    }
    node.addChild(decor);

    // 4) Carved emblem with a 3-pass bevel: drop shadow (down-right), bright
    //    highlight (up-left), then the metal face on top → reads as relief.
    const s = Math.min(w, h) * 0.48;
    const cx = w / 2;
    const cy = h / 2;
    const emblemCy = def.name && tier >= 3 ? cy - h * 0.06 : cy; // lift for nameplate
    const off = Math.max(2, s * 0.02);
    const emblem = def.emblem ?? '';

    const shadow = new Graphics();
    paintEmblem(shadow, emblem, cx + off, emblemCy + off * 1.4, s, darken(def.color, 0.6), darken(def.color, 0.6), def.label);
    node.addChild(shadow);

    const highlight = new Graphics();
    paintEmblem(highlight, emblem, cx - off, emblemCy - off, s, lighten(metal.light, 0.35), lighten(metal.light, 0.35), def.label);
    node.addChild(highlight);

    const face = new Graphics();
    paintEmblem(face, emblem, cx, emblemCy, s, metal.light, metal.dark, def.label);
    node.addChild(face);

    // 5) Nameplate ribbon for the high "character" symbols.
    if (def.name && tier >= 3) {
        drawNameplate(node, def.name, w, h, ft, metal);
    }
}

/** Engraved name ribbon across the lower third of a high-tier tile. */
function drawNameplate(node: Container, name: string, w: number, h: number, ft: number, metal: Metal): void {
    const rw = w - ft * 2.4;
    const rh = h * 0.17;
    const ry = h - ft - rh - h * 0.02;
    const rx = (w - rw) / 2;

    const ribbon = new Graphics()
        .roundRect(rx, ry, rw, rh, rh * 0.45)
        .fill(new FillGradient({
            type: 'linear', start: { x: 0, y: 0 }, end: { x: 0, y: 1 }, textureSpace: 'local',
            colorStops: [{ offset: 0, color: darken(metal.dark, 0.3) }, { offset: 1, color: 0x05060d }],
        }))
        .roundRect(rx, ry, rw, rh, rh * 0.45)
        .stroke({ width: Math.max(2, ft * 0.18), color: metal.light, alpha: 0.85 });
    node.addChild(ribbon);

    const label = new Text({
        text: name.toUpperCase(),
        style: {
            fontFamily: 'Georgia, "Times New Roman", serif',
            fontSize: rh * 0.62,
            fontWeight: '900',
            letterSpacing: 2,
            fill: metal.light,
            stroke: { color: 0x000000, width: Math.max(1, rh * 0.06) },
        },
    });
    label.anchor.set(0.5);
    label.position.set(w / 2, ry + rh / 2);
    // Fit long names within the ribbon.
    const maxW = rw * 0.86;
    if (label.width > maxW) label.scale.set(maxW / label.width);
    node.addChild(label);
}
