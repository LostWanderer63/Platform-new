import { Injectable, NotFoundException } from "@nestjs/common";
import { KycStatus, Prisma, UserStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

const D = Prisma.Decimal;

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async metrics() {
    const since = new Date(Date.now() - 24 * 3600 * 1000);
    const [users, active, betsAll, bets24, deposits, withdrawals, online] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { status: "ACTIVE" } }),
      this.prisma.bet.aggregate({ _sum: { amount: true, payout: true }, _count: true }),
      this.prisma.bet.aggregate({
        where: { createdAt: { gte: since } },
        _sum: { amount: true, payout: true },
        _count: true,
      }),
      this.prisma.transaction.aggregate({
        where: { type: "DEPOSIT", status: "COMPLETED" },
        _sum: { amount: true },
      }),
      this.prisma.transaction.aggregate({
        where: { type: "WITHDRAWAL", status: "COMPLETED" },
        _sum: { amount: true },
      }),
      this.prisma.session.count({ where: { revoked: false, expiresAt: { gt: new Date() } } }),
    ]);

    const ggr = (a?: Prisma.Decimal | null, p?: Prisma.Decimal | null) =>
      new D(a ?? 0).minus(new D(p ?? 0)).toFixed(2);

    return {
      users: { total: users, active, online },
      ggrAllTime: ggr(betsAll._sum.amount, betsAll._sum.payout),
      ggr24h: ggr(bets24._sum.amount, bets24._sum.payout),
      bets: { total: betsAll._count, last24h: bets24._count },
      wagered24h: new D(bets24._sum.amount ?? 0).toFixed(2),
      deposits: new D(deposits._sum.amount ?? 0).toFixed(2),
      withdrawals: new D(withdrawals._sum.amount ?? 0).toFixed(2),
    };
  }

  async listUsers(limit = 50) {
    const rows = await this.prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      take: Math.min(limit, 200),
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

  async setUserStatus(actorId: string, userId: string, status: UserStatus, ip?: string) {
    const user = await this.prisma.user.update({ where: { id: userId }, data: { status } });
    if (status !== "ACTIVE") {
      await this.prisma.session.updateMany({ where: { userId }, data: { revoked: true } });
    }
    await this.prisma.auditLog.create({
      data: { actorId, action: `user.status.${status}`, target: userId, ip },
    });
    return { id: user.id, status: user.status };
  }

  /** Simple risk heuristics: biggest recent wins + biggest single bets. */
  async riskQueue() {
    const since = new Date(Date.now() - 24 * 3600 * 1000);
    const bigWins = await this.prisma.bet.findMany({
      where: { status: "WON", createdAt: { gte: since } },
      orderBy: { payout: "desc" },
      take: 10,
      include: { user: { select: { username: true } } },
    });
    return bigWins.map((b) => ({
      betId: b.id,
      user: b.user.username,
      game: b.game,
      amount: b.amount.toFixed(2),
      payout: b.payout.toFixed(2),
      multiplier: b.multiplier.toFixed(2),
      level: b.payout.gt(2000) ? "High" : b.payout.gt(500) ? "Med" : "Low",
      createdAt: b.createdAt,
    }));
  }

  /** Players awaiting KYC review (PENDING) or previously REJECTED. */
  async kycQueue() {
    const rows = await this.prisma.user.findMany({
      where: { role: "USER", kycStatus: { in: ["PENDING", "REJECTED"] } },
      orderBy: { createdAt: "asc" },
      include: { wallet: true },
    });
    return rows.map((u) => ({
      id: u.id,
      username: u.username,
      email: u.email,
      kycStatus: u.kycStatus,
      balance: u.wallet?.balance.toFixed(2) ?? "0.00",
      createdAt: u.createdAt,
    }));
  }

  async setKyc(actorId: string, userId: string, status: KycStatus, ip?: string) {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!u) throw new NotFoundException("Player not found");
    await this.prisma.user.update({ where: { id: userId }, data: { kycStatus: status } });
    await this.prisma.auditLog.create({ data: { actorId, action: `kyc.${status.toLowerCase()}`, target: userId, ip } });
    return { id: userId, kycStatus: status };
  }

  async pendingWithdrawals() {
    const rows = await this.prisma.transaction.findMany({
      where: { type: "WITHDRAWAL", status: "PENDING" },
      orderBy: { createdAt: "asc" },
      include: { user: { select: { username: true } } },
    });
    return rows.map((t) => ({
      id: t.id,
      user: t.user.username,
      amount: t.amount.toFixed(2),
      method: t.method,
      createdAt: t.createdAt,
    }));
  }

  async transactions(opts: { type?: "DEPOSIT" | "WITHDRAWAL"; limit?: number }) {
    const rows = await this.prisma.transaction.findMany({
      where: { type: opts.type },
      orderBy: { createdAt: "desc" },
      take: Math.min(opts.limit ?? 100, 300),
      include: { user: { select: { username: true } } },
    });
    return rows.map((t) => ({
      id: t.id,
      user: t.user.username,
      type: t.type,
      status: t.status,
      method: t.method,
      amount: t.amount.toFixed(2),
      providerRef: t.providerRef,
      createdAt: t.createdAt,
    }));
  }

  async logs(limit = 100) {
    const rows = await this.prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: Math.min(limit, 300),
      include: { actor: { select: { username: true } } },
    });
    return rows.map((l) => ({
      id: l.id,
      actor: l.actor?.username ?? "system",
      action: l.action,
      target: l.target,
      meta: l.meta,
      ip: l.ip,
      createdAt: l.createdAt,
    }));
  }
}
