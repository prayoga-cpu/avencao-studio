-- AlterTable
ALTER TABLE "AuditEvent" ADD COLUMN     "mcpTokenId" TEXT,
ADD COLUMN     "via" TEXT;

-- AlterTable
ALTER TABLE "DirectCost" ADD COLUMN     "documentRef" TEXT;

-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "documentRef" TEXT;

-- CreateTable
CREATE TABLE "McpUploadTicket" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mcpTokenId" TEXT,
    "ownerType" "AttachmentOwner" NOT NULL,
    "ownerId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "attachmentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "McpUploadTicket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "McpUploadTicket_tokenHash_key" ON "McpUploadTicket"("tokenHash");

-- CreateIndex
CREATE INDEX "McpUploadTicket_userId_idx" ON "McpUploadTicket"("userId");

-- CreateIndex
CREATE INDEX "McpUploadTicket_expiresAt_idx" ON "McpUploadTicket"("expiresAt");

-- CreateIndex
CREATE INDEX "AuditEvent_via_createdAt_idx" ON "AuditEvent"("via", "createdAt");

-- CreateIndex
CREATE INDEX "DirectCost_documentRef_idx" ON "DirectCost"("documentRef");

-- CreateIndex
CREATE INDEX "Expense_documentRef_idx" ON "Expense"("documentRef");

-- AddForeignKey
ALTER TABLE "McpUploadTicket" ADD CONSTRAINT "McpUploadTicket_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Comme les autres tables : invisible pour l'API de données Supabase (RLS sans politique).
-- Le propriétaire des tables (rôle de l'application) n'est pas concerné.
ALTER TABLE "McpUploadTicket" ENABLE ROW LEVEL SECURITY;
