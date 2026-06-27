import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { OnEvent } from "@nestjs/event-emitter";
import {
  OnGatewayConnection,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";

export interface BetSettledEvent {
  userId: string;
  username: string;
  game: string;
  amount: string;
  payout: string;
  multiplier: number;
  win: boolean;
  balance: string;
}

function readCookie(raw: string | undefined, name: string): string | undefined {
  if (!raw) return undefined;
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return undefined;
}

@WebSocketGateway({ cors: { origin: true, credentials: true } })
export class LiveGateway implements OnGatewayConnection {
  @WebSocketServer() server!: Server;
  private readonly log = new Logger("LiveGateway");

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  /** Authenticate via the `at` cookie; authed sockets join their private room. */
  handleConnection(client: Socket) {
    try {
      const at = readCookie(client.handshake.headers.cookie, "at");
      if (at) {
        const payload = this.jwt.verify(at, { secret: this.config.get("JWT_ACCESS_SECRET") });
        client.data.userId = payload.sub;
        client.join(`user:${payload.sub}`);
      }
    } catch {
      /* anonymous socket — still gets the public win feed */
    }
  }

  @OnEvent("bet.settled")
  onBetSettled(e: BetSettledEvent) {
    // public live-wins feed (wins only)
    if (e.win) {
      this.server.emit("win", {
        username: e.username,
        game: e.game,
        amount: e.payout,
        multiplier: e.multiplier,
        at: Date.now(),
      });
    }
    // private balance push to the bettor
    this.server.to(`user:${e.userId}`).emit("balance", { balance: e.balance });
  }
}
