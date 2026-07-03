import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Body,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { EntriesService } from './entries.service';
import { CreateEntryDto } from './dto/create-entry.dto';

@Controller('entries')
export class EntriesController {
  constructor(private readonly entriesService: EntriesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateEntryDto) {
    return this.entriesService.create(dto);
  }

  @Get()
  findAll() {
    return this.entriesService.findAll();
  }

  @Get('active')
  findActive() {
    return this.entriesService.findActive();
  }

  @Put(':id/exit')
  registerExit(@Param('id', ParseIntPipe) id: number) {
    return this.entriesService.registerExit(id);
  }
}
