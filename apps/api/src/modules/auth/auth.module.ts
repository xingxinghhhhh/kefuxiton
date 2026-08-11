import { Module } from '@nestjs/common';
import { getStaffAuthMode, staffCapabilityFromMode } from '@ai-agent/config';
import { DenyStaffIdentityAdapter } from './deny-staff-identity.adapter.js';
import { STAFF_IDENTITY_CAPABILITY, STAFF_IDENTITY_PORT } from './staff-identity.port.js';
import { StaffAuthService } from './staff-auth.service.js';
import { TestStaffIdentityAdapter } from './test-staff-identity.adapter.js';

@Module({
  providers: [
    DenyStaffIdentityAdapter,
    TestStaffIdentityAdapter,
    { provide: STAFF_IDENTITY_CAPABILITY, inject: [], useFactory: () => staffCapabilityFromMode(getStaffAuthMode(process.env)) },
    {
      provide: STAFF_IDENTITY_PORT,
      inject: [TestStaffIdentityAdapter, DenyStaffIdentityAdapter],
      useFactory: (testAdapter: TestStaffIdentityAdapter, denyAdapter: DenyStaffIdentityAdapter) =>
        getStaffAuthMode(process.env) === 'test' ? testAdapter : denyAdapter,
    },
    StaffAuthService,
  ],
  exports: [StaffAuthService],
})
export class AuthModule {}
