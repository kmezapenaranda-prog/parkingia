import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Length, Min } from 'class-validator';

export class RegisterEntryDto {
  @IsInt()
  @Min(1)
  tenantId: number;

  @IsString()
  @IsNotEmpty()
  @Length(1, 10)
  plate: string;

  @IsOptional()
  @IsIn(['car', 'moto'])
  vehicleType?: 'car' | 'moto';
}
