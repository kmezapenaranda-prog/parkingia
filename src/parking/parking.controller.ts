import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ParkingService } from './parking.service';
import { RegisterEntryDto } from './dto/register-entry.dto';
import { RegisterExitDto } from './dto/register-exit.dto';

@Controller('parking')
export class ParkingController {
  constructor(private readonly parkingService: ParkingService) {}

  @Post('entry')
  registerEntry(@Body() dto: RegisterEntryDto) {
    return this.parkingService.registerEntry(dto.plate);
  }

  @Post('exit')
  registerExit(@Body() dto: RegisterExitDto) {
    return this.parkingService.registerExit(dto.plate);
  }

  @Get('active')
  getActive() {
    return this.parkingService.getActive();
  }

  @Get('status/:plate')
  getStatus(@Param('plate') plate: string) {
    return this.parkingService.getStatus(plate);
  }

  // Solo para desarrollo — elimina todos los ingresos abiertos sin salida
  @Delete('cleanup')
  cleanupOpenEntries() {
    return this.parkingService.cleanupOpenEntries();
  }

  // Solo para desarrollo — elimina todos los registros de mensualidades
  @Delete('cleanup-memberships')
  cleanupAllMemberships() {
    return this.parkingService.cleanupAllMemberships();
  }
}
