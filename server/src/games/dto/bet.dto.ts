import { IsIn, IsInt, IsNumberString, IsObject, IsOptional, IsString, MaxLength, Min } from "class-validator";

export class ExternalRoundDto {
  @IsString() @MaxLength(60) game!: string;
  @IsNumberString() amount!: string;
}

export class ExternalBetDto {
  @IsString() @MaxLength(60) game!: string;
  @IsOptional() @IsString() @MaxLength(80) slug?: string;
  @IsNumberString() amount!: string;
}

export class ExternalWinDto {
  @IsString() betId!: string;
  @IsNumberString() amount!: string;
}

export class ExternalVerifyDto {
  @IsString() @MaxLength(60) game!: string;
  @IsString() serverSeed!: string;
  @IsString() clientSeed!: string;
  @IsInt() @Min(0) nonce!: number;
}

export class BetDto {
  @IsIn(["DICE", "CRASH", "COINFLIP"])
  game!: "DICE" | "CRASH" | "COINFLIP";

  @IsNumberString()
  amount!: string;

  @IsObject()
  params!: Record<string, unknown>;
}

export class RotateSeedDto {
  @IsOptional()
  @IsString()
  clientSeed?: string;
}

export class VerifyDto {
  @IsIn(["DICE", "CRASH", "COINFLIP"])
  game!: "DICE" | "CRASH" | "COINFLIP";

  @IsString()
  serverSeed!: string;

  @IsString()
  clientSeed!: string;

  @IsInt()
  @Min(0)
  nonce!: number;

  @IsObject()
  params!: Record<string, unknown>;
}
