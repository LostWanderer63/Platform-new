/**
 * gen-art.mjs — procedural "3D-look" symbol art generator.
 *
 * Emits one SVG per symbol id (512×512, transparent) plus the Olympus
 * background (1920×1080) into tools/art-svg/. Render them to PNG with
 * tools/render-art.sh (headless Chrome screenshots) — output lands in
 * public/symbols/<id>.png where AssetManager picks it up automatically.
 *
 * The 3D look is layered vector shading: metallic multi-stop gradients,
 * extruded emblem copies (depth), per-facet lighting on the gems, specular
 * sparkles, vignettes and soft drop shadows.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), 'art-svg');
mkdirSync(OUT, { recursive: true });

/* ---------------------------------------------------------------- colours */
const clamp = (n) => Math.max(0, Math.min(255, Math.round(n)));
const toRgb = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
const toHex = (r, g, b) => `#${[r, g, b].map((v) => clamp(v).toString(16).padStart(2, '0')).join('')}`;
const mix = (c1, c2, t) => {
    const a = toRgb(c1), b = toRgb(c2);
    return toHex(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t);
};
const lighten = (c, t) => mix(c, '#ffffff', t);
const darken = (c, t) => mix(c, '#000000', t);

/* ----------------------------------------------------------------- random */
function rng(seed) {
    let a = seed;
    return () => {
        a |= 0; a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/* ------------------------------------------------------------ svg helpers */
const P = (pts) => pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');

const lg = (id, stops, x1 = 0, y1 = 0, x2 = 0, y2 = 1, user = false) =>
    `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"${user ? ' gradientUnits="userSpaceOnUse"' : ''}>` +
    stops.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a != null ? ` stop-opacity="${a}"` : ''}/>`).join('') +
    `</linearGradient>`;

const rg = (id, stops, cx = 0.5, cy = 0.5, r = 0.65, fx = null, fy = null) =>
    `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}"${fx != null ? ` fx="${fx}" fy="${fy}"` : ''}>` +
    stops.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a != null ? ` stop-opacity="${a}"` : ''}/>`).join('') +
    `</radialGradient>`;

const dropShadow = (id, dy, blur, opacity, color = '#000000') =>
    `<filter id="${id}" x="-40%" y="-40%" width="180%" height="180%">` +
    `<feDropShadow dx="0" dy="${dy}" stdDeviation="${blur}" flood-color="${color}" flood-opacity="${opacity}"/></filter>`;

const glowFilter = (id, blur, color, opacity = 0.9) =>
    `<filter id="${id}" x="-60%" y="-60%" width="220%" height="220%">` +
    `<feDropShadow dx="0" dy="0" stdDeviation="${blur}" flood-color="${color}" flood-opacity="${opacity}"/></filter>`;

const blurFilter = (id, blur) =>
    `<filter id="${id}" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="${blur}"/></filter>`;

/** 4-point lens sparkle. */
const sparkle = (x, y, r, a = 0.95) =>
    `<path d="M${x} ${y - r} Q${x + r * 0.14} ${y - r * 0.14} ${x + r} ${y} Q${x + r * 0.14} ${y + r * 0.14} ${x} ${y + r} ` +
    `Q${x - r * 0.14} ${y + r * 0.14} ${x - r} ${y} Q${x - r * 0.14} ${y - r * 0.14} ${x} ${y - r}Z" fill="#ffffff" opacity="${a}"/>`;

/** Extruded depth: stacked dark copies under the face shape. */
const extrude = (shape, depth, dark, dx = 0.45) => {
    let s = '';
    for (let i = depth; i >= 1; i--) s += `<g transform="translate(${(i * dx).toFixed(2)},${i})">${shape(dark)}</g>`;
    return s;
};

