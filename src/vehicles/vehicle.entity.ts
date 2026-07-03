import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { Client } from '../clients/client.entity';
import { Membership } from '../memberships/membership.entity';

export enum VehicleType {
  CAR = 'car',
  MOTO = 'moto',
  TRUCK = 'truck',
}

export enum VehicleStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

@Entity('vehicles')
export class Vehicle {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'client_id', nullable: true })
  clientId: number | null;

  @Column({ length: 10, unique: true })
  plate: string;

  @Column({ type: 'enum', enum: VehicleType })
  type: VehicleType;

  @Column({ length: 50, nullable: true })
  brand: string | null;

  @Column({ length: 30, nullable: true })
  color: string | null;

  @Column({ type: 'enum', enum: VehicleStatus, default: VehicleStatus.ACTIVE })
  status: VehicleStatus;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => Client, { eager: false, nullable: true })
  @JoinColumn({ name: 'client_id' })
  client: Client | null;

  @OneToMany(() => Membership, (m) => m.vehicle, { eager: false })
  memberships: Membership[];
}
