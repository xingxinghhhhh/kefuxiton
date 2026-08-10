import { IsNotEmpty, IsString, Length, Matches } from 'class-validator';

export class SendStaffReplyDto {
  @IsString()
  @IsNotEmpty()
  @Length(1, 2000)
  content!: string;

  @IsString()
  @Length(1, 128)
  @Matches(/^[A-Za-z0-9._:-]+$/u)
  idempotencyKey!: string;
}
