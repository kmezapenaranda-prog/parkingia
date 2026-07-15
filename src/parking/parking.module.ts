import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ParkingController } from './parking.controller';
import { ParkingService } from './parking.service';
import { Entry } from './entry.entity';
import { Vehicle } from '../vehicles/vehicle.entity';
import { MembershipsModule } from '../memberships/memberships.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Entry, Vehicle]),
    MembershipsModule,
    NotificationsModule,
    SettingsModule,
  ],
  controllers: [ParkingController],
  providers: [ParkingService],
})
export class ParkingModule {}
