import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { IsEmail, IsString, Matches, MaxLength, MinLength } from "class-validator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser, AuthUser } from "../common/decorators/current-user.decorator";
import { PortalService } from "./portal.service";

class CreatePlayerDto {
  @IsString() @MinLength(3) @MaxLength(20) @Matches(/^[a-zA-Z0-9_]+$/)
  username!: string;
  @IsEmail() email!: string;
  @IsString() @MinLength(8) @MaxLength(72) password!: string;
}

@Controller("portal")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("DISTRIBUTOR", "SUB_DISTRIBUTOR")
export class PortalController {
  constructor(private readonly portal: PortalService) {}

  @Get("overview")
  overview(@CurrentUser() u: AuthUser) {
    return this.portal.overview(u.sub);
  }

  @Get("players")
  players(@CurrentUser() u: AuthUser) {
    return this.portal.players(u.sub);
  }

  @Post("players")
  createPlayer(@CurrentUser() u: AuthUser, @Body() dto: CreatePlayerDto) {
    return this.portal.createPlayer(u.sub, dto);
  }

  @Get("subs")
  subs(@CurrentUser() u: AuthUser) {
    return this.portal.subs(u.sub);
  }
}
