import { IsNotEmpty, IsString, Length } from 'class-validator';

export class CreateInternalNoteDto {
  @IsString()
  @IsNotEmpty()
  @Length(1, 2000)
  content!: string;
}
