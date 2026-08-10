ALTER TYPE "HandoffRequestStatus" ADD VALUE 'claimed';

ALTER TABLE "HandoffRequest"
    ADD COLUMN "claimedBy" VARCHAR(255),
    ADD COLUMN "claimedAt" TIMESTAMP(3);

ALTER TABLE "AuditEvent"
    ADD COLUMN "actorId" VARCHAR(255);
