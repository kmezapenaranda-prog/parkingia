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
import { VehiclesService } from './vehicles.service';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';

@ApiTags('vehicles')
@Controller('vehicles')
export class VehiclesController {
  constructor(private readonly vehiclesService: VehiclesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateVehicleDto) {
    return this.vehiclesService.create(dto);
  }

  @Get()
  findAll(@Query('tenantId', ParseIntPipe) tenantId: number) {
    return this.vehiclesService.findAll(tenantId);
  }

  @Get(':plate')
  findByPlate(@Param('plate') plate: string, @Query('tenantId', ParseIntPipe) tenantId: number) {
    return this.vehiclesService.findByPlate(plate, tenantId);
  }

  @Put(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateVehicleDto,
    @Query('tenantId', ParseIntPipe) tenantId: number,
  ) {
    return this.vehiclesService.update(id, dto, tenantId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseIntPipe) id: number, @Query('tenantId', ParseIntPipe) tenantId: number) {
    return this.vehiclesService.remove(id, tenantId);
  }
}
