const asyncHandler = require('../../utils/asyncHandler');
const { ok } = require('../../utils/apiResponse');
const service = require('./shop-members-admin.service');

// Matches shop-items.controller.js's own adminActor() convention exactly —
// every admin-initiated mutation's audit row carries this instead of a
// userId, since there's no acting shop member to attribute it to.
function adminActor(req) {
  return { actorType: 'ADMIN', adminId: req.admin.id, adminEmail: req.admin.email };
}

const listMembers = asyncHandler(async (req, res) => {
  const members = await service.listMembers(req.params.shopId);
  return ok(res, members);
});

const invite = asyncHandler(async (req, res) => {
  const invitation = await service.inviteMember(req.params.shopId, req.body.phone, req.body.role, adminActor(req));
  return ok(res, invitation, 201);
});

const changeRole = asyncHandler(async (req, res) => {
  const updated = await service.changeRole(req.params.shopId, req.params.shopUserId, req.body.role, adminActor(req));
  return ok(res, updated);
});

const removeMember = asyncHandler(async (req, res) => {
  await service.removeMember(req.params.shopId, req.params.shopUserId, adminActor(req));
  return ok(res, { removed: true });
});

const listInvitations = asyncHandler(async (req, res) => {
  const invitations = await service.listInvitations(req.params.shopId);
  return ok(res, invitations);
});

const revokeInvitation = asyncHandler(async (req, res) => {
  await service.revokeInvitation(req.params.shopId, req.params.id, adminActor(req));
  return ok(res, { revoked: true });
});

module.exports = { listMembers, invite, changeRole, removeMember, listInvitations, revokeInvitation };
