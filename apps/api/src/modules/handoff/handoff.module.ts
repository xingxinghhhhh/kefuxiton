import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { HandoffController } from './handoff.controller.js';
import { HandoffService } from './handoff.service.js';

@Module({
  imports: [AuditModule],
  controllers: [HandoffController],
  providers: [HandoffService],
  exports: [HandoffService],
})
export class HandoffModule {}
