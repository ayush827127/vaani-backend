const prisma = require('../config/prisma');

// The cap itself lives on the Plan row (Plan.staffLimit, null = unlimited)
// — see shop-members.service.js's checkStaffQuota/getStaffQuota, which read
// it off the shop's effectivePlan. This just counts current usage: both
// already-active non-owner members AND still-pending invitations, so a
// capped shop can't dodge the cap by queuing up invites that would all
// land at once if accepted together.
async function countStaffUsage(shopId) {
  const [activeNonOwners, pendingInvites] = await Promise.all([
    prisma.shopUser.count({ where: { shopId, status: 'ACTIVE', role: { not: 'OWNER' } } }),
    prisma.invitation.count({ where: { shopId, status: 'PENDING' } }),
  ]);
  return activeNonOwners + pendingInvites;
}

module.exports = { countStaffUsage };
