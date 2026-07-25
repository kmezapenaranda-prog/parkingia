import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Query, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { ParkingService } from './parking.service';
import { RegisterEntryDto } from './dto/register-entry.dto';
import { RegisterExitDto } from './dto/register-exit.dto';

@ApiTags('parking')
@Controller('parking')
export class ParkingController {
  constructor(private readonly parkingService: ParkingService) {}

  @Post('entry')
  registerEntry(@Body() dto: RegisterEntryDto) {
    return this.parkingService.registerEntry(dto.tenantId, dto.plate, dto.vehicleType);
  }

  @Post('exit')
  registerExit(@Body() dto: RegisterExitDto) {
    return this.parkingService.registerExit(dto.tenantId, dto.plate);
  }

  @Get('active')
  getActive(@Query('tenantId', ParseIntPipe) tenantId: number) {
    return this.parkingService.getActive(tenantId);
  }

  @Get('entries')
  getEntries(@Query('tenantId', ParseIntPipe) tenantId: number) {
    return this.parkingService.getEntries(tenantId);
  }

  @Get('status/:plate')
  getStatus(@Param('plate') plate: string, @Query('tenantId', ParseIntPipe) tenantId: number) {
    return this.parkingService.getStatus(tenantId, plate);
  }

  @Get('entries/:id/receipt')
  async getExitReceipt(
    @Param('id', ParseIntPipe) id: number,
    @Query('tenantId', ParseIntPipe) tenantId: number,
    @Res() res: Response,
  ) {
    const { buffer, filename } = await this.parkingService.getExitReceiptPdf(tenantId, id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
    res.send(buffer);
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
