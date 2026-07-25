import { Controller, Get, Query, ParseIntPipe, BadRequestException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ReportsService } from './reports.service';

@ApiTags('reports')
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('caja')
  getCaja(@Query('fecha') fecha: string, @Query('tenantId', ParseIntPipe) tenantId: number) {
    if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      throw new BadRequestException('Parámetro fecha requerido (formato: YYYY-MM-DD)');
    }
    return this.reportsService.getCajaReport(fecha, tenantId);
  }

  @Get('summary')
  getSummary(@Query('tenantId', ParseIntPipe) tenantId: number) {
    return this.reportsService.getSummary(tenantId);
  }
}