const star = (cx, cy, points, outer, inner, rot = -Math.PI / 2) => {
    const pts = [];
    for (let i = 0; i < points * 2; i++) {
        const r = i % 2 === 0 ? outer : inner;
        const a = (Math.PI * i) / points + rot;
        pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
    return pts;
};

const text = (txt, x, y, size, fill, { stroke = null, sw = 0, ls = 2, family = `'Arial Black','Helvetica Neue',Arial,sans-serif`, italic = false } = {}) =>
    `<text x="${x}" y="${y}" font-family="${family}" font-size="${size}" font-weight="900" text-anchor="middle" letter-spacing="${ls}"` +
    (italic ? ' font-style="italic"' : '') +
    (stroke ? ` stroke="${stroke}" stroke-width="${sw}" paint-order="stroke" stroke-linejoin="round"` : '') +
    ` fill="${fill}">${txt}</text>`;

const svgDoc = (w, h, body) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;

/* ============================== OLYMPUS ================================== */
/* Ornate gold/marble carved-relic tiles. */

const GOLD_STOPS = [[0, '#fff6cf'], [0.28, '#ffd86b'], [0.52, '#fff3b0'], [0.75, '#c89627'], [1, '#7a5a10']];
const GOLD_DARK = '#5a430e';

function olympusTile(panelColor, content, extraDefs = '') {
    const defs =
        lg('gold', GOLD_STOPS) +
        lg('goldEdge', [[0, '#fffbe2'], [1, '#9c7a1a']]) +
        rg('panel', [[0, lighten(panelColor, 0.42)], [0.55, panelColor], [1, darken(panelColor, 0.55)]], 0.5, 0.38, 0.85) +
        rg('vig', [[0.55, '#000000', 0], [1, '#000000', 0.55]], 0.5, 0.5, 0.72) +
        dropShadow('tileShadow', 12, 14, 0.55) +
        extraDefs;
    const medallion = (x, y) =>
        `<circle cx="${x}" cy="${y}" r="17" fill="url(#gold)" stroke="${GOLD_DARK}" stroke-width="2.5"/>` +
        `<circle cx="${x}" cy="${y}" r="8" fill="#fff3b0" stroke="#c89627" stroke-width="2"/>`;
    return svgDoc(512, 512, `<defs>${defs}</defs>
<g filter="url(#tileShadow)">
  <rect x="20" y="18" width="472" height="472" rx="58" fill="url(#gold)" stroke="${GOLD_DARK}" stroke-width="4"/>
  <rect x="36" y="34" width="440" height="440" rx="46" fill="none" stroke="url(#goldEdge)" stroke-width="3" opacity="0.8"/>
  <rect x="54" y="52" width="404" height="404" rx="34" fill="url(#panel)"/>
  <rect x="54" y="52" width="404" height="404" rx="34" fill="url(#vig)"/>
  <rect x="54" y="52" width="404" height="404" rx="34" fill="none" stroke="#2b2010" stroke-width="3" opacity="0.7"/>
  ${content}
  <path d="M70,138 Q256,52 442,138 L442,90 Q442,68 420,68 L92,68 Q70,68 70,90 Z" fill="#ffffff" opacity="0.07"/>
  ${medallion(40, 38)}${medallion(472, 38)}${medallion(40, 470)}${medallion(472, 470)}
</g>`);
}

function olyZeus() {
    const bolt = (fill) => `<polygon points="212,76 332,76 270,212 348,212 196,436 248,266 178,266" fill="${fill}"/>`;
    const defs = lg('boltFace', [[0, '#ffffff'], [0.3, '#ffe98a'], [0.7, '#ffb300'], [1, '#c87800']]) +
        glowFilter('boltGlow', 16, '#7fb6ff', 0.95) + blurFilter('soft8', 8);
    const content =
        `<g filter="url(#boltGlow)">${bolt('#dceaff')}</g>` +
        `<g opacity="0.55" filter="url(#soft8)">${bolt('#8ab8ff')}</g>` +
        extrude(bolt, 10, '#7a4d05') + bolt('url(#boltFace)') +
        `<polygon points="223,86 308,86 262,190 240,190" fill="#ffffff" opacity="0.5"/>` +
        sparkle(330, 96, 26) + sparkle(206, 412, 18, 0.8);
    return olympusTile('#1c2c6e', content, defs);
}

function olyPoseidon() {
    const trident = (fill) =>
        `<path d="M248,150 L248,420 L264,420 L264,150 Z" fill="${fill}"/>` +
        `<path d="M256,70 L236,118 L248,118 L248,182 L264,182 L264,118 L276,118 Z" fill="${fill}"/>` +
        `<path d="M170,96 C162,160 176,196 232,204 L236,188 C192,178 182,150 188,104 L210,116 L196,72 Z" fill="${fill}"/>` +
        `<path d="M342,96 C350,160 336,196 280,204 L276,188 C320,178 330,150 324,104 L302,116 L316,72 Z" fill="${fill}"/>` +
        `<rect x="200" y="196" width="112" height="16" rx="8" fill="${fill}"/>` +
        `<circle cx="256" cy="438" r="20" fill="${fill}"/>`;
    const defs = lg('triFace', [[0, '#fff6cf'], [0.4, '#ffd86b'], [0.8, '#c89627'], [1, '#8a6512']]) + blurFilter('soft6', 6);
    const wave = (y, o) =>
        `<path d="M120,${y} Q176,${y - 34} 232,${y} T344,${y} T420,${y - 8}" fill="none" stroke="#62e0e8" stroke-width="11" stroke-linecap="round" opacity="${o}"/>`;
    const content =
        `<g filter="url(#soft6)" opacity="0.7">${wave(388, 0.5)}</g>` + wave(372, 0.85) + wave(412, 0.55) +
        extrude(trident, 9, '#6b4e0a') + trident('url(#triFace)') +
        `<rect x="250" y="156" width="5" height="258" fill="#fffbe2" opacity="0.55"/>` +
        sparkle(256, 78, 22) + sparkle(338, 92, 15, 0.8);
    return olympusTile('#0c4f60', content, defs);
}

function olyAthena() {
    // Corinthian helmet, front view. One silhouette path + a tall crest band.
    // userSpace gradients keep the shading continuous across the sub-shapes.
    const helm = (fill) =>
        `<path d="M164,272 C164,196 200,156 256,156 C312,156 348,196 348,272 ` +
        `L348,330 C348,352 336,376 314,398 L296,398 L300,322 ` +
        `C300,308 290,300 278,300 L278,394 L234,394 L234,300 ` +
        `C222,300 212,308 212,322 L216,398 L198,398 C176,376 164,352 164,330 Z" fill="${fill}"/>`;
    const crest = (fill) =>
        `<path d="M146,260 Q256,-66 366,260 L330,260 Q256,52 182,260 Z" fill="${fill}"/>`;
    const defs =
        lg('helmFace', [[0, '#ffffff'], [0.35, '#cdd6e0'], [0.7, '#8d9aa8'], [1, '#5a6775']], 164, 150, 348, 400, true) +
        lg('crestFace', [[0, '#ff8a78'], [0.45, '#d92e1e'], [1, '#8a1512']], 256, 70, 256, 260, true);
    // Plume comb separators along the crest arc.
    const qp = (a, c, b, t) => (1 - t) * (1 - t) * a + 2 * (1 - t) * t * c + t * t * b;
    let comb = '';
    for (let i = 1; i < 10; i++) {
        const t = i / 10;
        const xo = qp(146, 256, 366, t), yo = qp(260, -66, 260, t);
        const xi = qp(182, 256, 330, t), yi = qp(260, 52, 260, t);
        comb += `<line x1="${xo.toFixed(1)}" y1="${yo.toFixed(1)}" x2="${xi.toFixed(1)}" y2="${yi.toFixed(1)}" stroke="#7f1310" stroke-width="4" opacity="0.6"/>`;
    }
    const content =
        extrude(crest, 8, '#5a0d0a') + crest('url(#crestFace)') + comb +
        extrude(helm, 9, '#39424d') + helm('url(#helmFace)') +
        `<path d="M180,232 Q256,168 332,232" fill="none" stroke="#ffffff" stroke-width="7" opacity="0.55"/>` + // dome highlight
        `<path d="M214,262 q22,-14 44,4 q-20,12 -44,-4 Z" fill="#13181f"/>` + // eye L (almond)
        `<path d="M214,262 q22,-14 44,4 q-20,12 -44,-4 Z" fill="#13181f" transform="translate(512,0) scale(-1,1)"/>` + // eye R (mirrored)
        `<rect x="250" y="250" width="5" height="140" fill="#5a6775" opacity="0.8"/>` + // nose-guard shade line
        sparkle(322, 196, 18, 0.85) + sparkle(196, 330, 12, 0.7);
    return olympusTile('#3a2f6e', content, defs);
}

function olyCrown() {
    const crown = (fill) =>
        `<path d="M150,318 L150,206 L208,262 L256,160 L304,262 L362,206 L362,318 Z" fill="${fill}"/>` +
        `<rect x="142" y="318" width="228" height="46" rx="14" fill="${fill}"/>`;
    const defs = lg('crFace', [[0, '#fff6cf'], [0.35, '#ffd86b'], [0.75, '#c89627'], [1, '#8a6512']]) +
        rg('sap', [[0, '#9fd8ff'], [0.5, '#1f6fd0'], [1, '#0a2e66']], 0.4, 0.35, 0.8);
    const jewel = (x, y, r) =>
        `<circle cx="${x}" cy="${y}" r="${r}" fill="url(#sap)" stroke="#6b4e0a" stroke-width="3"/>` +
        `<circle cx="${x - r * 0.3}" cy="${y - r * 0.35}" r="${r * 0.22}" fill="#ffffff" opacity="0.85"/>`;
    const content =
        extrude(crown, 10, '#6b4e0a') + crown('url(#crFace)') +
        `<path d="M150,318 L362,318" stroke="#8a6512" stroke-width="4" opacity="0.7"/>` +
        `<circle cx="256" cy="150" r="15" fill="url(#crFace)" stroke="#8a6512" stroke-width="3"/>` +
        `<circle cx="150" cy="198" r="12" fill="url(#crFace)" stroke="#8a6512" stroke-width="3"/>` +
        `<circle cx="362" cy="198" r="12" fill="url(#crFace)" stroke="#8a6512" stroke-width="3"/>` +
        jewel(256, 340, 17) + jewel(190, 340, 12) + jewel(322, 340, 12) + jewel(256, 264, 14) +
        sparkle(256, 142, 22) + sparkle(354, 196, 14, 0.8);
    return olympusTile('#56430f', content, defs);
}

function olySword() {
    const blade = (fill) => `<polygon points="256,64 234,96 242,330 270,330 278,96" fill="${fill}"/>`;
    const hilt = (fill) =>
        `<rect x="192" y="328" width="128" height="22" rx="11" fill="${fill}"/>` +
        `<rect x="242" y="350" width="28" height="68" rx="10" fill="${fill}"/>` +
        `<circle cx="256" cy="436" r="19" fill="${fill}"/>`;
    const defs = lg('bladeFace', [[0, '#ffffff'], [0.45, '#cdd9e4'], [0.55, '#f4f9fd'], [1, '#76828f']], 0, 0, 1, 0) +
        lg('hiltFace', [[0, '#fff6cf'], [0.4, '#ffd86b'], [1, '#8a6512']]);
    const content =
        extrude(blade, 8, '#3c4754') + blade('url(#bladeFace)') +
        `<polygon points="256,72 250,98 252,326 258,326 260,98" fill="#5a6675" opacity="0.7"/>` +
        extrude(hilt, 8, '#6b4e0a') + hilt('url(#hiltFace)') +
        `<line x1="248" y1="356" x2="248" y2="412" stroke="#8a6512" stroke-width="4" opacity="0.8"/>` +
        `<line x1="262" y1="356" x2="262" y2="412" stroke="#8a6512" stroke-width="4" opacity="0.8"/>` +
        sparkle(256, 92, 22) + sparkle(244, 250, 13, 0.7);
    return olympusTile('#2f3a45', content, defs);
}

function olyGems() {
    const defs =
        lg('emFace', [[0, '#9fffce'], [0.5, '#0fae6b'], [1, '#03522f']]) +
        lg('ruFace', [[0, '#ff9aa2'], [0.5, '#e0233a'], [1, '#6e0a16']]) +
        lg('amFace', [[0, '#e3b3ff'], [0.5, '#9032c8'], [1, '#43106a']]) +
        dropShadow('gemDrop', 8, 8, 0.5);
    const facetGem = (cx, cy, r, face, rot) => {
        const pts = Array.from({ length: 6 }, (_, i) => {
            const a = (Math.PI / 3) * i + rot;
            return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
        });
        const top = pts.map((p) => [p[0] + (cx - p[0]) * 0.5, p[1] + (cy - p[1]) * 0.5]);
        let f = `<polygon points="${P(pts)}" fill="${face}" filter="url(#gemDrop)"/>`;
        for (let i = 0; i < 6; i++) {
            const j = (i + 1) % 6;
            f += `<polygon points="${P([pts[i], pts[j], top[i]])}" fill="#ffffff" opacity="${0.06 + 0.13 * ((i + 2) % 3)}"/>`;
        }
        f += `<polygon points="${P(top)}" fill="#ffffff" opacity="0.22"/>`;
        return f;
    };
    const content =
        facetGem(180, 222, 92, 'url(#emFace)', 0.3) +
        facetGem(330, 240, 78, 'url(#ruFace)', -0.2) +
        facetGem(252, 338, 70, 'url(#amFace)', 0.55) +
        sparkle(166, 186, 22) + sparkle(330, 206, 17, 0.85) + sparkle(244, 312, 13, 0.8);
    return olympusTile('#14624a', content, defs);
}

function olyWild() {
    const defs = lg('wreath', [[0, '#ffe98a'], [0.5, '#d4af37'], [1, '#7a5a10']]) +
        lg('wildTxt', [[0, '#fff6cf'], [0.45, '#ffd86b'], [1, '#a87b14']]) + glowFilter('wGlow', 10, '#ffb300', 0.8);
    let leaves = '';
    for (let i = 0; i < 8; i++) {
        for (const side of [-1, 1]) {
            const a = Math.PI / 2 + side * (0.55 + i * 0.21);
            const x = 256 + Math.cos(a) * 158;
            const y = 268 + Math.sin(a) * 158;
            const rot = ((a + Math.PI / 2) * 180) / Math.PI + side * 24;
            leaves += `<g transform="rotate(${rot.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)})">` +
                `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="14" ry="34" fill="url(#wreath)" stroke="#6b4e0a" stroke-width="2"/></g>`;
        }
    }
    const content =
        `<circle cx="256" cy="268" r="158" fill="none" stroke="#7a5a10" stroke-width="10" opacity="0.6"/>` +
        leaves +
        `<g filter="url(#wGlow)">${text('WILD', 256, 296, 96, 'url(#wildTxt)', { stroke: '#4a2c08', sw: 14, ls: 4 })}</g>` +
        `<polygon points="${P(star(256, 138, 4, 26, 10))}" fill="#fff6cf"/>` +
        sparkle(352, 360, 18, 0.85);
    return olympusTile('#5a160f', content, defs);
}

function olyOrb() {
    const defs =
        rg('orbBody', [[0, '#f3d4ff'], [0.35, '#b04ae0'], [0.75, '#5e1a8a'], [1, '#2a0845']], 0.38, 0.32, 0.85) +
        lg('orbRing', GOLD_STOPS) + glowFilter('orbGlow', 18, '#c44dff', 0.95) + blurFilter('soft5', 5);
    const arc = (d, o, w) => `<path d="${d}" fill="none" stroke="#f0c4ff" stroke-width="${w}" stroke-linecap="round" opacity="${o}"/>`;
    const content =
        `<g filter="url(#orbGlow)"><circle cx="256" cy="262" r="140" fill="url(#orbBody)"/></g>` +
        `<g filter="url(#soft5)">` +
        arc('M196,180 Q256,262 200,344', 0.8, 7) + arc('M318,186 Q250,266 314,340', 0.7, 6) +
        arc('M170,262 Q256,230 342,266', 0.6, 5) + `</g>` +
        `<polygon points="238,196 286,196 260,254 292,254 226,338 248,272 220,272" fill="#ffffff" opacity="0.95"/>` +
        `<circle cx="256" cy="262" r="140" fill="none" stroke="url(#orbRing)" stroke-width="13"/>` +
        `<circle cx="256" cy="262" r="129" fill="none" stroke="#3a1158" stroke-width="4" opacity="0.8"/>` +
        `<ellipse cx="210" cy="206" rx="44" ry="26" fill="#ffffff" opacity="0.4" transform="rotate(-28 210 206)"/>` +
        sparkle(206, 198, 20) + sparkle(316, 318, 14, 0.8);
    return olympusTile('#2c1540', content, defs);
}

/* =============================== VEGAS =================================== */
/* Dark glass tiles, chrome bezel, neon accent ring, glossy icons. */

function vegasTile(accent, content, extraDefs = '') {
    const defs =
        lg('chrome', [[0, '#fafdff'], [0.3, '#9aa7b8'], [0.5, '#e6edf4'], [0.75, '#55606e'], [1, '#c4cfdc']]) +
        lg('glass', [[0, '#343b4e'], [0.5, '#171b28'], [1, '#0a0c14']]) +
        rg('glassLite', [[0, lighten(accent, 0.15), 0.32], [0.7, accent, 0.05], [1, '#000000', 0]], 0.5, 0.3, 0.8) +
        glowFilter('neon', 11, accent, 0.95) +
        dropShadow('vShadow', 12, 14, 0.6) + extraDefs;
    return svgDoc(512, 512, `<defs>${defs}</defs>
<g filter="url(#vShadow)">
  <rect x="22" y="20" width="468" height="468" rx="64" fill="url(#chrome)" stroke="#39414c" stroke-width="4"/>
  <rect x="44" y="42" width="424" height="424" rx="48" fill="url(#glass)"/>
  <rect x="44" y="42" width="424" height="424" rx="48" fill="url(#glassLite)"/>
  <g filter="url(#neon)"><rect x="58" y="56" width="396" height="396" rx="40" fill="none" stroke="${accent}" stroke-width="5"/></g>
  <rect x="58" y="56" width="396" height="396" rx="40" fill="none" stroke="${lighten(accent, 0.55)}" stroke-width="2" opacity="0.9"/>
  ${content}
  <path d="M70,150 Q256,40 442,150 L442,84 Q442,60 418,60 L94,60 Q70,60 70,84 Z" fill="#ffffff" opacity="0.07"/>
</g>`);
}

function vCherry() {
    const defs = rg('cher', [[0, '#ffb3ba'], [0.3, '#f2384e'], [0.8, '#a40f22'], [1, '#5e0510']], 0.35, 0.3, 0.8) +
        lg('leafG', [[0, '#7ed26a'], [1, '#1f7d2c']]) + dropShadow('cDrop', 8, 7, 0.5);
    const content =
        `<path d="M262,118 C212,150 172,240 186,322" fill="none" stroke="#7a5230" stroke-width="13" stroke-linecap="round"/>` +
        `<path d="M262,118 C302,160 330,250 318,330" fill="none" stroke="#7a5230" stroke-width="13" stroke-linecap="round"/>` +
        `<path d="M262,118 C292,84 348,78 384,104 C352,128 300,134 262,118 Z" fill="url(#leafG)" stroke="#15601f" stroke-width="3"/>` +
        `<path d="M268,114 C310,96 350,96 376,104" fill="none" stroke="#1f7d2c" stroke-width="3" opacity="0.8"/>` +
        `<g filter="url(#cDrop)"><circle cx="178" cy="354" r="74" fill="url(#cher)"/></g>` +
        `<g filter="url(#cDrop)"><circle cx="322" cy="364" r="80" fill="url(#cher)"/></g>` +
        `<ellipse cx="152" cy="326" rx="22" ry="14" fill="#ffffff" opacity="0.65" transform="rotate(-30 152 326)"/>` +
        `<ellipse cx="296" cy="334" rx="24" ry="15" fill="#ffffff" opacity="0.65" transform="rotate(-30 296 334)"/>` +
        sparkle(204, 318, 12, 0.9);
    return vegasTile('#ff5a6e', content, defs);
}

function vBell() {
    const bell = (fill) =>
        `<path d="M256,108 C198,108 184,184 178,262 C175,294 162,310 150,322 L362,322 C350,310 337,294 334,262 C328,184 314,108 256,108 Z" fill="${fill}"/>`;
    const defs = lg('bellFace', [[0, '#fff4c4'], [0.35, '#ffce3d'], [0.75, '#d39516'], [1, '#8a5d0a']]) +
        dropShadow('bDrop', 7, 6, 0.45);
    const content =
        `<circle cx="256" cy="100" r="17" fill="#8a5d0a"/><circle cx="256" cy="98" r="12" fill="#ffce3d"/>` +
        extrude(bell, 9, '#6e4a08') + `<g filter="url(#bDrop)">${bell('url(#bellFace)')}</g>` +
        `<path d="M196,150 C188,196 186,236 184,268" fill="none" stroke="#fff4c4" stroke-width="12" stroke-linecap="round" opacity="0.7"/>` +
        `<rect x="142" y="322" width="228" height="26" rx="13" fill="#8a5d0a"/>` +
        `<rect x="142" y="318" width="228" height="18" rx="9" fill="#ffce3d"/>` +
        `<circle cx="256" cy="374" r="26" fill="#b27812"/><circle cx="248" cy="366" r="9" fill="#ffe9a0" opacity="0.85"/>` +
        sparkle(206, 142, 16, 0.9);
    return vegasTile('#ffd54f', content, defs);
}

function vBar() {
    const defs = lg('barGold', [[0, '#fff4c4'], [0.4, '#ffce3d'], [1, '#9a6a0c']]) +
        lg('barChrome', [[0, '#ffffff'], [0.45, '#aab6c4'], [1, '#5c6876']]) + dropShadow('barDrop', 6, 5, 0.5);
    const plate = (y, grad, txtFill) =>
        `<g filter="url(#barDrop)" transform="rotate(-4 256 ${y + 32})">` +
        `<rect x="118" y="${y}" width="276" height="74" rx="16" fill="${grad}" stroke="#2c2317" stroke-width="4"/>` +
        `<rect x="126" y="${y + 6}" width="260" height="30" rx="12" fill="#ffffff" opacity="0.25"/>` +
        text('BAR', 256, y + 56, 54, txtFill, { stroke: '#ffffff', sw: 0, ls: 8 }) + `</g>`;
    const content =
        plate(122, 'url(#barChrome)', '#1b2027') +
        plate(222, 'url(#barGold)', '#3a2a08') +
        plate(322, 'url(#barChrome)', '#1b2027') +
        sparkle(146, 136, 13, 0.9);
    return vegasTile('#4fd0ff', content, defs);
}

function vCoin() {
    const defs = rg('coinFace', [[0, '#fff4c4'], [0.45, '#ffce3d'], [0.85, '#d39516'], [1, '#8a5d0a']], 0.38, 0.32, 0.8) +
        lg('coinTxt', [[0, '#8a5d0a'], [1, '#5e3d06']]) + dropShadow('coDrop', 9, 8, 0.5);
    let ridges = '';
    for (let i = 0; i < 36; i++) {
        const a = (Math.PI * 2 * i) / 36;
        const x1 = 256 + Math.cos(a) * 154, y1 = 268 + Math.sin(a) * 154;
        const x2 = 256 + Math.cos(a) * 168, y2 = 268 + Math.sin(a) * 168;
        ridges += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#8a5d0a" stroke-width="9"/>`;
    }
    const content =
        `<g filter="url(#coDrop)"><circle cx="256" cy="268" r="168" fill="#b27812"/></g>` + ridges +
        `<circle cx="256" cy="268" r="154" fill="url(#coinFace)" stroke="#8a5d0a" stroke-width="5"/>` +
        `<circle cx="256" cy="268" r="120" fill="none" stroke="#8a5d0a" stroke-width="4" opacity="0.7"/>` +
        text('$', 256, 330, 170, 'url(#coinTxt)', { stroke: '#fff4c4', sw: 5 }) +
        `<path d="M150,180 A140,140 0 0 1 250,124" fill="none" stroke="#ffffff" stroke-width="16" stroke-linecap="round" opacity="0.5"/>` +
        sparkle(346, 172, 20, 0.95);
    return vegasTile('#ffc83d', content, defs);
}

function vDiamond() {
    const pts = [[256, 96], [368, 200], [256, 420], [144, 200]];
    const mid = [[200, 200], [256, 152], [312, 200], [256, 252]];
    const defs = lg('diaB', [[0, '#eafcff'], [0.5, '#54d6f2'], [1, '#0a7da0']]) + glowFilter('diaGlow', 12, '#6fe9ff', 0.8);
    const content =
        `<g filter="url(#diaGlow)"><polygon points="${P(pts)}" fill="url(#diaB)" stroke="#066a8a" stroke-width="4"/></g>` +
        `<polygon points="${P([pts[0], mid[1], mid[0], pts[3]])}" fill="#ffffff" opacity="0.55"/>` +
        `<polygon points="${P([pts[0], pts[1], mid[2], mid[1]])}" fill="#9bf0ff" opacity="0.5"/>` +
        `<polygon points="${P([pts[3], mid[0], mid[3], pts[2]])}" fill="#067a9e" opacity="0.55"/>` +
        `<polygon points="${P([mid[2], pts[1], pts[2], mid[3]])}" fill="#0993bd" opacity="0.6"/>` +
        `<polygon points="${P(mid)}" fill="#d2f7ff" opacity="0.75"/>` +
        sparkle(216, 160, 26) + sparkle(312, 296, 16, 0.85);
    return vegasTile('#6fe9ff', content, defs);
}

function vSeven() {
    const defs = lg('sevFace', [[0, '#ff8a8a'], [0.35, '#f2253d'], [0.8, '#9e0a20'], [1, '#5e0512']]) +
        glowFilter('sevGlow', 14, '#ff3b54', 0.85);
    const seven = (fill, stroke = 'none', sw = 0) =>
        text('7', 256, 392, 340, fill, { stroke, sw, ls: 0 });
    const content =
        `<g filter="url(#sevGlow)">${seven('#ff5a6e')}</g>` +
        Array.from({ length: 12 }, (_, i) => `<g transform="translate(${(i * 0.5).toFixed(1)},${i + 1})">${seven('#4e0410')}</g>`).reverse().join('') +
        seven('url(#sevFace)', '#ffd9b0', 5) +
        `<polygon points="168,128 352,128 344,166 184,166" fill="#ffffff" opacity="0.4"/>` +
        sparkle(196, 142, 20, 0.95) + sparkle(296, 348, 15, 0.8);
    return vegasTile('#ff3b54', content, defs);
}

function vWild() {
    const burst = star(256, 256, 12, 196, 120);
    const defs = lg('burstG', [[0, '#ff9d3d'], [0.6, '#e03616'], [1, '#7e1505']]) +
        lg('wTxt', [[0, '#fff6cf'], [0.45, '#ffd86b'], [1, '#a87b14']]) + glowFilter('wiGlow', 12, '#ffae2b', 0.9);
    const content =
        `<g filter="url(#wiGlow)"><polygon points="${P(burst)}" fill="url(#burstG)" stroke="#5e0e02" stroke-width="5"/></g>` +
        `<polygon points="${P(star(256, 256, 12, 158, 98))}" fill="#ffffff" opacity="0.14"/>` +
        text('WILD', 256, 296, 104, 'url(#wTxt)', { stroke: '#4a2208', sw: 14, ls: 2 }) +
        sparkle(150, 152, 18, 0.9) + sparkle(366, 344, 14, 0.85);
    return vegasTile('#ffe25a', content, defs);
}

function vBonus() {
    const defs = rg('bonB', [[0, '#7e3ff2', 0.85], [0.7, '#3d1180', 0.85], [1, '#1c0640', 0.9]], 0.5, 0.4, 0.75) +
        lg('bonTxt', [[0, '#ffffff'], [0.5, '#e8c4ff'], [1, '#9b5cf0']]) + glowFilter('boGlow', 13, '#c06bff', 0.95);
    const content =
        `<g filter="url(#boGlow)"><circle cx="256" cy="256" r="170" fill="url(#bonB)" stroke="#c06bff" stroke-width="6"/></g>` +
        `<circle cx="256" cy="256" r="148" fill="none" stroke="#e8c4ff" stroke-width="2.5" opacity="0.7" stroke-dasharray="4 14"/>` +
        `<polygon points="${P(star(256, 184, 5, 52, 22))}" fill="#ffd86b" stroke="#a87b14" stroke-width="3"/>` +
        text('BONUS', 256, 326, 78, 'url(#bonTxt)', { stroke: '#2a0a4e', sw: 12, ls: 3 }) +
        sparkle(338, 160, 16, 0.9) + sparkle(176, 330, 12, 0.8);
    return vegasTile('#c06bff', content, defs);
}

/* =============================== JEWELS ================================== */
/* Frameless faceted gems with per-facet lighting. */

function gemSVG(uid, { pts, base, accent, tableScale = 0.52, palette = null, extra = '', cx = 256, cy = 256 }) {
    const t = pts.map((p) => [p[0] + (cx - p[0]) * tableScale, p[1] + (cy - p[1]) * tableScale]);
    const lightA = -2.35; // key light top-left
    let facets = '';
    const n = pts.length;
    for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const mid = [(pts[i][0] + pts[j][0]) / 2, (pts[i][1] + pts[j][1]) / 2];
        const ang = Math.atan2(mid[1] - cy, mid[0] - cx);
        const bright = 0.5 + 0.5 * Math.cos(ang - lightA);
        const col = palette ? palette[i % palette.length] : base;
        const f1 = mix(darken(col, 0.5), lighten(col, 0.62), bright);
        const f2 = mix(darken(col, 0.62), lighten(col, 0.35), 1 - Math.abs(bright - 0.5));
        facets += `<polygon points="${P([pts[i], pts[j], t[i]])}" fill="${f1}"/>`;
        facets += `<polygon points="${P([pts[j], t[j], t[i]])}" fill="${f2}"/>`;
    }
    const defs =
        rg(`${uid}tab`, [[0, lighten(base, 0.55)], [0.6, lighten(base, 0.12)], [1, base]], 0.42, 0.36, 0.8) +
        glowFilter(`${uid}glow`, 16, accent, 0.75) +
        dropShadow(`${uid}drop`, 14, 12, 0.55);
    const body =
        `<g filter="url(#${uid}drop)"><g filter="url(#${uid}glow)">` +
        `<polygon points="${P(pts)}" fill="${darken(base, 0.35)}"/></g>` +
        facets +
        `<polygon points="${P(t)}" fill="url(#${uid}tab)"/>` +
        `<polygon points="${P(pts)}" fill="none" stroke="${darken(base, 0.55)}" stroke-width="4" stroke-linejoin="round"/>` +
        `<polygon points="${P(t)}" fill="none" stroke="${lighten(base, 0.7)}" stroke-width="2" opacity="0.6"/>` +
        extra +
        sparkle(t[0][0], t[0][1], 24) +
        sparkle(pts[Math.floor(n * 0.6)][0], pts[Math.floor(n * 0.6)][1], 14, 0.8) +
        `</g>`;
    return svgDoc(512, 512, `<defs>${defs}</defs>${body}`);
}

