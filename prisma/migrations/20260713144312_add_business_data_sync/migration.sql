-- AlterTable
ALTER TABLE "Shop" ADD COLUMN     "lastDataSyncAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "SyncedProduct" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "localId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT,
    "barcode" TEXT,
    "category" TEXT,
    "costPrice" DOUBLE PRECISION NOT NULL,
    "sellingPrice" DOUBLE PRECISION NOT NULL,
    "gstRate" DOUBLE PRECISION NOT NULL,
    "stockQuantity" INTEGER NOT NULL,
    "reorderLevel" INTEGER NOT NULL,
    "imagePath" TEXT,
    "isActive" BOOLEAN NOT NULL,
    "localCreatedAt" TIMESTAMP(3) NOT NULL,
    "localUpdatedAt" TIMESTAMP(3) NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyncedProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncedCustomer" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "localId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "totalPurchases" DOUBLE PRECISION NOT NULL,
    "totalBills" INTEGER NOT NULL,
    "totalOutstanding" DOUBLE PRECISION NOT NULL,
    "advanceBalance" DOUBLE PRECISION NOT NULL,
    "lastVisit" TIMESTAMP(3),
    "localCreatedAt" TIMESTAMP(3) NOT NULL,
    "localUpdatedAt" TIMESTAMP(3) NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyncedCustomer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncedInvoice" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "localId" INTEGER NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "localCustomerId" INTEGER,
    "customerName" TEXT NOT NULL,
    "subtotal" DOUBLE PRECISION NOT NULL,
    "discountType" TEXT NOT NULL,
    "discountValue" DOUBLE PRECISION NOT NULL,
    "discountAmount" DOUBLE PRECISION NOT NULL,
    "gstAmount" DOUBLE PRECISION NOT NULL,
    "grandTotal" DOUBLE PRECISION NOT NULL,
    "receivedAmount" DOUBLE PRECISION NOT NULL,
    "pendingAmount" DOUBLE PRECISION NOT NULL,
    "paymentMode" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "notes" TEXT,
    "localCreatedAt" TIMESTAMP(3) NOT NULL,
    "localUpdatedAt" TIMESTAMP(3) NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyncedInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncedInvoiceItem" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "localId" INTEGER NOT NULL,
    "localProductId" INTEGER NOT NULL,
    "productName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "sellingPrice" DOUBLE PRECISION NOT NULL,
    "gstRate" DOUBLE PRECISION NOT NULL,
    "gstAmount" DOUBLE PRECISION NOT NULL,
    "lineTotal" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "SyncedInvoiceItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncedInventoryTransaction" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "localId" INTEGER NOT NULL,
    "localProductId" INTEGER NOT NULL,
    "localInvoiceId" INTEGER,
    "type" TEXT NOT NULL,
    "quantityChange" INTEGER NOT NULL,
    "stockBefore" INTEGER NOT NULL,
    "stockAfter" INTEGER NOT NULL,
    "notes" TEXT,
    "localCreatedAt" TIMESTAMP(3) NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyncedInventoryTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SyncedProduct_shopId_localId_key" ON "SyncedProduct"("shopId", "localId");

-- CreateIndex
CREATE UNIQUE INDEX "SyncedCustomer_shopId_localId_key" ON "SyncedCustomer"("shopId", "localId");

-- CreateIndex
CREATE UNIQUE INDEX "SyncedInvoice_shopId_localId_key" ON "SyncedInvoice"("shopId", "localId");

-- CreateIndex
CREATE UNIQUE INDEX "SyncedInvoiceItem_invoiceId_localId_key" ON "SyncedInvoiceItem"("invoiceId", "localId");

-- CreateIndex
CREATE UNIQUE INDEX "SyncedInventoryTransaction_shopId_localId_key" ON "SyncedInventoryTransaction"("shopId", "localId");

-- AddForeignKey
ALTER TABLE "SyncedProduct" ADD CONSTRAINT "SyncedProduct_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncedCustomer" ADD CONSTRAINT "SyncedCustomer_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncedInvoice" ADD CONSTRAINT "SyncedInvoice_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncedInvoiceItem" ADD CONSTRAINT "SyncedInvoiceItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "SyncedInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncedInventoryTransaction" ADD CONSTRAINT "SyncedInventoryTransaction_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
