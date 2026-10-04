import {
  Controller,
  Get,
  Post,
  Req,
  Body,
  Param,
  Headers,
  ParseUUIDPipe,
} from "@nestjs/common";
import { ServiceCases } from "./service-cases.js";
import type { AuthedRequest } from "./auth.js";
const uuid = new ParseUUIDPipe({ version: "4" });
@Controller()
export class ServiceAPI {
  constructor(private readonly service: ServiceCases) {}
  @Get("complaints") list(@Req() r: AuthedRequest) {
    return this.service.list(r.actor);
  }
  @Post("complaints") create(
    @Req() r: AuthedRequest,
    @Body() b: unknown,
    @Headers("idempotency-key") k: string,
  ) {
    return this.service.create(r.actor, b, k);
  }
  @Get("complaints/report") report(@Req() r: AuthedRequest) {
    return this.service.report(r.actor);
  }
  @Get("complaints/:id") detail(
    @Req() r: AuthedRequest,
    @Param("id", uuid) id: string,
  ) {
    return this.service.detail(r.actor, id);
  }
  @Post("complaints/:id/transitions") transition(
    @Req() r: AuthedRequest,
    @Param("id", uuid) id: string,
    @Body() b: unknown,
    @Headers("idempotency-key") k: string,
    @Headers("if-match") v: string,
  ) {
    return this.service.transition(r.actor, id, b, k, v);
  }
  @Get("notifications") notifications(@Req() r: AuthedRequest) {
    return this.service.notifications(r.actor);
  }
  @Post("notifications/:id/read") read(
    @Req() r: AuthedRequest,
    @Param("id", uuid) id: string,
    @Headers("idempotency-key") k: string,
  ) {
    return this.service.readNotification(r.actor, id, k);
  }
}
