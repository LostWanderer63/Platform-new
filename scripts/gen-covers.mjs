/**
 * Generates a real PNG cover per game into public/games/<id>.png.
 * Original art (no copyrighted assets). Mirrors src/data/mock.ts.
 * Run: npm run gen:covers
 *
 * To use licensed/real artwork instead: drop your own <id>.png into
 * public/games/ — GameImage prefers existing files, this only fills gaps.
 */
import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "public", "games");

const hue = (i) => (i * 47) % 360;

// --- catalog (mirrors mock.ts) ---
const ORIGINALS = [
  ["crash", "rocket", 1], ["dice", "dice", 2], ["mines", "mines", 3], ["plinko", "plinko", 4],
  ["roulette", "roulette", 5], ["wheel", "wheel", 6], ["coinflip", "coin", 7], ["blackjack", "cards", 8],
].map(([id, motif, i]) => ({ id, motif, hue: hue(i) }));
const SLOTS = Array.from({ length: 8 }).map((_, i) => ({ id: `slot-${i}`, motif: "slots", hue: hue(i + 11) }));
const LIVE = Array.from({ length: 6 }).map((_, i) => ({ id: `live-${i}`, motif: "live", hue: hue(i + 21) }));
const GAMES = [...ORIGINALS, ...SLOTS, ...LIVE];

// --- Olympus cabinet (23 games, order matches the game's SLOTS[] / ?game=N) ---
const slugify = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const OL_TITLES = [
  "Wrath of Olympus", "Lucky 7s", "Gemstorm", "Pharaoh's Fortune", "Neon Plinko",
  "Rocket Crash", "Crystal Mines", "Royal Blackjack", "Dragon Tower", "Lucky Dice",
  "Neon Keno", "Cyber Coin Flip", "Jacks or Better", "Fortune Coins", "Sugar Storm",
  "Turbo Derby", "Lucky Scratch", "Reef Hunter", "Dragon Sic Bo", "Royal Megaways",
  "Bingo Blitz", "Jungle Swing", "Royal Baccarat",
];
const olMotif = (t) => {
  const s = t.toLowerCase();
  if (s.includes("crash")) return "rocket";
  if (s.includes("mines")) return "mines";
  if (s.includes("plinko")) return "plinko";
  if (s.includes("dice") || s.includes("sic bo")) return "dice";
  if (s.includes("blackjack") || s.includes("baccarat") || s.includes("jacks")) return "cards";
  if (s.includes("coin")) return "coin";
  if (s.includes("derby")) return "wheel";
  if (s.includes("keno") || s.includes("bingo") || s.includes("reef")) return "live";
  return "slots";
};
const OLYMPUS = OL_TITLES.map((title, i) => ({
  id: `olympus/${slugify(title)}`, motif: olMotif(title), hue: (i * 41) % 360, title,
}));

const W = 600, H = 800;
const GOLD = "#f0c46e";

