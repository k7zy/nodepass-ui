/*
  Warnings:

  - The values [INITIAL,CREATE,UPDATE,DELETE,SHUTDOWN,LOG] on the enum `SSEEventType` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "SSEEventType_new" AS ENUM ('initial', 'create', 'update', 'delete', 'shutdown', 'log');
ALTER TABLE "EndpointSSE" ALTER COLUMN "eventType" TYPE "SSEEventType_new" USING ("eventType"::text::"SSEEventType_new");
ALTER TYPE "SSEEventType" RENAME TO "SSEEventType_old";
ALTER TYPE "SSEEventType_new" RENAME TO "SSEEventType";
DROP TYPE "SSEEventType_old";
COMMIT;
