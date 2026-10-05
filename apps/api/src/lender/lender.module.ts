import { Module } from '@nestjs/common';
import { ConsumerModule } from '../consumer/consumer.module';
import { LenderController } from './lender.controller';
import { LenderService } from './lender.service';
import { OfferAssistantService } from './offer-assistant.service';

@Module({
  imports: [ConsumerModule],
  controllers: [LenderController],
  providers: [LenderService, OfferAssistantService],
  exports: [LenderService],
})
export class LenderModule {}
