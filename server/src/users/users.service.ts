import { Injectable } from "@nestjs/common";
import { Prisma, RgLimitType } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { SetLimitDto } from "./dto/limit.dto";

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getLimits(userId: string) {
    const rows = await this.prisma.rgLimit.findMany({ where: { userId } });
    return rows.map((r) => ({ type: r.type, amount: r.amount.toFixed(2), updatedAt: r.updatedAt }));
  }

  async setLimit(userId: string, dto: SetLimitDto) {
    const type = dto.type as RgLimitType;
    const amount = new Prisma.Decimal(dto.amount);
    const row = await this.prisma.rgLimit.upsert({
      where: { userId_type: { userId, type } },
      update: { amount },
      create: { userId, type, amount },
    });
    return { type: row.type, amount: row.amount.toFixed(2) };
  }

  async submitKyc(userId: string) {
    await this.prisma.user.update({ where: { id: userId }, data: { kycStatus: "PENDING" } });
    return { kycStatus: "PENDING" };
  }

  async selfExclude(userId: string) {
    await this.prisma.user.update({ where: { id: userId }, data: { status: "SELF_EXCLUDED" } });
    await this.prisma.session.updateMany({ where: { userId }, data: { revoked: true } });
    return { status: "SELF_EXCLUDED" };
  }

  async stats(userId: string) {
    const [bets, agg] = await Promise.all([
      this.prisma.bet.count({ where: { userId } }),
      this.prisma.bet.aggregate({
        where: { userId },
        _sum: { amount: true, payout: true },
        _max: { multiplier: true },
      }),
    ]);
    return {
      totalBets: bets,
      wagered: (agg._sum.amount ?? new Prisma.Decimal(0)).toFixed(2),
      won: (agg._sum.payout ?? new Prisma.Decimal(0)).toFixed(2),
      bestMultiplier: (agg._max.multiplier ?? new Prisma.Decimal(0)).toFixed(2),
    };
  }
}
