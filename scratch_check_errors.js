const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
(async () => {
  const rows = await prisma.errorLog.findMany({
    where: { path: { contains: 'pull' } },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });
  for (const r of rows) {
    console.log('----', r.createdAt.toISOString(), r.statusCode, r.method, r.path);
    console.log('shopId:', r.shopId);
    console.log('message:', r.message);
    console.log('stack:', (r.stack || '').split('\n').slice(0, 6).join('\n'));
  }
  console.log('total matched:', rows.length);
  await prisma.$disconnect();
})().catch(e => { console.error(e); process.exit(1); });
