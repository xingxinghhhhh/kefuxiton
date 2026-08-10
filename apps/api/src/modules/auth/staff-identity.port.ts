import type { StaffPermission } from '@ai-agent/contracts';

export interface StaffPrincipal {
  staffId: string;
  permissions: StaffPermission[];
}

export interface StaffIdentityPort {
  authenticate(authorization?: string): StaffPrincipal | null;
}

export const STAFF_IDENTITY_PORT = Symbol('STAFF_IDENTITY_PORT');
