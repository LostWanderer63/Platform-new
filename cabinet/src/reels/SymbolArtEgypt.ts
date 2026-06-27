/**
 * SymbolArtEgypt (Slot 4 tile art)
 * --------------------------------
 * Procedural "ancient Egypt" tile renderer: a sandstone slab with a gold cartouche
 * frame (metal by tier, like the Olympus set), a carved hieroglyph emblem with an
 * engraved bevel, and a sun-glow sheen. Drop-in real PNGs still override these.
 */
import { Container, Graphics, Text, FillGradient } from 'pixi.js';
import type { SymbolDefinition } from './ReelConfig';

const ch = (n: number): number => (n < 0 ? 0 : n > 255 ? 255 : n | 0);
const rgb = (c: number): [number, number, number] => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
const hex = (r: number, g: number, b: number): number => (ch(r) << 16) | (ch(g) << 8) | ch(b);
const lighten = (c: number, t: number): number => { const [r, g, b] = rgb(c); return hex(r + (255 - r) * t, g + (255 - g) * t, b + (255 - b) * t); };
const darken = (c: number, t: number): number => { const [r, g, b] = rgb(c); return hex(r * (1 - t), g * (1 - t), b * (1 - t)); };

interface Metal { light: number; mid: number; dark: number; }

function metalForTier(tier: number): Metal {
    switch (tier) {
        case 4:  return { light: 0xffe9a8, mid: 0xd4af37, dark: 0x7a5f12 }; // gold
        case 3:  return { light: 0xe0f2ff, mid: 0x9fb8cc, dark: 0x5a6e80 }; // silver
        case 2:  return { light: 0xf3cf95, mid: 0xc0813f, dark: 0x6b431b }; // bronze
        default: return { light: 0xe8d9b0, mid: 0xb09a64, dark: 0x66572f }; // sandstone
    }
}

function metalGradient(m: Metal): FillGradient {
    return new FillGradient({
        type: 'linear', start: { x: 0, y: 0 }, end: { x: 0, y: 1 }, textureSpace: 'local',
        colorStops: [
            { offset: 0, color: m.light },
            { offset: 0.42, color: m.mid },
            { offset: 0.5, color: m.light },
            { offset: 1, color: m.dark },
        ],
    });
}

function sandstoneGradient(base: number): FillGradient {
    return new FillGradient({
        type: 'radial',
        center: { x: 0.5, y: 0.38 }, innerRadius: 0.04,
        outerCenter: { x: 0.5, y: 0.55 }, outerRadius: 0.8, textureSpace: 'local',
        colorStops: [
            { offset: 0, color: lighten(base, 0.45) },
            { offset: 0.55, color: base },
            { offset: 1, color: darken(base, 0.45) },
        ],
    });
}

/** Map normalised emblem coords [x0,y0,x1,y1,...] (origin centre) to pixels. */
function P(coords: number[], cx: number, cy: number, s: number): number[] {
    const out = new Array<number>(coords.length);
    for (let i = 0; i < coords.length; i += 2) { out[i] = cx + coords[i] * s; out[i + 1] = cy + coords[i + 1] * s; }
    return out;
}

