import { Module } from '@nestjs/common';
import { CustomerReceiptsController, RestaurantController, RestaurantNotificationsController } from './restaurant.controller';
import { RestaurantService } from './restaurant.service';
import { RestaurantPayoutService } from './restaurant-payout.service';
import { RestaurantAdminController, RestaurantPortalController, RestaurantPayoutJobController } from './restaurant-payout.controller';

@Module({ controllers: [RestaurantController, CustomerReceiptsController, RestaurantNotificationsController, RestaurantAdminController, RestaurantPortalController, RestaurantPayoutJobController], providers: [RestaurantService, RestaurantPayoutService] })
export class RestaurantModule {}
