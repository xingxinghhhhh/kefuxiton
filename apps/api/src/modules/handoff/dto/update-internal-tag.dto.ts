import { IsIn, IsNotEmpty, IsString } from 'class-validator';
import type { InternalTag } from '@ai-agent/contracts';

export const INTERNAL_TAGS: readonly InternalTag[] = ['urgent', 'billing', 'technical', 'follow_up'];

export class UpdateInternalTagDto {
  @IsString()
  @IsNotEmpty()
  @IsIn(INTERNAL_TAGS)
  tag!: InternalTag;
}
