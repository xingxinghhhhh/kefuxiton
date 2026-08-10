import { IsIn, IsOptional } from 'class-validator';

export class ListStaffHandoffsDto {
  @IsOptional()
  @IsIn(['requested', 'claimed', 'closed'])
  status?: 'requested' | 'claimed' | 'closed';
}
