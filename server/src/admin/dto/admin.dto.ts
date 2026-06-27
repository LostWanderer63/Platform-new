import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsNumberString,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";
import { GameKind, GameStatus, UserStatus } from "@prisma/client";

const KINDS = ["CRASH", "DICE", "MINES", "PLINKO", "ROULETTE", "WHEEL", "COINFLIP", "BLACKJACK", "SLOTS", "LIVE"];
const GAME_STATUS = ["ACTIVE", "PAUSED", "MAINTENANCE", "DISABLED"];

export class GameCreateDto {
  @IsString() @MinLength(2) @MaxLength(40) slug!: string;
  @IsString() @MinLength(1) name!: string;
  @IsString() category!: string;
  @IsString() provider!: string;
  @IsIn(KINDS) kind!: GameKind;
  @IsOptional() @IsInt() hue?: number;
  @IsOptional() @IsBoolean() hot?: boolean;
  @IsOptional() @IsBoolean() live?: boolean;
  @IsOptional() @IsInt() order?: number;
  @IsOptional() @IsString() imageUrl?: string;
}

export class GameUpdateDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() provider?: string;
  @IsOptional() @IsIn(KINDS) kind?: GameKind;
  @IsOptional() @IsInt() hue?: number;
  @IsOptional() @IsBoolean() hot?: boolean;
  @IsOptional() @IsBoolean() live?: boolean;
  @IsOptional() @IsInt() order?: number;
  @IsOptional() @IsString() imageUrl?: string;
}

export class GameStatusDto {
  @IsIn(GAME_STATUS) status!: GameStatus;
}

export class BulkStatusDto {
  @IsArray() @ArrayNotEmpty() @IsString({ each: true }) ids!: string[];
  @IsIn(GAME_STATUS) status!: GameStatus;
}

export class UserStatusDto {
  @IsIn(["ACTIVE", "SUSPENDED", "SELF_EXCLUDED"]) status!: UserStatus;
}

export class CreatePlayerDto {
  @IsString() @MinLength(3) @MaxLength(20)
  @Matches(/^[a-zA-Z0-9_]+$/, { message: "username: letters, numbers, underscore only" })
  username!: string;
  @IsEmail() email!: string;
  @IsString() @MinLength(8) @MaxLength(72) password!: string;
  @IsOptional() @IsNumberString() startingBalance?: string;
  @IsOptional() @IsString() distributorId?: string;
}

export class KycStatusDto {
  @IsIn(["VERIFIED", "REJECTED", "PENDING", "NONE"]) status!: "VERIFIED" | "REJECTED" | "PENDING" | "NONE";
}

export class RejectDto {
  @IsOptional() @IsString() @MaxLength(140) reason?: string;
}

export class AdjustDto {
  // signed amount: "100" credits, "-25.50" debits
  @IsNumberString() amount!: string;
  @IsString() @MinLength(2) @MaxLength(140) reason!: string;
}

export class DistributorCreateDto {
  @IsString() @MinLength(2) name!: string;
  @IsString() @MinLength(2) @MaxLength(20) code!: string;
  @IsOptional() @IsString() parentId?: string;
  @IsOptional() @IsNumberString() commissionPct?: string;
  @IsOptional() @IsEmail() contactEmail?: string;
  // optional login for this distributor (creates a staff account)
  @IsOptional() @IsString() @MinLength(3) @MaxLength(20) username?: string;
  @IsOptional() @IsString() @MinLength(6) password?: string;
}

export class DistributorUpdateDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsNumberString() commissionPct?: string;
  @IsOptional() @IsEmail() contactEmail?: string;
}

export class DistributorStatusDto {
  @IsIn(["ACTIVE", "SUSPENDED"]) status!: "ACTIVE" | "SUSPENDED";
}
