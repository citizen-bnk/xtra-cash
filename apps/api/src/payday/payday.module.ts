import { Module } from '@nestjs/common';
import { PaydayController } from './payday.controller';
import { PaydayService } from './payday.service';
import { LeadAssistantController, LeadAssistantService } from './lead-assistant';
@Module({controllers:[PaydayController,LeadAssistantController],providers:[PaydayService,LeadAssistantService]})
export class PaydayModule {}
