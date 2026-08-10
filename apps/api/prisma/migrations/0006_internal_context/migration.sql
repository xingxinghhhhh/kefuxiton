CREATE TABLE "InternalNote" (
    "id" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "handoffRequestId" UUID NOT NULL,
    "operatorId" VARCHAR(255) NOT NULL,
    "content" VARCHAR(2000) NOT NULL,
    "idempotencyKey" VARCHAR(128) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InternalNote_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ConversationTag" (
    "id" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "handoffRequestId" UUID NOT NULL,
    "tag" VARCHAR(32) NOT NULL,
    "operatorId" VARCHAR(255) NOT NULL,
    "operationKey" VARCHAR(128) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "removedAt" TIMESTAMP(3),
    CONSTRAINT "ConversationTag_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InternalNote_handoffRequestId_idempotencyKey_key" ON "InternalNote"("handoffRequestId", "idempotencyKey");
CREATE INDEX "InternalNote_conversationId_createdAt_idx" ON "InternalNote"("conversationId", "createdAt");
CREATE INDEX "InternalNote_handoffRequestId_createdAt_idx" ON "InternalNote"("handoffRequestId", "createdAt");
CREATE UNIQUE INDEX "ConversationTag_handoffRequestId_tag_key" ON "ConversationTag"("handoffRequestId", "tag");
CREATE INDEX "ConversationTag_conversationId_active_tag_idx" ON "ConversationTag"("conversationId", "active", "tag");
CREATE INDEX "ConversationTag_handoffRequestId_active_idx" ON "ConversationTag"("handoffRequestId", "active");

ALTER TABLE "InternalNote" ADD CONSTRAINT "InternalNote_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InternalNote" ADD CONSTRAINT "InternalNote_handoffRequestId_fkey" FOREIGN KEY ("handoffRequestId") REFERENCES "HandoffRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConversationTag" ADD CONSTRAINT "ConversationTag_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConversationTag" ADD CONSTRAINT "ConversationTag_handoffRequestId_fkey" FOREIGN KEY ("handoffRequestId") REFERENCES "HandoffRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
