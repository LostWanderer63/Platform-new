import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { CurrentUser, AuthUser } from "../common/decorators/current-user.decorator";
import { WalletService } from "./wallet.service";

@Controller("wallet")
@UseGuards(JwtAuthGuard)
export class WalletController {
  constructor(private readonly wallet: WalletService) {}

  @Get()
  balance(@CurrentUser() user: AuthUser) {
    return this.wallet.getBalance(user.sub);
  }

  @Get("ledger")
  ledger(@CurrentUser() user: AuthUser, @Query("limit") limit?: string) {
    return this.wallet.getLedger(user.sub, limit ? Number(limit) : 50);
  }
}
