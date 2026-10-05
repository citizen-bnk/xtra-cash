import { Module } from '@nestjs/common';
import { ConsumerModule } from '../consumer/consumer.module';
import { PersonalLoanController, PersonalLenderController } from './personal.controller';
import { PersonalLoanService } from './personal.service';
@Module({ imports: [ConsumerModule], controllers: [PersonalLoanController, PersonalLenderController], providers: [PersonalLoanService] })
export class PersonalLoanModule {}
