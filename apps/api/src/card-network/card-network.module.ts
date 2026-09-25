import { Module } from '@nestjs/common';
import { ConsumerModule } from '../consumer/consumer.module';
import { CardNetworkController } from './card-network.controller';

@Module({ imports: [ConsumerModule], controllers: [CardNetworkController] })
export class CardNetworkModule {}
