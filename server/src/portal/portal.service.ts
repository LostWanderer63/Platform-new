import { ConflictException, ForbiddenException, Injectable } from "@nestjs/common";
import * as argon2 from "argon2";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class PortalService {
  constructor(private readonly prisma: PrismaService) {}

  /** Resolve the distributor record linked to the logged-in staff user. */
  private async own(userId: string) {
    const d = await this.prisma.distributor.findUnique({ where: { userId } });
    if (!d) throw new ForbiddenException("No distributor profile linked to this account");
    return d;
  }

  async overview(userId: string) {
    const d = await this.own(userId);
    const [players, subs, players24] = await Promise.all([
      this.prisma.user.count({ where: { distributorId: d.id } }),
      this.prisma.distributor.count({ where: { parentId: d.id } }),
      this.prisma.user.count({
        where: { distributorId: d.id, createdAt: { gte: new Date(Date.now() - 24 * 3600 * 1000) } },
      }),
    ]);
    return {
      id: d.id,
      name: d.name,
      code: d.code,
      level: d.parentId ? "Sub-distributor" : "Distributor",
      status: d.status,
      commissionPct: d.commissionPct.toFixed(2),
      balance: d.balance.toFixed(2),
      counts: { players, subs, players24 },
    };
  }

  async players(userId: string) {
    const d = await this.own(userId);
    const rows = await this.prisma.user.findMany({
      where: { distributorId: d.id },
      orderBy: { createdAt: "desc" },
      include: { wallet: true },
      take: 200,
    });
    return rows.map((u) => ({
      id: u.id,
      username: u.username,
      email: u.email,
      status: u.status,
      balance: u.wallet?.balance.toFixed(2) ?? "0.00",
      createdAt: u.createdAt,
    }));
  }

  async createPlayer(userId: string, input: { username: string; email: string; password: string }) {
    const d = await this.own(userId);
    const email = input.email.toLowerCase();
    const clash = await this.prisma.user.findFirst({
      where: { OR: [{ username: input.username }, { email }] },
      select: { id: true },
    });
    if (clash) throw new ConflictException("Username or email already in use");
    const passwordHash = await argon2.hash(input.password);
    const user = await this.prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: { username: input.username, email, passwordHash, role: "USER", distributorId: d.id },
      });
      await tx.wallet.create({ data: { userId: u.id } });
      return u;
    });
    return { id: user.id, username: user.username, email: user.email, status: user.status };
  }

  async subs(userId: string) {
    const d = await this.own(userId);
    const rows = await this.prisma.distributor.findMany({ where: { parentId: d.id }, orderBy: { createdAt: "asc" } });
    return rows.map((s) => ({
      id: s.id,
      name: s.name,
      code: s.code,
      status: s.status,
      commissionPct: s.commissionPct.toFixed(2),
      balance: s.balance.toFixed(2),
      createdAt: s.createdAt,
    }));
  }
}
