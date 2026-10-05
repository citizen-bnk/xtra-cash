import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { DbModule } from './common/db.module';
import { CommonModule } from './common/common.module';
import { AuthGuard } from './common/auth';
import { IntegrationsModule } from './integrations/integrations.module';
import { AuthModule } from './auth/auth.module';
import { ConsumerModule } from './consumer/consumer.module';
import { LenderModule } from './lender/lender.module';
import { AffiliateModule } from './affiliate/affiliate.module';
import { AdminModule } from './admin/admin.module';
import { CardNetworkModule } from './card-network/card-network.module';
import { HealthController } from './health.controller';
import { JobsService } from './common/jobs.service';
import { JobsController } from './common/jobs.controller';
import { PersonalLoanModule } from './personal-loans/personal.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: Number(process.env.RATE_LIMIT_PER_MIN ?? 300) }]),
    DbModule,
    CommonModule,
    IntegrationsModule,
    AuthModule,
    AffiliateModule,
    ConsumerModule,
    LenderModule,
    AdminModule,
    CardNetworkModule,
    PersonalLoanModule,
  ],
  controllers: [HealthController, JobsController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    JobsService,
  ],
})
export class AppModule {}
