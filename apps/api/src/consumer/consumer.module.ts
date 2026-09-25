import { Module } from '@nestjs/common';
import { AffiliateModule } from '../affiliate/affiliate.module';
import { ConsumerController } from './consumer.controller';
import { KycService } from './kyc.service';
import { CreditService } from './credit.service';
import { CardsService } from './cards.service';
import { AuthorizationService } from './authorization.service';
import { LoansService } from './loans.service';

@Module({
  imports: [AffiliateModule],
  controllers: [ConsumerController],
  providers: [KycService, CreditService, CardsService, AuthorizationService, LoansService],
  exports: [KycService, CreditService, CardsService, AuthorizationService, LoansService],
})
export class ConsumerModule {}