// --- motif markup in a 0..120 coordinate box ---
function motif(kind, a, a2) {
  const dark = "#0a0b12";
  switch (kind) {
    case "rocket":
      return `<g fill="none" stroke-linecap="round" stroke-linejoin="round">
        <path d="M10 108 Q55 100 104 18" stroke="${a2}" stroke-width="3" stroke-dasharray="2 7" opacity="0.8"/>
        <g transform="rotate(45 70 50)">
          <path d="M70 24 C82 36 82 56 70 70 C58 56 58 36 70 24 Z" fill="#fff"/>
          <circle cx="70" cy="44" r="6" fill="${a}"/>
          <path d="M58 64 L52 78 L66 70 Z" fill="${a2}"/>
          <path d="M82 64 L88 78 L74 70 Z" fill="${a2}"/>
          <path d="M64 70 Q70 86 76 70 Z" fill="${GOLD}"/>
        </g>
        <circle cx="24" cy="30" r="2" fill="#fff"/><circle cx="98" cy="84" r="2.5" fill="${GOLD}"/></g>`;
    case "dice":
      return `<g transform="rotate(-12 44 60)"><rect x="20" y="40" width="44" height="44" rx="10" fill="#fff"/>
        ${[[32,52],[52,52],[42,62],[32,72],[52,72]].map(([x,y])=>`<circle cx="${x}" cy="${y}" r="4" fill="${a}"/>`).join("")}</g>
        <g transform="rotate(14 80 56)"><rect x="58" y="34" width="40" height="40" rx="9" fill="${a}"/>
        ${[[68,44],[88,44],[68,64],[88,64]].map(([x,y])=>`<circle cx="${x}" cy="${y}" r="3.6" fill="#fff"/>`).join("")}</g>`;
    case "mines":
      return `${[0,1,2].map(r=>[0,1,2].map(c=>`<rect x="${24+c*26}" y="${24+r*26}" width="20" height="20" rx="5" fill="#fff" opacity="${r===1&&c===1?0:0.12}"/>`).join("")).join("")}
        <circle cx="60" cy="62" r="22" fill="${a}"/><circle cx="52" cy="54" r="6" fill="#fff" opacity="0.7"/>
        <path d="M60 40 L60 30 M60 30 L70 24" stroke="${GOLD}" stroke-width="4" stroke-linecap="round" fill="none"/>
        <circle cx="72" cy="22" r="4" fill="${GOLD}"/>
        <path d="M50 50 l4 4 M70 70 l-4 -4" stroke="${dark}" stroke-width="3" stroke-linecap="round"/>`;
    case "plinko": {
      let pegs = "";
      for (let row=0; row<4; row++) for (let i=0;i<row+2;i++){ const span=(row+1)*12; const x=60-span/2+i*12, y=28+row*16; pegs+=`<circle cx="${x}" cy="${y}" r="3.2" fill="#fff" opacity="0.85"/>`; }
      const slots = [-1,0,1].map((m,i)=>`<rect x="${48+m*16-6}" y="96" width="12" height="14" rx="3" fill="${i===1?a:a2}" opacity="0.9"/>`).join("");
      return `${pegs}<circle cx="60" cy="18" r="6" fill="${GOLD}"/>${slots}`;
    }
    case "roulette": {
      let spokes = "";
      for (let i=0;i<12;i++){ const ang=(i/12)*Math.PI*2; const x1=60+Math.cos(ang)*40,y1=60+Math.sin(ang)*40,x2=60+Math.cos(ang)*22,y2=60+Math.sin(ang)*22; spokes+=`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${i%2?a2:GOLD}" stroke-width="3"/>`; }
      return `<circle cx="60" cy="60" r="40" fill="none" stroke="#fff" stroke-width="3" opacity="0.5"/>
        <circle cx="60" cy="60" r="40" fill="${a}" opacity="0.25"/>${spokes}
        <circle cx="60" cy="60" r="18" fill="${dark}"/><circle cx="60" cy="60" r="9" fill="${a}"/><circle cx="92" cy="44" r="4.5" fill="#fff"/>`;
    }
    case "wheel": {
      let wedges = "";
      for (let i=0;i<8;i++){ const a0=(i/8)*Math.PI*2,a1=((i+1)/8)*Math.PI*2; const x0=60+Math.cos(a0)*40,y0=60+Math.sin(a0)*40,x1=60+Math.cos(a1)*40,y1=60+Math.sin(a1)*40; wedges+=`<path d="M60 60 L${x0} ${y0} A40 40 0 0 1 ${x1} ${y1} Z" fill="${i%2?a:a2}" opacity="${0.55+(i%3)*0.15}"/>`; }
      return `${wedges}<circle cx="60" cy="60" r="40" fill="none" stroke="#fff" stroke-width="2" opacity="0.5"/><circle cx="60" cy="60" r="8" fill="#fff"/><path d="M60 12 L53 26 L67 26 Z" fill="${GOLD}"/>`;
    }
    case "coin":
      return `<ellipse cx="60" cy="60" rx="34" ry="38" fill="${GOLD}"/>
        <ellipse cx="60" cy="60" rx="26" ry="30" fill="none" stroke="${dark}" stroke-width="2" opacity="0.4"/>
        <path d="M60 42 l5 12 13 1 -10 9 4 13 -12 -8 -12 8 4 -13 -10 -9 13 -1 Z" fill="${dark}" opacity="0.55"/>
        <path d="M24 40 Q14 60 24 80" stroke="${a2}" stroke-width="3" fill="none" stroke-linecap="round" stroke-dasharray="2 6"/>`;
    case "cards":
      return `<g transform="rotate(-14 46 64)"><rect x="24" y="34" width="44" height="60" rx="7" fill="#fff"/>
        <path d="M46 48 l8 14 -16 0 Z" fill="${a}"/><text x="30" y="50" font-size="13" font-weight="700" fill="${a}" font-family="sans-serif">A</text></g>
        <g transform="rotate(12 76 60)"><rect x="54" y="30" width="44" height="60" rx="7" fill="${a}"/>
        <circle cx="76" cy="58" r="11" fill="#fff"/><text x="60" y="46" font-size="13" font-weight="700" fill="#fff" font-family="sans-serif">K</text></g>`;
    case "slots":
      return `${[0,1,2].map(r=>`<rect x="${20+r*30}" y="28" width="24" height="64" rx="6" fill="#fff" opacity="0.9"/>`).join("")}
        <text x="26" y="66" font-size="20" font-weight="800" fill="${a}" font-family="sans-serif">7</text>
        <circle cx="62" cy="60" r="9" fill="${a2}"/>
        <path d="M92 50 l3 7 7 1 -5 5 1 7 -6 -3 -6 3 1 -7 -5 -5 7 -1 Z" fill="${GOLD}"/>`;
    case "live":
      return `<path d="M16 96 Q60 60 104 96" fill="${a}" opacity="0.25"/>
        <path d="M16 96 Q60 60 104 96" fill="none" stroke="#fff" stroke-width="2.5" opacity="0.5"/>
        <g transform="rotate(-10 50 60)"><rect x="34" y="44" width="30" height="42" rx="5" fill="#fff"/><path d="M49 56 l5 9 -10 0 Z" fill="${a}"/></g>
        <g transform="rotate(10 74 58)"><rect x="62" y="40" width="30" height="42" rx="5" fill="${a2}"/></g>
        <circle cx="40" cy="100" r="7" fill="${GOLD}"/><circle cx="54" cy="102" r="7" fill="${a}"/><circle cx="68" cy="100" r="7" fill="${a2}"/>`;
    default:
      return "";
  }
}

