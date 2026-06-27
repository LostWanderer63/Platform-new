import { Body, Controller, Get, Post, Req, Res, UseGuards } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request, Response } from "express";
import { AuthService } from "./auth.service";
import { TokenService } from "./token.service";
import { RegisterDto, LoginDto } from "./dto/auth.dto";
import { JwtAuthGuard, ACCESS_COOKIE } from "../common/guards/jwt-auth.guard";
import { CurrentUser, AuthUser } from "../common/decorators/current-user.decorator";

const REFRESH_COOKIE = "rt";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly tokens: TokenService,
    private readonly config: ConfigService,
  ) {}

  private ctx(req: Request) {
    return { ip: req.ip, ua: req.headers["user-agent"] };
  }

  private setCookies(res: Response, accessToken: string, refreshToken: string) {
    // SameSite=none is required when the apps live on DIFFERENT domains
    // (e.g. free hosts: *.pages.dev + *.onrender.com); it forces Secure.
    const sameSite = (this.config.get("COOKIE_SAMESITE") ?? "lax").toLowerCase() as "lax" | "none" | "strict";
    const secure = this.config.get("COOKIE_SECURE") === "true" || sameSite === "none";
    const domain = this.config.get("COOKIE_DOMAIN");
    const base = {
      httpOnly: true,
      secure,
      sameSite,
      // a shared cookie domain only makes sense for same-site (subdomain) setups
      ...(sameSite !== "none" && domain && domain !== "localhost" ? { domain } : {}),
    };
    res.cookie(ACCESS_COOKIE, accessToken, { ...base, maxAge: this.tokens.accessTtl * 1000, path: "/" });
    res.cookie(REFRESH_COOKIE, refreshToken, {
      ...base,
      maxAge: this.tokens.refreshTtl * 1000,
      path: "/api/auth",
    });
  }

  private clearCookies(res: Response) {
    const sameSite = (this.config.get("COOKIE_SAMESITE") ?? "lax").toLowerCase();
    const domain = this.config.get("COOKIE_DOMAIN");
    const d = sameSite !== "none" && domain && domain !== "localhost" ? { domain } : {};
    res.clearCookie(ACCESS_COOKIE, { path: "/", ...d });
    res.clearCookie(REFRESH_COOKIE, { path: "/api/auth", ...d });
  }

  @Post("register")
  async register(@Body() dto: RegisterDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { user, accessToken, refreshToken } = await this.auth.register(dto, this.ctx(req));
    this.setCookies(res, accessToken, refreshToken);
    return { user };
  }

  @Post("login")
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { user, accessToken, refreshToken } = await this.auth.login(dto, this.ctx(req));
    this.setCookies(res, accessToken, refreshToken);
    return { user };
  }

  @Post("admin/login")
  async adminLogin(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { user, accessToken, refreshToken } = await this.auth.adminLogin(dto, this.ctx(req));
    this.setCookies(res, accessToken, refreshToken);
    return { user };
  }

  @Post("refresh")
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { accessToken, refreshToken } = await this.auth.refresh(req.cookies?.[REFRESH_COOKIE], this.ctx(req));
    this.setCookies(res, accessToken, refreshToken);
    return { ok: true };
  }

  @Post("logout")
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(req.cookies?.[REFRESH_COOKIE]);
    this.clearCookies(res);
    return { ok: true };
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.sub);
  }
}
