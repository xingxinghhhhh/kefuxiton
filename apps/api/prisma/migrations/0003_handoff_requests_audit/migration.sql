CREATE TYPE "HandoffRequestStatus" AS ENUM ('requested', 'closed');

CREATE TABLE "HandoffRequest" (
    "id" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "status" "HandoffRequestStatus" NOT NULL DEFAULT 'requested',
    "reasonCode" VARCHAR(64) NOT NULL,
    "activeKey" VARCHAR(64),
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),
    CONSTRAINT "HandoffRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuditEvent" (
    "id" UUID NOT NULL,
    "conversationId" UUID,
    "handoffRequestId" UUID,
    "actorType" VARCHAR(32) NOT NULL,
    "action" VARCHAR(64) NOT NULL,
    "outcome" VARCHAR(32) NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "HandoffRequest_activeKey_key" ON "HandoffRequest"("activeKey");
CREATE INDEX "HandoffRequest_conversationId_status_requestedAt_idx" ON "HandoffRequest"("conversationId", "status", "requestedAt");
CREATE INDEX "AuditEvent_conversationId_createdAt_idx" ON "AuditEvent"("conversationId", "createdAt");
CREATE INDEX "AuditEvent_handoffRequestId_createdAt_idx" ON "AuditEvent"("handoffRequestId", "createdAt");

ALTER TABLE "HandoffRequest" ADD CONSTRAINT "HandoffRequest_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_handoffRequestId_fkey" FOREIGN KEY ("handoffRequestId") REFERENCES "HandoffRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
