const prisma = require('../../config/prisma');

// AuditLog has no FK relation to User (see its own schema comment — userId
// is a free-form nullable reference, never enforced), so a plain findMany
// is enough; no join needed to show a human-readable actor, since every
// write into this table already carries enough of that in its own metadata
// (an admin's adminEmail, or the app's real userId for the caller to look
// up separately if needed).
async function list(shopId, { page = 1, limit = 50 } = {}) {
  const where = { shopId };
  const skip = (page - 1) * limit;
  const [entries, total] = await Promise.all([
    prisma.auditLog.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' } }),
    prisma.auditLog.count({ where }),
  ]);
  return { entries, total, page, limit };
}

module.exports = { list };
