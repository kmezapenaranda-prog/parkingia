import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { MembershipsService } from './memberships.service';
import { CreateMembershipDto } from './dto/create-membership.dto';

@ApiTags('memberships')
@Controller('memberships')
export class MembershipsController {
  constructor(private readonly membershipsService: MembershipsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateMembershipDto) {
    return this.membershipsService.create(dto);
  }

  @Get()
  findAll(@Query('tenantId', ParseIntPipe) tenantId: number) {
    return this.membershipsService.findAll(tenantId);
  }

  // Ruta fija debe ir antes de la ruta dinámica al mismo nivel
  @Get('expiring')
  findExpiring(@Query('tenantId', ParseIntPipe) tenantId: number) {
    return this.membershipsService.findExpiring(tenantId);
  }

  @Get(':plate/status')
  getStatus(@Param('plate') plate: string, @Query('tenantId', ParseIntPipe) tenantId: number) {
    return this.membershipsService.getStatusByPlate(plate, tenantId);
  }

  @Put(':id/renew')
  renew(@Param('id', ParseIntPipe) id: number, @Query('tenantId', ParseIntPipe) tenantId: number) {
    return this.membershipsService.renew(id, tenantId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseIntPipe) id: number, @Query('tenantId', ParseIntPipe) tenantId: number) {
    return this.membershipsService.remove(id, tenantId);
  }
}
