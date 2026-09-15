-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('SUPERADMIN', 'SUPPORT');

-- CreateEnum
CREATE TYPE "ShopStatus" AS ENUM ('TRIAL', 'ACTIVE', 'SUSPENDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BillingCycle" AS ENUM ('MONTHLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIAL', 'ACTIVE', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ShopUserRole" AS ENUM ('OWNER', 'MANAGER', 'CASHIER');

-- CreateTable
CREATE TABLE "AdminUser" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" "AdminRole" NOT NULL DEFAULT 'SUPERADMIN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shop" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownerName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "address" TEXT,
    "status" "ShopStatus" NOT NULL DEFAULT 'TRIAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Module" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Module_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Plan" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "billingCycle" "BillingCycle" NOT NULL DEFAULT 'MONTHLY',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanModule" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,

    CONSTRAINT "PlanModule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopModuleOverride" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,

    CONSTRAINT "ShopModuleOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'TRIAL',
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endDate" TIMESTAMP(3),
    "autoRenew" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopUser" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "role" "ShopUserRole" NOT NULL DEFAULT 'CASHIER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopUserModuleAccess" (
    "id" TEXT NOT NULL,
    "shopUserId" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "canView" BOOLEAN NOT NULL DEFAULT true,
    "canEdit" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ShopUserModuleAccess_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_email_key" ON "AdminUser"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Shop_phone_key" ON "Shop"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "Module_key_key" ON "Module"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Plan_name_key" ON "Plan"("name");

-- CreateIndex
CREATE UNIQUE INDEX "PlanModule_planId_moduleId_key" ON "PlanModule"("planId", "moduleId");

-- CreateIndex
CREATE UNIQUE INDEX "ShopModuleOverride_shopId_moduleId_key" ON "ShopModuleOverride"("shopId", "moduleId");

-- CreateIndex
CREATE UNIQUE INDEX "ShopUser_shopId_phone_key" ON "ShopUser"("shopId", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "ShopUserModuleAccess_shopUserId_moduleId_key" ON "ShopUserModuleAccess"("shopUserId", "moduleId");

-- AddForeignKey
ALTER TABLE "PlanModule" ADD CONSTRAINT "PlanModule_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanModule" ADD CONSTRAINT "PlanModule_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "Module"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopModuleOverride" ADD CONSTRAINT "ShopModuleOverride_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopModuleOverride" ADD CONSTRAINT "ShopModuleOverride_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "Module"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopUser" ADD CONSTRAINT "ShopUser_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopUserModuleAccess" ADD CONSTRAINT "ShopUserModuleAccess_shopUserId_fkey" FOREIGN KEY ("shopUserId") REFERENCES "ShopUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopUserModuleAccess" ADD CONSTRAINT "ShopUserModuleAccess_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "Module"("id") ON DELETE CASCADE ON UPDATE CASCADE;
