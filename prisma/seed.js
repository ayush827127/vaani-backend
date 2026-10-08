require('dotenv').config();
const bcrypt = require('bcrypt');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const MODULES = [
  { key: 'billing', name: 'Billing', description: 'Voice and manual invoice creation' },
  { key: 'inventory', name: 'Inventory', description: 'Item catalog and stock management' },
  { key: 'customers', name: 'Customers', description: 'Customer records and history' },
  { key: 'reports', name: 'Reports', description: 'Sales and business reports' },
  { key: 'ai_manager', name: 'AI Manager', description: 'AI-assisted store management insights' },
  { key: 'printer', name: 'Printer', description: 'Receipt/invoice printer configuration' },
  { key: 'notifications', name: 'Notifications', description: 'In-app notifications and alerts' },
];

// Basic is the always-available free tier (no Subscription row required —
// shop-status.service.js falls back to it whenever a shop has no
// currently-in-force paid subscription). Only Basic and Pro are active —
// Advanced was retired (it had always matched Pro module-for-module; see
// RETIRED_PLAN_NAMES below) in favor of keeping the lineup to exactly two
// tiers, per the business's own simplification call.
const PLAN_MODULES = {
  Basic: ['billing', 'inventory', 'customers', 'printer', 'notifications'],
  Pro: ['billing', 'inventory', 'customers', 'printer', 'notifications', 'reports', 'ai_manager'],
};

const PLAN_PRICES = {
  Basic: { price: 0, billingCycle: 'MONTHLY' },
  Pro: { price: 99, billingCycle: 'MONTHLY' },
};

// Resource caps — null means unlimited. These are the only numbers that
// distinguish Basic from Pro resource-wise (module access aside); see the
// Plan model's doc comment in schema.prisma. Changing a number here and
// reseeding is the admin-panel-free way to adjust a cap; the admin panel's
// Plans page can also edit these directly on an existing plan without
// reseeding.
//
// invoiceMonthlyLimit counts voice- and manually-created invoices TOGETHER
// against one combined monthly quota (not two separate caps).
const PLAN_LIMITS = {
  Basic: { invoiceMonthlyLimit: 50, staffLimit: 0 },
  Pro: { invoiceMonthlyLimit: null, staffLimit: null },
};

// Retired plan names — deactivated rather than deleted so any historical
// Subscription/PaymentClaim row referencing one by FK stays intact;
// isActive: false just means the admin panel and this seed script stop
// offering it going forward. 'Advanced' was retired because it had always
// been functionally identical to Pro; any shop that was actually on it got
// migrated to a fresh Pro subscription (preserving its dates) in the
// 20261008072339_simplify_subscription_plans migration, not here.
const RETIRED_PLAN_NAMES = ['Free', 'Advanced'];

async function main() {
  const moduleByKey = {};
  for (const m of MODULES) {
    const module_ = await prisma.module.upsert({
      where: { key: m.key },
      update: { name: m.name, description: m.description },
      create: m,
    });
    moduleByKey[m.key] = module_;
  }
  console.log(`Seeded ${MODULES.length} modules.`);

  for (const [planName, moduleKeys] of Object.entries(PLAN_MODULES)) {
    const plan = await prisma.plan.upsert({
      where: { name: planName },
      update: { ...PLAN_PRICES[planName], ...PLAN_LIMITS[planName], isActive: true },
      create: { name: planName, ...PLAN_PRICES[planName], ...PLAN_LIMITS[planName] },
    });

    await prisma.planModule.deleteMany({ where: { planId: plan.id } });
    await prisma.planModule.createMany({
      data: moduleKeys.map((key) => ({ planId: plan.id, moduleId: moduleByKey[key].id })),
    });
  }
  console.log(`Seeded ${Object.keys(PLAN_MODULES).length} plans.`);

  for (const planName of RETIRED_PLAN_NAMES) {
    await prisma.plan.updateMany({ where: { name: planName }, data: { isActive: false } });
  }
  if (RETIRED_PLAN_NAMES.length) {
    console.log(`Retired ${RETIRED_PLAN_NAMES.length} old plan(s): ${RETIRED_PLAN_NAMES.join(', ')}`);
  }

  const { name, email, password } = {
    name: process.env.ADMIN_SEED_NAME || 'Super Admin',
    email: process.env.ADMIN_SEED_EMAIL,
    password: process.env.ADMIN_SEED_PASSWORD,
  };

  if (!email || !password) {
    console.warn('ADMIN_SEED_EMAIL / ADMIN_SEED_PASSWORD not set — skipping admin user seed.');
    return;
  }

  const hashed = await bcrypt.hash(password, 10);
  await prisma.adminUser.upsert({
    where: { email },
    update: {},
    create: { name, email, password: hashed, role: 'SUPERADMIN' },
  });
  console.log(`Seeded superadmin user: ${email}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
