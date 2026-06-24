/* Mock content — no external assets. Thumbnails = deterministic gradients. */

export interface Game {
  id: string;
  name: string;
  category: "Originals" | "Slots" | "Live" | "Crash" | "Table";
  provider: string;
  players: number;
  hot?: boolean;
  live?: boolean;
  hue: number; // drives gradient
  kw: string; // image search keywords (per-game, used by cover generator)
  img?: string; // optional override: licensed/external cover URL
  url: string; // game client launch URL (loaded via iframe/webview)
}

const hue = (i: number) => (i * 47) % 360;

/** Attach the iframe launch URL. Swap for real provider URLs in production. */
const withUrl = <T extends { id: string; name: string }>(g: T): T & { url: string } => ({
  ...g,
  url: `/demo-game.html?id=${g.id}&name=${encodeURIComponent(g.name)}`,
});

export const ORIGINALS: Game[] = (
  [
    {
      id: "crash",
      name: "Crash",
      category: "Originals",
      provider: "Aurora",
      players: 1284,
      hot: true,
      live: true,
      hue: hue(1),
      kw: "rocket,launch,space",
    },
    {
      id: "dice",
      name: "Dice",
      category: "Originals",
      provider: "Aurora",
      players: 842,
      hue: hue(2),
      kw: "dice,casino,neon",
    },
    {
      id: "mines",
      name: "Mines",
      category: "Originals",
      provider: "Aurora",
      players: 1103,
      hot: true,
      hue: hue(3),
      kw: "diamond,gem,explosion",
    },
    {
      id: "plinko",
      name: "Plinko",
      category: "Originals",
      provider: "Aurora",
      players: 967,
      hue: hue(4),
      kw: "pachinko,neon,balls",
    },
    {
      id: "roulette",
      name: "Roulette",
      category: "Originals",
      provider: "Aurora",
      players: 521,
      hue: hue(5),
      kw: "roulette,wheel,casino",
    },
    {
      id: "wheel",
      name: "Wheel",
      category: "Originals",
      provider: "Aurora",
      players: 433,
      hue: hue(6),
      kw: "wheel,fortune,gold",
    },
    {
      id: "coinflip",
      name: "Coin Flip",
      category: "Originals",
      provider: "Aurora",
      players: 388,
      hue: hue(7),
      kw: "gold,coin,flip",
    },
    {
      id: "blackjack",
      name: "Blackjack",
      category: "Table",
      provider: "Aurora",
      players: 712,
      hue: hue(8),
      kw: "blackjack,cards,casino",
    },
  ] as Omit<Game, "url">[]
).map(withUrl);

const SLOT_NAMES = [
  "Gates of Olympus",
  "Sweet Bonanza",
  "Sugar Rush",
  "Big Bass",
  "Wanted",
  "Money Train",
  "Wild West",
  "Starlight",
];
const SLOT_KW = [
  "zeus,greek,temple",
  "candy,fruit,colorful",
  "candy,sweets,pink",
  "fishing,fish,lake",
  "wild,west,cowboy",
  "train,money,gold",
  "western,desert,saloon",
  "stars,galaxy,night",
];
export const SLOTS: Game[] = Array.from({ length: 8 })
  .map(
    (_, i): Omit<Game, "url"> => ({
      id: `slot-${i}`,
      name: SLOT_NAMES[i],
      category: "Slots",
      provider: ["Pragmatic", "Hacksaw", "Push", "Relax", "NoLimit", "Play'n GO"][i % 6],
      players: 200 + i * 137,
      hot: i % 3 === 0,
      hue: hue(i + 11),
      kw: SLOT_KW[i],
    })
  )
  .map(withUrl);

const LIVE_NAMES = [
  "Lightning Roulette",
  "Crazy Time",
  "Mega Wheel",
  "Blackjack Lux",
  "Baccarat",
  "Monopoly Live",
];
const LIVE_KW = [
  "roulette,lightning,casino",
  "carnival,wheel,lights",
  "wheel,fortune,gameshow",
  "blackjack,cards,dealer",
  "baccarat,cards,luxury",
  "monopoly,board,game",
];
export const LIVE: Game[] = Array.from({ length: 6 })
  .map(
    (_, i): Omit<Game, "url"> => ({
      id: `live-${i}`,
      name: LIVE_NAMES[i],
      category: "Live",
      provider: ["Evolution", "Pragmatic Live"][i % 2],
      players: 300 + i * 90,
      live: true,
      hue: hue(i + 21),
      kw: LIVE_KW[i],
    })
  )
  .map(withUrl);

export const PROVIDERS = [
  "Pragmatic",
  "Evolution",
  "Hacksaw",
  "NoLimit",
  "Push",
  "Relax",
  "Play'n GO",
  "Aurora",
];

export interface Winner {
  user: string;
  game: string;
  amount: string;
  multiplier: string;
}
export const WINNERS: Winner[] = [
  { user: "Nova_77", game: "Crash", amount: "$4,120", multiplier: "12.4x" },
  { user: "Kairo", game: "Mines", amount: "$880", multiplier: "3.1x" },
  { user: "Selene", game: "Plinko", amount: "$2,640", multiplier: "8.0x" },
  { user: "Vexel", game: "Dice", amount: "$310", multiplier: "1.9x" },
  { user: "Orion", game: "Gates", amount: "$9,200", multiplier: "104x" },
  { user: "Lyra", game: "Wheel", amount: "$540", multiplier: "5.0x" },
];

export interface Tx {
  id: string;
  type: "Deposit" | "Withdraw" | "Bet" | "Win" | "Bonus";
  method: string;
  amount: string;
  positive: boolean;
  status: "Completed" | "Pending" | "Failed";
  date: string;
}
export const TRANSACTIONS: Tx[] = [
  {
    id: "tx1",
    type: "Deposit",
    method: "Visa •••• 4242",
    amount: "+$1,000.00",
    positive: true,
    status: "Completed",
    date: "Jun 23, 14:02",
  },
  {
    id: "tx2",
    type: "Win",
    method: "Crash",
    amount: "+$412.00",
    positive: true,
    status: "Completed",
    date: "Jun 23, 13:48",
  },
  {
    id: "tx3",
    type: "Bet",
    method: "Mines",
    amount: "-$50.00",
    positive: false,
    status: "Completed",
    date: "Jun 23, 13:40",
  },
  {
    id: "tx4",
    type: "Withdraw",
    method: "Bank transfer",
    amount: "-$2,500.00",
    positive: false,
    status: "Pending",
    date: "Jun 23, 12:10",
  },
  {
    id: "tx5",
    type: "Bonus",
    method: "Daily Reward",
    amount: "+$25.00",
    positive: true,
    status: "Completed",
    date: "Jun 23, 09:00",
  },
  {
    id: "tx6",
    type: "Deposit",
    method: "PayPal",
    amount: "+$500.00",
    positive: true,
    status: "Failed",
    date: "Jun 22, 21:33",
  },
];

export const PLAYER = {
  name: "Pruthvi",
  handle: "@pruthvi",
  level: 42,
  xp: 6820,
  xpMax: 10000,
  rank: "Gold III",
  balance: "$8,412.50",
  joined: "Jan 2025",
  wagered: "$248,910",
  wins: 1842,
  bestMulti: "104x",
};
