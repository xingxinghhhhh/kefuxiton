import { IsIn, IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';
import { FEEDBACK_VALUES, type FeedbackValue } from '@ai-agent/contracts';

export class SubmitMessageFeedbackDto {
  @IsIn(FEEDBACK_VALUES)
  value!: FeedbackValue;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  @Matches(/^[A-Za-z0-9._:-]+$/u)
  idempotencyKey!: string;
}
