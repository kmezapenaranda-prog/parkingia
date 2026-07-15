import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Entry } from '../parking/entry.entity';
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

  async getCajaReport(fecha: string, tenantId: number) {
    // Vehicles that entered on this date (for count, hourly breakdown, visitor classification)
    const entradas: { plate: string }[] = await this.entryRepo.query(
      `SELECT plate FROM entries
       WHERE tenant_id = $2
         AND (entry_time AT TIME ZONE 'America/Bogota')::date = $1::date`,
      [fecha, tenantId],
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
       WHERE tenant_id = $2
         AND exit_time IS NOT NULL
         AND (exit_time AT TIME ZONE 'America/Bogota')::date = $1::date
       ORDER BY exit_time ASC`,
      [fecha, tenantId],
    );

    // Plates with active membership on this date
    const membershipRows: { plate: string }[] = await this.membershipRepo.query(
      `SELECT DISTINCT v.plate FROM memberships m
       JOIN vehicles v ON v.id = m.vehicle_id
       WHERE m.tenant_id = $2 AND m.start_date <= $1 AND m.end_date >= $1`,
      [fecha, tenantId],
    );
    const membershipPlates = new Set(membershipRows.map((r) => r.plate));

    // Membership payments (nuevas + renovaciones) realizados este día → suman al ingreso del día
    const pagosMensualidadesRaw: Array<{
      plate: string;
      price: string;
      paidAt: Date;
    }> = await this.membershipRepo.query(
      `SELECT v.plate AS plate, m.price AS price, m.paid_at AS "paidAt"
       FROM memberships m
       JOIN vehicles v ON v.id = m.vehicle_id
       WHERE m.tenant_id = $2
         AND m.paid_at IS NOT NULL
         AND (m.paid_at AT TIME ZONE 'America/Bogota')::date = $1::date
       ORDER BY m.paid_at ASC`,
      [fecha, tenantId],
    );

    // Hourly breakdown by entry hour in Bogotá
    const hourRows: { hora: number; cantidad: number }[] = await this.entryRepo.query(
      `SELECT EXTRACT(HOUR FROM entry_time AT TIME ZONE 'America/Bogota')::int AS hora,
              COUNT(*)::int AS cantidad
       FROM entries
       WHERE tenant_id = $2
         AND (entry_time AT TIME ZONE 'America/Bogota')::date = $1::date
       GROUP BY hora
       ORDER BY hora ASC`,
      [fecha, tenantId],
    );

    const ingresosMensualidades = pagosMensualidadesRaw.reduce((sum, p) => sum + Number(p.price), 0);
    const totalCOP = cobrosRaw.reduce((sum, e) => sum + (e.amountPaid ?? 0), 0) + ingresosMensualidades;
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

    const cobrosMensualidades = pagosMensualidadesRaw.map((p) => ({
      placa: p.plate,
      tipo: 'Mensualidad',
      esMensualidad: true,
      horaEntrada: p.paidAt,
      horaSalida: p.paidAt,
      duracion: 'Pago mensual',
      monto: Number(p.price),
    }));

    return {
      fecha,
      totalCOP,
      totalVehiculos,
      visitantes,
      mensualidades,
      ingresosMensualidades,
      desglosePorHora,
      cobros: [...cobros, ...cobrosMensualidades],
    };
  }
}
