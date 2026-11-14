import { Module } from '@nestjs/common';
import { CustomerReceiptsController, RestaurantController, RestaurantNotificationsController } from './restaurant.controller';
import { RestaurantService } from './restaurant.service';
import { RestaurantPayoutService } from './restaurant-payout.service';
import { RestaurantAdminController, RestaurantPortalController, RestaurantPayoutJobController, RestaurantStaffController } from './restaurant-payout.controller';

@Module({ controllers: [RestaurantController, CustomerReceiptsController, RestaurantNotificationsController, RestaurantAdminController, RestaurantPortalController, RestaurantStaffController, RestaurantPayoutJobController], providers: [RestaurantService, RestaurantPayoutService] })
export class RestaurantModule {}
