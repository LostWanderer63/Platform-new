// Seeds the 23 "Wrath of Olympus" cabinet games as individual Aurora catalog
// tiles, each deep-linking the external client (?game=N) via launchUrl.
//   Run:  set -a; source .env; set +a; node prisma/seed-olympus.mjs
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const BASE = process.env.OLYMPUS_URL ?? "http://localhost:5180";

// Order MUST match SLOTS[] in the game's MenuScene (index = ?game=N).
const TITLES = [
  "Wrath of Olympus", "Lucky 7s", "Gemstorm", "Pharaoh's Fortune", "Neon Plinko",
  "Rocket Crash", "Crystal Mines", "Royal Blackjack", "Dragon Tower", "Lucky Dice",
  "Neon Keno", "Cyber Coin Flip", "Jacks or Better", "Fortune Coins", "Sugar Storm",
  "Turbo Derby", "Lucky Scratch", "Reef Hunter", "Dragon Sic Bo", "Royal Megaways",
  "Bingo Blitz", "Jungle Swing", "Royal Baccarat",
];

const kindFor = (t) => {
  const s = t.toLowerCase();
  if (s.includes("crash")) return "CRASH";
  if (s.includes("mines")) return "MINES";
  if (s.includes("plinko")) return "PLINKO";
  if (s.includes("dice") || s.includes("sic bo")) return "DICE";
  if (s.includes("blackjack")) return "BLACKJACK";
  if (s.includes("coin")) return "COINFLIP";
  if (s.includes("derby")) return "WHEEL";
  if (s.includes("baccarat") || s.includes("keno") || s.includes("bingo")) return "LIVE";
  return "SLOTS";
};

const slugify = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

async function main() {
  let n = 0;
  for (let i = 0; i < TITLES.length; i++) {
    const name = TITLES[i];
    const slug = `olympus-${slugify(name)}`;
    const data = {
      name,
      category: "Slots",
      provider: "Olympus Studios",
      kind: kindFor(name),
      status: "ACTIVE",
      hot: i < 3,
      live: false,
      hue: (i * 41) % 360,
      order: 100 + i,
      launchUrl: `${BASE}/?game=${i}`,
      imageUrl: `/games/olympus/${slug.replace(/^olympus-/, "")}.png`,
    };
    await prisma.game.upsert({ where: { slug }, update: data, create: { slug, ...data } });
    n++;
  }
  console.log(`Seeded ${n} Olympus games -> ${BASE}/?game=N`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
