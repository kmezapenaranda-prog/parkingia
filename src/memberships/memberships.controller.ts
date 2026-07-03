import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { MembershipsService } from './memberships.service';
import { CreateMembershipDto } from './dto/create-membership.dto';

@Controller('memberships')
export class MembershipsController {
  constructor(private readonly membershipsService: MembershipsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateMembershipDto) {
    return this.membershipsService.create(dto);
  }

  @Get()
  findAll() {
    return this.membershipsService.findAll();
  }

  // Ruta fija debe ir antes de la ruta dinámica al mismo nivel
  @Get('expiring')
  findExpiring() {
    return this.membershipsService.findExpiring();
  }

  @Get(':plate/status')
  getStatus(@Param('plate') plate: string) {
    return this.membershipsService.getStatusByPlate(plate);
  }

  @Put(':id/renew')
  renew(@Param('id', ParseIntPipe) id: number) {
    return this.membershipsService.renew(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.membershipsService.remove(id);
  }
}
