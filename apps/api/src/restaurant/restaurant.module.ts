import { Module } from '@nestjs/common';
import { CustomerReceiptsController, RestaurantController, RestaurantNotificationsController } from './restaurant.controller';
import { RestaurantService } from './restaurant.service';

@Module({ controllers: [RestaurantController, CustomerReceiptsController, RestaurantNotificationsController], providers: [RestaurantService] })
export class RestaurantModule {}
