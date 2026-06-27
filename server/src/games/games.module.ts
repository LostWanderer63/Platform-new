import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { GamesService } from "./games.service";
import { GamesController } from "./games.controller";
import { FairnessService } from "./fairness.service";
import { WalletModule } from "../wallet/wallet.module";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";

@Module({
  imports: [JwtModule.register({}), WalletModule],
  controllers: [GamesController],
  providers: [GamesService, FairnessService, JwtAuthGuard],
  exports: [GamesService, FairnessService],
})
export class GamesModule {}
