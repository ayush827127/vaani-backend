const prisma = require('../../config/prisma');
const AppError = require('../../utils/AppError');
const auditLog = require('../../services/auditLog.service');
const { hasPermission } = require('../../services/permissions');
const { assertNotRemovingLastOwner, assertCanChangeRole } = require('../../services/ownerProtection');

// Same pattern shop-otp.service.js already validates phones with.
const PHONE_REGEX = /^[6-9]\d{9}$/;
const INVITATION_TTL_DAYS = 7;
const VALID_ROLES = ['OWNER', 'MANAGER', 'CASHIER'];

async function activeMembershipsForShop(shopId) {
  return prisma.shopUser.findMany({ where: { shopId, status: 'ACTIVE' } });
}

async function overridesFor(shopUserId) {
  return prisma.shopUserPermission.findMany({
    where: { shopUserId },
    select: { permission: true, granted: true },
  });
}

async function listMembers(shopId) {
  const members = await prisma.shopUser.findMany({
    where: { shopId, status: 'ACTIVE' },
    include: { user: { select: { id: true, name: true, phone: true } } },
    orderBy: { createdAt: 'asc' },
  });
  return members.map((m) => ({
    shopUserId: m.id,
    userId: m.userId,
    name: m.user?.name ?? m.name,
    phone: m.user?.phone ?? m.phone,
    role: m.role,
  }));
}

async function inviteMember({ shopId, actorUserId, actorShopUserId, actorRole, phone, role }) {
  if (!PHONE_REGEX.test(phone)) {
    throw new AppError('Enter a valid 10-digit Indian mobile number', 400);
  }
  if (!VALID_ROLES.includes(role)) {
    throw new AppError('Invalid role', 400);
  }
  if (role === 'OWNER') {
    const actorOverrides = await overridesFor(actorShopUserId);
    if (!hasPermission(actorRole, actorOverrides, 'member.permission.manage')) {
      throw new AppError('Only an owner can invite another owner', 403);
    }
  }

  const existingMember = await prisma.shopUser.findFirst({ where: { shopId, phone, status: 'ACTIVE' } });
  if (existingMember) {
    throw new AppError('This phone number is already an active member of this business', 409);
  }
  const existingInvite = await prisma.invitation.findFirst({
    where: { shopId, invitedPhone: phone, status: 'PENDING' },
  });
  if (existingInvite) {
    throw new AppError('An invitation is already pending for this phone number', 409);
  }

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + INVITATION_TTL_DAYS);
  const invitation = await prisma.invitation.create({
    data: { shopId, invitedPhone: phone, role, invitedByUserId: actorUserId, expiresAt },
  });

  await auditLog.record({
    shopId,
    userId: actorUserId,
    action: 'MEMBER_INVITED',
    module: 'member',
    entityType: 'Invitation',
    entityId: invitation.id,
    metadata: { invitedPhone: phone, role },
  });
  return invitation;
}

async function revokeInvitation({ shopId, actorUserId, invitationId }) {
  const invitation = await prisma.invitation.findFirst({ where: { id: invitationId, shopId } });
  if (!invitation || invitation.status !== 'PENDING') {
    throw new AppError('Invitation not found', 404);
  }
  await prisma.invitation.update({ where: { id: invitationId }, data: { status: 'REVOKED' } });
  await auditLog.record({
    shopId,
    userId: actorUserId,
    action: 'MEMBER_INVITE_REVOKED',
    module: 'member',
    entityType: 'Invitation',
    entityId: invitationId,
  });
}

async function listMyInvitations(phone) {
  return prisma.invitation.findMany({
    where: { invitedPhone: phone, status: 'PENDING', expiresAt: { gt: new Date() } },
    include: { shop: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' },
  });
}

// Idempotent find-or-link-or-create — mirrors scripts/backfill-shop-owners.js's
// exact matching logic, so accepting the same invitation twice (a retried
// request, a double-tap) never produces a duplicate ShopUser.
async function acceptInvitation({ invitationId, userId, phone }) {
  const invitation = await prisma.invitation.findUnique({ where: { id: invitationId } });
  if (!invitation || invitation.invitedPhone !== phone) {
    throw new AppError('Invitation not found', 404);
  }
  if (invitation.status === 'PENDING' && invitation.expiresAt < new Date()) {
    await prisma.invitation.update({ where: { id: invitationId }, data: { status: 'EXPIRED' } });
    throw new AppError('This invitation has expired', 410);
  }
  if (invitation.status !== 'PENDING') {
    throw new AppError('This invitation is no longer available', 409);
  }

  let membership = await prisma.shopUser.findFirst({ where: { shopId: invitation.shopId, userId } });
  if (!membership) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    const unlinked = await prisma.shopUser.findFirst({
      where: { shopId: invitation.shopId, phone: user.phone, userId: null },
    });
    if (unlinked) {
      membership = await prisma.shopUser.update({
        where: { id: unlinked.id },
        data: { userId, role: invitation.role, status: 'ACTIVE' },
      });
    } else {
      membership = await prisma.shopUser.create({
        data: {
          shopId: invitation.shopId,
          userId,
          name: user.name ?? user.phone,
          phone: user.phone,
          role: invitation.role,
          status: 'ACTIVE',
        },
      });
    }
  } else if (membership.status !== 'ACTIVE') {
    membership = await prisma.shopUser.update({ where: { id: membership.id }, data: { status: 'ACTIVE' } });
  }

  await prisma.invitation.update({
    where: { id: invitationId },
    data: { status: 'ACCEPTED', acceptedAt: new Date() },
  });
  await auditLog.record({
    shopId: invitation.shopId,
    userId,
    action: 'MEMBER_ACCEPTED',
    module: 'member',
    entityType: 'ShopUser',
    entityId: membership.id,
    metadata: { role: invitation.role },
  });

  // The accepting device has no other way to learn this shop's profile
  // (it never held a legacy Shop-token, so it never called
  // /api/shop/auth/login) — carrying it here lets the client create its
  // local Shop row from this one response, same as checkExistingCloudShop's
  // response already does for the "returning shop, new device" case.
  const shop = await prisma.shop.findUnique({
    where: { id: invitation.shopId },
    select: {
      name: true,
      ownerName: true,
      address: true,
      gstNumber: true,
      currency: true,
      gstEnabled: true,
      defaultGstRate: true,
      upiId: true,
    },
  });
  return { ...membership, shop };
}

