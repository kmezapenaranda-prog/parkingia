import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { Membership, MembershipStatus } from './membership.entity';
import { Vehicle } from '../vehicles/vehicle.entity';
import { CreateMembershipDto } from './dto/create-membership.dto';

function getTodayBogota(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
}

@Injectable()
export class MembershipsService {
  constructor(
    @InjectRepository(Membership)
    private readonly membershipRepo: Repository<Membership>,
    @InjectRepository(Vehicle)
    private readonly vehicleRepo: Repository<Vehicle>,
  ) {}

  async create(dto: CreateMembershipDto): Promise<Membership> {
    const vehicle = await this.vehicleRepo.findOne({
      where: { id: dto.vehicleId, tenantId: dto.tenantId },
    });
    if (!vehicle) throw new NotFoundException(`Vehículo ${dto.vehicleId} no encontrado`);

    const activeMembership = await this.membershipRepo.findOne({
      where: { vehicleId: dto.vehicleId, status: MembershipStatus.ACTIVE },
    });
    if (activeMembership) {
      throw new ConflictException(
        'El vehículo ya tiene una mensualidad activa. Debe vencerla o cancelarla antes de crear una nueva',
      );
    }

    const membership = this.membershipRepo.create({
      tenantId: dto.tenantId,
      vehicleId: dto.vehicleId,
      clientId: dto.clientId,
      startDate: dto.startDate,
      endDate: dto.endDate,
      status: dto.status ?? MembershipStatus.ACTIVE,
      price: dto.price,
      autoRenew: dto.autoRenew ?? false,
      company: dto.company ?? null,
      paidAt: new Date(),
    });
    return this.membershipRepo.save(membership);
  }

  async cleanupAll(): Promise<{ deleted: number }> {
    const result = await this.membershipRepo.query('DELETE FROM memberships');
    return { deleted: result[1] ?? 0 };
  }

  findAll(tenantId: number): Promise<Membership[]> {
    return this.membershipRepo.find({
      where: { tenantId },
      relations: ['client', 'vehicle'],
      order: { createdAt: 'DESC' },
    });
  }

  async getStatusByPlate(plate: string, tenantId: number): Promise<{ status: string; membership?: Membership }> {
    const vehicle = await this.vehicleRepo.findOne({ where: { plate: plate.toUpperCase(), tenantId } });
    if (!vehicle) return { status: 'NOT_FOUND' };

    // find() + take:1 garantiza ORDER BY end_date DESC LIMIT 1 sin el bug de findOne+order
    const results = await this.membershipRepo.find({
      where: { vehicleId: vehicle.id },
      order: { endDate: 'DESC' },
      take: 1,
    });
    if (results.length === 0) return { status: 'NOT_FOUND' };
    const membership = results[0];

    const today = getTodayBogota();
    const endDateStr =
      typeof membership.endDate === 'string'
        ? membership.endDate.slice(0, 10)
        : new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(
            membership.endDate as unknown as Date,
          );
    if (endDateStr < today) return { status: 'EXPIRED', membership };
    return { status: 'ACTIVE', membership };
  }

  async renew(id: number, tenantId: number): Promise<Membership> {
    const membership = await this.membershipRepo.findOne({ where: { id, tenantId } });
    if (!membership) throw new NotFoundException(`Mensualidad ${id} no encontrada`);

    // Extend end_date by exactly 1 month from the current end_date
    const currentEnd = new Date(membership.endDate + 'T12:00:00');
    currentEnd.setMonth(currentEnd.getMonth() + 1);
    membership.endDate = currentEnd.toISOString().split('T')[0];
    membership.status = MembershipStatus.ACTIVE;
    membership.paidAt = new Date();
    return this.membershipRepo.save(membership);
  }

  async remove(id: number, tenantId: number): Promise<void> {
    const membership = await this.membershipRepo.findOne({ where: { id, tenantId } });
    if (!membership) throw new NotFoundException(`Mensualidad ${id} no encontrada`);
    await this.membershipRepo.softDelete(id);
  }

  findExpiring(tenantId: number): Promise<Membership[]> {
    const today = getTodayBogota();
    const limit = new Date(today + 'T12:00:00');
    limit.setDate(limit.getDate() + 7);
    const in7Days = limit.toISOString().split('T')[0];

    return this.membershipRepo.find({
      relations: ['client', 'vehicle'],
      where: {
        tenantId,
        status: MembershipStatus.ACTIVE,
        endDate: Between(today, in7Days),
      },
      order: { endDate: 'ASC' },
    });
  }
}
