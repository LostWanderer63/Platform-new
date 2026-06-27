import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { TransactionsService } from "./transactions.service";
import { TransactionsController } from "./transactions.controller";
import { PaymentProvider, FakePaymentProvider } from "./payment.provider";
import { WalletModule } from "../wallet/wallet.module";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";

@Module({
  imports: [JwtModule.register({}), WalletModule],
  controllers: [TransactionsController],
  providers: [
    TransactionsService,
    JwtAuthGuard,
    { provide: PaymentProvider, useClass: FakePaymentProvider },
  ],
  exports: [TransactionsService],
})
export class TransactionsModule {}