const ring = (cx, cy, rx, ry, n, rot = 0, squish = 1) =>
    Array.from({ length: n }, (_, i) => {
        const a = (Math.PI * 2 * i) / n + rot;
        return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry * squish];
    });

function jRed() { // Ruby — cushion octagon
    const w = 188, c = 78;
    const pts = [[256 - w + c, 256 - w], [256 + w - c, 256 - w], [256 + w, 256 - w + c], [256 + w, 256 + w - c],
        [256 + w - c, 256 + w], [256 - w + c, 256 + w], [256 - w, 256 + w - c], [256 - w, 256 - w + c]];
    return gemSVG('jr', { pts, base: '#e0233a', accent: '#ff8a80' });
}
function jOrange() { // Amber — hexagon
    return gemSVG('jo', { pts: ring(256, 256, 196, 196, 6, Math.PI / 6), base: '#f5840c', accent: '#ffcc80' });
}
function jYellow() { // Topaz — round brilliant 12-gon
    return gemSVG('jy', { pts: ring(256, 256, 198, 198, 12, Math.PI / 12), base: '#f2c40c', accent: '#fff59d', tableScale: 0.56 });
}
function jGreen() { // Emerald — emerald cut
    const w = 150, h = 196, c = 52;
    const pts = [[256 - w + c, 256 - h], [256 + w - c, 256 - h], [256 + w, 256 - h + c], [256 + w, 256 + h - c],
        [256 + w - c, 256 + h], [256 - w + c, 256 + h], [256 - w, 256 + h - c], [256 - w, 256 - h + c]];
    const steps =
        `<polygon points="${P(pts.map((p) => [p[0] + (256 - p[0]) * 0.18, p[1] + (256 - p[1]) * 0.18]))}" fill="none" stroke="#03522f" stroke-width="3" opacity="0.6"/>` +
        `<polygon points="${P(pts.map((p) => [p[0] + (256 - p[0]) * 0.34, p[1] + (256 - p[1]) * 0.34]))}" fill="none" stroke="#9fffce" stroke-width="2" opacity="0.5"/>`;
    return gemSVG('jg', { pts, base: '#13a05e', accent: '#a5d6a7', tableScale: 0.5, extra: steps });
}
function jBlue() { // Sapphire — oval
    return gemSVG('jb', { pts: ring(256, 256, 162, 208, 12, Math.PI / 12, 1), base: '#1668d8', accent: '#90caf9', tableScale: 0.5 });
}
function jPurple() { // Amethyst — pear / teardrop
    const pts = [[256, 58], [330, 134], [368, 238], [348, 330], [292, 398], [256, 412], [220, 398], [164, 330], [144, 238], [182, 134]];
    return gemSVG('jp', { pts, base: '#8e24aa', accent: '#ce93d8', tableScale: 0.5 });
}
function jWild() { // Wild — prismatic diamond + banner
    const palette = ['#f25c5c', '#f2a93d', '#efe04a', '#5cd874', '#53c8f2', '#7a6cf2', '#c45cf2', '#f25cc1'];
    const banner =
        `<rect x="74" y="218" width="364" height="86" rx="20" fill="#191427" opacity="0.92" stroke="#ffd86b" stroke-width="4"/>` +
        text('WILD', 256, 284, 64, '#ffd86b', { stroke: '#231a05', sw: 8, ls: 6 });
    return gemSVG('jw', { pts: ring(256, 256, 200, 200, 12, Math.PI / 12), base: '#e8ecf5', accent: '#fff176', palette, tableScale: 0.55, extra: banner });
}
function jStar() { // Scatter — faceted gold star
    const pts = star(256, 266, 5, 212, 104);
    const inner = `<polygon points="${P(star(256, 266, 5, 122, 56))}" fill="#fff6cf" opacity="0.35"/>`;
    return gemSVG('js', { pts, base: '#f2b91d', accent: '#fff9c4', tableScale: 0.42, cx: 256, cy: 266, extra: inner });
}

