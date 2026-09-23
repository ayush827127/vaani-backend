-- Rename Product -> Item across the sync tables. The app now bills both
-- physical products and non-inventory services through one catalog.
-- Renames are metadata-only (data, ids and relations are untouched);
-- existing rows come back with itemType='PRODUCT', inventoryEnabled=true,
-- i.e. exactly their current behavior.

-- AlterTable
ALTER TABLE "SyncedProduct" RENAME TO "SyncedItem";
ALTER TABLE "SyncedItem" ADD COLUMN "itemType" TEXT NOT NULL DEFAULT 'PRODUCT';
ALTER TABLE "SyncedItem" ADD COLUMN "inventoryEnabled" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "SyncedInvoiceItem" RENAME COLUMN "localProductId" TO "localItemId";
ALTER TABLE "SyncedInvoiceItem" RENAME COLUMN "productName" TO "itemName";
ALTER TABLE "SyncedInvoiceItem" ADD COLUMN "itemType" TEXT NOT NULL DEFAULT 'PRODUCT';

-- AlterTable
ALTER TABLE "SyncedInventoryTransaction" RENAME COLUMN "localProductId" TO "localItemId";
