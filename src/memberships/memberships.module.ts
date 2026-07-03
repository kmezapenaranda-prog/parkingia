import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MembershipsController } from './memberships.controller';
import { MembershipsService } from './memberships.service';
import { Membership } from './membership.entity';
import { Vehicle } from '../vehicles/vehicle.entity';

@Module({
  // Vehicle se importa para que MembershipsService pueda buscar placas sin depender de VehiclesModule
  imports: [TypeOrmModule.forFeature([Membership, Vehicle])],
  controllers: [MembershipsController],
  providers: [MembershipsService],
  exports: [MembershipsService],
})
export class MembershipsModule {}
