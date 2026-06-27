import { IsIn, IsNumberString, IsOptional, IsString } from "class-validator";

export class MoneyDto {
  @IsNumberString()
  amount!: string;

  @IsString()
  @IsIn(["visa", "mastercard", "paypal", "bank", "applepay"])
  method!: string;

  @IsOptional()
  @IsString()
  destination?: string;
}
