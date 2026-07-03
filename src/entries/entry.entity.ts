import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('entries')
export class Entry {
  @PrimaryGeneratedColumn()
  id: number;

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
}
