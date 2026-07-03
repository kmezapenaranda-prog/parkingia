import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { Entry } from './entry.entity';
import { CreateEntryDto } from './dto/create-entry.dto';

@Injectable()
export class EntriesService {
  constructor(
    @InjectRepository(Entry)
    private readonly entriesRepository: Repository<Entry>,
  ) {}

  create(dto: CreateEntryDto): Promise<Entry> {
    const entry = this.entriesRepository.create({ plate: dto.plate.toUpperCase() });
    return this.entriesRepository.save(entry);
  }

  findAll(): Promise<Entry[]> {
    return this.entriesRepository.find({ order: { entryTime: 'DESC' } });
  }

  findActive(): Promise<Entry[]> {
    return this.entriesRepository.find({
      where: { exitTime: IsNull() },
      order: { entryTime: 'DESC' },
    });
  }

  async registerExit(id: number): Promise<Entry> {
    const entry = await this.entriesRepository.findOne({ where: { id } });
    if (!entry) {
      throw new NotFoundException(`No se encontró el registro con id ${id}`);
    }
    if (entry.exitTime) {
      throw new NotFoundException(`El vehículo con id ${id} ya registró su salida`);
    }
    entry.exitTime = new Date();
    return this.entriesRepository.save(entry);
  }
}
