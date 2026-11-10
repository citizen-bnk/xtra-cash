import { Module } from "@nestjs/common";
import { LenderAccessService, LenderAccessController } from './lender-access';
import {RoutingService,RoutingController} from './routing';
import {LoanOperationsService,LoanOperationsController} from './loan-operations';
import {LenderModule} from '../lender/lender.module';
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
import { VaultService } from './vault.service';
@Module({
  imports: [ConsumerModule,LenderModule],
  controllers: [
    LoanOperationsController,
    RoutingController,
    LenderAccessController,
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
    LoanOperationsService,
    RoutingService,
    LenderAccessService,
    PersonalLoanService,
    SettlementService,
    MoneyConnector,
    LenderAiService,
    LenderAiModel,
    WorkAssistantService,
    WorkAssistantModel,
    VaultService,
  ],
})
export class PersonalLoanModule {}
