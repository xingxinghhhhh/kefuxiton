import { IsOptional, IsString } from 'class-validator';
import type { CloseReason, ResolutionCode } from '@ai-agent/contracts';

export class CloseHandoffDto {
  @IsOptional()
  @IsString()
  closeReason?: CloseReason;

  @IsOptional()
  @IsString()
  resolutionCode?: ResolutionCode;
}
