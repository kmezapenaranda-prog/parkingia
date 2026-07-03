import { IsNotEmpty, IsString, Length } from 'class-validator';

export class RegisterEntryDto {
  @IsString()
  @IsNotEmpty()
  @Length(1, 10)
  plate: string;
}
