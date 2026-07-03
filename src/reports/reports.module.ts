import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { Entry } from '../entries/entry.entity';
import { Membership } from '../memberships/membership.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Entry, Membership])],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
