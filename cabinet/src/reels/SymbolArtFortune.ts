/**
 * SymbolArtFortune (Slot 14 tile art)
 * -----------------------------------
 * Procedural "lunar festival" tile renderer: a red-lacquer slab with a metal
 * frame (by tier, like the Olympus set), gold corner studs, a carved emblem
 * with an engraved bevel, and a lantern-glow sheen. The `blank` emblem renders
 * a muted, near-empty tile for the HOLD & WIN respin reels. Drop-in real PNGs
 * still override these.
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
        default: return { light: 0xd49a8a, mid: 0x9a5a4a, dark: 0x4a241c }; // rosewood
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

function lacquerGradient(base: number): FillGradient {
    return new FillGradient({
        type: 'radial',
        center: { x: 0.5, y: 0.38 }, innerRadius: 0.04,
        outerCenter: { x: 0.5, y: 0.55 }, outerRadius: 0.8, textureSpace: 'local',
        colorStops: [
            { offset: 0, color: lighten(base, 0.35) },
            { offset: 0.55, color: base },
            { offset: 1, color: darken(base, 0.5) },
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
        case 'envelope':
            g.roundRect(cx - 0.32 * s, cy - 0.24 * s, 0.64 * s, 0.52 * s, 0.04 * s).fill({ color });   // packet
            g.poly(P([-0.32, -0.24, 0, 0.04, 0.32, -0.24], cx, cy, s)).fill({ color: darken(color, 0.25) }); // flap
            g.moveTo(cx - 0.32 * s, cy - 0.24 * s).lineTo(cx, cy + 0.04 * s).lineTo(cx + 0.32 * s, cy - 0.24 * s)
                .stroke({ width: s * 0.03, color: edge });
            g.circle(cx, cy + 0.04 * s, 0.09 * s).fill({ color: edge });                                // gold seal
            break;

        case 'lantern':
            g.moveTo(cx, cy - 0.44 * s).lineTo(cx, cy - 0.36 * s).stroke({ width: s * 0.04, color: edge }); // hanger
            g.roundRect(cx - 0.14 * s, cy - 0.4 * s, 0.28 * s, 0.07 * s, 0.02 * s).fill({ color: edge });   // cap
            g.ellipse(cx, cy - 0.02 * s, 0.3 * s, 0.32 * s).fill({ color });                            // body
            for (const rx of [-0.18, 0, 0.18]) {
                g.moveTo(cx + rx * s, cy - 0.32 * s)
                    .quadraticCurveTo(cx + rx * 1.6 * s, cy - 0.02 * s, cx + rx * s, cy + 0.28 * s)
                    .stroke({ width: s * 0.025, color: edge, alpha: 0.8 });                             // ribs
            }
            g.roundRect(cx - 0.14 * s, cy + 0.26 * s, 0.28 * s, 0.07 * s, 0.02 * s).fill({ color: edge }); // base
            g.moveTo(cx, cy + 0.33 * s).lineTo(cx, cy + 0.48 * s).stroke({ width: s * 0.03, color: edge }); // tassel
            break;

        case 'koi':
            // Curved fish: head, body sweep, tail fan.
            g.moveTo(cx - 0.3 * s, cy - 0.2 * s)
                .quadraticCurveTo(cx + 0.34 * s, cy - 0.28 * s, cx + 0.26 * s, cy + 0.1 * s)
                .quadraticCurveTo(cx + 0.16 * s, cy + 0.42 * s, cx - 0.12 * s, cy + 0.3 * s)
                .quadraticCurveTo(cx - 0.42 * s, cy + 0.14 * s, cx - 0.3 * s, cy - 0.2 * s)
                .closePath()
                .fill({ color });
            g.poly(P([0.2, 0.14, 0.46, 0.3, 0.3, 0.42, 0.14, 0.3], cx, cy, s)).fill({ color: edge });  // tail
            g.circle(cx - 0.18 * s, cy - 0.08 * s, 0.04 * s).fill({ color: edge });                     // eye
            for (let i = 0; i < 3; i++) {
                g.moveTo(cx - 0.04 * s + i * 0.1 * s, cy - 0.16 * s + i * 0.02 * s)
                    .quadraticCurveTo(cx + i * 0.1 * s, cy + 0.0 * s, cx - 0.04 * s + i * 0.1 * s, cy + 0.16 * s)
                    .stroke({ width: s * 0.025, color: edge, alpha: 0.7 });                             // scales
            }
            break;

        case 'ingot':
            // Sycee: boat-shaped base with a domed bump.
            g.moveTo(cx - 0.4 * s, cy - 0.08 * s)
                .quadraticCurveTo(cx, cy + 0.5 * s, cx + 0.4 * s, cy - 0.08 * s)
                .quadraticCurveTo(cx + 0.46 * s, cy - 0.2 * s, cx + 0.3 * s, cy - 0.16 * s)
                .lineTo(cx - 0.3 * s, cy - 0.16 * s)
                .quadraticCurveTo(cx - 0.46 * s, cy - 0.2 * s, cx - 0.4 * s, cy - 0.08 * s)
                .closePath()
                .fill({ color });
            g.ellipse(cx, cy - 0.18 * s, 0.18 * s, 0.14 * s).fill({ color });                           // dome
            g.ellipse(cx, cy - 0.18 * s, 0.18 * s, 0.14 * s).stroke({ width: s * 0.03, color: edge, alpha: 0.7 });
            g.ellipse(cx, cy - 0.12 * s, 0.3 * s, 0.06 * s).stroke({ width: s * 0.025, color: edge, alpha: 0.6 }); // rim
            break;

        case 'phoenix':
            // Sweeping tail plumes, body, head with crest.
            for (let i = 0; i < 3; i++) {
                g.moveTo(cx + 0.02 * s, cy + 0.08 * s)
                    .quadraticCurveTo(cx - 0.3 * s - i * 0.08 * s, cy + 0.2 * s + i * 0.1 * s, cx - 0.44 * s + i * 0.1 * s, cy + 0.46 * s)
                    .stroke({ width: s * 0.05, color: i === 1 ? edge : color, cap: 'round' });          // tail
            }
            g.ellipse(cx + 0.08 * s, cy - 0.02 * s, 0.16 * s, 0.22 * s).fill({ color });                // body
            g.moveTo(cx + 0.04 * s, cy - 0.1 * s)
                .quadraticCurveTo(cx + 0.42 * s, cy - 0.26 * s, cx + 0.3 * s, cy + 0.1 * s)
                .stroke({ width: s * 0.05, color, cap: 'round' });                                      // wing
            g.circle(cx + 0.1 * s, cy - 0.3 * s, 0.09 * s).fill({ color });                             // head
            g.poly(P([0.18, -0.32, 0.3, -0.28, 0.18, -0.24], cx, cy, s)).fill({ color: edge });         // beak
            g.moveTo(cx + 0.06 * s, cy - 0.38 * s).lineTo(cx - 0.02 * s, cy - 0.48 * s)
                .moveTo(cx + 0.1 * s, cy - 0.39 * s).lineTo(cx + 0.08 * s, cy - 0.5 * s)
                .stroke({ width: s * 0.03, color: edge, cap: 'round' });                                // crest
            break;

        case 'cat':
            // Maneki-neko: round head, ears, raised paw, collar.
            g.circle(cx, cy - 0.14 * s, 0.22 * s).fill({ color: edge });                                // head
            g.poly(P([-0.2, -0.28, -0.26, -0.46, -0.08, -0.34], cx, cy, s)).fill({ color: edge });      // ear L
            g.poly(P([0.2, -0.28, 0.26, -0.46, 0.08, -0.34], cx, cy, s)).fill({ color: edge });         // ear R
            g.ellipse(cx, cy + 0.22 * s, 0.24 * s, 0.24 * s).fill({ color: edge });                     // body
            g.roundRect(cx + 0.16 * s, cy - 0.18 * s, 0.1 * s, 0.3 * s, 0.05 * s).fill({ color: edge }); // raised paw
            g.circle(cx - 0.08 * s, cy - 0.16 * s, 0.035 * s).fill({ color });                          // eye L
            g.circle(cx + 0.08 * s, cy - 0.16 * s, 0.035 * s).fill({ color });                          // eye R
            g.moveTo(cx - 0.06 * s, cy - 0.06 * s)
                .quadraticCurveTo(cx, cy - 0.02 * s, cx + 0.06 * s, cy - 0.06 * s)
                .stroke({ width: s * 0.02, color, cap: 'round' });                                      // smile
            g.moveTo(cx - 0.18 * s, cy + 0.04 * s).lineTo(cx + 0.18 * s, cy + 0.04 * s)
                .stroke({ width: s * 0.045, color });                                                   // collar
            g.circle(cx, cy + 0.09 * s, 0.04 * s).fill({ color });                                      // bell
            break;

        case 'knot': {
            // Endless knot: interwoven diamond lattice + tassels.
            const d = 0.3 * s;
            for (const [ox, oy] of [[-0.1, 0], [0.1, 0], [0, -0.1], [0, 0.1]] as const) {
                g.poly([
                    cx + ox * s, cy + oy * s - d,
                    cx + ox * s + d, cy + oy * s,
                    cx + ox * s, cy + oy * s + d,
                    cx + ox * s - d, cy + oy * s,
                ]).stroke({ width: lw * 0.7, color, join: 'round' });
            }
            g.moveTo(cx, cy + 0.4 * s).lineTo(cx, cy + 0.52 * s)
                .moveTo(cx - 0.05 * s, cy + 0.44 * s).lineTo(cx - 0.08 * s, cy + 0.54 * s)
                .moveTo(cx + 0.05 * s, cy + 0.44 * s).lineTo(cx + 0.08 * s, cy + 0.54 * s)
                .stroke({ width: s * 0.03, color: edge, cap: 'round' });                                // tassel
            break;
        }

        case 'coin':
            // Cash coin: disc with a square hole, notched rim.
            g.circle(cx, cy, 0.4 * s).fill({ color: edge });
            g.circle(cx, cy, 0.4 * s).stroke({ width: s * 0.04, color });
            g.circle(cx, cy, 0.32 * s).stroke({ width: s * 0.02, color, alpha: 0.6 });
            g.rect(cx - 0.11 * s, cy - 0.11 * s, 0.22 * s, 0.22 * s).fill({ color });                   // square hole
            g.rect(cx - 0.11 * s, cy - 0.11 * s, 0.22 * s, 0.22 * s).stroke({ width: s * 0.025, color: edge });
            for (let i = 0; i < 4; i++) {
                const a = (Math.PI / 2) * i + Math.PI / 4;
                g.moveTo(cx + Math.cos(a) * 0.18 * s, cy + Math.sin(a) * 0.18 * s)
                    .lineTo(cx + Math.cos(a) * 0.28 * s, cy + Math.sin(a) * 0.28 * s)
                    .stroke({ width: s * 0.035, color, cap: 'round' });                                 // glyph strokes
            }
            break;

        case 'blank':
            // Feature filler: faint embossed disc only.
            g.circle(cx, cy, 0.22 * s).stroke({ width: s * 0.03, color, alpha: 0.5 });
            break;

        default:
            g.circle(cx, cy, 0.3 * s).stroke({ width: lw, color });
            break;
    }
}

/* --- public ------------------------------------------------------------- */
/** Render one red-lacquer festival tile into `node`. */
export function drawFortuneTile(node: Container, def: SymbolDefinition, w: number, h: number): void {
    const tier = def.tier ?? 1;
    const metal = metalForTier(tier);
    const r = Math.min(w, h) * 0.14;
    const ft = Math.min(w, h) * 0.1; // frame thickness
    const blank = def.emblem === 'blank';

    // 1) Metal frame (muted for the feature filler).
    node.addChild(new Graphics().roundRect(0, 0, w, h, r).fill(blank ? darken(metal.dark, 0.4) : metalGradient(metal)));

    // 2) Inset lacquer slab + engraved bevel.
    const pw = w - 2 * ft;
    const ph = h - 2 * ft;
    node.addChild(new Graphics()
        .roundRect(ft, ft, pw, ph, r * 0.6).fill(lacquerGradient(def.color))
        .roundRect(ft, ft, pw, ph, r * 0.6).stroke({ width: Math.max(2, ft * 0.22), color: darken(metal.dark, 0.2), alpha: 0.7 })
        .roundRect(ft * 1.4, ft * 1.4, w - 2.8 * ft, h - 2.8 * ft, r * 0.45).stroke({ width: 2, color: lighten(metal.light, 0.2), alpha: blank ? 0.12 : 0.35 }));

    // 2b) Inner vignette for depth.
    node.addChild(new Graphics()
        .roundRect(ft, ft, pw, ph, r * 0.6)
        .fill(new FillGradient({
            type: 'radial', center: { x: 0.5, y: 0.5 }, innerRadius: 0.2, outerCenter: { x: 0.5, y: 0.5 }, outerRadius: 0.72, textureSpace: 'local',
            colorStops: [{ offset: 0, color: 'rgba(0,0,0,0)' }, { offset: 1, color: 'rgba(0,0,0,0.45)' }],
        })));

    // 3) Gold corner studs (skipped on the filler).
    if (!blank) {
        const studs = new Graphics();
        for (const bx of [ft * 0.55, w - ft * 0.55]) {
            for (const by of [ft * 0.55, h - ft * 0.55]) {
                studs.circle(bx, by, ft * 0.2).fill({ color: metal.mid })
                    .circle(bx - ft * 0.05, by - ft * 0.05, ft * 0.07).fill({ color: lighten(metal.light, 0.2), alpha: 0.8 });
            }
        }
        node.addChild(studs);
    }

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

    // 5) Lantern-glow sheen across the top.
    if (!blank) {
        node.addChild(new Graphics()
            .ellipse(w / 2, ft + ph * 0.16, pw * 0.42, ph * 0.18)
            .fill({ color: 0xffe9c4, alpha: 0.12 }));
    }

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
