import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EntriesModule } from './entries/entries.module';
import { ClientsModule } from './clients/clients.module';
import { VehiclesModule } from './vehicles/vehicles.module';
import { MembershipsModule } from './memberships/memberships.module';
import { ParkingModule } from './parking/parking.module';
import { SettingsModule } from './settings/settings.module';
import { ReportsModule } from './reports/reports.module';
import { Entry } from './entries/entry.entity';
import { Client } from './clients/client.entity';
import { Vehicle } from './vehicles/vehicle.entity';
import { Membership } from './memberships/membership.entity';
import { Settings } from './settings/settings.entity';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT) || 5432,
      username: process.env.DB_USER || 'parkinguser',
      password: process.env.DB_PASSWORD || 'parkingpass',
      database: process.env.DB_NAME || 'parkingdb',
      entities: [Entry, Client, Vehicle, Membership, Settings],
      synchronize: true,
      extra: { options: '-c timezone=America/Bogota' },
    }),
    EntriesModule,
    ClientsModule,
    VehiclesModule,
    MembershipsModule,
    ParkingModule,
    SettingsModule,
    ReportsModule,
  ],
})
export class AppModule {}
