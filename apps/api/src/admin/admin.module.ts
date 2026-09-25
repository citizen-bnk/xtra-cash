import { Module } from '@nestjs/common';
import { ConsumerModule } from '../consumer/consumer.module';
import { LenderModule } from '../lender/lender.module';
import { AffiliateModule } from '../affiliate/affiliate.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [ConsumerModule, LenderModule, AffiliateModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
