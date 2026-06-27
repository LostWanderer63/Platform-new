import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { createHash, createHmac, randomBytes } from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { settle, PlayableGame } from "./engines";

type Tx = Prisma.TransactionClient;

@Injectable()
export class FairnessService {
  constructor(private readonly prisma: PrismaService) {}

  // ---- crypto primitives ----
  newServerSeed() {
    return randomBytes(32).toString("hex");
  }
  hash(seed: string) {
    return createHash("sha256").update(seed).digest("hex");
  }

  /** Uniform float in [0,1) from HMAC-SHA256(serverSeed, `${clientSeed}:${nonce}`). */
  rng(serverSeed: string, clientSeed: string, nonce: number): number {
    const hmac = createHmac("sha256", serverSeed)
      .update(`${clientSeed}:${nonce}`)
      .digest("hex");
    // first 8 hex chars (32 bits) -> [0,1)
    return parseInt(hmac.slice(0, 8), 16) / 0x100000000;
  }

  // ---- seed lifecycle ----
  async getOrCreateActive(userId: string) {
    const active = await this.prisma.provablyFairSeed.findFirst({
      where: { userId, active: true },
    });
    if (active) return active;
    return this.createActive(userId, randomBytes(8).toString("hex"));
  }

  private async createActive(userId: string, clientSeed: string) {
    const serverSeed = this.newServerSeed();
    return this.prisma.provablyFairSeed.create({
      data: {
        userId,
        serverSeed,
        serverSeedHash: this.hash(serverSeed),
        clientSeed,
        nonce: 0,
        active: true,
      },
    });
  }

  /** Reveal the current server seed and start a fresh one. */
  async rotate(userId: string, clientSeed?: string) {
    const current = await this.getOrCreateActive(userId);
    await this.prisma.provablyFairSeed.update({
      where: { id: current.id },
      data: { active: false, revealedAt: new Date() },
    });
    const next = await this.createActive(userId, clientSeed || randomBytes(8).toString("hex"));
    return {
      revealed: {
        serverSeed: current.serverSeed,
        serverSeedHash: current.serverSeedHash,
        clientSeed: current.clientSeed,
        finalNonce: current.nonce,
      },
      active: this.publicSeed(next),
    };
  }

  publicSeed(s: { serverSeedHash: string; clientSeed: string; nonce: number }) {
    // never expose the active serverSeed (only its hash) until rotated
    return { serverSeedHash: s.serverSeedHash, clientSeed: s.clientSeed, nonce: s.nonce };
  }

  async getActive(userId: string) {
    return this.publicSeed(await this.getOrCreateActive(userId));
  }

  /** Read active seed inside a transaction (for atomic bet settlement). */
  activeInTx(tx: Tx, userId: string) {
    return tx.provablyFairSeed.findFirst({ where: { userId, active: true } });
  }

  /** Re-derive an outcome from revealed seeds — lets anyone verify a past bet. */
  verify(input: {
    game: PlayableGame;
    serverSeed: string;
    clientSeed: string;
    nonce: number;
    params: Record<string, unknown>;
  }) {
    const float = this.rng(input.serverSeed, input.clientSeed, input.nonce);
    const result = settle(input.game, float, input.params);
    return {
      serverSeedHash: this.hash(input.serverSeed),
      float,
      ...result,
    };
  }
}
