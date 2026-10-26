-- CreateEnum
CREATE TYPE "McpTokenKind" AS ENUM ('PERSONAL', 'OAUTH_ACCESS', 'OAUTH_REFRESH');

-- CreateTable
CREATE TABLE "McpClient" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "clientSecretHash" TEXT,
    "name" TEXT NOT NULL,
    "redirectUris" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "McpClient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "McpAuthCode" (
    "id" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "mcpClientId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "redirectUri" TEXT NOT NULL,
    "codeChallenge" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "resource" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "McpAuthCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "McpToken" (
    "id" TEXT NOT NULL,
    "kind" "McpTokenKind" NOT NULL,
    "userId" TEXT NOT NULL,
    "mcpClientId" TEXT,
    "grantId" TEXT,
    "name" TEXT,
    "tokenHash" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'crm:read',
    "expiresAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "McpToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "McpClient_clientId_key" ON "McpClient"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "McpAuthCode_codeHash_key" ON "McpAuthCode"("codeHash");

-- CreateIndex
CREATE INDEX "McpAuthCode_userId_idx" ON "McpAuthCode"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "McpToken_tokenHash_key" ON "McpToken"("tokenHash");

-- CreateIndex
CREATE INDEX "McpToken_userId_kind_idx" ON "McpToken"("userId", "kind");

-- CreateIndex
CREATE INDEX "McpToken_grantId_idx" ON "McpToken"("grantId");

-- AddForeignKey
ALTER TABLE "McpAuthCode" ADD CONSTRAINT "McpAuthCode_mcpClientId_fkey" FOREIGN KEY ("mcpClientId") REFERENCES "McpClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "McpAuthCode" ADD CONSTRAINT "McpAuthCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "McpToken" ADD CONSTRAINT "McpToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "McpToken" ADD CONSTRAINT "McpToken_mcpClientId_fkey" FOREIGN KEY ("mcpClientId") REFERENCES "McpClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Comme les autres tables : invisibles pour l'API de données Supabase (RLS sans politique).
-- Le propriétaire des tables (rôle de l'application) n'est pas concerné.
ALTER TABLE "McpClient" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "McpAuthCode" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "McpToken" ENABLE ROW LEVEL SECURITY;