/* --- emblems ------------------------------------------------------------ */
function paintEmblem(g: Graphics, emblem: string, cx: number, cy: number, s: number, color: number, edge: number): void {
    const lw = s * 0.1;
    switch (emblem) {
        case 'ankh':
            g.ellipse(cx, cy - 0.26 * s, 0.17 * s, 0.22 * s).stroke({ width: lw, color });
            g.moveTo(cx, cy - 0.04 * s).lineTo(cx, cy + 0.5 * s)
                .moveTo(cx - 0.26 * s, cy + 0.08 * s).lineTo(cx + 0.26 * s, cy + 0.08 * s)
                .stroke({ width: lw, color, cap: 'round' });
            break;

        case 'lotus': {
            // Fanned petals over a stem.
            for (let i = -2; i <= 2; i++) {
                const a = i * 0.42;
                const px = cx + Math.sin(a) * 0.3 * s;
                const py = cy - 0.12 * s - Math.cos(a) * 0.26 * s;
                g.ellipse(px, py, 0.1 * s, 0.24 * s).fill({ color: i === 0 ? color : darken(color, 0.12 * Math.abs(i)) });
            }
            g.poly(P([-0.3, 0.12, 0.3, 0.12, 0.16, 0.42, -0.16, 0.42], cx, cy, s)).fill({ color: edge });
            break;
        }

        case 'scarab':
            g.ellipse(cx, cy + 0.1 * s, 0.24 * s, 0.3 * s).fill({ color });                       // body
            g.circle(cx, cy - 0.26 * s, 0.13 * s).fill({ color });                                  // head
            g.moveTo(cx, cy - 0.18 * s).lineTo(cx, cy + 0.4 * s).stroke({ width: s * 0.03, color: edge }); // wing split
            for (const side of [-1, 1]) {
                g.moveTo(cx + side * 0.2 * s, cy - 0.1 * s)
                    .quadraticCurveTo(cx + side * 0.52 * s, cy - 0.3 * s, cx + side * 0.42 * s, cy + 0.18 * s)
                    .stroke({ width: s * 0.05, color, cap: 'round' });                              // legs/wings
            }
            g.circle(cx, cy - 0.42 * s, 0.08 * s).fill({ color: edge });                            // sun ball
            break;

        case 'horus':
            // Eye of Horus: lid, iris, brow, spiral + teardrop markings.
            g.moveTo(cx - 0.42 * s, cy - 0.02 * s)
                .quadraticCurveTo(cx, cy - 0.34 * s, cx + 0.42 * s, cy - 0.02 * s)
                .quadraticCurveTo(cx, cy + 0.22 * s, cx - 0.42 * s, cy - 0.02 * s)
                .stroke({ width: lw * 0.8, color });
            g.circle(cx, cy - 0.04 * s, 0.12 * s).fill({ color });
            g.moveTo(cx - 0.46 * s, cy - 0.18 * s)
                .quadraticCurveTo(cx, cy - 0.46 * s, cx + 0.46 * s, cy - 0.18 * s)
                .stroke({ width: lw * 0.8, color, cap: 'round' });                                  // brow
            g.moveTo(cx - 0.18 * s, cy + 0.12 * s).lineTo(cx - 0.22 * s, cy + 0.44 * s)
                .stroke({ width: lw * 0.7, color, cap: 'round' });                                  // teardrop
            g.moveTo(cx + 0.2 * s, cy + 0.1 * s)
                .quadraticCurveTo(cx + 0.42 * s, cy + 0.34 * s, cx + 0.26 * s, cy + 0.42 * s)
                .stroke({ width: lw * 0.7, color, cap: 'round' });                                  // spiral tail
            break;

        case 'anubis':
            // Jackal head in profile: long snout, tall ears.
            g.poly(P([-0.3, 0.45, -0.22, -0.05, -0.05, -0.3, 0.42, -0.18, 0.1, -0.05, 0.08, 0.45], cx, cy, s)).fill({ color }); // head + snout
            g.poly(P([-0.26, -0.2, -0.34, -0.55, -0.12, -0.28], cx, cy, s)).fill({ color });         // ear back
            g.poly(P([-0.08, -0.26, -0.02, -0.58, 0.12, -0.24], cx, cy, s)).fill({ color });         // ear front
            g.circle(cx + 0.02 * s, cy - 0.12 * s, 0.045 * s).fill({ color: edge });                 // eye
            g.rect(cx - 0.3 * s, cy + 0.32 * s, 0.38 * s, 0.07 * s).fill({ color: edge });           // collar
            break;

        case 'pharaoh':
            // Pharaoh death-mask: nemes headdress + face.
            g.poly(P([-0.42, 0.4, -0.34, -0.3, 0, -0.5, 0.34, -0.3, 0.42, 0.4, 0.22, 0.4, 0.22, 0.05, -0.22, 0.05, -0.22, 0.4], cx, cy, s)).fill({ color }); // nemes
            g.ellipse(cx, cy + 0.06 * s, 0.2 * s, 0.26 * s).fill({ color: edge });                   // face
            g.rect(cx - 0.05 * s, cy + 0.3 * s, 0.1 * s, 0.18 * s).fill({ color });                  // beard
            g.rect(cx - 0.04 * s, cy - 0.62 * s, 0.08 * s, 0.16 * s).fill({ color });                // uraeus
            g.circle(cx - 0.08 * s, cy - 0.0 * s, 0.03 * s).fill({ color });                         // eye L
            g.circle(cx + 0.08 * s, cy - 0.0 * s, 0.03 * s).fill({ color });                         // eye R
            break;

        case 'sundisc': {
            // Winged sun disc.
            g.circle(cx, cy - 0.05 * s, 0.2 * s).fill({ color });
            for (const side of [-1, 1]) {
                for (let i = 0; i < 3; i++) {
                    const sweep = 0.5 + i * 0.16;
                    g.moveTo(cx + side * 0.12 * s, cy - 0.02 * s + i * 0.07 * s)
                        .quadraticCurveTo(cx + side * sweep * 0.7 * s, cy - 0.18 * s + i * 0.1 * s, cx + side * sweep * s, cy + 0.12 * s + i * 0.06 * s)
                        .stroke({ width: s * 0.05, color: i === 1 ? edge : color, cap: 'round' });
                }
            }
            g.circle(cx, cy - 0.05 * s, 0.09 * s).fill({ color: edge });
            break;
        }

        case 'pyramid':
            g.poly(P([0, -0.46, -0.48, 0.38, 0.48, 0.38], cx, cy, s)).fill({ color });
            g.poly(P([0, -0.46, 0.1, -0.28, -0.1, -0.28], cx, cy, s)).fill({ color: edge });         // glowing capstone
            g.moveTo(cx, cy - 0.46 * s).lineTo(cx - 0.12 * s, cy + 0.38 * s)
                .stroke({ width: s * 0.025, color: edge, alpha: 0.6 });                              // edge line
            for (let i = 1; i < 4; i++) {
                const y = cy - 0.46 * s + (0.84 * s * i) / 4;
                const half = 0.48 * s * (i / 4);
                g.moveTo(cx - half, y).lineTo(cx + half, y).stroke({ width: s * 0.018, color: edge, alpha: 0.35 });
            }
            break;

        default:
            g.circle(cx, cy, 0.3 * s).stroke({ width: lw, color });
            break;
    }
}

