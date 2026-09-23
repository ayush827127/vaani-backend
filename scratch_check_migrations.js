const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
(async () => {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT migration_name, finished_at, applied_steps_count, logs
     FROM "_prisma_migrations" ORDER BY started_at DESC LIMIT 8`
  );
  for (const r of rows) {
    console.log(r.migration_name, '| finished_at:', r.finished_at, '| steps:', r.applied_steps_count);
    if (r.logs) console.log('  logs:', String(r.logs).slice(0, 300));
  }
  // Also check directly whether the column exists right now
  const col = await prisma.$queryRawUnsafe(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'SyncedCustomer'`
  );
  console.log('SyncedCustomer columns:', col.map(c => c.column_name).join(', '));
  await prisma.$disconnect();
})().catch(e => { console.error(e); process.exit(1); });
