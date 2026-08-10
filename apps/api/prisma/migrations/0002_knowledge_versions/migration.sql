CREATE TYPE "KnowledgeVersionStatus" AS ENUM ('draft', 'published', 'superseded', 'expired', 'local_eval');

CREATE TABLE "KnowledgeDocument" (
    "id" UUID NOT NULL,
    "sourceId" VARCHAR(255) NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "KnowledgeDocument_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "KnowledgeVersion" (
    "id" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "version" VARCHAR(64) NOT NULL,
    "status" "KnowledgeVersionStatus" NOT NULL,
    "sourceRef" VARCHAR(500),
    "sourceStatus" VARCHAR(64),
    "contentSha256" VARCHAR(64),
    "effectiveAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "approvedBy" VARCHAR(255),
    "approvedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "rawContent" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "KnowledgeVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "KnowledgeChunk" (
    "id" UUID NOT NULL,
    "knowledgeVersionId" UUID NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "heading" VARCHAR(255) NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "conditions" TEXT NOT NULL,
    "exceptions" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "contentSha256" VARCHAR(64) NOT NULL,
    "sourceLocator" VARCHAR(255) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "KnowledgeChunk_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "KnowledgeDocument_sourceId_key" ON "KnowledgeDocument"("sourceId");
CREATE UNIQUE INDEX "KnowledgeVersion_documentId_version_key" ON "KnowledgeVersion"("documentId", "version");
CREATE INDEX "KnowledgeVersion_status_effectiveAt_expiresAt_idx" ON "KnowledgeVersion"("status", "effectiveAt", "expiresAt");
CREATE UNIQUE INDEX "KnowledgeChunk_knowledgeVersionId_ordinal_key" ON "KnowledgeChunk"("knowledgeVersionId", "ordinal");
CREATE INDEX "KnowledgeChunk_knowledgeVersionId_ordinal_idx" ON "KnowledgeChunk"("knowledgeVersionId", "ordinal");

ALTER TABLE "KnowledgeVersion" ADD CONSTRAINT "KnowledgeVersion_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "KnowledgeDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "KnowledgeChunk" ADD CONSTRAINT "KnowledgeChunk_knowledgeVersionId_fkey" FOREIGN KEY ("knowledgeVersionId") REFERENCES "KnowledgeVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
