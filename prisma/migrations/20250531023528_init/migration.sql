-- CreateEnum
CREATE TYPE "EndpointStatus" AS ENUM ('ONLINE', 'OFFLINE', 'FAIL');

-- CreateEnum
CREATE TYPE "SSEEventType" AS ENUM ('INITIAL', 'CREATE', 'UPDATE', 'DELETE', 'SHUTDOWN', 'LOG');

-- CreateEnum
CREATE TYPE "TunnelStatus" AS ENUM ('running', 'stopped', 'error');

-- CreateEnum
CREATE TYPE "TunnelMode" AS ENUM ('server', 'client');

-- CreateEnum
CREATE TYPE "TLSMode" AS ENUM ('mode0', 'mode1', 'mode2');

-- CreateEnum
CREATE TYPE "LogLevel" AS ENUM ('debug', 'info', 'warn', 'error', 'fatal');

-- CreateTable
CREATE TABLE "Endpoint" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "apiPath" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL,
    "status" "EndpointStatus" NOT NULL DEFAULT 'OFFLINE',
    "lastCheck" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "color" TEXT DEFAULT 'default',
    "tunnelCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Endpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tunnel" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "endpointId" INTEGER NOT NULL,
    "mode" "TunnelMode" NOT NULL,
    "status" "TunnelStatus" NOT NULL DEFAULT 'stopped',
    "tunnelAddress" TEXT NOT NULL,
    "tunnelPort" TEXT NOT NULL,
    "targetAddress" TEXT NOT NULL,
    "targetPort" TEXT NOT NULL,
    "tlsMode" "TLSMode" NOT NULL,
    "certPath" TEXT,
    "keyPath" TEXT,
    "logLevel" "LogLevel" NOT NULL DEFAULT 'info',
    "commandLine" TEXT NOT NULL,
    "instanceId" TEXT,
    "tcpRx" BIGINT DEFAULT 0,
    "tcpTx" BIGINT DEFAULT 0,
    "udpRx" BIGINT DEFAULT 0,
    "udpTx" BIGINT DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tunnel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TunnelOperationLog" (
    "id" SERIAL NOT NULL,
    "tunnelId" INTEGER,
    "tunnelName" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TunnelOperationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EndpointSSE" (
    "id" SERIAL NOT NULL,
    "eventType" "SSEEventType" NOT NULL,
    "pushType" TEXT NOT NULL,
    "eventTime" TIMESTAMP(3) NOT NULL,
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EndpointSSE_pkey" PRIMARY KEY ("id")
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

-- AddForeignKey
ALTER TABLE "Tunnel" ADD CONSTRAINT "Tunnel_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "Endpoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EndpointSSE" ADD CONSTRAINT "EndpointSSE_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "Endpoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;
