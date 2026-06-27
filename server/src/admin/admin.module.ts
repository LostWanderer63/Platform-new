import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { AdminService } from "./admin.service";
import { AdminController } from "./admin.controller";
import { GamesAdminService } from "./games-admin.service";
import { PlayersAdminService } from "./players-admin.service";
import { DistributorsService } from "./distributors.service";
import { WalletModule } from "../wallet/wallet.module";
import { TransactionsModule } from "../transactions/transactions.module";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";

@Module({
  imports: [JwtModule.register({}), WalletModule, TransactionsModule],
  controllers: [AdminController],
  providers: [
    AdminService,
    GamesAdminService,
    PlayersAdminService,
    DistributorsService,
    JwtAuthGuard,
    RolesGuard,
  ],
})
export class AdminModule {}