/* ================================ EGYPT ================================== */
/* Sandstone cartouche tiles with gold hieroglyph reliefs. */

function egyptTile(panelColor, content, extraDefs = '') {
    const defs =
        lg('sand', [[0, '#efdcae'], [0.45, '#d3b377'], [1, '#8a6b35']]) +
        lg('egGold', GOLD_STOPS) +
        rg('epanel', [[0, lighten(panelColor, 0.35)], [0.55, panelColor], [1, darken(panelColor, 0.5)]], 0.5, 0.36, 0.85) +
        rg('evig', [[0.55, '#000000', 0], [1, '#000000', 0.5]], 0.5, 0.5, 0.72) +
        dropShadow('eShadow', 12, 14, 0.55) + extraDefs;
    let glyphs = '';
    for (let i = 0; i < 7; i++) {
        const x = 84 + i * 58;
        glyphs += `<circle cx="${x}" cy="40" r="5" fill="#7a5a10"/><circle cx="${x}" cy="472" r="5" fill="#7a5a10"/>`;
    }
    return svgDoc(512, 512, `<defs>${defs}</defs>
<g filter="url(#eShadow)">
  <rect x="20" y="18" width="472" height="472" rx="40" fill="url(#sand)" stroke="#5e4a1e" stroke-width="4"/>
  <rect x="34" y="32" width="444" height="444" rx="32" fill="none" stroke="url(#egGold)" stroke-width="7"/>
  <rect x="52" y="50" width="408" height="408" rx="24" fill="url(#epanel)"/>
  <rect x="52" y="50" width="408" height="408" rx="24" fill="url(#evig)"/>
  <rect x="52" y="50" width="408" height="408" rx="24" fill="none" stroke="#2b2010" stroke-width="3" opacity="0.7"/>
  ${glyphs}
  ${content}
  <path d="M68,136 Q256,54 444,136 L444,88 Q444,66 422,66 L90,66 Q68,66 68,88 Z" fill="#fff3d0" opacity="0.07"/>
</g>`);
}

