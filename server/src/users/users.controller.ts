import { Body, Controller, Get, Post, Put, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { CurrentUser, AuthUser } from "../common/decorators/current-user.decorator";
import { UsersService } from "./users.service";
import { SetLimitDto } from "./dto/limit.dto";

@Controller("users/me")
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get("stats")
  stats(@CurrentUser() u: AuthUser) {
    return this.users.stats(u.sub);
  }

  @Get("limits")
  limits(@CurrentUser() u: AuthUser) {
    return this.users.getLimits(u.sub);
  }

  @Put("limits")
  setLimit(@CurrentUser() u: AuthUser, @Body() dto: SetLimitDto) {
    return this.users.setLimit(u.sub, dto);
  }

  @Post("kyc")
  kyc(@CurrentUser() u: AuthUser) {
    return this.users.submitKyc(u.sub);
  }

  @Post("self-exclude")
  selfExclude(@CurrentUser() u: AuthUser) {
    return this.users.selfExclude(u.sub);
  }
}
