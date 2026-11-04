import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Req,
  UnauthorizedException,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { timingSafeEqual } from "crypto";
import { z } from "zod";
import { CurrentUser, Public, Roles, type AuthUser } from "../common/auth";
import { parse } from "../payday/payday.dto";
import { SettlementService } from "./settlement.service";
import { MoneyConnector, providerEvent } from "./money-connector";
import {
  approveInput,
  acceptInput,
  beneficiaryInput,
  withdrawInput,
  updateReview,
} from "./settlement.dto";
@Controller("personal-loans")
export class SettlementController {
  constructor(private service: SettlementService) {}
  @Get("configuration") configuration() {
    return this.service.configuration();
  }
  @Get("applications/:id") detail(
    @CurrentUser() a: AuthUser,
    @Param("id") id: string,
  ) {
    return this.service.detail(a, id);
  }
  @Roles("ADMIN", "SUPER_ADMIN", "LENDER")
  @Post("applications/:id/approve")
  approve(
    @CurrentUser() a: AuthUser,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.service.approve(a, id, parse(approveInput, body));
  }
  @Roles("ADMIN", "SUPER_ADMIN", "LENDER")
  @Post("applications/:id/information")
  information(
    @CurrentUser() a: AuthUser,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.service.requestInformation(
      a,
      id,
      parse(updateReview, body).message,
    );
  }
  @Post("applications/:id/respond") respond(
    @CurrentUser() a: AuthUser,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.service.respond(a, id, parse(updateReview, body).message);
  }
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post("applications/:id/accept")
  accept(
    @CurrentUser() a: AuthUser,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.service.accept(a, id, parse(acceptInput, body));
  }
  @Post("applications/:id/cancel") cancel(
    @CurrentUser() a: AuthUser,
    @Param("id") id: string,
  ) {
    return this.service.cancel(a, id);
  }
  @Roles("ADMIN", "SUPER_ADMIN") @Post("applications/:id/fund") fund(
    @CurrentUser() a: AuthUser,
    @Param("id") id: string,
  ) {
    return this.service.fund(a, id);
  }
}
@Controller("wallet")
export class WalletController {
  constructor(private service: SettlementService) {}
  @Get() wallet(@CurrentUser() a: AuthUser) {
    return this.service.wallet(a);
  }
  @Get("banks") banks() {
    return this.service.banks();
  }
  @Throttle({ default: { limit: 5, ttl: 60000 } }) @Post("beneficiaries") bank(
    @CurrentUser() a: AuthUser,
    @Body() body: unknown,
  ) {
    return this.service.addBank(a, parse(beneficiaryInput, body));
  }
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post("beneficiaries/:id/verify")
  verify(@CurrentUser() a: AuthUser, @Param("id") id: string) {
    return this.service.verifyBank(a, id);
  }
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post("withdrawals")
  withdraw(@CurrentUser() a: AuthUser, @Body() body: unknown) {
    return this.service.withdraw(a, parse(withdrawInput, body));
  }
}
@Controller("money")
export class MoneyController {
  constructor(
    private service: SettlementService,
    private connector: MoneyConnector,
  ) {}
  @Roles("ADMIN", "SUPER_ADMIN") @Get("operations") operations() {
    return this.service.operations();
  }
  @Roles("ADMIN", "SUPER_ADMIN") @Get("reconciliation") reconciliation() {
    return this.service.reconciliation();
  }
  @Roles("ADMIN", "SUPER_ADMIN") @Post("process") process() {
    return this.service.process();
  }
  @Public() @Post("webhook") @HttpCode(200) webhook(
    @Req() req: any,
    @Headers("x-money-timestamp") timestamp: string,
    @Headers("x-money-signature") signature: string,
    @Body() body: unknown,
  ) {
    if (!Buffer.isBuffer(req.rawBody)) throw new UnauthorizedException();
    this.connector.verifySignature(req.rawBody, timestamp, signature);
    return this.service.settle(parse(providerEvent, body));
  }
  @Public() @Get("process") cron(@Headers("authorization") auth: string) {
    const expected = Buffer.from(`Bearer ${process.env.CRON_SECRET ?? ""}`),
      given = Buffer.from(auth ?? "");
    if (
      !process.env.CRON_SECRET ||
      given.length !== expected.length ||
      !timingSafeEqual(given, expected)
    )
      throw new UnauthorizedException();
    if (!this.service.configuration().enabled)
      return { checked: 0, activationPending: true };
    return this.service.process();
  }
}
