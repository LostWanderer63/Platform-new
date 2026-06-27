import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { CurrentUser, AuthUser } from "../common/decorators/current-user.decorator";
import { GamesService } from "./games.service";
import { FairnessService } from "./fairness.service";
import { BetDto, ExternalBetDto, ExternalRoundDto, ExternalVerifyDto, ExternalWinDto, RotateSeedDto, VerifyDto } from "./dto/bet.dto";

@Controller("games")
export class GamesController {
  constructor(
    private readonly games: GamesService,
    private readonly fairness: FairnessService,
  ) {}

  // public: playable game catalog
  @Get("catalog")
  catalog() {
    return this.games.catalog();
  }

  // public: recent wins feed
  @Get("recent-wins")
  recentWins(@Query("limit") limit?: string) {
    return this.games.recentWins(limit ? Number(limit) : 20);
  }

  // public: anyone can verify a revealed outcome
  @Post("verify")
  verify(@Body() dto: VerifyDto) {
    return this.fairness.verify(dto);
  }

  @Get("seed")
  @UseGuards(JwtAuthGuard)
  seed(@CurrentUser() u: AuthUser) {
    return this.fairness.getActive(u.sub);
  }

  @Post("seed/rotate")
  @UseGuards(JwtAuthGuard)
  rotate(@CurrentUser() u: AuthUser, @Body() dto: RotateSeedDto) {
    return this.fairness.rotate(u.sub, dto.clientSeed);
  }

  @Post("bet")
  @UseGuards(JwtAuthGuard)
  bet(@CurrentUser() u: AuthUser, @Body() dto: BetDto) {
    return this.games.placeBet(u.sub, dto, u.username);
  }

  // external (iframe) games — outcome decided server-side, provably fair
  @Post("external/round")
  @UseGuards(JwtAuthGuard)
  externalRound(@CurrentUser() u: AuthUser, @Body() dto: ExternalRoundDto) {
    return this.games.externalRound(u.sub, u.username, dto.game, dto.amount);
  }

  // external (iframe) games — MIRROR mode: client reports the outcome, wallet records it
  @Post("external/bet")
  @UseGuards(JwtAuthGuard)
  externalBet(@CurrentUser() u: AuthUser, @Body() dto: ExternalBetDto) {
    return this.games.externalBet(u.sub, dto.slug, dto.game, dto.amount);
  }

  @Post("external/win")
  @UseGuards(JwtAuthGuard)
  externalWin(@CurrentUser() u: AuthUser, @Body() dto: ExternalWinDto) {
    return this.games.externalWin(u.sub, u.username, dto.betId, dto.amount);
  }

  // public: reproduce a round's multiplier from a revealed seed
  @Post("external/verify")
  externalVerify(@Body() dto: ExternalVerifyDto) {
    return this.games.externalVerify(dto.game, dto.serverSeed, dto.clientSeed, dto.nonce);
  }

  @Get("bets")
  @UseGuards(JwtAuthGuard)
  bets(@CurrentUser() u: AuthUser, @Query("limit") limit?: string) {
    return this.games.history(u.sub, limit ? Number(limit) : 30);
  }
}
