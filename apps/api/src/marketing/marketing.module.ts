import { Module } from '@nestjs/common';
import { LenderMarketingController, MemberMarketingController, PublicCampaignController } from './marketing.controller';
import { MarketingService } from './marketing.service';
import { PushService } from './push.service';
import { MarketingJobsController } from './marketing-jobs.controller';
@Module({ controllers: [LenderMarketingController, MemberMarketingController, PublicCampaignController, MarketingJobsController], providers: [MarketingService, PushService] })
export class MarketingModule {}
