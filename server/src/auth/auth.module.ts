import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { AuthService } from "./auth.service";
import { AuthController } from "./auth.controller";
import { TokenService } from "./token.service";
import { WalletModule } from "../wallet/wallet.module";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";

@Module({
  imports: [JwtModule.register({}), WalletModule],
  controllers: [AuthController],
  providers: [AuthService, TokenService, JwtAuthGuard],
  exports: [TokenService],
})
export class AuthModule {}
