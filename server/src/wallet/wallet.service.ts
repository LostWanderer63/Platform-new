import { BadRequestException, Injectable } from "@nestjs/common";
import { Prisma, LedgerType } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

type Tx = Prisma.TransactionClient;
const D = Prisma.Decimal;
const SERIALIZABLE = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable } as const;

@Injectable()
export class WalletService {
  constructor(private readonly prisma: PrismaService) {}

  async ensureWallet(userId: string) {
    return this.prisma.wallet.upsert({ where: { userId }, update: {}, create: { userId } });
  }

  /**
   * Core ledger primitive — applies a SIGNED amount within an existing
   * transaction (credit > 0, debit < 0). Recomputes balance, blocks overdraft,
   * writes an append-only ledger row. Callers wrap this in a serializable tx so
   * bet + settlement + ledger stay atomic.
   */
  async applyWithinTx(
    tx: Tx,
    userId: string,
    type: LedgerType,
    amount: Prisma.Decimal.Value,
    ref?: { refType?: string; refId?: string; meta?: Prisma.InputJsonValue },
  ) {
    const wallet = await tx.wallet.findUnique({ where: { userId } });
    if (!wallet) throw new BadRequestException("Wallet not found");

    const delta = new D(amount);
    const next = new D(wallet.balance).plus(delta);
    if (next.isNegative()) throw new BadRequestException("Insufficient balance");

    await tx.wallet.update({ where: { userId }, data: { balance: next } });
    await tx.ledgerEntry.create({
      data: {
        walletId: wallet.id,
        userId,
        type,
        amount: delta,
        balanceAfter: next,
        refType: ref?.refType,
        refId: ref?.refId,
        meta: ref?.meta,
      },
    });
    return next;
  }

  /** Standalone signed move (own transaction). */
  move(userId: string, type: LedgerType, amount: Prisma.Decimal.Value, ref?: { refType?: string; refId?: string }) {
    return this.prisma.$transaction((tx) => this.applyWithinTx(tx, userId, type, amount, ref), SERIALIZABLE);
  }

  async getBalance(userId: string) {
    const w = await this.ensureWallet(userId);
    return { balance: w.balance.toFixed(2), bonus: w.bonus.toFixed(2), currency: w.currency };
  }

  async getLedger(userId: string, limit = 50) {
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
      refId: r.refId,
      createdAt: r.createdAt,
    }));
  }

}
