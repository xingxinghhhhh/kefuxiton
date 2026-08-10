import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { HandoffController } from './handoff.controller.js';
import { HandoffService } from './handoff.service.js';
import { StaffHandoffController } from './staff-handoff.controller.js';

@Module({
  imports: [AuditModule, AuthModule],
  controllers: [HandoffController, StaffHandoffController],
  providers: [HandoffService],
  exports: [HandoffService],
})
export class HandoffModule {}
