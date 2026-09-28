const prisma = require('../../config/prisma');
const memberService = require('../shop-members/shop-members.service');

// Thin admin-facing wrapper around shop-members.service.js — reuses every
// validation and data-integrity rule already built there (phone format,
// duplicate-invite/duplicate-member checks, last-owner protection), just
// with adminInitiated:true so the actor-permission half of those checks
// (which assumes an acting shop member, not a platform admin) is skipped.
// See shop-members.service.js's own doc comments on inviteMember/changeRole
// for exactly what that does and doesn't skip.

function listMembers(shopId) {
  return memberService.listMembers(shopId);
}

function inviteMember(shopId, phone, role, auditMeta) {
  return memberService.inviteMember({ shopId, phone, role, adminInitiated: true, auditMeta });
}

function changeRole(shopId, targetShopUserId, newRole, auditMeta) {
  return memberService.changeRole({ shopId, targetShopUserId, newRole, adminInitiated: true, auditMeta });
}

function removeMember(shopId, targetShopUserId, auditMeta) {
  return memberService.removeMember({ shopId, targetShopUserId, auditMeta });
}

// No app-facing equivalent exists (an invited person sees their own pending
// invitations by phone via listMyInvitations; an admin instead needs every
// pending invitation for a given shop).
async function listInvitations(shopId) {
  return prisma.invitation.findMany({
    where: { shopId, status: 'PENDING' },
    orderBy: { createdAt: 'desc' },
  });
}

function revokeInvitation(shopId, invitationId, auditMeta) {
  return memberService.revokeInvitation({ shopId, invitationId, auditMeta });
}

module.exports = { listMembers, inviteMember, changeRole, removeMember, listInvitations, revokeInvitation };
