import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { TxStatus, TxType } from "@prisma/client";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { CurrentUser, AuthUser } from "../common/decorators/current-user.decorator";
import { TransactionsService } from "./transactions.service";
import { MoneyDto } from "./dto/transaction.dto";

@Controller("transactions")
@UseGuards(JwtAuthGuard)
export class TransactionsController {
  constructor(private readonly txns: TransactionsService) {}

  @Get()
  list(
    @CurrentUser() u: AuthUser,
    @Query("type") type?: TxType,
    @Query("status") status?: TxStatus,
    @Query("limit") limit?: string,
  ) {
    return this.txns.list(u.sub, { type, status, limit: limit ? Number(limit) : 50 });
  }

  @Get(":id")
  get(@CurrentUser() u: AuthUser, @Param("id") id: string) {
    return this.txns.get(u.sub, id);
  }

  @Post("deposit")
  deposit(@CurrentUser() u: AuthUser, @Body() dto: MoneyDto) {
    return this.txns.deposit(u.sub, dto.amount, dto.method);
  }

  @Post("withdraw")
  withdraw(@CurrentUser() u: AuthUser, @Body() dto: MoneyDto) {
    return this.txns.withdraw(u.sub, dto.amount, dto.method, dto.destination);
  }
}
