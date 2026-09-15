-- AlterTable
ALTER TABLE "Shop" ADD COLUMN     "categories" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'INR',
ADD COLUMN     "defaultGstRate" DOUBLE PRECISION NOT NULL DEFAULT 5.0,
ADD COLUMN     "gstEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "upiId" TEXT;

-- AlterTable
ALTER TABLE "SyncedProduct" ADD COLUMN     "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[];
