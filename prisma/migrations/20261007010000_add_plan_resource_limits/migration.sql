-- AlterTable
ALTER TABLE "Plan" ADD COLUMN     "voiceInvoiceLimit" INTEGER,
ADD COLUMN     "staffLimit" INTEGER,
ADD COLUMN     "manualInvoiceMonthlyLimit" INTEGER;

-- Backfill the Basic plan's real caps immediately, in the migration itself
-- — not left for a manual `npm run seed` re-run, which only happens when
-- someone remembers to do it. Without this, every new column above lands
-- NULL (unlimited) on deploy, silently reopening every cap this session
-- just added (staff, voice, manual invoices) until someone notices and
-- reseeds. Pro/Advanced intentionally stay NULL (unlimited) — matches
-- PLAN_LIMITS in prisma/seed.js, which a future reseed will also produce.
UPDATE "Plan" SET "voiceInvoiceLimit" = 50, "staffLimit" = 0, "manualInvoiceMonthlyLimit" = 50 WHERE "name" = 'Basic';
