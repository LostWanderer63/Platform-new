import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { GameKind, Prisma } from "@prisma/client";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { PrismaService } from "../prisma/prisma.service";
import { WalletService } from "../wallet/wallet.service";
import { FairnessService } from "./fairness.service";
import { settle, PlayableGame } from "./engines";
import { BetDto } from "./dto/bet.dto";

const D = Prisma.Decimal;
const SERIALIZABLE = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable } as const;
const MAX_BET = new D(10000);

@Injectable()
export class GamesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
    private readonly fairness: FairnessService,
    private readonly events: EventEmitter2,
  ) {}

  private normalizeParams(game: PlayableGame, raw: Record<string, unknown>) {
    if (game === "DICE") {
      const target = Number(raw.target);
      const direction = raw.direction === "over" ? "over" : "under";
      if (!Number.isFinite(target) || target < 2 || target > 98) {
        throw new BadRequestException("dice target must be between 2 and 98");
      }
      return { target, direction };
    }
    if (game === "CRASH") {
      const target = Number(raw.target);
      if (!Number.isFinite(target) || target < 1.01 || target > 1_000_000) {
        throw new BadRequestException("crash target must be >= 1.01");
      }
      return { target: Math.floor(target * 100) / 100 };
    }
    // COINFLIP
    const side = raw.side === "tails" ? "tails" : "heads";
    return { side };
  }

  async placeBet(userId: string, dto: BetDto, username = "player") {
    const game = dto.game as PlayableGame;
    const amount = new D(dto.amount);
    if (amount.lte(0)) throw new BadRequestException("Amount must be positive");
    if (amount.gt(MAX_BET)) throw new BadRequestException(`Max bet is ${MAX_BET.toFixed(2)}`);
    const params = this.normalizeParams(game, dto.params);

    await this.fairness.getOrCreateActive(userId);

    const result = await this.prisma.$transaction(async (tx) => {
      const seed = await this.fairness.activeInTx(tx, userId);
      if (!seed) throw new BadRequestException("No active seed");
      const nonce = seed.nonce;

      const bet = await tx.bet.create({
        data: {
          userId,
          game,
          amount,
          clientSeed: seed.clientSeed,
          nonce,
          seedId: seed.id,
          params: params as Prisma.InputJsonValue,
          status: "PENDING",
        },
      });

      // debit the stake (throws on insufficient funds -> rolls back)
      await this.wallet.applyWithinTx(tx, userId, "BET", amount.negated(), {
        refType: "bet",
        refId: bet.id,
      });

      const float = this.fairness.rng(seed.serverSeed, seed.clientSeed, nonce);
      const res = settle(game, float, params);
      const payout = amount.times(res.multiplier);

      let balance: Prisma.Decimal;
      if (res.win) {
        balance = await this.wallet.applyWithinTx(tx, userId, "WIN", payout, {
          refType: "bet",
          refId: bet.id,
        });
      } else {
        const w = await tx.wallet.findUniqueOrThrow({ where: { userId } });
        balance = w.balance;
      }

      await tx.bet.update({
        where: { id: bet.id },
        data: {
          status: res.win ? "WON" : "LOST",
          multiplier: new D(res.multiplier),
          payout,
          outcome: res.outcome as Prisma.InputJsonValue,
          settledAt: new Date(),
        },
      });
      await tx.provablyFairSeed.update({ where: { id: seed.id }, data: { nonce: nonce + 1 } });

      return {
        betId: bet.id,
        game,
        amount: amount.toFixed(2),
        win: res.win,
        multiplier: res.multiplier,
        payout: payout.toFixed(2),
        outcome: res.outcome,
        nonce,
        balance: balance.toFixed(2),
        serverSeedHash: seed.serverSeedHash,
        clientSeed: seed.clientSeed,
      };
    }, SERIALIZABLE);

    // fire-and-forget realtime broadcast (live wins feed + balance push)
    this.events.emit("bet.settled", {
      userId,
      username,
      game: result.game,
      amount: result.amount,
      payout: result.payout,
      multiplier: result.multiplier,
      win: result.win,
      balance: result.balance,
    });
    return result;
  }

  /** Public catalog — playable games for the player app (hides DISABLED). */
  async catalog() {
    const rows = await this.prisma.game.findMany({
      where: { status: { not: "DISABLED" } },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    });
    return rows.map((g) => ({
      id: g.slug,
      name: g.name,
      category: g.category,
      provider: g.provider,
      kind: g.kind,
      status: g.status,
      hot: g.hot,
      live: g.live,
      hue: g.hue,
      img: g.imageUrl,
      launchUrl: g.launchUrl,
    }));
  }

  /** Map an external slot title to the closest internal GameKind (for stats/labels). */
  private kindFor(title: string): GameKind {
    const t = title.toLowerCase();
    if (t.includes("crash")) return "CRASH";
    if (t.includes("mines")) return "MINES";
    if (t.includes("plinko")) return "PLINKO";
    if (t.includes("dice") || t.includes("sic bo")) return "DICE";
    if (t.includes("blackjack")) return "BLACKJACK";
    if (t.includes("coin")) return "COINFLIP";
    if (t.includes("wheel") || t.includes("derby")) return "WHEEL";
    if (t.includes("baccarat") || t.includes("keno") || t.includes("bingo") || t.includes("roulette")) return "LIVE";
    return "SLOTS";
  }

  /**
   * Per-GameKind payout model. Server-authoritative + provably fair.
   * `u` is a uniform [0,1) derived from the committed server seed; the player
   * can reproduce the exact multiplier from the revealed seed (see externalVerify).
   *
   * Model: lose when u >= hit; otherwise multiplier = (rtp/hit) * -ln(1-v),
   * v = u/hit. E[-ln(1-v)] = 1, so the expected return is exactly `rtp`
   * (minus the tiny clip at `max`). Lower `hit` = higher volatility.
   */
  private static MODELS: Record<string, { hit: number; rtp: number; max: number }> = {
    SLOTS: { hit: 0.28, rtp: 0.95, max: 500 },
    CRASH: { hit: 0.47, rtp: 0.97, max: 1000 },
    MINES: { hit: 0.4, rtp: 0.97, max: 500 },
    PLINKO: { hit: 0.5, rtp: 0.97, max: 200 },
    DICE: { hit: 0.49, rtp: 0.98, max: 100 },
    COINFLIP: { hit: 0.49, rtp: 0.98, max: 8 },
    BLACKJACK: { hit: 0.46, rtp: 0.99, max: 12 },
    WHEEL: { hit: 0.35, rtp: 0.96, max: 50 },
    LIVE: { hit: 0.33, rtp: 0.95, max: 100 },
    ROULETTE: { hit: 0.45, rtp: 0.97, max: 36 },
  };

  private multiplierFor(kind: GameKind, u: number): number {
    const cfg = GamesService.MODELS[kind] ?? GamesService.MODELS.SLOTS;
    if (u >= cfg.hit) return 0;
    const v = u / cfg.hit; // 0..1 within the winning region
    const m = (cfg.rtp / cfg.hit) * -Math.log(1 - v);
    return Math.round(Math.min(m, cfg.max) * 100) / 100;
  }

  /**
   * External (iframe) game round — fully SERVER-decided. The client only renders
   * the result; it never controls the payout. One atomic, provably-fair tx:
   * debit stake → draw outcome from the committed seed → credit any payout.
   */
  async externalRound(userId: string, username: string, game: string, amountStr: string) {
    const amount = new D(amountStr);
    if (amount.lte(0)) throw new BadRequestException("Amount must be positive");
    if (amount.gt(MAX_BET)) throw new BadRequestException(`Max bet is ${MAX_BET.toFixed(2)}`);
    const title = (game || "Slot").slice(0, 60);
    const kind = this.kindFor(title);

    await this.fairness.getOrCreateActive(userId);

    const result = await this.prisma.$transaction(async (tx) => {
      const seed = await this.fairness.activeInTx(tx, userId);
      if (!seed) throw new BadRequestException("No active seed");
      const nonce = seed.nonce;

      const u = this.fairness.rng(seed.serverSeed, seed.clientSeed, nonce);
      const mult = this.multiplierFor(kind, u);
      const payout = amount.times(mult);

      const bet = await tx.bet.create({
        data: {
          userId,
          game: kind,
          amount,
          clientSeed: seed.clientSeed,
          nonce,
          seedId: seed.id,
          params: { title } as Prisma.InputJsonValue,
          status: "PENDING",
        },
      });

      // debit stake (throws -> rolls back on insufficient funds)
      await this.wallet.applyWithinTx(tx, userId, "BET", amount.negated(), { refType: "external_bet", refId: bet.id });

      let balance: Prisma.Decimal;
      if (payout.gt(0)) {
        balance = await this.wallet.applyWithinTx(tx, userId, "WIN", payout, { refType: "external_bet", refId: bet.id });
      } else {
        balance = (await tx.wallet.findUniqueOrThrow({ where: { userId } })).balance;
      }

      await tx.bet.update({
        where: { id: bet.id },
        data: {
          status: payout.gt(0) ? "WON" : "LOST",
          multiplier: new D(mult),
          payout,
          outcome: { title, multiplier: mult } as Prisma.InputJsonValue,
          settledAt: new Date(),
        },
      });
      await tx.provablyFairSeed.update({ where: { id: seed.id }, data: { nonce: nonce + 1 } });

      return {
        betId: bet.id,
        game: title,
        win: payout.gt(0),
        multiplier: mult,
        payout: payout.toFixed(2),
        balance: balance.toFixed(2),
        nonce,
        serverSeedHash: seed.serverSeedHash,
        clientSeed: seed.clientSeed,
      };
    }, SERIALIZABLE);

    if (result.win) {
      this.events.emit("bet.settled", {
        userId,
        username,
        game: result.game,
        amount: result.payout,
        payout: result.payout,
        multiplier: result.multiplier,
        win: true,
        balance: result.balance,
      });
    }
    return result;
  }

  /** Reproduce an external round's multiplier from a revealed seed (provably fair). */
  externalVerify(game: string, serverSeed: string, clientSeed: string, nonce: number) {
    const kind = this.kindFor((game || "Slot").slice(0, 60));
    const u = this.fairness.rng(serverSeed, clientSeed, nonce);
    return { game, kind, u, multiplier: this.multiplierFor(kind, u) };
  }

  /**
   * External (iframe) game — MIRROR mode. The game client decides the outcome
   * and we record it against the real wallet so the platform balance always
   * equals what the player sees on the reels.
   *   bet  -> debit the stake, open a Bet
   *   win  -> credit the payout, settle the Bet, broadcast the win
   * (Balance is platform-owned via the ledger; outcomes are client-reported.)
   */
  async externalBet(userId: string, slug: string | undefined, game: string, amountStr: string) {
    const amount = new D(amountStr);
    if (amount.lte(0)) throw new BadRequestException("Amount must be positive");
    if (amount.gt(MAX_BET)) throw new BadRequestException(`Max bet is ${MAX_BET.toFixed(2)}`);
    const title = (game || "Slot").slice(0, 60);

    // enforce game availability — paused / maintenance / disabled games can't be bet on
    if (slug) {
      const g = await this.prisma.game.findUnique({ where: { slug }, select: { status: true } });
      if (g && g.status !== "ACTIVE") {
        throw new BadRequestException(`This game is currently ${g.status.toLowerCase()}`);
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const bet = await tx.bet.create({
        data: {
          userId,
          game: this.kindFor(title),
          amount,
          clientSeed: "external",
          nonce: 0,
          params: { title } as Prisma.InputJsonValue,
          status: "PENDING",
        },
      });
      const balance = await this.wallet.applyWithinTx(tx, userId, "BET", amount.negated(), {
        refType: "external_bet",
        refId: bet.id,
      });
      return { betId: bet.id, balance: balance.toFixed(2) };
    }, SERIALIZABLE);
  }

  async externalWin(userId: string, username: string, betId: string, payoutStr: string) {
    const payout = new D(payoutStr);
    if (payout.lt(0)) throw new BadRequestException("Payout cannot be negative");

    const result = await this.prisma.$transaction(async (tx) => {
      const bet = await tx.bet.findFirst({ where: { id: betId, userId } });
      if (!bet) throw new NotFoundException("Bet not found");
      if (bet.status !== "PENDING") throw new BadRequestException("Bet already settled");

      let balance: Prisma.Decimal;
      if (payout.gt(0)) {
        balance = await this.wallet.applyWithinTx(tx, userId, "WIN", payout, { refType: "external_bet", refId: bet.id });
      } else {
        balance = (await tx.wallet.findUniqueOrThrow({ where: { userId } })).balance;
      }
      const mult = bet.amount.gt(0) ? payout.div(bet.amount) : new D(0);
      const title = (bet.params as { title?: string } | null)?.title ?? "Slot";
      await tx.bet.update({
        where: { id: bet.id },
        data: {
          status: payout.gt(0) ? "WON" : "LOST",
          payout,
          multiplier: mult,
          outcome: { title } as Prisma.InputJsonValue,
          settledAt: new Date(),
        },
      });
      return { balance: balance.toFixed(2), payout: payout.toFixed(2), multiplier: Number(mult.toFixed(4)), title };
    }, SERIALIZABLE);

    if (payout.gt(0)) {
      this.events.emit("bet.settled", {
        userId, username, game: result.title,
        amount: result.payout, payout: result.payout,
        multiplier: result.multiplier, win: true, balance: result.balance,
      });
    }
    return result;
  }

  /** Public recent wins feed (across all players). */
  async recentWins(limit = 20) {
    const rows = await this.prisma.bet.findMany({
      where: { status: "WON" },
      orderBy: { settledAt: "desc" },
      take: Math.min(limit, 50),
      include: { user: { select: { username: true } } },
    });
    return rows.map((b) => ({
      username: b.user.username,
      game: (b.outcome as { title?: string } | null)?.title ?? b.game,
      amount: b.payout.toFixed(2),
      multiplier: Number(b.multiplier),
      at: (b.settledAt ?? b.createdAt).getTime(),
    }));
  }

  async history(userId: string, limit = 30) {
    const rows = await this.prisma.bet.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: Math.min(limit, 100),
    });
    return rows.map((b) => ({
      id: b.id,
      game: b.game,
      amount: b.amount.toFixed(2),
      payout: b.payout.toFixed(2),
      multiplier: b.multiplier.toFixed(2),
      status: b.status,
      outcome: b.outcome,
      nonce: b.nonce,
      createdAt: b.createdAt,
    }));
  }
}
