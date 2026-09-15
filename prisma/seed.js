require('dotenv').config();
const bcrypt = require('bcrypt');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const MODULES = [
  { key: 'billing', name: 'Billing', description: 'Voice and manual invoice creation' },
  { key: 'inventory', name: 'Inventory', description: 'Product catalog and stock management' },
  { key: 'customers', name: 'Customers', description: 'Customer records and history' },
  { key: 'reports', name: 'Reports', description: 'Sales and business reports' },
  { key: 'ai_manager', name: 'AI Manager', description: 'AI-assisted store management insights' },
  { key: 'printer', name: 'Printer', description: 'Receipt/invoice printer configuration' },
  { key: 'notifications', name: 'Notifications', description: 'In-app notifications and alerts' },
];

const PLAN_MODULES = {
  Free: ['billing', 'inventory', 'customers'],
  Basic: ['billing', 'inventory', 'customers', 'reports', 'notifications'],
  Pro: ['billing', 'inventory', 'customers', 'reports', 'notifications', 'ai_manager', 'printer'],
};

const PLAN_PRICES = {
  Free: { price: 0, billingCycle: 'MONTHLY' },
  Basic: { price: 499, billingCycle: 'MONTHLY' },
  Pro: { price: 999, billingCycle: 'MONTHLY' },
};

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
      update: { ...PLAN_PRICES[planName] },
      create: { name: planName, ...PLAN_PRICES[planName] },
    });

    await prisma.planModule.deleteMany({ where: { planId: plan.id } });
    await prisma.planModule.createMany({
      data: moduleKeys.map((key) => ({ planId: plan.id, moduleId: moduleByKey[key].id })),
    });
  }
  console.log(`Seeded ${Object.keys(PLAN_MODULES).length} plans.`);

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
