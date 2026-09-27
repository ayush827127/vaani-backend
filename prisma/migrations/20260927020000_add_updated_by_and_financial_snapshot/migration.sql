-- AlterTable
ALTER TABLE "SyncedItem" ADD COLUMN     "updatedByUserId" TEXT;

-- AlterTable
ALTER TABLE "SyncedCustomer" ADD COLUMN     "updatedByUserId" TEXT;

-- AlterTable
ALTER TABLE "SyncedInvoice" ADD COLUMN     "updatedByUserId" TEXT;

-- AlterTable
ALTER TABLE "SyncedInventoryTransaction" ADD COLUMN     "updatedByUserId" TEXT;

-- AlterTable
ALTER TABLE "SyncedPaymentTransaction" ADD COLUMN     "updatedByUserId" TEXT,
ADD COLUMN     "customerOutstandingBefore" DOUBLE PRECISION,
ADD COLUMN     "customerAdvanceBefore" DOUBLE PRECISION;
