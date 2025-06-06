-- CreateTable
CREATE TABLE "Endpoint" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "apiPath" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OFFLINE',
    "lastCheck" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "color" TEXT DEFAULT 'default',
    "tunnelCount" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "Tunnel" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "endpointId" INTEGER NOT NULL,
    "mode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'stopped',
    "tunnelAddress" TEXT NOT NULL,
    "tunnelPort" TEXT NOT NULL,
    "targetAddress" TEXT NOT NULL,
    "targetPort" TEXT NOT NULL,
    "tlsMode" TEXT NOT NULL,
    "certPath" TEXT,
    "keyPath" TEXT,
    "logLevel" TEXT NOT NULL DEFAULT 'info',
    "commandLine" TEXT NOT NULL,
    "instanceId" TEXT,
    "tcpRx" BIGINT DEFAULT 0,
    "tcpTx" BIGINT DEFAULT 0,
    "udpRx" BIGINT DEFAULT 0,
    "udpTx" BIGINT DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Tunnel_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "Endpoint" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TunnelOperationLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tunnelId" INTEGER,
    "tunnelName" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "message" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "EndpointSSE" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "eventType" TEXT NOT NULL,
    "pushType" TEXT NOT NULL,
    "eventTime" DATETIME NOT NULL,
    "endpointId" INTEGER NOT NULL,
    "instanceId" TEXT NOT NULL,
    "instanceType" TEXT,
    "status" TEXT,
    "url" TEXT,
    "tcpRx" BIGINT DEFAULT 0,
    "tcpTx" BIGINT DEFAULT 0,
    "udpRx" BIGINT DEFAULT 0,
    "udpTx" BIGINT DEFAULT 0,
    "logs" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EndpointSSE_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "Endpoint" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SystemConfig" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "UserSession" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "sessionId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true
);

-- CreateIndex
CREATE UNIQUE INDEX "Endpoint_name_key" ON "Endpoint"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Endpoint_url_key" ON "Endpoint"("url");

-- CreateIndex
CREATE INDEX "Endpoint_status_idx" ON "Endpoint"("status");

-- CreateIndex
CREATE INDEX "Endpoint_createdAt_idx" ON "Endpoint"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Tunnel_name_key" ON "Tunnel"("name");

-- CreateIndex
CREATE INDEX "Tunnel_status_idx" ON "Tunnel"("status");

-- CreateIndex
CREATE INDEX "Tunnel_createdAt_idx" ON "Tunnel"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Tunnel_endpointId_instanceId_key" ON "Tunnel"("endpointId", "instanceId");

-- CreateIndex
CREATE INDEX "TunnelOperationLog_tunnelId_idx" ON "TunnelOperationLog"("tunnelId");

-- CreateIndex
CREATE INDEX "TunnelOperationLog_createdAt_idx" ON "TunnelOperationLog"("createdAt");

-- CreateIndex
CREATE INDEX "EndpointSSE_endpointId_eventTime_idx" ON "EndpointSSE"("endpointId", "eventTime");

-- CreateIndex
CREATE INDEX "EndpointSSE_instanceId_eventTime_idx" ON "EndpointSSE"("instanceId", "eventTime");

-- CreateIndex
CREATE INDEX "EndpointSSE_status_idx" ON "EndpointSSE"("status");

-- CreateIndex
CREATE INDEX "EndpointSSE_eventType_idx" ON "EndpointSSE"("eventType");

-- CreateIndex
CREATE INDEX "EndpointSSE_pushType_idx" ON "EndpointSSE"("pushType");

-- CreateIndex
CREATE UNIQUE INDEX "SystemConfig_key_key" ON "SystemConfig"("key");

-- CreateIndex
CREATE INDEX "SystemConfig_key_idx" ON "SystemConfig"("key");

-- CreateIndex
CREATE UNIQUE INDEX "UserSession_sessionId_key" ON "UserSession"("sessionId");

-- CreateIndex
CREATE INDEX "UserSession_sessionId_idx" ON "UserSession"("sessionId");

-- CreateIndex
CREATE INDEX "UserSession_username_idx" ON "UserSession"("username");

-- CreateIndex
CREATE INDEX "UserSession_expiresAt_idx" ON "UserSession"("expiresAt");
