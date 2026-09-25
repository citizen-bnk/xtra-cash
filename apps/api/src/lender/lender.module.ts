import { Module } from '@nestjs/common';
import { ConsumerModule } from '../consumer/consumer.module';
import { LenderController } from './lender.controller';
import { LenderService } from './lender.service';

@Module({
  imports: [ConsumerModule],
  controllers: [LenderController],
  providers: [LenderService],
  exports: [LenderService],
})
export class LenderModule {}
