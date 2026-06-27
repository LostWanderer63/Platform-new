import { IsIn, IsNumberString } from "class-validator";

const TYPES = [
  "DEPOSIT_DAILY",
  "DEPOSIT_WEEKLY",
  "LOSS_DAILY",
  "LOSS_WEEKLY",
  "WAGER_DAILY",
  "SESSION_MINUTES",
] as const;

export class SetLimitDto {
  @IsIn(TYPES)
  type!: (typeof TYPES)[number];

  @IsNumberString()
  amount!: string;
}