function eAnkh() {
    const ankh = (fill) =>
        `<path d="M256,96 C198,96 178,148 178,182 C178,216 204,242 230,252 L230,266 L162,266 L162,302 L230,302 L230,432 L282,432 L282,302 L350,302 L350,266 L282,266 L282,252 C308,242 334,216 334,182 C334,148 314,96 256,96 Z ` +
        `M256,134 C290,134 298,164 298,182 C298,202 280,220 256,220 C232,220 214,202 214,182 C214,164 222,134 256,134 Z" fill-rule="evenodd" fill="${fill}"/>`;
    const defs = lg('ankhFace', [[0, '#fff6cf'], [0.4, '#ffd86b'], [0.8, '#c89627'], [1, '#8a6512']]);
    const content =
        extrude(ankh, 10, '#6b4e0a') + ankh('url(#ankhFace)') +
        `<path d="M232,116 C212,128 200,152 198,176" fill="none" stroke="#fffbe2" stroke-width="8" stroke-linecap="round" opacity="0.7"/>` +
        sparkle(316, 130, 18, 0.9) + sparkle(204, 380, 12, 0.7);
    return egyptTile('#6d4c1e', content, defs);
}

function eLotus() {
    const defs = lg('petalC', [[0, '#9fe8e0'], [0.55, '#26a69a'], [1, '#0c5a52']]) +
        lg('petalS', [[0, '#7ad4ca'], [0.6, '#1c8a7e'], [1, '#0a4a44']]) +
        lg('lotusBase', [[0, '#ffd86b'], [1, '#8a6512']]);
    let petals = '';
    for (const [i, side] of [[2, -1], [2, 1], [1, -1], [1, 1], [0, 0]]) {
        const a = side * (i * 0.46);
        const px = 256 + Math.sin(a) * 118;
        const py = 250 - Math.cos(a) * 96;
        const rot = (a * 180) / Math.PI;
        const fill = i === 0 ? 'url(#petalC)' : 'url(#petalS)';
        petals += `<g transform="rotate(${rot.toFixed(1)} ${px.toFixed(1)} ${py.toFixed(1)})">` +
            `<ellipse cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" rx="${i === 0 ? 52 : 42}" ry="${i === 0 ? 118 : 96}" fill="${fill}" stroke="#0a4a44" stroke-width="3"/>` +
            `<ellipse cx="${(px - 12).toFixed(1)}" cy="${(py - 30).toFixed(1)}" rx="10" ry="${i === 0 ? 56 : 40}" fill="#ffffff" opacity="0.3"/></g>`;
    }
    const content =
        petals +
        `<path d="M186,330 L326,330 L296,420 L216,420 Z" fill="url(#lotusBase)" stroke="#6b4e0a" stroke-width="4"/>` +
        `<line x1="216" y1="344" x2="296" y2="344" stroke="#8a6512" stroke-width="5" opacity="0.8"/>` +
        `<line x1="226" y1="370" x2="286" y2="370" stroke="#8a6512" stroke-width="5" opacity="0.8"/>` +
        sparkle(256, 148, 18, 0.9);
    return egyptTile('#1e5a52', content, defs);
}

function eScarab() {
    const defs = rg('scarB', [[0, '#7ff2e4'], [0.45, '#16b8a4'], [1, '#063f38']], 0.4, 0.32, 0.85) +
        lg('scarG', [[0, '#fff6cf'], [0.5, '#ffd86b'], [1, '#8a6512']]) +
        rg('sunB', [[0, '#fff3b0'], [0.5, '#ff9d3d'], [1, '#c84e08']], 0.4, 0.35, 0.8) + glowFilter('sunGlow', 12, '#ffae2b', 0.9);
    const legs = [[-1, -0.6], [-1, 0.1], [-1, 0.75], [1, -0.6], [1, 0.1], [1, 0.75]].map(([sd, k]) =>
        `<path d="M${256 + sd * 70},${292 + k * 40} q${sd * 56},${-18 + k * 20} ${sd * 88},${10 + k * 34}" fill="none" stroke="url(#scarG)" stroke-width="14" stroke-linecap="round"/>`).join('');
    const content =
        `<g filter="url(#sunGlow)"><circle cx="256" cy="126" r="40" fill="url(#sunB)"/></g>` +
        legs +
        `<path d="M256,176 a44,40 0 1 1 -0.1,0 Z" fill="url(#scarB)" stroke="#06352e" stroke-width="4"/>` +
        `<ellipse cx="256" cy="312" rx="92" ry="86" fill="url(#scarB)" stroke="#06352e" stroke-width="5"/>` +
        `<line x1="256" y1="232" x2="256" y2="396" stroke="#06352e" stroke-width="5" opacity="0.8"/>` +
        `<path d="M188,266 Q256,292 324,266" fill="none" stroke="#06352e" stroke-width="4" opacity="0.7"/>` +
        `<ellipse cx="218" cy="288" rx="20" ry="12" fill="#b2fff4" opacity="0.4"/>` +
        `<circle cx="240" cy="196" r="6" fill="#063f38"/><circle cx="272" cy="196" r="6" fill="#063f38"/>` +
        sparkle(238, 122, 14, 0.9) + sparkle(300, 348, 13, 0.75);
    return egyptTile('#0f4c5c', content, defs);
}

