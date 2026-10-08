-- AlterTable: Shop gains a standalone "has this shop ever started its one
-- Pro trial" flag (see trialUsed's doc comment in schema.prisma).
ALTER TABLE "Shop" ADD COLUMN     "trialUsed" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: Plan's two separate invoice caps (lifetime voice,
-- monthly manual) collapse into one combined monthly cap.
ALTER TABLE "Plan" ADD COLUMN     "invoiceMonthlyLimit" INTEGER;

-- Backfill: Basic's combined cap is the same 50/month the business always
-- intended, just counted across voice+manual together now instead of as
-- two separate 50s. Pro/Advanced stay unlimited (NULL).
UPDATE "Plan" SET "invoiceMonthlyLimit" = 50 WHERE "name" = 'Basic';

-- Backfill: mark trialUsed = true for every shop that has EVER had a TRIAL
-- subscription row — active, expired, or since upgraded to paid — so no
-- existing shop can start a second trial once the opt-in flow ships. Done
-- before dropping the old limit columns so this read has no dependency on
-- them.
UPDATE "Shop" SET "trialUsed" = true
WHERE "id" IN (SELECT DISTINCT "shopId" FROM "Subscription" WHERE "status" = 'TRIAL');

-- Retire Advanced as an active, assignable plan — same treatment already
-- used for the old 'Free' plan. Never deleted: existing Subscription/
-- PaymentClaim rows still reference it for history.
UPDATE "Plan" SET "isActive" = false WHERE "name" = 'Advanced';

-- Migrate every shop whose CURRENTLY IN-FORCE subscription is Advanced onto
-- Pro, preserving status/startDate/endDate/autoRenew exactly — Advanced has
-- always had identical functionality to Pro, so this is not a downgrade.
-- "Currently in-force" mirrors getEffectivePlan()'s own rule exactly: the
-- single most-recent Subscription row per shop (by createdAt), with
-- status IN ('ACTIVE','TRIAL') and (endDate IS NULL OR endDate in the
-- future). A fresh row is INSERTed (never an UPDATE of the old Advanced
-- row) so the old row stays intact as history, and the new row's newer
-- createdAt makes it the new "most recent" — i.e. the one getEffectivePlan
-- actually picks up — with zero interruption to the shop.
WITH latest_sub AS (
  SELECT
    s.*,
    ROW_NUMBER() OVER (PARTITION BY s."shopId" ORDER BY s."createdAt" DESC) AS rn
  FROM "Subscription" s
),
advanced_in_force AS (
  SELECT ls.*
  FROM latest_sub ls
  JOIN "Plan" p ON p.id = ls."planId"
  WHERE ls.rn = 1
    AND p."name" = 'Advanced'
    AND ls."status" IN ('ACTIVE', 'TRIAL')
    AND (ls."endDate" IS NULL OR ls."endDate" > now())
)
INSERT INTO "Subscription" ("id", "shopId", "planId", "status", "startDate", "endDate", "autoRenew", "createdAt", "updatedAt")
SELECT
  gen_random_uuid(),
  aif."shopId",
  (SELECT id FROM "Plan" WHERE "name" = 'Pro'),
  aif."status",
  aif."startDate",
  aif."endDate",
  aif."autoRenew",
  now(),
  now()
FROM advanced_in_force aif;

-- AlterTable: drop the two superseded columns now that invoiceMonthlyLimit
-- carries their combined meaning.
ALTER TABLE "Plan" DROP COLUMN     "voiceInvoiceLimit",
DROP COLUMN     "manualInvoiceMonthlyLimit";
