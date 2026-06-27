import { Injectable, NotFoundException } from "@nestjs/common";
import { GameKind, GameStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

export interface GameInput {
  slug: string;
  name: string;
  category: string;
  provider: string;
  kind: GameKind;
  hue?: number;
  hot?: boolean;
  live?: boolean;
  order?: number;
  imageUrl?: string;
}

@Injectable()
export class GamesAdminService {
  constructor(private readonly prisma: PrismaService) {}

  private view(g: {
    id: string; slug: string; name: string; category: string; provider: string;
    kind: GameKind; status: GameStatus; hot: boolean; live: boolean; hue: number;
    order: number; imageUrl: string | null; updatedAt: Date;
  }) {
    return {
      id: g.id, slug: g.slug, name: g.name, category: g.category, provider: g.provider,
      kind: g.kind, status: g.status, hot: g.hot, live: g.live, hue: g.hue,
      order: g.order, imageUrl: g.imageUrl, updatedAt: g.updatedAt,
    };
  }

  async list() {
    const rows = await this.prisma.game.findMany({ orderBy: [{ order: "asc" }, { name: "asc" }] });
    return rows.map((g) => this.view(g));
  }

  async create(input: GameInput) {
    const g = await this.prisma.game.create({
      data: {
        slug: input.slug,
        name: input.name,
        category: input.category,
        provider: input.provider,
        kind: input.kind,
        hue: input.hue ?? 200,
        hot: input.hot ?? false,
        live: input.live ?? false,
        order: input.order ?? 0,
        imageUrl: input.imageUrl ?? `/games/${input.slug}.png`,
      },
    });
    return this.view(g);
  }

  async update(id: string, input: Partial<GameInput>) {
    await this.ensure(id);
    const g = await this.prisma.game.update({
      where: { id },
      data: {
        name: input.name,
        category: input.category,
        provider: input.provider,
        kind: input.kind,
        hue: input.hue,
        hot: input.hot,
        live: input.live,
        order: input.order,
        imageUrl: input.imageUrl,
      },
    });
    return this.view(g);
  }

  async remove(id: string) {
    await this.ensure(id);
    await this.prisma.game.delete({ where: { id } });
    return { ok: true };
  }

  async setStatus(id: string, status: GameStatus) {
    await this.ensure(id);
    const g = await this.prisma.game.update({ where: { id }, data: { status } });
    return this.view(g);
  }

  /** Bulk maintenance / pause toggles across many games at once. */
  async bulkStatus(ids: string[], status: GameStatus) {
    const r = await this.prisma.game.updateMany({ where: { id: { in: ids } }, data: { status } });
    return { updated: r.count, status };
  }

  private async ensure(id: string) {
    const g = await this.prisma.game.findUnique({ where: { id }, select: { id: true } });
    if (!g) throw new NotFoundException("Game not found");
  }
}

export const GameStatusValues: GameStatus[] = ["ACTIVE", "PAUSED", "MAINTENANCE", "DISABLED"];
export const GameKindValues: GameKind[] = [
  "CRASH", "DICE", "MINES", "PLINKO", "ROULETTE", "WHEEL", "COINFLIP", "BLACKJACK", "SLOTS", "LIVE",
];
