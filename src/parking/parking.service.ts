import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, In, Repository } from 'typeorm';
import { Entry } from '../entries/entry.entity';
import { Vehicle, VehicleType } from '../vehicles/vehicle.entity';
import { MembershipsService } from '../memberships/memberships.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SettingsService } from '../settings/settings.service';
import { Settings } from '../settings/settings.entity';

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function detectTypeFromPlate(plate: string): VehicleType {
  // Moto colombiana: 3 letras + 2 dígitos + 1 letra  (ej. XTE09I)
  if (/^[A-Z]{3}\d{2}[A-Z]$/i.test(plate)) return VehicleType.MOTO;
  // Carro/camión:   3 letras + 3 dígitos             (ej. ABC123)
  return VehicleType.CAR;
}

function calculateFare(totalMinutes: number, vehicleType: string, s: Settings): number {
  const isMoto = vehicleType === 'moto';
  const fraccion = isMoto ? s.fraccionMoto : s.fraccionCarro;
  const hora     = isMoto ? s.horaMoto     : s.horaCarro;
  const medioDia = isMoto ? s.medioDiaMoto : s.medioDiaCarro;
  const dia      = isMoto ? s.diaMoto      : s.diaCarro;

  if (totalMinutes <= 15)  return fraccion;
  if (totalMinutes <= 60)  return hora;
  if (totalMinutes <= 360) return medioDia;
  if (totalMinutes <= 720) return dia;
  return Math.ceil(totalMinutes / 1440) * dia;
}

@Injectable()
export class ParkingService {
  constructor(
    @InjectRepository(Entry)
    private readonly entryRepo: Repository<Entry>,
    @InjectRepository(Vehicle)
    private readonly vehicleRepo: Repository<Vehicle>,
    private readonly membershipsService: MembershipsService,
    private readonly notificationsService: NotificationsService,
    private readonly settingsService: SettingsService,
  ) {}

  async registerEntry(plate: string): Promise<Entry & { action: string }> {
    const normalized = plate.toUpperCase();
    const existing = await this.entryRepo.findOne({
      where: { plate: normalized, exitTime: IsNull() },
    });
    if (existing) {
      throw new ConflictException(
        `El vehículo ${normalized} ya se encuentra dentro del parqueadero`,
      );
    }

    let vehicle = await this.vehicleRepo.findOne({ where: { plate: normalized } });
    if (!vehicle) {
      vehicle = await this.vehicleRepo.save(
        this.vehicleRepo.create({
          plate: normalized,
          type: detectTypeFromPlate(normalized),
          clientId: null,
        }),
      );
    }
    const entry = await this.entryRepo.save(
      this.entryRepo.create({
        plate: normalized,
        vehicleType: vehicle.type,
      }),
    );

    const { status } = await this.membershipsService.getStatusByPlate(normalized);
    const action =
      status === 'ACTIVE' ? 'GRANTED' :
      status === 'EXPIRED' ? 'ALERT' :
      'VISITOR';

    void this.notificationsService.notifyEntry(normalized, entry.entryTime);
    return { ...entry, action };
  }

  async registerExit(plate: string) {
    const normalized = plate.toUpperCase();
    const entry = await this.entryRepo.findOne({
      where: { plate: normalized, exitTime: IsNull() },
    });
    if (!entry) {
      throw new NotFoundException(
        `No se encontró un ingreso activo para la placa ${normalized}`,
      );
    }

    const exitTime = new Date();
    const totalMinutes = Math.ceil(
      (exitTime.getTime() - entry.entryTime.getTime()) / 60000,
    );

    const { status } = await this.membershipsService.getStatusByPlate(normalized);
    let amountToPay = 0;
    if (status !== 'ACTIVE') {
      const settings = await this.settingsService.get();
      const vehicleType = entry.vehicleType ?? 'car';
      amountToPay = calculateFare(totalMinutes, vehicleType, settings);
    }

    entry.exitTime = exitTime;
    entry.amountPaid = amountToPay;
    await this.entryRepo.save(entry);

    const duration = formatDuration(totalMinutes);
    void this.notificationsService.notifyExit(normalized, exitTime, duration, amountToPay);

    return {
      plate: normalized,
      entryTime: entry.entryTime,
      exitTime,
      duration,
      totalMinutes,
      amountToPay,
      currency: 'COP',
    };
  }

  async getStatus(plate: string) {
    const normalized = plate.toUpperCase();
    const entry = await this.entryRepo.findOne({
      where: { plate: normalized, exitTime: IsNull() },
    });
    if (!entry) return { plate: normalized, isInside: false };

    const currentMinutes = Math.floor(
      (Date.now() - entry.entryTime.getTime()) / 60000,
    );
    return {
      plate: normalized,
      isInside: true,
      entryTime: entry.entryTime,
      currentMinutes,
      duration: formatDuration(currentMinutes),
    };
  }

  async getActive() {
    const entries = await this.entryRepo.find({
      where: { exitTime: IsNull() },
      order: { entryTime: 'ASC' },
    });
    if (entries.length === 0) return [];

    const plates = entries.map((e) => e.plate);
    const vehicles = await this.vehicleRepo.find({ where: { plate: In(plates) } });
    const vehicleMap = new Map(vehicles.map((v) => [v.plate, v]));
    const settings = await this.settingsService.get();
    const now = Date.now();

    return entries.map((e) => {
      const vehicle = vehicleMap.get(e.plate);
      const vehicleType = e.vehicleType ?? vehicle?.type ?? 'car';
      const currentMinutes = Math.floor((now - e.entryTime.getTime()) / 60000);
      const estimatedCost = calculateFare(currentMinutes, vehicleType, settings);
      return {
        id: e.id,
        plate: e.plate,
        vehicleType,
        entryTime: e.entryTime,
        currentMinutes,
        duration: formatDuration(currentMinutes),
        estimatedCost,
      };
    });
  }

  async cleanupAllMemberships(): Promise<{ deleted: number }> {
    return this.membershipsService.cleanupAll();
  }

  async cleanupOpenEntries(): Promise<{ deleted: number }> {
    const result = await this.entryRepo.delete({ exitTime: IsNull() });
    return { deleted: result.affected ?? 0 };
  }
}