/* --- public ------------------------------------------------------------- */
/** Render one Egyptian cartouche tile into `node`. */
export function drawEgyptTile(node: Container, def: SymbolDefinition, w: number, h: number): void {
    const tier = def.tier ?? 1;
    const metal = metalForTier(tier);
    const r = Math.min(w, h) * 0.14;
    const ft = Math.min(w, h) * 0.1; // frame thickness

    // 1) Cartouche frame.
    node.addChild(new Graphics().roundRect(0, 0, w, h, r).fill(metalGradient(metal)));

    // 2) Inset sandstone slab + engraved bevel.
    const pw = w - 2 * ft;
    const ph = h - 2 * ft;
    node.addChild(new Graphics()
        .roundRect(ft, ft, pw, ph, r * 0.6).fill(sandstoneGradient(def.color))
        .roundRect(ft, ft, pw, ph, r * 0.6).stroke({ width: Math.max(2, ft * 0.22), color: darken(metal.dark, 0.2), alpha: 0.7 })
        .roundRect(ft * 1.4, ft * 1.4, w - 2.8 * ft, h - 2.8 * ft, r * 0.45).stroke({ width: 2, color: lighten(metal.light, 0.2), alpha: 0.35 }));

    // 2b) Inner vignette for depth.
    node.addChild(new Graphics()
        .roundRect(ft, ft, pw, ph, r * 0.6)
        .fill(new FillGradient({
            type: 'radial', center: { x: 0.5, y: 0.5 }, innerRadius: 0.2, outerCenter: { x: 0.5, y: 0.5 }, outerRadius: 0.72, textureSpace: 'local',
            colorStops: [{ offset: 0, color: 'rgba(0,0,0,0)' }, { offset: 1, color: 'rgba(0,0,0,0.45)' }],
        })));

    // 3) Hieroglyph side notches (cartouche tie-offs).
    const decor = new Graphics();
    for (const sy of [0.3, 0.5, 0.7]) {
        decor.rect(ft * 0.25, h * sy - 2, ft * 0.5, 4).fill({ color: metal.dark, alpha: 0.8 });
        decor.rect(w - ft * 0.75, h * sy - 2, ft * 0.5, 4).fill({ color: metal.dark, alpha: 0.8 });
    }
    node.addChild(decor);

    // 4) Carved emblem: shadow → highlight → face (relief bevel).
    const s = Math.min(w, h) * 0.5;
    const cx = w / 2;
    const cy = h / 2;
    const emblemCy = def.name && tier >= 3 ? cy - h * 0.06 : cy;
    const off = Math.max(2, s * 0.02);
    const emblem = def.emblem ?? '';

    const shadow = new Graphics();
    paintEmblem(shadow, emblem, cx + off, emblemCy + off * 1.4, s, darken(def.color, 0.6), darken(def.color, 0.6));
    node.addChild(shadow);

    const highlight = new Graphics();
    paintEmblem(highlight, emblem, cx - off, emblemCy - off, s, lighten(metal.light, 0.35), lighten(metal.light, 0.35));
    node.addChild(highlight);

    const face = new Graphics();
    paintEmblem(face, emblem, cx, emblemCy, s, metal.light, metal.dark);
    node.addChild(face);

    // 5) Sun-glow sheen across the top.
    node.addChild(new Graphics()
        .ellipse(w / 2, ft + ph * 0.16, pw * 0.42, ph * 0.18)
        .fill({ color: 0xfff3d0, alpha: 0.12 }));

    // 6) Nameplate ribbon for high-tier symbols.
    if (def.name && tier >= 3) {
        const rw = w - ft * 2.4;
        const rh = h * 0.16;
        const ry = h - ft - rh - h * 0.02;
        node.addChild(new Graphics()
            .roundRect((w - rw) / 2, ry, rw, rh, rh * 0.45)
            .fill(new FillGradient({
                type: 'linear', start: { x: 0, y: 0 }, end: { x: 0, y: 1 }, textureSpace: 'local',
                colorStops: [{ offset: 0, color: darken(metal.dark, 0.3) }, { offset: 1, color: 0x0a0703 }],
            }))
            .roundRect((w - rw) / 2, ry, rw, rh, rh * 0.45)
            .stroke({ width: Math.max(2, ft * 0.18), color: metal.light, alpha: 0.85 }));
        const label = new Text({
            text: def.name.toUpperCase(),
            style: {
                fontFamily: 'Georgia, "Times New Roman", serif', fontSize: rh * 0.6, fontWeight: '900', letterSpacing: 2,
                fill: metal.light, stroke: { color: 0x000000, width: Math.max(1, rh * 0.06) },
            },
        });
        label.anchor.set(0.5);
        label.position.set(w / 2, ry + rh / 2);
        const maxW = rw * 0.86;
        if (label.width > maxW) label.scale.set(maxW / label.width);
        node.addChild(label);
    }
}
