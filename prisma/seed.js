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
// currently-in-force paid subscription). Advanced currently matches Pro
// module-for-module; it exists as a distinct plan/price point specifically
// so future advanced features and AI models have a plan to land in without
// restructuring anything — add a module to MODULES above, list it under
// Advanced (and Pro, if it should be shared), reseed, done.
const PLAN_MODULES = {
  Basic: ['billing', 'inventory', 'customers', 'printer', 'notifications'],
  Pro: ['billing', 'inventory', 'customers', 'printer', 'notifications', 'reports', 'ai_manager'],
  Advanced: ['billing', 'inventory', 'customers', 'printer', 'notifications', 'reports', 'ai_manager'],
};

const PLAN_PRICES = {
  Basic: { price: 0, billingCycle: 'MONTHLY' },
  Pro: { price: 99, billingCycle: 'MONTHLY' },
  Advanced: { price: 199, billingCycle: 'MONTHLY' },
};

// Retired plan names from the old two-tier (Free/Basic/Pro @ 499/999)
// lineup — deactivated rather than deleted so any historical Subscription
// row referencing one by FK stays intact; isActive: false just means the
// admin panel and this seed script stop offering it going forward.
const RETIRED_PLAN_NAMES = ['Free'];

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
      update: { ...PLAN_PRICES[planName], isActive: true },
      create: { name: planName, ...PLAN_PRICES[planName] },
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
