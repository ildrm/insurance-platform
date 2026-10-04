import "reflect-metadata";
import type {} from "multer";
import {
  Module,
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Req,
  Res,
  Headers,
  UploadedFile,
  UseInterceptors,
  ParseUUIDPipe,
  Catch,
  HttpException,
  type ExceptionFilter,
  type ArgumentsHost,
} from "@nestjs/common";
import { NestFactory, APP_GUARD } from "@nestjs/core";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  SwaggerModule,
  DocumentBuilder,
  ApiBody,
  ApiHeader,
  ApiCookieAuth,
  ApiBearerAuth,
} from "@nestjs/swagger";
import helmet from "helmet";
import { randomUUID } from "node:crypto";
import { z, ZodError } from "zod";
import type { Request, Response, NextFunction } from "express";
import { AuthService, AuthGuard, Public, type AuthedRequest } from "./auth.js";
import { ProductsPolicies } from "./products-policies.js";
import { ClaimsFinance } from "./claims-finance.js";
import { PlatformService } from "./platform.js";
import { Sandbox } from "./sandbox.js";
import { Adapters } from "./adapters.js";
import { Documents } from "./documents.js";
import { pool } from "../../../packages/runtime/src/database.js";
import {
  config,
  validateEnvironment,
} from "../../../packages/runtime/src/config.js";
import { DomainError } from "../../../packages/domain/src/insurance.js";
const uuid = new ParseUUIDPipe({ version: "4" });

@Controller()
@ApiCookieAuth("ip_session")
@ApiBearerAuth()
@ApiHeader({
  name: "Idempotency-Key",
  required: false,
  description:
    "Required for commands; replay identical requests with the same key.",
})
export class SessionAPI {
  constructor(private readonly auth: AuthService) {}
  @Public() @Get("health/live") live() {
    return { status: "ok" };
  }
  @Public() @Get("health/ready") async ready() {
    await pool.query("SELECT 1");
    return { status: "ready" };
  }
  @Public()
  @Post("auth/login")
  @ApiBody({
    schema: {
      type: "object",
      required: ["email", "password"],
      properties: {
        email: { type: "string", format: "email" },
        password: { type: "string" },
        totp: { type: "string" },
      },
    },
  })
  login(
    @Body() body: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const b = z
      .object({
        email: z.email().max(254),
        password: z.string().min(1).max(128),
        totp: z.string().max(6).optional(),
      })
      .strict()
      .parse(body);
    return this.auth.login(b.email, b.password, b.totp, req, res);
  }
  @Get("auth/me") me(@Req() r: AuthedRequest) {
    return { user: r.actor };
  }
  @Post("auth/logout") logout(
    @Req() r: Request,
    @Res({ passthrough: true }) s: Response,
  ) {
    return this.auth.logout(r, s);
  }
}

