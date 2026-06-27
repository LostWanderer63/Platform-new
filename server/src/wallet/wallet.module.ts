import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { WalletService } from "./wallet.service";
import { WalletController } from "./wallet.controller";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";

@Module({
  imports: [JwtModule.register({})],
  controllers: [WalletController],
  providers: [WalletService, JwtAuthGuard],
  exports: [WalletService],
})
export class WalletModule {}