function eHorus() {
    const defs = lg('eyeG', [[0, '#fff6cf'], [0.45, '#ffd86b'], [1, '#9a720f']]) +
        rg('iris', [[0, '#9fd8ff'], [0.45, '#1f6fd0'], [1, '#0a2050']], 0.4, 0.35, 0.8);
    const stroke = (d, w) => `<path d="${d}" fill="none" stroke="url(#eyeG)" stroke-width="${w}" stroke-linecap="round"/>`;
    const strokeDark = (d, w) => `<path d="${d}" fill="none" stroke="#4a3508" stroke-width="${w + 7}" stroke-linecap="round"/>`;
    const parts = [
        ['M116,180 Q256,96 396,180', 26], // brow
        ['M136,236 Q256,160 376,236 Q256,308 136,236 Z', 18], // lid
        ['M134,242 L96,228', 18], // kohl toward nose
        ['M196,288 L182,398', 20], // teardrop
        ['M312,282 Q372,344 332,380 Q300,394 296,360', 20], // spiral
    ];
    const content =
        parts.map(([d, w]) => strokeDark(d, w)).join('') +
        `<path d="M136,236 Q256,160 376,236 Q256,308 136,236 Z" fill="#10204a"/>` +
        parts.map(([d, w]) => stroke(d, w)).join('') +
        `<circle cx="256" cy="234" r="52" fill="url(#iris)" stroke="url(#eyeG)" stroke-width="10"/>` +
        `<circle cx="256" cy="234" r="20" fill="#06122e"/>` +
        `<circle cx="240" cy="216" r="11" fill="#ffffff" opacity="0.9"/>` +
        sparkle(366, 160, 18, 0.9);
    return egyptTile('#283593', content, defs);
}

function eAnubis() {
    const head = (fill) =>
        `<path d="M206,118 L236,178 L268,170 L252,108 L228,84 Z" fill="${fill}"/>` + // front ear
        `<path d="M148,140 L184,196 L212,184 L192,118 L160,102 Z" fill="${fill}"/>` + // back ear
        `<path d="M170,182 Q230,148 280,170 L396,238 Q412,248 398,260 L300,254 Q286,300 278,360 L282,432 L172,432 Q156,300 170,182 Z" fill="${fill}"/>`;
    const defs = lg('anuB', [[0, '#3a3a55'], [0.5, '#1c1c30'], [1, '#0a0a16']]) +
        lg('anuG', [[0, '#fff6cf'], [0.5, '#ffd86b'], [1, '#8a6512']]);
    const content =
        extrude(head, 8, '#05050c') + head('url(#anuB)') +
        `<path d="M210,124 L236,170" stroke="#ffd86b" stroke-width="6" opacity="0.7"/>` +
        `<path d="M280,170 L380,232" stroke="#4a4a6a" stroke-width="5" opacity="0.6"/>` +
        `<ellipse cx="268" cy="206" rx="16" ry="9" fill="url(#anuG)" transform="rotate(14 268 206)"/>` +
        `<circle cx="268" cy="206" r="4" fill="#10101e"/>` +
        `<path d="M160,392 L292,392 L300,432 L152,432 Z" fill="url(#anuG)" stroke="#6b4e0a" stroke-width="4"/>` +
        `<line x1="170" y1="408" x2="294" y2="408" stroke="#8a6512" stroke-width="5"/>` +
        `<line x1="166" y1="422" x2="298" y2="422" stroke="#8a6512" stroke-width="5"/>` +
        sparkle(214, 134, 12, 0.8) + sparkle(330, 226, 12, 0.7);
    return egyptTile('#1a1a2e', content, defs);
}

function ePharaoh() {
    const defs =
        lg('nemes', [[0, '#ffd86b'], [0.12, '#ffd86b'], [0.12, '#1f4fa0'], [0.24, '#1f4fa0'], [0.24, '#ffd86b'], [0.36, '#ffd86b'],
            [0.36, '#1f4fa0'], [0.48, '#1f4fa0'], [0.48, '#ffd86b'], [0.6, '#ffd86b'], [0.6, '#1f4fa0'], [0.72, '#1f4fa0'],
            [0.72, '#ffd86b'], [0.84, '#ffd86b'], [0.84, '#1f4fa0'], [1, '#1f4fa0']], 0, 0, 1, 0) +
        rg('face', [[0, '#ffe9a0'], [0.55, '#e8b54a'], [1, '#9a6a14']], 0.42, 0.35, 0.85) +
        lg('phG', [[0, '#fff6cf'], [0.5, '#ffd86b'], [1, '#8a6512']]);
    const nemesPath = 'M150,432 L150,250 Q150,118 256,108 Q362,118 362,250 L362,432 L296,432 L296,330 Q256,300 216,330 L216,432 Z';
    const content =
        `<g transform="translate(4,10)" opacity="0.5"><path d="${nemesPath}" fill="#000000"/></g>` +
        `<path d="${nemesPath}" fill="url(#nemes)" stroke="#143468" stroke-width="5"/>` +
        `<path d="M174,150 Q256,118 338,150 L338,182 Q256,150 174,182 Z" fill="url(#phG)" stroke="#6b4e0a" stroke-width="3"/>` + // headband
        `<path d="M246,84 Q238,108 250,128 Q262,116 258,96 Q268,86 262,72 Z" fill="url(#phG)" stroke="#6b4e0a" stroke-width="3"/>` + // uraeus
        `<ellipse cx="256" cy="262" rx="72" ry="88" fill="url(#face)"/>` +
        `<path d="M222,238 q16,-12 32,0" fill="none" stroke="#5e3d06" stroke-width="7" stroke-linecap="round"/>` +
        `<path d="M258,238 q16,-12 32,0" fill="none" stroke="#5e3d06" stroke-width="7" stroke-linecap="round"/>` +
        `<ellipse cx="238" cy="252" rx="13" ry="7" fill="#171717"/><ellipse cx="274" cy="252" rx="13" ry="7" fill="#171717"/>` +
        `<path d="M252,268 L248,296 L264,296" fill="none" stroke="#9a6a14" stroke-width="5" stroke-linecap="round"/>` +
        `<path d="M236,316 Q256,328 276,316" fill="none" stroke="#7a4e0e" stroke-width="6" stroke-linecap="round"/>` +
        `<rect x="243" y="346" width="26" height="74" rx="10" fill="url(#phG)" stroke="#6b4e0a" stroke-width="3"/>` +
        `<line x1="243" y1="366" x2="269" y2="366" stroke="#6b4e0a" stroke-width="4"/>` +
        `<line x1="243" y1="386" x2="269" y2="386" stroke="#6b4e0a" stroke-width="4"/>` +
        `<ellipse cx="216" cy="178" rx="34" ry="56" fill="#ffffff" opacity="0.12" transform="rotate(18 216 178)"/>` +
        sparkle(330, 142, 16, 0.85);
    return egyptTile('#4a3208', content, defs);
}

function eWild() {
    const defs = rg('sunW', [[0, '#fff3b0'], [0.45, '#ffae2b'], [1, '#c84e08']], 0.4, 0.35, 0.8) +
        lg('phG2', [[0, '#fff6cf'], [0.5, '#ffd86b'], [1, '#8a6512']]) +
        glowFilter('sunWGlow', 16, '#ffae2b', 0.95);
    let wings = '';
    for (const side of [-1, 1]) {
        for (let row = 0; row < 3; row++) {
            for (let i = 0; i < 6; i++) {
                const t = i / 5;
                const len = (96 - row * 22) * (1 - t * 0.35);
                const bx = 256 + side * (54 + i * 24);
                const by = 196 + row * 16 + t * 26;
                const rot = side * (18 + t * 38);
                const col = row === 1 ? '#1f4fa0' : 'url(#phG2)';
                wings += `<g transform="rotate(${rot.toFixed(1)} ${bx} ${by})">` +
                    `<rect x="${bx - 7}" y="${by}" width="14" height="${len.toFixed(0)}" rx="7" fill="${col}" stroke="#6b4e0a" stroke-width="2"/></g>`;
            }
        }
    }
    const content =
        wings +
        `<g filter="url(#sunWGlow)"><circle cx="256" cy="196" r="58" fill="url(#sunW)"/></g>` +
        `<circle cx="256" cy="196" r="58" fill="none" stroke="#8a4a08" stroke-width="5"/>` +
        `<circle cx="238" cy="178" r="14" fill="#ffffff" opacity="0.6"/>` +
        text('WILD', 256, 408, 86, 'url(#phG2)', { stroke: '#3a2608', sw: 12, ls: 5 }) +
        sparkle(256, 132, 18, 0.95);
    return egyptTile('#7a3b06', content, defs);
}

function ePyramid() {
    const defs = lg('pyrL', [[0, '#ffe9a0'], [0.6, '#d9a94e'], [1, '#9a6a14']]) +
        lg('pyrD', [[0, '#8a6512'], [1, '#4a3208']]) +
        rg('cap', [[0, '#ffffff'], [0.4, '#ffe98a'], [1, '#ffae2b']], 0.45, 0.4, 0.8) + glowFilter('capGlow', 14, '#ffd86b', 0.95);
    let bricks = '';
    for (let i = 1; i < 7; i++) {
        const y = 128 + ((404 - 128) * i) / 7;
        const t = (y - 110) / (404 - 110);
        bricks += `<line x1="${256 - 158 * t}" y1="${y}" x2="${256 + 36 * t}" y2="${y}" stroke="#6e4a0c" stroke-width="3" opacity="0.4"/>`;
    }
    const content =
        `<polygon points="256,110 98,404 292,404" fill="url(#pyrL)" stroke="#6e4a0c" stroke-width="4"/>` +
        `<polygon points="256,110 292,404 414,404" fill="url(#pyrD)" stroke="#4a3208" stroke-width="4"/>` +
        bricks +
        `<g filter="url(#capGlow)"><polygon points="256,110 222,174 290,174" fill="url(#cap)"/></g>` +
        `<polygon points="256,110 222,174 290,174" fill="none" stroke="#b27812" stroke-width="3"/>` +
        text('SCATTER', 256, 452, 44, '#ffe98a', { stroke: '#3a2608', sw: 8, ls: 4 }) +
        sparkle(256, 102, 20) + sparkle(196, 300, 12, 0.6);
    return egyptTile('#33260c', content, defs);
}

