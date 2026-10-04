import {
  verifyPassword,
  totp,
  decrypt,
} from "../../../packages/runtime/src/crypto.js";
export {
  passwordHash,
  encrypt,
  decrypt,
  totp,
} from "../../../packages/runtime/src/crypto.js";
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  SetMetadata,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { randomBytes, createHash } from "node:crypto";
import type { Request, Response } from "express";
import { pool } from "../../../packages/runtime/src/database.js";
import { production } from "../../../packages/runtime/src/config.js";
import {
  DomainError,
  type Actor,
  type Role,
} from "../../../packages/domain/src/insurance.js";
export type AuthedRequest = Request & { actor: Actor; requestId: string };
export const Public = () => SetMetadata("public", true);
interface UserRow {
  id: string;
  tenant_id: string;
  party_id: string;
  email: string;
  name: string;
  role: Role;
  password_hash: string;
  totp_secret: string | null;
}
export function actorOf(row: UserRow): Actor {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    partyId: row.party_id,
    email: row.email,
    name: row.name,
    role: row.role,
  };
}
@Injectable()
export class AuthService {
  async login(
    email: string,
    password: string,
    code: string | undefined,
    req: Request,
    res: Response,
  ) {
    const ip = req.ip ?? "unknown";
    for (const [bucket, limit] of [
      [`ip:${ip}`, 1000],
      [`account:${email.toLowerCase()}`, 20],
    ] as const) {
      const key = createHash("sha256").update(bucket).digest("hex");
      const r = await pool.query<{ attempts: number }>(
        "INSERT INTO identity.rate_limits(key,attempts,expires_at) VALUES($1,1,now()+interval '15 minutes') ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN identity.rate_limits.expires_at<now() THEN 1 ELSE identity.rate_limits.attempts+1 END,expires_at=CASE WHEN identity.rate_limits.expires_at<now() THEN now()+interval '15 minutes' ELSE identity.rate_limits.expires_at END RETURNING attempts",
        [key],
      );
      if (r.rows[0]!.attempts > limit)
        throw new DomainError(
          "RATE_LIMIT",
          "Too many attempts. Try again later.",
          429,
        );
    }
    const r = await pool.query<UserRow>(
      "SELECT * FROM identity.users WHERE lower(email)=lower($1) AND disabled=false",
      [email],
    );
    const row = r.rows[0];
    const valid = await verifyPassword(
      password,
      row?.password_hash ?? `${"0".repeat(32)}:${"0".repeat(128)}`,
    );
    if (!row || !valid)
      throw new DomainError(
        "INVALID_CREDENTIALS",
        "Email, password or verification code is incorrect.",
        401,
      );
    if (row.totp_secret || (production && row.role !== "CUSTOMER")) {
      const now = Date.now();
      const delta =
        row.totp_secret && code && /^[0-9]{6}$/.test(code)
          ? [-30000, 0, 30000].find(
              (offset) =>
                totp(decrypt(row.totp_secret!), now + offset) === code,
            )
          : undefined;
      if (delta === undefined)
        throw new DomainError(
          "MFA_REQUIRED",
          "A valid authenticator code is required.",
          401,
        );
      const accepted = await pool.query(
        "INSERT INTO identity.mfa_counters(user_id,last_counter) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET last_counter=excluded.last_counter WHERE identity.mfa_counters.last_counter<excluded.last_counter RETURNING user_id",
        [row.id, Math.floor((now + delta) / 30000)],
      );
      if (!accepted.rowCount)
        throw new DomainError(
          "MFA_REPLAY",
          "This authenticator code was already used. Wait for the next code.",
          401,
        );
    }
    const token = randomBytes(32).toString("base64url"),
      hash = createHash("sha256").update(token).digest("hex");
    await pool.query(
      "INSERT INTO identity.sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '8 hours')",
      [hash, row.id],
    );
    res.cookie("ip_session", token, {
      httpOnly: true,
      secure: production,
      sameSite: "strict",
      path: "/",
      maxAge: 8 * 3600000,
    });
    return { user: actorOf(row) };
  }
  async resolve(req: Request): Promise<Actor> {
    const cookie = req.headers.cookie
      ?.split(";")
      .find((c) => c.trim().startsWith("ip_session="))
      ?.trim()
      .slice(11);
    const bearer = req.headers.authorization?.startsWith("Bearer ")
      ? req.headers.authorization.slice(7)
      : undefined;
    if (bearer?.startsWith("ipk_")) {
      const hashed = createHash("sha256").update(bearer).digest("hex");
      const key = await pool.query<UserRow>(
        "SELECT * FROM identity.key_subject($1)",
        [hashed],
      );
      if (key.rows[0]) return actorOf(key.rows[0]);
    }
    if (bearer)
      throw new DomainError("UNAUTHENTICATED", "Invalid API credential.", 401);
    if (!cookie)
      throw new DomainError("UNAUTHENTICATED", "Sign in to continue.", 401);
    const r = await pool.query<UserRow>(
      "SELECT u.* FROM identity.sessions s JOIN identity.users u ON s.user_id=u.id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.disabled=false",
      [createHash("sha256").update(cookie).digest("hex")],
    );
    if (!r.rows[0])
      throw new DomainError(
        "UNAUTHENTICATED",
        "Your session has expired.",
        401,
      );
    return actorOf(r.rows[0]);
  }
  async logout(req: Request, res: Response) {
    const cookie = req.headers.cookie
      ?.split(";")
      .find((c) => c.trim().startsWith("ip_session="))
      ?.trim()
      .slice(11);
    if (cookie)
      await pool.query("DELETE FROM identity.sessions WHERE token_hash=$1", [
        createHash("sha256").update(cookie).digest("hex"),
      ]);
    res.clearCookie("ip_session", {
      path: "/",
      httpOnly: true,
      sameSite: "strict",
      secure: production,
    });
    return { ok: true };
  }
}
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    private readonly reflector: Reflector,
  ) {}
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    if (
      this.reflector.getAllAndOverride<boolean>("public", [
        ctx.getHandler(),
        ctx.getClass(),
      ])
    )
      return true;
    req.actor = await this.auth.resolve(req);
    return true;
  }
}
