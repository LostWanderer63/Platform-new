import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { LiveGateway } from "./live.gateway";

@Module({
  imports: [JwtModule.register({})],
  providers: [LiveGateway],
})
export class LiveModule {}