/* ============================ MINES (Slot 7) ============================= */

function mTile() {
    // Unrevealed tile back: steel-sapphire slab, gold rim, engraved rhombus.
    const defs =
        lg('mtFrame', [[0, '#5a708c'], [0.45, '#2c3c52'], [0.55, '#46586f'], [1, '#141d2b']]) +
        rg('mtPanel', [[0, '#27374e'], [0.6, '#16202f'], [1, '#0a101a']], 0.5, 0.38, 0.85) +
        lg('mtRim', [[0, '#fff6cf'], [0.5, '#d4af37'], [1, '#7a5a10']]) +
        dropShadow('mtShadow', 12, 13, 0.55);
    const rhomb = (off, color, alpha = 1) =>
        `<polygon points="${P([[256, 166 + off], [346, 256 + off], [256, 346 + off], [166, 256 + off]])}" fill="none" stroke="${color}" stroke-width="10" stroke-linejoin="round" opacity="${alpha}"/>`;
    return svgDoc(512, 512, `<defs>${defs}</defs>
<g filter="url(#mtShadow)">
  <rect x="22" y="20" width="468" height="468" rx="54" fill="url(#mtFrame)" stroke="#0a1018" stroke-width="4"/>
  <rect x="36" y="34" width="440" height="440" rx="44" fill="none" stroke="url(#mtRim)" stroke-width="5" opacity="0.9"/>
  <rect x="50" y="48" width="412" height="412" rx="36" fill="url(#mtPanel)"/>
  <rect x="50" y="48" width="412" height="412" rx="36" fill="none" stroke="#0a1018" stroke-width="3" opacity="0.8"/>
  ${rhomb(7, '#060a10', 0.9)}${rhomb(-4, '#7da4cc', 0.5)}${rhomb(0, '#3c5a78', 1)}
  <polygon points="${P([[256, 196], [316, 256], [256, 316], [196, 256]])}" fill="#1c2d42"/>
  <polygon points="${P([[256, 196], [316, 256], [256, 256]])}" fill="#2c4662" opacity="0.9"/>
  <path d="M70,136 Q256,54 442,136 L442,88 Q442,66 420,66 L92,66 Q70,66 70,88 Z" fill="#ffffff" opacity="0.06"/>
</g>`);
}

function mGem() {
    // Revealed gem: vivid teal-green brilliant — uses the jewel facet engine.
    return gemSVG('mg', { pts: ring(256, 256, 198, 198, 10, Math.PI / 10), base: '#0fbf6f', accent: '#7dffb0', tableScale: 0.52 });
}

function mBomb() {
    const defs =
        rg('mbBody', [[0, '#5a6474'], [0.35, '#22262e'], [0.8, '#0c0e14'], [1, '#05060a']], 0.36, 0.3, 0.85) +
        lg('mbCap', [[0, '#fff6cf'], [0.5, '#d4af37'], [1, '#7a5a10']]) +
        rg('mbFlame', [[0, '#ffffff'], [0.35, '#ffe98a'], [0.8, '#ff8a3d'], [1, '#e8421c']], 0.5, 0.6, 0.7) +
        glowFilter('mbGlow', 14, '#ff9d3d', 0.95) +
        dropShadow('mbShadow', 14, 12, 0.6);
    return svgDoc(512, 512, `<defs>${defs}</defs>
<g filter="url(#mbShadow)">
  <circle cx="256" cy="300" r="158" fill="url(#mbBody)"/>
  <circle cx="256" cy="300" r="158" fill="none" stroke="#03040a" stroke-width="5"/>
  <ellipse cx="200" cy="240" rx="52" ry="32" fill="#ffffff" opacity="0.35" transform="rotate(-28 200 240)"/>
  <ellipse cx="300" cy="392" rx="70" ry="22" fill="#7da4cc" opacity="0.12"/>
  <rect x="222" y="118" width="68" height="44" rx="12" fill="url(#mbCap)" stroke="#5e470c" stroke-width="4"/>
  <path d="M256,120 C250,88 286,84 296,62" fill="none" stroke="#8a6a3a" stroke-width="13" stroke-linecap="round"/>
  <g filter="url(#mbGlow)">
    <path d="M296,62 C282,46 290,26 304,14 C306,32 322,34 324,50 C326,64 312,74 296,62 Z" fill="url(#mbFlame)"/>
  </g>
  ${sparkle(316, 30, 18)}${sparkle(180, 226, 14, 0.8)}
</g>`);
}

function minesBackground() {
    const rand = rng(7770707);
    const W = 1920, H = 1080;
    let rocks = '';
    // Stalactites along the top.
    let topPts = `0,0 `;
    for (let x = 0; x <= W; x += 80) {
        topPts += `${x + 40},${60 + rand() * 130} ${x + 80},${30 + rand() * 50} `;
    }
    rocks += `<polygon points="${topPts}${W},0" fill="#0c1322"/>`;
    // Crystal cluster helper.
    const cluster = (cx, cy, scale, hue) => {
        const [c1, c2] = hue === 'cyan' ? ['#7af2ff', '#0a7da0'] : ['#d29aff', '#5e1a8a'];
        let s = `<ellipse cx="${cx}" cy="${cy}" rx="${190 * scale}" ry="${130 * scale}" fill="url(#${hue === 'cyan' ? 'cGlow' : 'pGlow'})"/>`;
        for (let i = 0; i < 5; i++) {
            const a = -18 - i * 16 + rand() * 10;
            const len = (110 + rand() * 130) * scale;
            const w2 = (16 + rand() * 14) * scale;
            const bx = cx + (i - 2) * 36 * scale;
            s += `<g transform="rotate(${a} ${bx} ${cy})">` +
                `<polygon points="${bx - w2},${cy} ${bx},${cy - len} ${bx + w2},${cy} ${bx + w2 * 0.6},${cy + 26 * scale} ${bx - w2 * 0.6},${cy + 26 * scale}"` +
                ` fill="url(#${hue === 'cyan' ? 'cCrys' : 'pCrys'})" stroke="${c2}" stroke-width="2" opacity="0.95"/>` +
                `<polygon points="${bx - w2},${cy} ${bx},${cy - len} ${bx - w2 * 0.2},${cy}" fill="${c1}" opacity="0.5"/></g>`;
        }
        return s;
    };
    const defs =
        lg('caveG', [[0, '#101a30'], [0.55, '#0a1020'], [1, '#04060c']]) +
        lg('cCrys', [[0, '#bdf6ff'], [0.5, '#37c4de'], [1, '#0a5a78']]) +
        lg('pCrys', [[0, '#ecd2ff'], [0.5, '#a455e8'], [1, '#4a1278']]) +
        rg('cGlow', [[0, '#37c4de', 0.3], [1, '#37c4de', 0]], 0.5, 0.5, 0.5) +
        rg('pGlow', [[0, '#a455e8', 0.28], [1, '#a455e8', 0]], 0.5, 0.5, 0.5) +
        rg('shaft', [[0, '#9ecfe8', 0.12], [1, '#9ecfe8', 0]], 0.5, 0.5, 0.5) +
        lg('floorG', [[0, '#0e1626'], [1, '#05080f']]);
    let stars = '';
    for (let i = 0; i < 90; i++) {
        stars += `<circle cx="${(rand() * W).toFixed(0)}" cy="${(rand() * H).toFixed(0)}" r="${(rand() * 1.6 + 0.4).toFixed(1)}" fill="#9ecfe8" opacity="${(rand() * 0.35 + 0.08).toFixed(2)}"/>`;
    }
    const body = `
<rect width="${W}" height="${H}" fill="url(#caveG)"/>
${stars}
<ellipse cx="960" cy="430" rx="760" ry="500" fill="url(#shaft)"/>
${rocks}
${cluster(170, 940, 1.25, 'cyan')}
${cluster(420, 1010, 0.8, 'purple')}
${cluster(1750, 950, 1.3, 'purple')}
${cluster(1520, 1020, 0.85, 'cyan')}
${cluster(120, 330, 0.6, 'purple')}
${cluster(1820, 300, 0.55, 'cyan')}
<rect x="0" y="990" width="${W}" height="90" fill="url(#floorG)"/>`;
    return svgDoc(W, H, `<defs>${defs}</defs>${body}`);
}

/* ====================== DRAGON TOWER BACKGROUND ========================== */

