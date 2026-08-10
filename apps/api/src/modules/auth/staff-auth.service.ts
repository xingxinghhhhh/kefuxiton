import { ForbiddenException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { StaffPermission } from '@ai-agent/contracts';
import { STAFF_IDENTITY_PORT, type StaffIdentityPort, type StaffPrincipal } from './staff-identity.port.js';

@Injectable()
export class StaffAuthService {
  constructor(@Inject(STAFF_IDENTITY_PORT) private readonly identity: StaffIdentityPort) {}

  require(authorization: string | undefined, permission: StaffPermission): StaffPrincipal {
    const principal = this.identity.authenticate(authorization);
    if (!principal) throw new UnauthorizedException('Staff 身份无效。');
    if (!principal.permissions.includes(permission)) throw new ForbiddenException('Staff 权限不足。');
    return principal;
  }
}
