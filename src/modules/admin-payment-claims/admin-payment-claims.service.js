const prisma = require('../../config/prisma');
const AppError = require('../../utils/AppError');

async function list({ status, page = 1, limit = 20 }) {
  const where = status ? { status } : {};
  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    prisma.paymentClaim.findMany({
      where,
      include: { plan: true, shop: { select: { id: true, name: true, phone: true } } },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.paymentClaim.count({ where }),
  ]);
  return { items, total, page, limit };
}

function endDateFor(plan, from) {
  const d = new Date(from);
  if (plan.billingCycle === 'YEARLY') {
    d.setFullYear(d.getFullYear() + 1);
  } else {
    d.setMonth(d.getMonth() + 1);
  }
  return d;
}

// Confirming a claim is the *only* thing that ever activates a paid plan —
// see PaymentClaim's doc comment in schema.prisma. Guarding on status ===
// 'PENDING' inside the same transaction as the update is what makes this
// safe against a double-click or two admins acting on the same claim at
// once: the second call finds the row already CONFIRMED/REJECTED and
// refuses rather than granting a second subscription period.
async function confirm(id, adminEmail) {
  return prisma.$transaction(async (tx) => {
    const claim = await tx.paymentClaim.findUnique({ where: { id }, include: { plan: true } });
    if (!claim) throw new AppError('Payment claim not found', 404);
    if (claim.status !== 'PENDING') {
      throw new AppError(`This claim was already ${claim.status.toLowerCase()}`, 409);
    }

    const now = new Date();
    const updatedClaim = await tx.paymentClaim.update({
      where: { id },
      data: { status: 'CONFIRMED', confirmedAt: now, reviewedBy: adminEmail },
      include: { plan: true },
    });

    const subscription = await tx.subscription.create({
      data: {
        shopId: claim.shopId,
        planId: claim.planId,
        status: 'ACTIVE',
        startDate: now,
        endDate: endDateFor(claim.plan, now),
      },
      include: { plan: true },
    });

    return { claim: updatedClaim, subscription };
  });
}

async function reject(id, adminEmail, note) {
  return prisma.$transaction(async (tx) => {
    const claim = await tx.paymentClaim.findUnique({ where: { id } });
    if (!claim) throw new AppError('Payment claim not found', 404);
    if (claim.status !== 'PENDING') {
      throw new AppError(`This claim was already ${claim.status.toLowerCase()}`, 409);
    }
    return tx.paymentClaim.update({
      where: { id },
      data: { status: 'REJECTED', confirmedAt: new Date(), reviewedBy: adminEmail, note },
      include: { plan: true },
    });
  });
}

module.exports = { list, confirm, reject };
