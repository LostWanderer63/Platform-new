import { Injectable } from "@nestjs/common";
import { randomBytes } from "crypto";

export interface ProviderResult {
  ok: boolean;
  ref: string;
  message?: string;
}

export interface ChargeInput {
  userId: string;
  amount: string;
  method: string;
  destination?: string;
}

/**
 * Payment-provider seam. Swap this stub for real adapters (Stripe, Checkout,
 * a PSP, bank rails) — controllers/services don't change.
 */
export abstract class PaymentProvider {
  abstract charge(input: ChargeInput): Promise<ProviderResult>; // money in
  abstract payout(input: ChargeInput): Promise<ProviderResult>; // money out
}

@Injectable()
export class FakePaymentProvider extends PaymentProvider {
  private ref(prefix: string) {
    return `${prefix}_${randomBytes(8).toString("hex")}`;
  }

  async charge(): Promise<ProviderResult> {
    // simulate an instant successful authorization + capture
    return { ok: true, ref: this.ref("ch") };
  }

  async payout(): Promise<ProviderResult> {
    // simulate provider accepting the payout
    return { ok: true, ref: this.ref("po") };
  }
}
