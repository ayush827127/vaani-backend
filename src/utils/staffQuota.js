const prisma = require('../config/prisma');

// The cap itself lives on the Plan row (Plan.staffLimit, null = unlimited)
// — see shop-members.service.js's checkStaffQuota/getStaffQuota, which read
// it off the shop's effectivePlan. This just counts current usage: both
// already-active non-owner members AND still-pending, still-unexpired
// invitations, so a capped shop can't dodge the cap by queuing up invites
// that would all land at once if accepted together.
//
// expiresAt must still be in the future — an invitation whose 7-day window
// has lapsed is dead (acceptInvitation itself refuses it and flips it to
// EXPIRED the next time anyone tries), so counting it here would
// permanently inflate usage for a shop that sent one invite that was never
// accepted, long after it stopped being a real pending request. This was a
// real, confirmed bug: a Basic shop with a single long-expired invite
// showed "1 of 0 staff used" even though it had no real staff or live
// invitations at all.
async function countStaffUsage(shopId) {
  const [activeNonOwners, pendingInvites] = await Promise.all([
    prisma.shopUser.count({ where: { shopId, status: 'ACTIVE', role: { not: 'OWNER' } } }),
    prisma.invitation.count({ where: { shopId, status: 'PENDING', expiresAt: { gt: new Date() } } }),
  ]);
  return activeNonOwners + pendingInvites;
}

module.exports = { countStaffUsage };
