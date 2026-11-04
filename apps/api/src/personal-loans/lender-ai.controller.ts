import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Put,
  Req,
  UnauthorizedException,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { timingSafeEqual } from "crypto";
import { CurrentUser, Public, Roles, type AuthUser } from "../common/auth";
import { parse } from "../payday/payday.dto";
import { LenderAiService } from "./lender-ai.service";
import {
  decisionChatInput,
  decisionAdvanceInput,
  lenderPolicyInput,
  assessmentEventInput,
} from "./lender-ai.dto";
import { updateReview } from "./settlement.dto";
@Controller("personal-loans/applications")
export class ApplicantReviewController {
  constructor(private service: LenderAiService) {}
  @Post(":id/human-review") review(
    @CurrentUser() a: AuthUser,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.service.requestHumanReview(
      a,
      id,
      parse(updateReview, body).message,
    );
  }
}
@Roles("ADMIN", "SUPER_ADMIN", "LENDER")
@Controller("personal-loans/applications")
export class DecisionAiController {
  constructor(private service: LenderAiService) {}
  @Get(":id/decision-chat") state(
    @CurrentUser() a: AuthUser,
    @Param("id") id: string,
  ) {
    return this.service.state(a, id);
  }
  @Throttle({ default: { limit: 12, ttl: 60000 } })
  @Post(":id/decision-chat")
  chat(
    @CurrentUser() a: AuthUser,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.service.chat(a, id, parse(decisionChatInput, body));
  }
  @Post(":id/decision-chat/advance") advance(
    @CurrentUser() a: AuthUser,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.service.advance(a, id, parse(decisionAdvanceInput, body));
  }
}
@Roles("LENDER")
@Controller("lender/ai")
export class LenderAiController {
  constructor(private service: LenderAiService) {}
  @Get("settings") settings(@CurrentUser() a: AuthUser) {
    return this.service.settings(a);
  }
  @Put("settings") save(@CurrentUser() a: AuthUser, @Body() body: unknown) {
    return this.service.saveSettings(a, parse(lenderPolicyInput, body));
  }
  @Post("process") process(@CurrentUser() a: AuthUser) {
    return this.service.process(a);
  }
}
@Controller("lender-ai")
export class LenderAiProviderController {
  constructor(private service: LenderAiService) {}
  @Public() @Post("assessment") assessment(
    @Req() req: any,
    @Headers("x-assessment-timestamp") timestamp: string,
    @Headers("x-assessment-signature") signature: string,
    @Body() body: unknown,
  ) {
    if (!Buffer.isBuffer(req.rawBody)) throw new UnauthorizedException();
    return this.service.receiveAssessment(
      req.rawBody,
      timestamp,
      signature,
      parse(assessmentEventInput, body),
    );
  }
  @Public() @Get("process") process(@Headers("authorization") auth: string) {
    const secret = process.env.CRON_SECRET,
      expected = Buffer.from(`Bearer ${secret ?? ""}`),
      given = Buffer.from(auth ?? "");
    if (
      !secret ||
      given.length !== expected.length ||
      !timingSafeEqual(given, expected)
    )
      throw new UnauthorizedException();
    return this.service.process();
  }
}
