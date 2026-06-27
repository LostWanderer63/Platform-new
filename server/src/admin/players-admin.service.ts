import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, UserStatus } from "@prisma/client";
import * as argon2 from "argon2";
import { PrismaService } from "../prisma/prisma.service";
import { WalletService } from "../wallet/wallet.service";

const D = Prisma.Decimal;
const SERIALIZABLE = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable } as const;

@Injectable()
export class PlayersAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
  ) {}

  async list(opts: { q?: string; limit?: number }) {
    // real players only — never staff/distributor accounts
    const where: Prisma.UserWhereInput = {
      role: "USER",
      ...(opts.q
        ? { OR: [{ email: { contains: opts.q, mode: "insensitive" } }, { username: { contains: opts.q, mode: "insensitive" } }] }
        : {}),
    };
    const rows = await this.prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: Math.min(opts.limit ?? 50, 200),
      include: { wallet: true },
    });
    return rows.map((u) => ({
      id: u.id,
      email: u.email,
      username: u.username,
      role: u.role,
      status: u.status,
      kycStatus: u.kycStatus,
      balance: u.wallet?.balance.toFixed(2) ?? "0.00",
      createdAt: u.createdAt,
    }));
  }

  async get(id: string) {
    const u = await this.prisma.user.findUnique({ where: { id }, include: { wallet: true } });
    if (!u) throw new NotFoundException("Player not found");
    const [bets, txns] = await Promise.all([
      this.prisma.bet.aggregate({ where: { userId: id }, _sum: { amount: true, payout: true }, _count: true }),
      this.prisma.transaction.count({ where: { userId: id } }),
    ]);
    return {
      id: u.id,
      email: u.email,
      username: u.username,
      role: u.role,
      status: u.status,
      kycStatus: u.kycStatus,
      level: u.level,
      xp: u.xp,
      balance: u.wallet?.balance.toFixed(2) ?? "0.00",
      wagered: (bets._sum.amount ?? new D(0)).toFixed(2),
      won: (bets._sum.payout ?? new D(0)).toFixed(2),
      bets: bets._count,
      transactions: txns,
      createdAt: u.createdAt,
    };
  }

  async createPlayer(
    actorId: string,
    input: { username: string; email: string; password: string; startingBalance?: string; distributorId?: string },
    ip?: string,
  ) {
    const email = input.email.toLowerCase();
    const clash = await this.prisma.user.findFirst({
      where: { OR: [{ username: input.username }, { email }] },
      select: { id: true },
    });
    if (clash) throw new ConflictException("Username or email already in use");
    if (input.distributorId) {
      const d = await this.prisma.distributor.findUnique({ where: { id: input.distributorId }, select: { id: true } });
      if (!d) throw new BadRequestException("Distributor not found");
    }
    const start = new D(input.startingBalance ?? "0");
    if (start.isNegative()) throw new BadRequestException("Starting balance cannot be negative");
    const passwordHash = await argon2.hash(input.password);

    const user = await this.prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: { username: input.username, email, passwordHash, role: "USER", distributorId: input.distributorId ?? null },
      });
      await tx.wallet.create({ data: { userId: u.id } });
      if (start.gt(0)) {
        await this.wallet.applyWithinTx(tx, u.id, "ADJUSTMENT", start, {
          refType: "admin_create", meta: { actorId, reason: "starting balance" },
        });
      }
      return u;
    }, SERIALIZABLE);

    await this.prisma.auditLog.create({
      data: { actorId, action: "player.create", target: user.id, meta: { startingBalance: start.toFixed(2), distributorId: input.distributorId ?? null }, ip },
    });
    return { id: user.id, username: user.username, email: user.email, status: user.status };
  }

  async setStatus(actorId: string, id: string, status: UserStatus, ip?: string) {
    await this.prisma.user.update({ where: { id }, data: { status } });
    if (status !== "ACTIVE") {
      await this.prisma.session.updateMany({ where: { userId: id }, data: { revoked: true } });
    }
    await this.prisma.auditLog.create({ data: { actorId, action: `player.status.${status}`, target: id, ip } });
    return { id, status };
  }

  /** Manual point adjustment (signed). Positive credits, negative debits;
   *  overdraft is blocked by the ledger. Writes an audit entry. */
  async adjust(actorId: string, userId: string, amount: string, reason: string, ip?: string) {
    const amt = new D(amount);
    if (amt.isZero()) throw new BadRequestException("Amount cannot be zero");
    await this.prisma.user.findUniqueOrThrow({ where: { id: userId } }).catch(() => {
      throw new NotFoundException("Player not found");
    });

    const balance = await this.prisma.$transaction(async (tx) => {
      const next = await this.wallet.applyWithinTx(tx, userId, "ADJUSTMENT", amt, {
        refType: "admin_adjust",
        meta: { reason, actorId },
      });
      await tx.auditLog.create({
        data: { actorId, action: "player.adjust", target: userId, meta: { amount, reason }, ip },
      });
      return next;
    }, SERIALIZABLE);

    return { userId, amount: amt.toFixed(2), balance: balance.toFixed(2) };
  }

  async ledger(userId: string, limit = 50) {
    const rows = await this.prisma.ledgerEntry.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: Math.min(limit, 200),
    });
    return rows.map((r) => ({
      id: r.id,
      type: r.type,
      amount: r.amount.toFixed(2),
      balanceAfter: r.balanceAfter.toFixed(2),
      refType: r.refType,
      createdAt: r.createdAt,
    }));
  }
}
