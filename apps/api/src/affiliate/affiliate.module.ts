import { Module } from '@nestjs/common';
import { AffiliateController } from './affiliate.controller';
import { AffiliateService } from './affiliate.service';
import { CommissionService } from './commission.service';

@Module({
  controllers: [AffiliateController],
  providers: [AffiliateService, CommissionService],
  exports: [AffiliateService, CommissionService],
})
export class AffiliateModule {}
