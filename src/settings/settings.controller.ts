import { Controller, Get, Put, Body, Query, ParseIntPipe } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SettingsService } from './settings.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';

@ApiTags('settings')
@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  get(@Query('tenantId', ParseIntPipe) tenantId: number) {
    return this.settingsService.get(tenantId);
  }

  @Put()
  update(@Query('tenantId', ParseIntPipe) tenantId: number, @Body() dto: UpdateSettingsDto) {
    return this.settingsService.upsert(tenantId, dto);
  }
}
