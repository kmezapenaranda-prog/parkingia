import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientsModule } from './clients/clients.module';
import { VehiclesModule } from './vehicles/vehicles.module';
import { MembershipsModule } from './memberships/memberships.module';
import { ParkingModule } from './parking/parking.module';
import { SettingsModule } from './settings/settings.module';
import { ReportsModule } from './reports/reports.module';
import { TenantsModule } from './tenants/tenants.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { HealthModule } from './health/health.module';
import { Entry } from './parking/entry.entity';
import { Client } from './clients/client.entity';
import { Vehicle } from './vehicles/vehicle.entity';
import { Membership } from './memberships/membership.entity';
import { Settings } from './settings/settings.entity';
import { Tenant } from './tenants/tenant.entity';
import { User } from './users/user.entity';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      entities: [Entry, Client, Vehicle, Membership, Settings, Tenant, User],
      synchronize: true,
      ssl: { rejectUnauthorized: false },
      extra: { options: '-c timezone=America/Bogota' },
    }),
    ClientsModule,
    VehiclesModule,
    MembershipsModule,
    ParkingModule,
    SettingsModule,
    ReportsModule,
    TenantsModule,
    UsersModule,
    AuthModule,
    HealthModule,
  ],
})
export class AppModule {}
