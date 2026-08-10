import { Module } from '@nestjs/common';
import { DenyStaffIdentityAdapter } from './deny-staff-identity.adapter.js';
import { STAFF_IDENTITY_PORT } from './staff-identity.port.js';
import { StaffAuthService } from './staff-auth.service.js';
import { TestStaffIdentityAdapter } from './test-staff-identity.adapter.js';

@Module({
  providers: [
    DenyStaffIdentityAdapter,
    TestStaffIdentityAdapter,
    {
      provide: STAFF_IDENTITY_PORT,
      inject: [TestStaffIdentityAdapter, DenyStaffIdentityAdapter],
      useFactory: (testAdapter: TestStaffIdentityAdapter, denyAdapter: DenyStaffIdentityAdapter) =>
        process.env.STAFF_AUTH_MODE === 'test' ? testAdapter : denyAdapter,
    },
    StaffAuthService,
  ],
  exports: [StaffAuthService],
})
export class AuthModule {}
