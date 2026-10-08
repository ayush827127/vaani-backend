-- Shop.status's 'TRIAL' value was only ever set because every new shop
-- used to get an automatic 14-day Pro trial Subscription at registration
-- (see the old shop-auth.service.js, removed in the previous migration) —
-- the two were set in lockstep. Now that the Pro trial is opt-in and
-- tracked independently via Shop.trialUsed + the Subscription row itself,
-- a shop's own account-standing status ('TRIAL' vs 'ACTIVE') no longer
-- means anything distinct — both are treated identically everywhere this
-- is read (only SUSPENDED/CANCELLED actually lock a shop out). Leaving old
-- shops stuck on the stale 'TRIAL' label is actively misleading now that
-- "trial" has a specific, different meaning (the Pro trial), so a Basic
-- shop with no subscription history at all showed as "status: TRIAL" next
-- to "plan: Basic" in the admin panel — contradictory-looking, though
-- functionally harmless.
UPDATE "Shop" SET "status" = 'ACTIVE' WHERE "status" = 'TRIAL';

-- AlterTable: new shops (however created — self-registration or an admin
-- manually adding one) default to ACTIVE going forward too.
ALTER TABLE "Shop" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';
