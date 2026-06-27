import { PrismaClient, GameKind } from "@prisma/client";
import * as argon2 from "argon2";

const prisma = new PrismaClient();

const hue = (i: number) => (i * 47) % 360;

interface SeedGame {
  slug: string;
  name: string;
  category: string;
  provider: string;
  kind: GameKind;
  hot?: boolean;
  live?: boolean;
  hue: number;
}

const ORIGINALS: SeedGame[] = [
  { slug: "crash", name: "Crash", category: "Originals", provider: "Aurora", kind: "CRASH", hot: true, live: true, hue: hue(1) },
  { slug: "dice", name: "Dice", category: "Originals", provider: "Aurora", kind: "DICE", hue: hue(2) },
  { slug: "mines", name: "Mines", category: "Originals", provider: "Aurora", kind: "MINES", hot: true, hue: hue(3) },
  { slug: "plinko", name: "Plinko", category: "Originals", provider: "Aurora", kind: "PLINKO", hue: hue(4) },
  { slug: "roulette", name: "Roulette", category: "Originals", provider: "Aurora", kind: "ROULETTE", hue: hue(5) },
  { slug: "wheel", name: "Wheel", category: "Originals", provider: "Aurora", kind: "WHEEL", hue: hue(6) },
  { slug: "coinflip", name: "Coin Flip", category: "Originals", provider: "Aurora", kind: "COINFLIP", hue: hue(7) },
  { slug: "blackjack", name: "Blackjack", category: "Table", provider: "Aurora", kind: "BLACKJACK", hue: hue(8) },
];

const SLOT_NAMES = ["Gates of Olympus", "Sweet Bonanza", "Sugar Rush", "Big Bass", "Wanted", "Money Train", "Wild West", "Starlight"];
const PROVIDERS = ["Pragmatic", "Hacksaw", "Push", "Relax", "NoLimit", "Play'n GO"];
const SLOTS: SeedGame[] = SLOT_NAMES.map((name, i) => ({
  slug: `slot-${i}`,
  name,
  category: "Slots",
  provider: PROVIDERS[i % PROVIDERS.length],
  kind: "SLOTS",
  hot: i % 3 === 0,
  hue: hue(i + 11),
}));

const LIVE_NAMES = ["Lightning Roulette", "Crazy Time", "Mega Wheel", "Blackjack Lux", "Baccarat", "Monopoly Live"];
const LIVE: SeedGame[] = LIVE_NAMES.map((name, i) => ({
  slug: `live-${i}`,
  name,
  category: "Live",
  provider: ["Evolution", "Pragmatic Live"][i % 2],
  kind: "LIVE",
  live: true,
  hue: hue(i + 21),
}));

async function seedAdmin() {
  const email = "admin@aurora.dev";
  if (await prisma.user.findUnique({ where: { email } })) {
    console.log("Admin exists:", email);
    return;
  }
  const passwordHash = await argon2.hash("admin12345");
  const admin = await prisma.user.create({ data: { email, username: "admin", passwordHash, role: "ADMIN" } });
  await prisma.wallet.create({ data: { userId: admin.id } });
  console.log("Seeded admin:", email, "/ admin12345");
}

async function seedGames() {
  const all = [...ORIGINALS, ...SLOTS, ...LIVE];
  let order = 0;
  for (const g of all) {
    await prisma.game.upsert({
      where: { slug: g.slug },
      update: {},
      create: {
        slug: g.slug,
        name: g.name,
        category: g.category,
        provider: g.provider,
        kind: g.kind,
        hot: g.hot ?? false,
        live: g.live ?? false,
        hue: g.hue,
        order: order++,
        imageUrl: `/games/${g.slug}.png`,
      },
    });
  }
  console.log(`Seeded ${all.length} games`);
}

async function seedDevs() {
  const passwordHash = await argon2.hash("dev12345");
  for (let i = 1; i <= 5; i++) {
    const email = `dev${i}@aurora.dev`;
    if (await prisma.user.findUnique({ where: { email } })) {
      console.log("Dev exists:", email);
      continue;
    }
    const u = await prisma.user.create({ data: { email, username: `dev${i}`, passwordHash, role: "USER" } });
    await prisma.wallet.create({ data: { userId: u.id, balance: 10000 } });
    console.log("Seeded dev:", email, "/ dev12345 ($10,000)");
  }
}

async function main() {
  await seedAdmin();
  await seedDevs();
  // Demo/dummy games removed — the catalog is seeded from real game clients only
  // (prisma/seed-olympus.mjs). Re-enable only if you want placeholder games.
  // await seedGames();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
