ALTER TABLE "Message"
    ADD COLUMN "senderType" VARCHAR(32);

CREATE TABLE "OperatorReply" (
    "id" UUID NOT NULL,
    "handoffRequestId" UUID NOT NULL,
    "messageId" UUID NOT NULL,
    "operatorId" VARCHAR(255) NOT NULL,
    "idempotencyKey" VARCHAR(128) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperatorReply_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OperatorReply_messageId_key" ON "OperatorReply"("messageId");
CREATE UNIQUE INDEX "OperatorReply_handoffRequestId_idempotencyKey_key" ON "OperatorReply"("handoffRequestId", "idempotencyKey");
CREATE INDEX "OperatorReply_operatorId_createdAt_idx" ON "OperatorReply"("operatorId", "createdAt");

ALTER TABLE "OperatorReply"
    ADD CONSTRAINT "OperatorReply_handoffRequestId_fkey"
    FOREIGN KEY ("handoffRequestId") REFERENCES "HandoffRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OperatorReply"
    ADD CONSTRAINT "OperatorReply_messageId_fkey"
    FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;
