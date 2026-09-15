-- CreateTable
CREATE TABLE "SyncedPaymentTransaction" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "localId" INTEGER NOT NULL,
    "localCustomerId" INTEGER NOT NULL,
    "localInvoiceId" INTEGER,
    "type" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "paymentMode" TEXT NOT NULL,
    "notes" TEXT,
    "localCreatedAt" TIMESTAMP(3) NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyncedPaymentTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SyncedPaymentTransaction_shopId_localId_key" ON "SyncedPaymentTransaction"("shopId", "localId");

-- AddForeignKey
ALTER TABLE "SyncedPaymentTransaction" ADD CONSTRAINT "SyncedPaymentTransaction_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
