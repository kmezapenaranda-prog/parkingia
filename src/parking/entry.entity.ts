import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Tenant } from '../tenants/tenant.entity';
import { Vehicle } from '../vehicles/vehicle.entity';

@Entity('entries')
// Solo puede haber UNA entrada abierta (sin salida) por placa y negocio.
// Índice parcial de Postgres: evita ingresos duplicados aunque el fetch
// se dispare dos veces por reintentos/red.
@Index('uq_entries_open', ['tenantId', 'plate'], {
  unique: true,
  where: '"exit_time" IS NULL',
})
export class Entry {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'tenant_id' })
  tenantId: number;

  @ManyToOne(() => Tenant, { eager: false })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column({ length: 10 })
  plate: string;

  @CreateDateColumn({ name: 'entry_time' })
  entryTime: Date;

  @Column({ name: 'exit_time', type: 'timestamptz', nullable: true })
  exitTime: Date | null;

  @Column({ name: 'amount_paid', type: 'int', nullable: true })
  amountPaid: number | null;

  @Column({ name: 'vehicle_type', length: 10, nullable: true })
  vehicleType: string | null;

  @Column({ name: 'vehicle_id', nullable: true })
  vehicleId: number | null;

  @ManyToOne(() => Vehicle, { eager: false })
  @JoinColumn({ name: 'vehicle_id' })
  vehicle: Vehicle | null;
}
