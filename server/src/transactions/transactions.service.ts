import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, TxStatus, TxType } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { WalletService } from "../wallet/wallet.service";
import { PaymentProvider } from "./payment.provider";

const D = Prisma.Decimal;
const SERIALIZABLE = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable } as const;
const MIN = new D("1");
const MAX = new D("50000");

@Injectable()
export class TransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
    private readonly provider: PaymentProvider,
  ) {}

  private validate(amount: string) {
    const amt = new D(amount);
    if (amt.lt(MIN)) throw new BadRequestException(`Minimum is $${MIN.toFixed(2)}`);
    if (amt.gt(MAX)) throw new BadRequestException(`Maximum is $${MAX.toFixed(2)}`);
    return amt;
  }

  /** DEPOSIT — charge the provider, then credit the ledger atomically. */
  async deposit(userId: string, amount: string, method: string) {
    const amt = this.validate(amount);
    const charge = await this.provider.charge({ userId, amount, method });
    if (!charge.ok) {
      await this.prisma.transaction.create({
        data: { userId, type: "DEPOSIT", status: "FAILED", method, amount: amt, providerRef: charge.ref },
      });
      throw new BadRequestException("Payment was declined");
    }
    return this.prisma.$transaction(async (tx) => {
      const txn = await tx.transaction.create({
        data: {
          userId,
          type: "DEPOSIT",
          status: "COMPLETED",
          method,
          amount: amt,
          provider: "fake",
          providerRef: charge.ref,
        },
      });
      const balance = await this.wallet.applyWithinTx(tx, userId, "DEPOSIT", amt, {
        refType: "transaction",
        refId: txn.id,
      });
      return { transactionId: txn.id, status: "COMPLETED", balance: balance.toFixed(2) };
    }, SERIALIZABLE);
  }

  /**
   * WITHDRAW — hold funds (debit + PENDING) atomically. The payout is NOT made
   * automatically; an admin must approve (or reject) the request in the back-office.
   */
  async withdraw(userId: string, amount: string, method: string, _destination?: string) {
    const amt = this.validate(amount);

    const txn = await this.prisma.$transaction(async (tx) => {
      const t = await tx.transaction.create({
        data: { userId, type: "WITHDRAWAL", status: "PENDING", method, amount: amt },
      });
      // debit immediately (throws on insufficient funds -> rolls back, nothing held)
      await this.wallet.applyWithinTx(tx, userId, "WITHDRAWAL", amt.negated(), {
        refType: "transaction",
        refId: t.id,
      });
      return t;
    }, SERIALIZABLE);

    const w = await this.wallet.getBalance(userId);
    return { transactionId: txn.id, status: "PENDING", balance: w.balance };
  }

  /** ADMIN — approve a pending withdrawal: ask the provider to pay out.
   *  On provider failure the held funds are refunded and the txn marked FAILED. */
  async adminApprove(actorId: string, id: string, ip?: string) {
    const t = await this.prisma.transaction.findUnique({ where: { id } });
    if (!t || t.type !== "WITHDRAWAL") throw new NotFoundException("Withdrawal not found");
    if (t.status !== "PENDING") throw new BadRequestException(`Withdrawal is already ${t.status}`);

    const payout = await this.provider.payout({ userId: t.userId, amount: t.amount.toString(), method: t.method ?? "bank" });
    if (!payout.ok) {
      await this.prisma.$transaction(async (tx) => {
        await this.wallet.applyWithinTx(tx, t.userId, "REFUND", t.amount, { refType: "transaction", refId: t.id });
        await tx.transaction.update({ where: { id: t.id }, data: { status: "FAILED" } });
        await tx.auditLog.create({ data: { actorId, action: "withdrawal.payout_failed", target: t.id, ip } });
      }, SERIALIZABLE);
      throw new BadRequestException("Provider payout failed — funds returned to player");
    }
    await this.prisma.transaction.update({
      where: { id: t.id },
      data: { status: "COMPLETED", provider: "fake", providerRef: payout.ref },
    });
    await this.prisma.auditLog.create({ data: { actorId, action: "withdrawal.approve", target: t.id, meta: { amount: t.amount.toFixed(2) }, ip } });
    return { id: t.id, status: "COMPLETED" };
  }

  /** ADMIN — reject a pending withdrawal: refund the held funds, mark FAILED. */
  async adminReject(actorId: string, id: string, reason?: string, ip?: string) {
    const t = await this.prisma.transaction.findUnique({ where: { id } });
    if (!t || t.type !== "WITHDRAWAL") throw new NotFoundException("Withdrawal not found");
    if (t.status !== "PENDING") throw new BadRequestException(`Withdrawal is already ${t.status}`);

    await this.prisma.$transaction(async (tx) => {
      await this.wallet.applyWithinTx(tx, t.userId, "REFUND", t.amount, { refType: "transaction", refId: t.id });
      await tx.transaction.update({ where: { id: t.id }, data: { status: "FAILED" } });
      await tx.auditLog.create({ data: { actorId, action: "withdrawal.reject", target: t.id, meta: { amount: t.amount.toFixed(2), reason }, ip } });
    }, SERIALIZABLE);
    return { id: t.id, status: "FAILED" };
  }

  async list(
    userId: string,
    filters: { type?: TxType; status?: TxStatus; limit?: number },
  ) {
    const rows = await this.prisma.transaction.findMany({
      where: { userId, type: filters.type, status: filters.status },
      orderBy: { createdAt: "desc" },
      take: Math.min(filters.limit ?? 50, 200),
    });
    return rows.map((t) => ({
      id: t.id,
      type: t.type,
      status: t.status,
      method: t.method,
      amount: t.amount.toFixed(2),
      providerRef: t.providerRef,
      createdAt: t.createdAt,
    }));
  }

  async get(userId: string, id: string) {
    const t = await this.prisma.transaction.findFirst({ where: { id, userId } });
    if (!t) throw new NotFoundException("Transaction not found");
    return {
      id: t.id,
      type: t.type,
      status: t.status,
      method: t.method,
      amount: t.amount.toFixed(2),
      provider: t.provider,
      providerRef: t.providerRef,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    };
  }
}