@Controller()
@ApiCookieAuth("ip_session")
@ApiBearerAuth()
@ApiHeader({
  name: "Idempotency-Key",
  required: false,
  description:
    "Required for commands; replay identical requests with the same key.",
})
export class InsuranceAPI {
  constructor(private readonly p: ProductsPolicies) {}
  @Public() @Get("products") products() {
    return this.p.products();
  }
  @Get("quotes") quotes(@Req() r: AuthedRequest) {
    return this.p.quotes(r.actor);
  }
  @Post("quotes")
  @ApiBody({
    schema: {
      type: "object",
      required: ["productId", "age", "assetValueMinor", "coverageCodes"],
      properties: {
        productId: { type: "string", format: "uuid" },
        age: { type: "integer", minimum: 18, maximum: 100 },
        assetValueMinor: { type: "string", pattern: "^[1-9][0-9]{0,17}$" },
        coverageCodes: { type: "array", items: { type: "string" } },
      },
    },
  })
  quote(
    @Req() r: AuthedRequest,
    @Body() b: unknown,
    @Headers("idempotency-key") k: string,
  ) {
    return this.p.quote(r.actor, b, k);
  }
  @Get("underwriting") uw(@Req() r: AuthedRequest) {
    return this.p.underwriting(r.actor);
  }
  @Post("quotes/:id/underwriting") decide(
    @Req() r: AuthedRequest,
    @Param("id", uuid) id: string,
    @Body() b: unknown,
    @Headers("idempotency-key") k: string,
    @Headers("if-match") v: string,
  ) {
    return this.p.decide(r.actor, id, b, k, v);
  }
  @Post("quotes/:id/purchase") buy(
    @Req() r: AuthedRequest,
    @Param("id", uuid) id: string,
    @Headers("idempotency-key") k: string,
    @Headers("if-match") v: string,
  ) {
    return this.p.purchase(r.actor, id, k, v);
  }
  @Get("operations/:id") op(
    @Req() r: AuthedRequest,
    @Param("id", uuid) id: string,
  ) {
    return this.p.operations(r.actor, id);
  }
  @Get("policies") policies(@Req() r: AuthedRequest) {
    return this.p.policies(r.actor);
  }
  @Post("policies/:id/endorsements") endorse(
    @Req() r: AuthedRequest,
    @Param("id", uuid) id: string,
    @Body() b: unknown,
    @Headers("idempotency-key") k: string,
    @Headers("if-match") v: string,
  ) {
    return this.p.endorse(r.actor, id, b, k, v);
  }
  @Post("policies/:id/renewals") renew(
    @Req() r: AuthedRequest,
    @Param("id", uuid) id: string,
    @Headers("idempotency-key") k: string,
  ) {
    return this.p.renew(r.actor, id, k);
  }
  @Post("policies/:id/cancellations") cancel(
    @Req() r: AuthedRequest,
    @Param("id", uuid) id: string,
    @Body() b: unknown,
    @Headers("idempotency-key") k: string,
  ) {
    return this.p.cancel(r.actor, id, b, k);
  }
  @Get("policies/:id/document") async contract(
    @Req() r: AuthedRequest,
    @Param("id", uuid) id: string,
    @Res() res: Response,
  ) {
    const d = await this.p.document(r.actor, id);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="policy-${d.number}.json"`,
    );
    res.json(d);
  }
}

@Controller()
@ApiCookieAuth("ip_session")
@ApiBearerAuth()
@ApiHeader({
  name: "Idempotency-Key",
  required: false,
  description:
    "Required for commands; replay identical requests with the same key.",
})
export class ClaimsAPI {
  constructor(
    private readonly c: ClaimsFinance,
    private readonly files: Documents,
  ) {}
  @Get("claims") claims(@Req() r: AuthedRequest) {
    return this.c.list(r.actor);
  }
  @Post("claims") submit(
    @Req() r: AuthedRequest,
    @Body() b: unknown,
    @Headers("idempotency-key") k: string,
  ) {
    return this.c.submit(r.actor, b, k);
  }
  @Get("claims/:id") claim(
    @Req() r: AuthedRequest,
    @Param("id", uuid) id: string,
  ) {
    return this.c.detail(r.actor, id);
  }
  @Post("claims/:id/decisions") decision(
    @Req() r: AuthedRequest,
    @Param("id", uuid) id: string,
    @Body() b: unknown,
    @Headers("idempotency-key") k: string,
    @Headers("if-match") v: string,
  ) {
    return this.c.decision(r.actor, id, b, k, v);
  }
  @Post("claims/:id/decline-proposals") decline(
    @Req() r: AuthedRequest,
    @Param("id", uuid) id: string,
    @Body() b: unknown,
    @Headers("idempotency-key") k: string,
    @Headers("if-match") v: string,
  ) {
    return this.c.decline(r.actor, id, b, k, v);
  }
  @Post("claims/:id/approvals") approve(
    @Req() r: AuthedRequest,
    @Param("id", uuid) id: string,
    @Body() b: unknown,
    @Headers("idempotency-key") k: string,
    @Headers("if-match") v: string,
  ) {
    return this.c.approve(r.actor, id, b, k, v);
  }
  @Post("claims/:id/payouts") pay(
    @Req() r: AuthedRequest,
    @Param("id", uuid) id: string,
    @Headers("idempotency-key") k: string,
  ) {
    return this.c.payout(r.actor, id, k);
  }
  @Post("claims/:id/documents")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 2, parts: 3 },
    }),
  )
  upload(
    @Req() r: AuthedRequest,
    @Param("id", uuid) id: string,
    @UploadedFile() f: Express.Multer.File,
    @Headers("idempotency-key") k: string,
  ) {
    return this.files.upload(r.actor, id, f, k);
  }
  @Get("documents/:id") async download(
    @Req() r: AuthedRequest,
    @Param("id", uuid) id: string,
    @Res() res: Response,
  ) {
    const f = await this.files.download(r.actor, id);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${f.filename}"`,
    );
    res.type(f.mime).send(f.body);
  }
}

