import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PortalService } from "./portal.service";
import { PortalController } from "./portal.controller";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";

@Module({
  imports: [JwtModule.register({})],
  controllers: [PortalController],
  providers: [PortalService, JwtAuthGuard, RolesGuard],
})
export class PortalModule {}