function buildSvg(g) {
  const a = `hsl(${g.hue} 88% 62%)`;
  const a2 = `hsl(${(g.hue + 50) % 360} 90% 58%)`;
  const bgA = `hsl(${g.hue} 88% 58%)`;
  const bgB = `hsl(${(g.hue + 50) % 360} 92% 52%)`;
  const scale = 372 / 120, tx = (W - 372) / 2, ty = (H - 372) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <defs>
      <radialGradient id="b1" cx="25%" cy="12%" r="80%"><stop offset="0%" stop-color="${bgA}" stop-opacity="0.95"/><stop offset="55%" stop-color="${bgA}" stop-opacity="0"/></radialGradient>
      <radialGradient id="b2" cx="100%" cy="105%" r="90%"><stop offset="0%" stop-color="${bgB}" stop-opacity="0.85"/><stop offset="55%" stop-color="${bgB}" stop-opacity="0"/></radialGradient>
      <linearGradient id="b3" x1="0" y1="0" x2="0.4" y2="1"><stop offset="0%" stop-color="hsl(${g.hue} 45% 16%)"/><stop offset="100%" stop-color="#15192a"/></linearGradient>
      <linearGradient id="sheen" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#ffffff" stop-opacity="0.10"/><stop offset="45%" stop-color="#ffffff" stop-opacity="0"/><stop offset="100%" stop-color="#06070d" stop-opacity="0.45"/></linearGradient>
      <linearGradient id="tb" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#06070d" stop-opacity="0"/><stop offset="100%" stop-color="#06070d" stop-opacity="0.92"/></linearGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#b3)"/>
    <rect width="${W}" height="${H}" fill="url(#b1)"/>
    <rect width="${W}" height="${H}" fill="url(#b2)"/>
    <g transform="translate(${tx} ${ty}) scale(${scale})" filter="url(#none)">${motif(g.motif, a, a2)}</g>
    <rect width="${W}" height="${H}" fill="url(#sheen)"/>
    ${g.title ? titleBanner(g.title) : ""}
  </svg>`;
}

const xmlEsc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function titleBanner(title) {
  const size = title.length > 14 ? 34 : 42;
  return `<rect x="0" y="${H - 190}" width="${W}" height="190" fill="url(#tb)"/>
    <text x="${W / 2}" y="${H - 56}" text-anchor="middle" font-family="'Helvetica Neue',Arial,sans-serif" font-weight="800" font-size="${size}" fill="#ffffff" letter-spacing="0.5">${xmlEsc(title)}</text>
    <rect x="${W / 2 - 34}" y="${H - 40}" width="68" height="4" rx="2" fill="${GOLD}"/>`;
}

async function main() {
  await mkdir(OUT, { recursive: true });
  await mkdir(join(OUT, "olympus"), { recursive: true });
  let n = 0;
  for (const g of [...GAMES, ...OLYMPUS]) {
    const svg = buildSvg(g);
    const png = await sharp(Buffer.from(svg)).png({ quality: 90 }).toBuffer();
    await writeFile(join(OUT, `${g.id}.png`), png);
    n++;
  }
  console.log(`✓ generated ${n} PNG covers -> public/games/ (incl. ${OLYMPUS.length} Olympus)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
