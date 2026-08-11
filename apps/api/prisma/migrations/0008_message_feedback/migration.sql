CREATE TABLE "MessageFeedback" (
    "id" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "messageId" UUID NOT NULL,
    "value" VARCHAR(32) NOT NULL,
    "idempotencyKey" VARCHAR(128) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageFeedback_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MessageFeedback_conversationId_messageId_key" ON "MessageFeedback"("conversationId", "messageId");
CREATE UNIQUE INDEX "MessageFeedback_conversationId_idempotencyKey_key" ON "MessageFeedback"("conversationId", "idempotencyKey");
CREATE INDEX "MessageFeedback_conversationId_createdAt_idx" ON "MessageFeedback"("conversationId", "createdAt");

ALTER TABLE "MessageFeedback" ADD CONSTRAINT "MessageFeedback_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MessageFeedback" ADD CONSTRAINT "MessageFeedback_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;