function towerBackground() {
    const rand = rng(99090919);
    const W = 1920, H = 1080;
    const defs =
        lg('tSky', [[0, '#160b26'], [0.45, '#2a0f1e'], [0.8, '#451608'], [1, '#5e1e04']]) +
        rg('tMoon', [[0, '#ffd9a8', 0.95], [0.35, '#ff9d5a', 0.4], [1, '#ff7a3d', 0]], 0.5, 0.5, 0.5) +
        rg('lavaPool', [[0, '#ff9d3d', 0.85], [0.5, '#e8421c', 0.5], [1, '#7a1a04', 0]], 0.5, 0.5, 0.5) +
        lg('mount', [[0, '#1c0f1e'], [1, '#0c0610']]) +
        lg('mountFar', [[0, '#241226'], [1, '#140a18']]) +
        lg('crackG', [[0, '#ffe98a'], [0.5, '#ff8a3d'], [1, '#e8421c']]);
    let stars = '';
    for (let i = 0; i < 120; i++) {
        stars += `<circle cx="${(rand() * W).toFixed(0)}" cy="${(rand() * H * 0.6).toFixed(0)}" r="${(rand() * 1.6 + 0.4).toFixed(1)}" fill="#ffd9a8" opacity="${(rand() * 0.4 + 0.1).toFixed(2)}"/>`;
    }
    // Jagged volcanic ridges, far and near.
    const ridge = (baseY, amp, fill, step) => {
        let pts = `0,${H} 0,${baseY} `;
        for (let x = 0; x <= W; x += step) {
            pts += `${x + step / 2},${baseY - rand() * amp} ${x + step},${baseY - rand() * amp * 0.4} `;
        }
        return `<polygon points="${pts}${W},${H}" fill="${fill}"/>`;
    };
    // Glowing lava cracks crawling up the near ridge.
    let cracks = '';
    for (let i = 0; i < 9; i++) {
        const x = 80 + rand() * (W - 160);
        const y = H - 40 - rand() * 120;
        const h2 = 60 + rand() * 130;
        cracks += `<path d="M${x},${y} l${(rand() - 0.5) * 40},-${h2 * 0.4} l${(rand() - 0.5) * 50},-${h2 * 0.35} l${(rand() - 0.5) * 40},-${h2 * 0.25}"` +
            ` fill="none" stroke="url(#crackG)" stroke-width="${(2 + rand() * 3.5).toFixed(1)}" stroke-linecap="round" opacity="${(0.5 + rand() * 0.5).toFixed(2)}"/>`;
    }
    // A dragon silhouette wheeling across the ember moon.
    const dragon = `
<g transform="translate(1430,250) scale(1.15) rotate(-8)" fill="#140a10">
  <path d="M0,0 C-26,-6 -52,-2 -74,10 C-50,12 -36,12 -20,10 C-44,30 -56,52 -58,74 C-38,52 -22,38 -6,28
           C2,44 14,52 30,56 C22,40 20,28 22,16 C44,22 66,20 86,8 C62,4 46,-2 34,-10
           C52,-26 60,-44 60,-62 C44,-44 28,-32 12,-26 C8,-38 0,-48 -12,-54 C-6,-38 -4,-22 -6,-10 Z"/>
  <circle cx="2" cy="2" r="6"/>
</g>`;
    const body = `
<rect width="${W}" height="${H}" fill="url(#tSky)"/>
${stars}
<circle cx="1500" cy="230" r="300" fill="url(#tMoon)"/>
<circle cx="1500" cy="230" r="118" fill="#ffce8a" opacity="0.9"/>
<circle cx="1462" cy="206" r="16" fill="#e8a55e" opacity="0.5"/>
<circle cx="1530" cy="258" r="24" fill="#e8a55e" opacity="0.45"/>
<circle cx="1488" cy="282" r="11" fill="#e8a55e" opacity="0.5"/>
${dragon}
${ridge(H * 0.66, 240, 'url(#mountFar)', 240)}
${ridge(H * 0.8, 280, 'url(#mount)', 180)}
<ellipse cx="${W / 2}" cy="${H + 60}" rx="1300" ry="330" fill="url(#lavaPool)"/>
${cracks}
<rect width="${W}" height="${H}" fill="#000000" opacity="0.12"/>`;
    return svgDoc(W, H, `<defs>${defs}</defs>${body}`);
}

/* ============================ BACKGROUND ================================= */

function olympusBackground() {
    const rand = rng(20260611);
    let stars = '';
    for (let i = 0; i < 160; i++) {
        const x = rand() * 1920, y = rand() * 700, r = rand() * 1.8 + 0.4;
        stars += `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${r.toFixed(1)}" fill="#fff3d0" opacity="${(rand() * 0.5 + 0.15).toFixed(2)}"/>`;
    }
    const column = (x, mirror) => {
        const w = 130;
        let flutes = '';
        for (let k = 1; k < 7; k++) flutes += `<rect x="${x + (w * k) / 7 - 2}" y="240" width="4" height="640" fill="#3a3148" opacity="0.5"/>`;
        return `
  <rect x="${x}" y="240" width="${w}" height="640" fill="url(#colG)"/>
  ${flutes}
  <rect x="${x - 22}" y="206" width="${w + 44}" height="38" rx="8" fill="url(#capG)" stroke="#3a3148" stroke-width="3"/>
  <rect x="${x - 14}" y="244" width="${w + 28}" height="14" rx="6" fill="#8d8298"/>
  <rect x="${x - 26}" y="876" width="${w + 52}" height="44" rx="9" fill="url(#capG)" stroke="#3a3148" stroke-width="3"/>
  <ellipse cx="${x + w / 2 + (mirror ? -30 : 30)}" cy="560" rx="26" ry="300" fill="#ffffff" opacity="0.08"/>`;
    };
    const defs =
        lg('skyG', [[0, '#171130'], [0.5, '#2a1d4a'], [1, '#0a0a16']]) +
        lg('floorG', [[0, '#332b4a'], [1, '#110d1c']]) +
        lg('colG', [[0, '#544a66'], [0.5, '#bdb3cc'], [1, '#544a66']], 0, 0, 1, 0) +
        lg('capG', [[0, '#cfc5dd'], [1, '#6e6382']]) +
        rg('rays', [[0, '#b89ce0', 0.4], [0.6, '#6a4ea8', 0.12], [1, '#3a2a6a', 0]], 0.5, 0.32, 0.7) +
        rg('moon', [[0, '#fff8e0', 0.95], [0.3, '#e8d9ff', 0.5], [1, '#a98ce0', 0]], 0.5, 0.5, 0.5) +
        lg('mountG', [[0, '#241a3e'], [1, '#140e26']]);
    const body = `
<rect width="1920" height="1080" fill="url(#skyG)"/>
${stars}
<circle cx="1560" cy="190" r="210" fill="url(#moon)"/>
<polygon points="0,760 240,560 430,720 640,580 830,760 1100,600 1370,760 1590,590 1820,720 1920,640 1920,800 0,800" fill="url(#mountG)"/>
<ellipse cx="960" cy="520" rx="900" ry="520" fill="url(#rays)"/>
<rect x="0" y="790" width="1920" height="290" fill="url(#floorG)"/>
<g opacity="0.35">
  <line x1="960" y1="800" x2="200" y2="1080" stroke="#6e6382" stroke-width="2"/>
  <line x1="960" y1="800" x2="600" y2="1080" stroke="#6e6382" stroke-width="2"/>
  <line x1="960" y1="800" x2="1320" y2="1080" stroke="#6e6382" stroke-width="2"/>
  <line x1="960" y1="800" x2="1720" y2="1080" stroke="#6e6382" stroke-width="2"/>
  <line x1="0" y1="850" x2="1920" y2="850" stroke="#6e6382" stroke-width="2"/>
  <line x1="0" y1="930" x2="1920" y2="930" stroke="#6e6382" stroke-width="2"/>
</g>
${column(120, false)}
${column(1670, true)}
<ellipse cx="185" cy="990" rx="200" ry="40" fill="#000000" opacity="0.4"/>
<ellipse cx="1735" cy="990" rx="200" ry="40" fill="#000000" opacity="0.4"/>
<rect width="1920" height="1080" fill="url(#rays)" opacity="0.25"/>`;
    return svgDoc(1920, 1080, `<defs>${defs}</defs>${body}`);
}

/* ================================ MAIN =================================== */

const SYMBOLS = {
    // Slot 1 — Wrath of Olympus
    zeus: olyZeus, poseidon: olyPoseidon, athena: olyAthena, crown: olyCrown,
    sword: olySword, gems: olyGems, wild: olyWild, orb: olyOrb,
    // Slot 2 — Lucky 7s
    v_cherry: vCherry, v_bell: vBell, v_bar: vBar, v_coin: vCoin,
    v_diamond: vDiamond, v_seven: vSeven, v_wild: vWild, v_bonus: vBonus,
    // Slot 3 — Gemstorm
    j_red: jRed, j_orange: jOrange, j_yellow: jYellow, j_green: jGreen,
    j_blue: jBlue, j_purple: jPurple, j_wild: jWild, j_star: jStar,
    // Slot 4 — Pharaoh's Fortune
    p_ankh: eAnkh, p_lotus: eLotus, p_scarab: eScarab, p_horus: eHorus,
    p_anubis: eAnubis, p_pharaoh: ePharaoh, p_wild: eWild, p_pyramid: ePyramid,
    // Slot 7 — Crystal Mines
    m_tile: mTile, m_gem: mGem, m_bomb: mBomb,
};

for (const [id, fn] of Object.entries(SYMBOLS)) {
    writeFileSync(join(OUT, `${id}.svg`), fn());
    console.log(`wrote ${id}.svg`);
}
writeFileSync(join(OUT, 'background.svg'), olympusBackground());
console.log('wrote background.svg');
writeFileSync(join(OUT, 'mines-bg.svg'), minesBackground());
console.log('wrote mines-bg.svg');
writeFileSync(join(OUT, 'tower-bg.svg'), towerBackground());
console.log('wrote tower-bg.svg');
