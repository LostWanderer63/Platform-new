import { IsIn, IsNumberString, IsString } from "class-validator";

export class AmountDto {
  // string to preserve decimal precision (no float)
  @IsNumberString({ no_symbols: false })
  amount!: string;

  @IsString()
  @IsIn(["visa", "mastercard", "paypal", "bank", "applepay"])
  method!: string;
}
