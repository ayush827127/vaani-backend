-- AlterTable
ALTER TABLE "SyncedCustomer" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "SyncedInvoice" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "SyncedPaymentTransaction" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "localUpdatedAt" TIMESTAMP(3);

-- Backfill: existing rows never had an edit timestamp before two-way sync.
-- localCreatedAt is the only truthful value available for them.
UPDATE "SyncedPaymentTransaction" SET "localUpdatedAt" = "localCreatedAt" WHERE "localUpdatedAt" IS NULL;

-- AlterTable
ALTER TABLE "SyncedProduct" ADD COLUMN     "deletedAt" TIMESTAMP(3);
