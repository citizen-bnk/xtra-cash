import { Module } from '@nestjs/common';
import { ConsumerModule } from '../consumer/consumer.module';
import { PersonalLoanController, PersonalLenderController } from './personal.controller';
import { PersonalLoanService } from './personal.service';
import { SettlementService } from './settlement.service';
import { MoneyConnector } from './money-connector';
import { SettlementController, WalletController, MoneyController } from './settlement.controller';
@Module({ imports: [ConsumerModule], controllers: [PersonalLoanController, PersonalLenderController, SettlementController, WalletController, MoneyController], providers: [PersonalLoanService, SettlementService, MoneyConnector] })
export class PersonalLoanModule {}
