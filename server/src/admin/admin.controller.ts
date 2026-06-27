import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser, AuthUser } from "../common/decorators/current-user.decorator";
import { AdminService } from "./admin.service";
import { GamesAdminService } from "./games-admin.service";
import { PlayersAdminService } from "./players-admin.service";
import { DistributorsService } from "./distributors.service";
import { TransactionsService } from "../transactions/transactions.service";
import {
  AdjustDto, BulkStatusDto, CreatePlayerDto, DistributorCreateDto, DistributorStatusDto,
  DistributorUpdateDto, GameCreateDto, GameStatusDto, GameUpdateDto, KycStatusDto, RejectDto, UserStatusDto,
} from "./dto/admin.dto";

@Controller("admin")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("ADMIN", "MODERATOR")
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly games: GamesAdminService,
    private readonly players: PlayersAdminService,
    private readonly distributors: DistributorsService,
    private readonly txns: TransactionsService,
  ) {}

  // ---- dashboard ----
  @Get("metrics") metrics() { return this.admin.metrics(); }
  @Get("risk") risk() { return this.admin.riskQueue(); }
  @Get("logs") logs(@Query("limit") limit?: string) { return this.admin.logs(limit ? Number(limit) : 100); }
  @Get("transactions") transactions(@Query("type") type?: "DEPOSIT" | "WITHDRAWAL", @Query("limit") limit?: string) {
    return this.admin.transactions({ type, limit: limit ? Number(limit) : 100 });
  }
  @Get("withdrawals/pending") pending() { return this.admin.pendingWithdrawals(); }
  @Post("withdrawals/:id/approve") @Roles("ADMIN")
  approveWithdrawal(@CurrentUser() a: AuthUser, @Param("id") id: string, @Req() req: Request) {
    return this.txns.adminApprove(a.sub, id, req.ip);
  }
  @Post("withdrawals/:id/reject") @Roles("ADMIN")
  rejectWithdrawal(@CurrentUser() a: AuthUser, @Param("id") id: string, @Body() dto: RejectDto, @Req() req: Request) {
    return this.txns.adminReject(a.sub, id, dto.reason, req.ip);
  }

  // ---- KYC ----
  @Get("kyc") kycQueue() { return this.admin.kycQueue(); }
  @Post("players/:id/kyc") @Roles("ADMIN")
  setKyc(@CurrentUser() a: AuthUser, @Param("id") id: string, @Body() dto: KycStatusDto, @Req() req: Request) {
    return this.admin.setKyc(a.sub, id, dto.status, req.ip);
  }

  // ---- players ----
  @Get("players") listPlayers(@Query("q") q?: string, @Query("limit") limit?: string) {
    return this.players.list({ q, limit: limit ? Number(limit) : 50 });
  }
  @Post("players") @Roles("ADMIN")
  createPlayer(@CurrentUser() a: AuthUser, @Body() dto: CreatePlayerDto, @Req() req: Request) {
    return this.players.createPlayer(a.sub, dto, req.ip);
  }
  @Get("players/:id") getPlayer(@Param("id") id: string) { return this.players.get(id); }
  @Get("players/:id/ledger") playerLedger(@Param("id") id: string) { return this.players.ledger(id); }
  @Post("players/:id/status") @Roles("ADMIN")
  playerStatus(@CurrentUser() a: AuthUser, @Param("id") id: string, @Body() dto: UserStatusDto, @Req() req: Request) {
    return this.players.setStatus(a.sub, id, dto.status, req.ip);
  }
  @Post("players/:id/adjust") @Roles("ADMIN")
  adjust(@CurrentUser() a: AuthUser, @Param("id") id: string, @Body() dto: AdjustDto, @Req() req: Request) {
    return this.players.adjust(a.sub, id, dto.amount, dto.reason, req.ip);
  }

  // ---- games ----
  @Get("games") listGames() { return this.games.list(); }
  @Post("games") @Roles("ADMIN") createGame(@Body() dto: GameCreateDto) { return this.games.create(dto); }
  @Patch("games/:id") @Roles("ADMIN") updateGame(@Param("id") id: string, @Body() dto: GameUpdateDto) {
    return this.games.update(id, dto);
  }
  @Delete("games/:id") @Roles("ADMIN") deleteGame(@Param("id") id: string) { return this.games.remove(id); }
  @Post("games/:id/status") setGameStatus(@Param("id") id: string, @Body() dto: GameStatusDto) {
    return this.games.setStatus(id, dto.status);
  }
  @Post("games/bulk-status") bulkGameStatus(@Body() dto: BulkStatusDto) {
    return this.games.bulkStatus(dto.ids, dto.status);
  }

  // ---- distributors / sub-distributors ----
  @Get("distributors") listDist() { return this.distributors.list(); }
  @Post("distributors") @Roles("ADMIN") createDist(@Body() dto: DistributorCreateDto) {
    return this.distributors.create(dto);
  }
  @Patch("distributors/:id") @Roles("ADMIN") updateDist(@Param("id") id: string, @Body() dto: DistributorUpdateDto) {
    return this.distributors.update(id, dto);
  }
  @Post("distributors/:id/status") @Roles("ADMIN") distStatus(@Param("id") id: string, @Body() dto: DistributorStatusDto) {
    return this.distributors.setStatus(id, dto.status);
  }
  @Delete("distributors/:id") @Roles("ADMIN") deleteDist(@Param("id") id: string) {
    return this.distributors.remove(id);
  }
}
