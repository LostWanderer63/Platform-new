import { Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { createHash } from "crypto";

export interface AccessPayload {
  sub: string;
  username: string;
  role: string;
}

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  get accessTtl() {
    return Number(this.config.get("JWT_ACCESS_TTL") ?? 900);
  }
  get refreshTtl() {
    return Number(this.config.get("JWT_REFRESH_TTL") ?? 2592000);
  }

  signAccess(p: AccessPayload) {
    return this.jwt.signAsync(p, {
      secret: this.config.get("JWT_ACCESS_SECRET"),
      expiresIn: this.accessTtl,
    });
  }

  signRefresh(sub: string, sid: string) {
    return this.jwt.signAsync(
      { sub, sid },
      { secret: this.config.get("JWT_REFRESH_SECRET"), expiresIn: this.refreshTtl },
    );
  }

  verifyRefresh(token: string): Promise<{ sub: string; sid: string }> {
    return this.jwt.verifyAsync(token, { secret: this.config.get("JWT_REFRESH_SECRET") });
  }

  hash(token: string) {
    return createHash("sha256").update(token).digest("hex");
  }
}
