const AppError = require('../utils/AppError');
const { hasPermission } = require('./permissions');

/**
 * Blocks removing or demoting a shop's last remaining OWNER (spec §17).
 * @param {Array<{shopUserId: string, role: string, status: string}>} shopMemberships
 *   every ACTIVE membership currently on the shop (including the target).
 * @param {string} targetShopUserId - the membership being removed/demoted.
 */
function assertNotRemovingLastOwner(shopMemberships, targetShopUserId) {
  const target = shopMemberships.find((m) => m.shopUserId === targetShopUserId);
  if (!target || target.role !== 'OWNER') return; // not an owner — nothing to protect
  const remainingOwners = shopMemberships.filter(
    (m) => m.role === 'OWNER' && m.shopUserId !== targetShopUserId
  );
  if (remainingOwners.length === 0) {
    throw new AppError('Cannot remove or demote the last owner of this business', 400);
  }
}

/**
 * Blocks unauthorized role changes / permission escalation (spec §17):
 * only someone whose effective permissions include member.permission.manage
 * (OWNER by default) may change anyone's role at all, and even an OWNER
 * demoting themselves must leave another OWNER in place.
 * @param {{shopUserId: string, role: string, overrides?: Array}} actor - who is making the change
 * @param {{shopUserId: string, role: string}} target - whose role is changing
 * @param {string} newRole
 * @param {Array<{shopUserId: string, role: string}>} shopMemberships - full active membership list, for the last-owner check
 */
function assertCanChangeRole(actor, target, newRole, shopMemberships) {
  if (!hasPermission(actor.role, actor.overrides || [], 'member.permission.manage')) {
    throw new AppError('You are not authorized to change member roles', 403);
  }
  if (target.role === 'OWNER' && newRole !== 'OWNER') {
    assertNotRemovingLastOwner(shopMemberships, target.shopUserId);
  }
}

module.exports = { assertNotRemovingLastOwner, assertCanChangeRole };