async function rejectInvitation({ invitationId, phone }) {
  const invitation = await prisma.invitation.findUnique({ where: { id: invitationId } });
  if (!invitation || invitation.invitedPhone !== phone) {
    throw new AppError('Invitation not found', 404);
  }
  if (invitation.status !== 'PENDING') {
    throw new AppError('This invitation is no longer available', 409);
  }
  await prisma.invitation.update({ where: { id: invitationId }, data: { status: 'REJECTED' } });
}

async function changeRole({ shopId, actorShopUserId, actorRole, actorUserId, targetShopUserId, newRole }) {
  if (!VALID_ROLES.includes(newRole)) {
    throw new AppError('Invalid role', 400);
  }
  const memberships = await activeMembershipsForShop(shopId);
  const target = memberships.find((m) => m.id === targetShopUserId);
  if (!target) {
    throw new AppError('Member not found', 404);
  }
  const actorOverrides = await overridesFor(actorShopUserId);

  assertCanChangeRole(
    { shopUserId: actorShopUserId, role: actorRole, overrides: actorOverrides },
    { shopUserId: target.id, role: target.role },
    newRole,
    memberships.map((m) => ({ shopUserId: m.id, role: m.role }))
  );

  const updated = await prisma.shopUser.update({ where: { id: targetShopUserId }, data: { role: newRole } });
  await auditLog.record({
    shopId,
    userId: actorUserId,
    action: 'ROLE_CHANGED',
    module: 'member',
    entityType: 'ShopUser',
    entityId: targetShopUserId,
    metadata: { from: target.role, to: newRole },
  });
  return updated;
}

async function _softRemove({ shopId, actorUserId, targetShopUserId, selfInitiated }) {
  const memberships = await activeMembershipsForShop(shopId);
  const target = memberships.find((m) => m.id === targetShopUserId);
  if (!target) {
    throw new AppError('Member not found', 404);
  }
  assertNotRemovingLastOwner(memberships.map((m) => ({ shopUserId: m.id, role: m.role })), targetShopUserId);

  await prisma.shopUser.update({
    where: { id: targetShopUserId },
    data: { status: 'REMOVED', removedAt: new Date() },
  });
  await auditLog.record({
    shopId,
    userId: actorUserId,
    action: 'MEMBER_REMOVED',
    module: 'member',
    entityType: 'ShopUser',
    entityId: targetShopUserId,
    metadata: { selfInitiated: !!selfInitiated },
  });
}

async function removeMember({ shopId, actorUserId, targetShopUserId }) {
  return _softRemove({ shopId, actorUserId, targetShopUserId, selfInitiated: false });
}

async function leaveShop({ shopId, actorUserId, actorShopUserId }) {
  return _softRemove({ shopId, actorUserId, targetShopUserId: actorShopUserId, selfInitiated: true });
}

async function setPermission({ shopId, actorUserId, targetShopUserId, permission, granted }) {
  const target = await prisma.shopUser.findFirst({
    where: { id: targetShopUserId, shopId, status: 'ACTIVE' },
  });
  if (!target) {
    throw new AppError('Member not found', 404);
  }
  const row = await prisma.shopUserPermission.upsert({
    where: { shopUserId_permission: { shopUserId: targetShopUserId, permission } },
    update: { granted },
    create: { shopUserId: targetShopUserId, permission, granted },
  });
  await auditLog.record({
    shopId,
    userId: actorUserId,
    action: 'PERMISSION_CHANGED',
    module: 'member',
    entityType: 'ShopUserPermission',
    entityId: row.id,
    metadata: { permission, granted },
  });
  return row;
}

module.exports = {
  listMembers,
  inviteMember,
  revokeInvitation,
  listMyInvitations,
  acceptInvitation,
  rejectInvitation,
  changeRole,
  removeMember,
  leaveShop,
  setPermission,
};
