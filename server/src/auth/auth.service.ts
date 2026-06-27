import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as argon2 from "argon2";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { WalletService } from "../wallet/wallet.service";
import { TokenService } from "./token.service";
import { RegisterDto, LoginDto } from "./dto/auth.dto";

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
    private readonly tokens: TokenService,
    private readonly config: ConfigService,
  ) {}

  private publicUser(u: {
    id: string;
    email: string;
    username: string;
    role: string;
    status: string;
    kycStatus: string;
    level: number;
    xp: number;
    createdAt: Date;
  }) {
    return {
      id: u.id,
      email: u.email,
      username: u.username,
      role: u.role,
      status: u.status,
      kycStatus: u.kycStatus,
      level: u.level,
      xp: u.xp,
      joined: u.createdAt,
    };
  }

  async register(dto: RegisterDto, ctx: { ip?: string; ua?: string }) {
    const exists = await this.prisma.user.findFirst({
      where: { OR: [{ email: dto.email.toLowerCase() }, { username: dto.username }] },
      select: { email: true, username: true },
    });
    if (exists) throw new ConflictException("Email or username already in use");

    const passwordHash = await argon2.hash(dto.password);

    const user = await this.prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: { email: dto.email.toLowerCase(), username: dto.username, passwordHash },
      });
      await tx.wallet.create({ data: { userId: u.id } });
      return u;
    });

    const bonus = Number(this.config.get("SIGNUP_BONUS") ?? 0);
    if (bonus > 0) {
      await this.wallet.move(user.id, "BONUS", new Prisma.Decimal(bonus), { refType: "signup_bonus" });
    }

    const session = await this.issueSession(user.id, ctx);
    return { user: this.publicUser(user), ...session };
  }

  async login(dto: LoginDto, ctx: { ip?: string; ua?: string }) {
    const id = dto.identifier.toLowerCase();
    const user = await this.prisma.user.findFirst({
      where: { OR: [{ email: id }, { username: dto.identifier }] },
    });
    if (!user) throw new UnauthorizedException("Invalid credentials");

    const ok = await argon2.verify(user.passwordHash, dto.password);
    if (!ok) throw new UnauthorizedException("Invalid credentials");
    // players only — staff/distributors must use the admin panel
    if (user.role !== "USER") {
      throw new UnauthorizedException("Staff accounts must sign in via the admin panel");
    }
    if (user.status === "SELF_EXCLUDED") throw new BadRequestException("Account is self-excluded");
    if (user.status === "SUSPENDED") throw new BadRequestException("Account is suspended");

    const session = await this.issueSession(user.id, ctx);
    return { user: this.publicUser(user), ...session };
  }

  /** Dedicated staff login — only ADMIN/MODERATOR accounts may authenticate here. */
  async adminLogin(dto: LoginDto, ctx: { ip?: string; ua?: string }) {
    const id = dto.identifier.toLowerCase();
    const user = await this.prisma.user.findFirst({
      where: { OR: [{ email: id }, { username: dto.identifier }] },
    });
    if (!user) throw new UnauthorizedException("Invalid credentials");

    const ok = await argon2.verify(user.passwordHash, dto.password);
    if (!ok) throw new UnauthorizedException("Invalid credentials");
    const STAFF = ["ADMIN", "MODERATOR", "DISTRIBUTOR", "SUB_DISTRIBUTOR"];
    if (!STAFF.includes(user.role)) {
      throw new UnauthorizedException("Players cannot access the admin panel");
    }
    if (user.status !== "ACTIVE") throw new BadRequestException("Account is not active");

    const session = await this.issueSession(user.id, ctx);
    return { user: this.publicUser(user), ...session };
  }

  async refresh(refreshToken: string | undefined, ctx: { ip?: string; ua?: string }) {
    if (!refreshToken) throw new UnauthorizedException("No refresh token");
    let payload: { sub: string; sid: string };
    try {
      payload = await this.tokens.verifyRefresh(refreshToken);
    } catch {
      throw new UnauthorizedException("Invalid refresh token");
    }

    const session = await this.prisma.session.findUnique({ where: { id: payload.sid } });
    if (
      !session ||
      session.revoked ||
      session.expiresAt < new Date() ||
      session.tokenHash !== this.tokens.hash(refreshToken)
    ) {
      throw new UnauthorizedException("Session expired");
    }

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) throw new UnauthorizedException("User not found");

    // rotate refresh token on the same session
    const newRefresh = await this.tokens.signRefresh(user.id, session.id);
    await this.prisma.session.update({
      where: { id: session.id },
      data: { tokenHash: this.tokens.hash(newRefresh), ip: ctx.ip, userAgent: ctx.ua },
    });
    const accessToken = await this.tokens.signAccess({
      sub: user.id,
      username: user.username,
      role: user.role,
    });
    return { accessToken, refreshToken: newRefresh };
  }

  async logout(refreshToken: string | undefined) {
    if (!refreshToken) return { ok: true };
    try {
      const { sid } = await this.tokens.verifyRefresh(refreshToken);
      await this.prisma.session.updateMany({ where: { id: sid }, data: { revoked: true } });
    } catch {
      /* already invalid */
    }
    return { ok: true };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException("User not found");
    return this.publicUser(user);
  }

  private async issueSession(userId: string, ctx: { ip?: string; ua?: string }) {
    const session = await this.prisma.session.create({
      data: {
        userId,
        tokenHash: "", // set below after signing (needs id)
        ip: ctx.ip,
        userAgent: ctx.ua,
        expiresAt: new Date(Date.now() + this.tokens.refreshTtl * 1000),
      },
    });
    const refreshToken = await this.tokens.signRefresh(userId, session.id);
    await this.prisma.session.update({
      where: { id: session.id },
      data: { tokenHash: this.tokens.hash(refreshToken) },
    });
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const accessToken = await this.tokens.signAccess({
      sub: userId,
      username: user.username,
      role: user.role,
    });
    return { accessToken, refreshToken };
  }
}
