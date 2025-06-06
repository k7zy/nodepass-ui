-- AlterTable
ALTER TABLE "Tunnel" ADD COLUMN "lastEventTime" DATETIME;

-- CreateIndex
CREATE INDEX "Tunnel_lastEventTime_idx" ON "Tunnel"("lastEventTime");
