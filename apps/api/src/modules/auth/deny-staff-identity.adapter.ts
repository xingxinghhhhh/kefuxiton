import { Injectable } from '@nestjs/common';
import type { StaffIdentityPort, StaffPrincipal } from './staff-identity.port.js';

@Injectable()
export class DenyStaffIdentityAdapter implements StaffIdentityPort {
  authenticate(_authorization?: string): StaffPrincipal | null {
    return null;
  }
}
