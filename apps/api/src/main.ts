import { ServiceCases } from "./service-cases.js";
import { ServiceAPI } from "./service-controller.js";
import {
  SessionAPI,
  InsuranceAPI,
  ClaimsAPI,
  FinanceAPI,
  AdminAPI,
  DeveloperAPI,
} from "./controllers.js";
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
import type { NestExpressApplication } from "@nestjs/platform-express";
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
import type { Request, Response, NextFunction, Express } from "express";
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
@Catch()
class Errors implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>(),
      req = host.switchToHttp().getRequest<AuthedRequest>();
    let status = 500,
      code = "INTERNAL_ERROR",
      message = "The request could not be completed.";
    if (error instanceof DomainError) {
      status = error.status;
      code = error.code;
      message = error.message;
    } else if (error instanceof ZodError) {
      status = 422;
      code = "VALIDATION_ERROR";
      message = error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ");
    } else if (error instanceof HttpException) {
      status = error.getStatus();
      code = "REQUEST_ERROR";
      message = error.message;
    }
    if (status === 500)
      console.error(
        JSON.stringify({
          level: "error",
          requestId: req.requestId,
          code,
          errorType: error instanceof Error ? error.name : "unknown",
        }),
      );
    res
      .status(status)
      .json({ error: { code, message, requestId: req.requestId }, message });
  }
}

@Module({
  controllers: [
    ServiceAPI,
    SessionAPI,
    InsuranceAPI,
    ClaimsAPI,
    FinanceAPI,
    AdminAPI,
    DeveloperAPI,
  ],
  providers: [
    ServiceCases,
    AuthService,
    ProductsPolicies,
    ClaimsFinance,
    PlatformService,
    Documents,
    Adapters,
    Sandbox,
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
class AppModule {}
validateEnvironment();
const app = await NestFactory.create<NestExpressApplication>(AppModule, {
  bodyParser: false,
  logger: ["error", "warn", "log"],
});
app.setGlobalPrefix("api");
app.useBodyParser("json", { limit: "256kb" });
app.use(helmet());
app.useGlobalFilters(new Errors());
const origins = config("ALLOWED_ORIGINS").split(",");
app.use((req: AuthedRequest, res: Response, next: NextFunction) => {
  req.requestId = randomUUID();
  res.setHeader("X-Request-ID", req.requestId);
  res.setHeader("Cache-Control", "private, no-store");
  if (
    !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
    !req.headers.authorization
  ) {
    if (!req.headers.origin || !origins.includes(req.headers.origin))
      return res.status(403).json({
        error: { code: "CSRF_ORIGIN", message: "Untrusted browser origin." },
      });
  }
  next();
});
// OpenAPI is intentionally available to authenticated integrations; generated from real routes.
const doc = SwaggerModule.createDocument(
  app,
  new DocumentBuilder()
    .setTitle("Coverline API")
    .setVersion("0.1.0")
    .addCookieAuth("ip_session")
    .addBearerAuth()
    .build(),
);
const expressServer = app.getHttpAdapter().getInstance() as Express;
expressServer.get("/api/docs-json", async (req: Request, res: Response) => {
  try {
    await app.get(AuthService).resolve(req);
    res.json(doc);
  } catch {
    res.status(401).json({ message: "Sign in to view the API contract." });
  }
});
app.enableShutdownHooks();
await app.listen(Number(config("PORT", "3000")), "0.0.0.0");
