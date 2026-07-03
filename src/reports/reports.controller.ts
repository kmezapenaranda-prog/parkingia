import { Controller, Get, Query, BadRequestException } from '@nestjs/common';
import { ReportsService } from './reports.service';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('caja')
  getCaja(@Query('fecha') fecha: string) {
    if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      throw new BadRequestException('Parámetro fecha requerido (formato: YYYY-MM-DD)');
    }
    return this.reportsService.getCajaReport(fecha);
  }
}
