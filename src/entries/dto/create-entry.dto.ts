import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class CreateEntryDto {
  @IsNotEmpty({ message: 'La placa es obligatoria' })
  @IsString()
  @Matches(/^[A-Za-z0-9]{3,10}$/, {
    message: 'La placa debe tener entre 3 y 10 caracteres alfanuméricos',
  })
  plate: string;
}
