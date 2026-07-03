import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Entry } from '../entries/entry.entity';
import { Membership } from '../memberships/membership.entity';

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(Entry)
    private readonly entryRepo: Repository<Entry>,
    @InjectRepository(Membership)
    private readonly membershipRepo: Repository<Membership>,
  ) {}

  async getCajaReport(fecha: string) {
    // Vehicles that entered on this date (for count, hourly breakdown, visitor classification)
    const entradas: { plate: string }[] = await this.entryRepo.query(
      `SELECT plate FROM entries
       WHERE (entry_time AT TIME ZONE 'America/Bogota')::date = $1::date`,
      [fecha],
    );

    // Closed entries whose exit_time falls on this date → revenue of the day
    // Aliases map snake_case columns to camelCase so JS code can access them correctly
    const cobrosRaw: Array<{
      plate: string;
      vehicleType: string | null;
      entryTime: Date;
      exitTime: Date;
      amountPaid: number | null;
    }> = await this.entryRepo.query(
      `SELECT plate,
              vehicle_type  AS "vehicleType",
              entry_time    AS "entryTime",
              exit_time     AS "exitTime",
              amount_paid   AS "amountPaid"
       FROM entries
       WHERE exit_time IS NOT NULL
         AND (exit_time AT TIME ZONE 'America/Bogota')::date = $1::date
       ORDER BY exit_time ASC`,
      [fecha],
    );

    // Plates with active membership on this date
    const membershipRows: { plate: string }[] = await this.membershipRepo.query(
      `SELECT DISTINCT v.plate FROM memberships m
       JOIN vehicles v ON v.id = m.vehicle_id
       WHERE m.start_date <= $1 AND m.end_date >= $1`,
      [fecha],
    );
    const membershipPlates = new Set(membershipRows.map((r) => r.plate));

    // Hourly breakdown by entry hour in Bogotá
    const hourRows: { hora: number; cantidad: number }[] = await this.entryRepo.query(
      `SELECT EXTRACT(HOUR FROM entry_time AT TIME ZONE 'America/Bogota')::int AS hora,
              COUNT(*)::int AS cantidad
       FROM entries
       WHERE (entry_time AT TIME ZONE 'America/Bogota')::date = $1::date
       GROUP BY hora
       ORDER BY hora ASC`,
      [fecha],
    );

    const totalCOP = cobrosRaw.reduce((sum, e) => sum + (e.amountPaid ?? 0), 0);
    const totalVehiculos = entradas.length;
    const mensualidades = entradas.filter((e) => membershipPlates.has(e.plate)).length;
    const visitantes = totalVehiculos - mensualidades;

    const desglosePorHora = hourRows.map((r) => ({
      hora: `${String(r.hora).padStart(2, '0')}:00`,
      cantidad: Number(r.cantidad),
    }));

    const cobros = cobrosRaw.map((e) => {
      const totalMinutes = Math.ceil(
        (new Date(e.exitTime).getTime() - new Date(e.entryTime).getTime()) / 60000,
      );
      return {
        placa: e.plate,
        tipo: e.vehicleType ?? 'car',
        esMensualidad: membershipPlates.has(e.plate),
        horaEntrada: e.entryTime,   // Date object → interceptor → "DD/MM/YYYY HH:mm:ss"
        horaSalida: e.exitTime,
        duracion: formatDuration(totalMinutes),
        monto: e.amountPaid ?? 0,
      };
    });

    return {
      fecha,
      totalCOP,
      totalVehiculos,
      visitantes,
      mensualidades,
      desglosePorHora,
      cobros,
    };
  }
}