@Controller()
@ApiCookieAuth("ip_session")
@ApiBearerAuth()
@ApiHeader({
  name: "Idempotency-Key",
  required: false,
  description:
    "Required for commands; replay identical requests with the same key.",
})
export class FinanceAPI {
  constructor(private readonly c: ClaimsFinance) {}
  @Get("ledger") ledger(@Req() r: AuthedRequest) {
    return this.c.ledger(r.actor);
  }
  @Get("settlements") settlements(@Req() r: AuthedRequest) {
    return this.c.settlements(r.actor);
  }
  @Post("settlements") prepare(
    @Req() r: AuthedRequest,
    @Body() b: unknown,
    @Headers("idempotency-key") k: string,
  ) {
    return this.c.prepareSettlement(r.actor, b, k);
  }
  @Post("settlements/:id/approvals") sa(
    @Req() r: AuthedRequest,
    @Param("id", uuid) id: string,
    @Headers("idempotency-key") k: string,
  ) {
    return this.c.approveSettlement(r.actor, id, k);
  }
  @Post("settlements/:id/payouts") sp(
    @Req() r: AuthedRequest,
    @Param("id", uuid) id: string,
    @Headers("idempotency-key") k: string,
  ) {
    return this.c.paySettlement(r.actor, id, k);
  }
}

@Controller()
@ApiCookieAuth("ip_session")
@ApiBearerAuth()
@ApiHeader({
  name: "Idempotency-Key",
  required: false,
  description:
    "Required for commands; replay identical requests with the same key.",
})
export class AdminAPI {
  constructor(
    private readonly p: ProductsPolicies,
    private readonly platform: PlatformService,
    private readonly adapters: Adapters,
    private readonly sandbox: Sandbox,
  ) {}
  @Post("admin/sandbox/faults") fault(
    @Req() r: AuthedRequest,
    @Body() b: unknown,
    @Headers("idempotency-key") k: string,
  ) {
    return this.sandbox.fault(r.actor, b, k);
  }
  @Get("admin/adapters") adapterList(@Req() r: AuthedRequest) {
    return this.adapters.list(r.actor);
  }
  @Post("admin/adapters") adapterDraft(
    @Req() r: AuthedRequest,
    @Body() b: unknown,
    @Headers("idempotency-key") k: string,
  ) {
    return this.adapters.draft(r.actor, b, k);
  }
  @Post("admin/adapters/:id/approvals") adapterApprove(
    @Req() r: AuthedRequest,
    @Param("id", uuid) id: string,
    @Headers("idempotency-key") k: string,
  ) {
    return this.adapters.approve(r.actor, id, k);
  }
  @Get("admin/overview") overview(@Req() r: AuthedRequest) {
    return this.platform.overview(r.actor);
  }
  @Get("admin/tenants") tenants(@Req() r: AuthedRequest) {
    return this.platform.tenants(r.actor);
  }
  @Get("admin/audit") audit(@Req() r: AuthedRequest) {
    return this.platform.audit(r.actor);
  }
  @Get("admin/products") adminProducts(@Req() r: AuthedRequest) {
    return this.platform.products(r.actor);
  }
  @Post("admin/products") draft(
    @Req() r: AuthedRequest,
    @Body() b: unknown,
    @Headers("idempotency-key") k: string,
  ) {
    return this.p.publishDraft(r.actor, b, k);
  }
  @Post("admin/products/:id/publications") publish(
    @Req() r: AuthedRequest,
    @Param("id", uuid) id: string,
    @Headers("idempotency-key") k: string,
  ) {
    return this.p.publish(r.actor, id, k);
  }
}

@Controller()
@ApiCookieAuth("ip_session")
@ApiBearerAuth()
@ApiHeader({
  name: "Idempotency-Key",
  required: false,
  description:
    "Required for commands; replay identical requests with the same key.",
})
export class DeveloperAPI {
  constructor(private readonly platform: PlatformService) {}
  @Get("developer/keys") keys(@Req() r: AuthedRequest) {
    return this.platform.keys(r.actor);
  }
  @Post("developer/keys") key(
    @Req() r: AuthedRequest,
    @Body() b: unknown,
    @Headers("idempotency-key") k: string,
  ) {
    return this.platform.createKey(r.actor, b, k);
  }
  @Delete("developer/keys/:id") revoke(
    @Req() r: AuthedRequest,
    @Param("id", uuid) id: string,
  ) {
    return this.platform.revokeKey(r.actor, id);
  }
  @Get("developer/webhooks") hooks(@Req() r: AuthedRequest) {
    return this.platform.webhooks(r.actor);
  }
  @Post("developer/webhooks") hook(
    @Req() r: AuthedRequest,
    @Body() b: unknown,
    @Headers("idempotency-key") k: string,
  ) {
    return this.platform.createWebhook(r.actor, b, k);
  }
  @Get("developer/logs") logs(@Req() r: AuthedRequest) {
    return this.platform.logs(r.actor);
  }
}
