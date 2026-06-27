import { Controller, Get } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

@Controller("stats")
export class StatsController {
  constructor(private readonly prisma: PrismaService) {}

  /** Public headline stats for the landing/home pages. */
  @Get()
  async publicStats() {
    const since = new Date(Date.now() - 24 * 3600 * 1000);
    const [players, online, wager, biggest] = await Promise.all([
      this.prisma.user.count({ where: { role: "USER" } }),
      this.prisma.session.count({ where: { revoked: false, expiresAt: { gt: new Date() } } }),
      this.prisma.bet.aggregate({ where: { createdAt: { gte: since } }, _sum: { amount: true } }),
      this.prisma.bet.aggregate({ where: { status: "WON", createdAt: { gte: since } }, _max: { payout: true } }),
    ]);
    return {
      players,
      online,
      wagered24h: Number(wager._sum.amount ?? new Prisma.Decimal(0)),
      biggestWin24h: Number(biggest._max.payout ?? new Prisma.Decimal(0)),
    };
  }
}
