const asyncHandler = require('../../utils/asyncHandler');
const { ok } = require('../../utils/apiResponse');
const service = require('./shop-members.service');

const listMembers = asyncHandler(async (req, res) => {
  const members = await service.listMembers(req.membership.shopId);
  return ok(res, members);
});

const invite = asyncHandler(async (req, res) => {
  const invitation = await service.inviteMember({
    shopId: req.membership.shopId,
    actorUserId: req.user.userId,
    actorShopUserId: req.membership.shopUserId,
    actorRole: req.membership.role,
    phone: req.body.phone,
    role: req.body.role,
  });
  return ok(res, invitation, 201);
});

const revokeInvite = asyncHandler(async (req, res) => {
  await service.revokeInvitation({
    shopId: req.membership.shopId,
    actorUserId: req.user.userId,
    invitationId: req.params.id,
  });
  return ok(res, { revoked: true });
});

const listMyInvitations = asyncHandler(async (req, res) => {
  const invitations = await service.listMyInvitations(req.user.phone);
  return ok(res, invitations);
});

const acceptInvitation = asyncHandler(async (req, res) => {
  const membership = await service.acceptInvitation({
    invitationId: req.params.id,
    userId: req.user.userId,
    phone: req.user.phone,
  });
  return ok(res, membership);
});

const rejectInvitation = asyncHandler(async (req, res) => {
  await service.rejectInvitation({ invitationId: req.params.id, phone: req.user.phone });
  return ok(res, { rejected: true });
});

const changeRole = asyncHandler(async (req, res) => {
  const updated = await service.changeRole({
    shopId: req.membership.shopId,
    actorShopUserId: req.membership.shopUserId,
    actorRole: req.membership.role,
    actorUserId: req.user.userId,
    targetShopUserId: req.params.shopUserId,
    newRole: req.body.role,
  });
  return ok(res, updated);
});

const removeMember = asyncHandler(async (req, res) => {
  await service.removeMember({
    shopId: req.membership.shopId,
    actorUserId: req.user.userId,
    targetShopUserId: req.params.shopUserId,
  });
  return ok(res, { removed: true });
});

const leave = asyncHandler(async (req, res) => {
  await service.leaveShop({
    shopId: req.membership.shopId,
    actorUserId: req.user.userId,
    actorShopUserId: req.membership.shopUserId,
  });
  return ok(res, { left: true });
});

const setPermission = asyncHandler(async (req, res) => {
  const row = await service.setPermission({
    shopId: req.membership.shopId,
    actorUserId: req.user.userId,
    targetShopUserId: req.params.shopUserId,
    permission: req.body.permission,
    granted: req.body.granted,
  });
  return ok(res, row);
});

module.exports = {
  listMembers,
  invite,
  revokeInvite,
  listMyInvitations,
  acceptInvitation,
  rejectInvitation,
  changeRole,
  removeMember,
  leave,
  setPermission,
};
