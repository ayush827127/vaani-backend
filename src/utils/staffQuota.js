const prisma = require('../config/prisma');

// The Basic plan's cap on additional staff beyond the shop owner — 0 means
// a Basic shop can't invite anyone at all. Pro/Advanced are unlimited
// (absent from this map, same convention as voiceQuota.js's Basic-only
// limit). Counts both already-active non-owner members AND still-pending
// invitations, so a Basic shop can't dodge the cap by queuing up invites
// that would all land at once if accepted together.
const BASIC_STAFF_LIMIT = 0;

async function countStaffUsage(shopId) {
  const [activeNonOwners, pendingInvites] = await Promise.all([
    prisma.shopUser.count({ where: { shopId, status: 'ACTIVE', role: { not: 'OWNER' } } }),
    prisma.invitation.count({ where: { shopId, status: 'PENDING' } }),
  ]);
  return activeNonOwners + pendingInvites;
}

module.exports = { BASIC_STAFF_LIMIT, countStaffUsage };
