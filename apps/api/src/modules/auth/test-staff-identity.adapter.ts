import { Injectable } from '@nestjs/common';
import type { StaffPermission } from '@ai-agent/contracts';
import type { StaffIdentityPort, StaffPrincipal } from './staff-identity.port.js';

const TEST_PERMISSIONS: StaffPermission[] = [
  'handoff:read',
  'handoff:claim',
  'handoff:close',
  'handoff:reply',
  'handoff:context',
  'conversation:read',
];

@Injectable()
export class TestStaffIdentityAdapter implements StaffIdentityPort {
  authenticate(authorization?: string): StaffPrincipal | null {
    if (process.env.STAFF_AUTH_MODE !== 'test') return null;
    const token = process.env.AI_AGENT_TEST_STAFF_TOKEN;
    if (!token || authorization !== `Staff ${token}`) return null;
    return {
      staffId: process.env.AI_AGENT_TEST_STAFF_ID ?? 'test-operator',
      permissions: TEST_PERMISSIONS,
    };
  }
}
