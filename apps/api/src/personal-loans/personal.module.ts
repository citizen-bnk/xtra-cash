import { Module } from "@nestjs/common";
import { ConsumerModule } from "../consumer/consumer.module";
import {
  PersonalLoanController,
  PersonalLenderController,
} from "./personal.controller";
import { PersonalLoanService } from "./personal.service";
import { SettlementService } from "./settlement.service";
import { MoneyConnector } from "./money-connector";
import {
  SettlementController,
  WalletController,
  MoneyController,
} from "./settlement.controller";
import {
  DecisionAiController,
  LenderAiController,
  LenderAiProviderController,
  ApplicantReviewController,
} from "./lender-ai.controller";
import { LenderAiService } from "./lender-ai.service";
import { LenderAiModel } from "./lender-ai-model";
import {
  WorkAssistantController,
  WorkAssistantService,
  WorkAssistantModel,
} from "./work-assistant";
@Module({
  imports: [ConsumerModule],
  controllers: [
    PersonalLoanController,
    PersonalLenderController,
    SettlementController,
    WalletController,
    MoneyController,
    DecisionAiController,
    LenderAiController,
    LenderAiProviderController,
    ApplicantReviewController,
    WorkAssistantController,
  ],
  providers: [
    PersonalLoanService,
    SettlementService,
    MoneyConnector,
    LenderAiService,
    LenderAiModel,
    WorkAssistantService,
    WorkAssistantModel,
  ],
})
export class PersonalLoanModule {}
