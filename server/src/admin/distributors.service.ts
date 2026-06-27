import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { DistributorStatus, Prisma } from "@prisma/client";
import * as argon2 from "argon2";
import { PrismaService } from "../prisma/prisma.service";

export interface DistributorInput {
  name: string;
  code: string;
  parentId?: string | null;
  commissionPct?: string;
  contactEmail?: string;
  // optional login credentials for the distributor's own admin access
  username?: string;
  password?: string;
}

@Injectable()
export class DistributorsService {
  constructor(private readonly prisma: PrismaService) {}

  private view(d: {
    id: string; name: string; code: string; parentId: string | null;
    status: DistributorStatus; commissionPct: Prisma.Decimal; balance: Prisma.Decimal;
    contactEmail: string | null; userId: string | null; createdAt: Date;
  }) {
    return {
      id: d.id,
      name: d.name,
      code: d.code,
      parentId: d.parentId,
      level: d.parentId ? "Sub-distributor" : "Distributor",
      status: d.status,
      commissionPct: d.commissionPct.toFixed(2),
      balance: d.balance.toFixed(2),
      contactEmail: d.contactEmail,
      hasLogin: !!d.userId,
      createdAt: d.createdAt,
    };
  }

  async list() {
    const rows = await this.prisma.distributor.findMany({ orderBy: { createdAt: "asc" } });
    return rows.map((d) => this.view(d));
  }

  async create(input: DistributorInput) {
    let userId: string | undefined;

    // optionally mint a staff login for this distributor / sub-distributor
    if (input.username && input.password) {
      if (input.password.length < 6) throw new BadRequestException("Password must be 6+ characters");
      const role = input.parentId ? "SUB_DISTRIBUTOR" : "DISTRIBUTOR";
      const email = input.contactEmail?.toLowerCase() || `${input.username.toLowerCase()}@dist.aurora`;
      const clash = await this.prisma.user.findFirst({
        where: { OR: [{ username: input.username }, { email }] },
        select: { id: true },
      });
      if (clash) throw new ConflictException("Username or email already in use");
      const passwordHash = await argon2.hash(input.password);
      const u = await this.prisma.user.create({
        data: { username: input.username, email, passwordHash, role },
      });
      userId = u.id;
    }

    const d = await this.prisma.distributor.create({
      data: {
        name: input.name,
        code: input.code,
        parentId: input.parentId || null,
        commissionPct: input.commissionPct ? new Prisma.Decimal(input.commissionPct) : new Prisma.Decimal(0),
        contactEmail: input.contactEmail,
        userId,
      },
    });
    return this.view(d);
  }

  async update(id: string, input: Partial<DistributorInput>) {
    await this.ensure(id);
    const d = await this.prisma.distributor.update({
      where: { id },
      data: {
        name: input.name,
        contactEmail: input.contactEmail,
        commissionPct: input.commissionPct ? new Prisma.Decimal(input.commissionPct) : undefined,
      },
    });
    return this.view(d);
  }

  async setStatus(id: string, status: DistributorStatus) {
    await this.ensure(id);
    const d = await this.prisma.distributor.update({ where: { id }, data: { status } });
    return this.view(d);
  }

  async remove(id: string) {
    await this.ensure(id);
    const kids = await this.prisma.distributor.count({ where: { parentId: id } });
    if (kids > 0) throw new NotFoundException("Remove sub-distributors first");
    await this.prisma.distributor.delete({ where: { id } });
    return { ok: true };
  }

  private async ensure(id: string) {
    const d = await this.prisma.distributor.findUnique({ where: { id }, select: { id: true } });
    if (!d) throw new NotFoundException("Distributor not found");
  }
}
