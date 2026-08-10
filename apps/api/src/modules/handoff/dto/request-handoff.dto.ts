import { IsIn } from 'class-validator';

export class RequestHandoffDto {
  @IsIn(['customer_requested'])
  reasonCode!: 'customer_requested';
}
