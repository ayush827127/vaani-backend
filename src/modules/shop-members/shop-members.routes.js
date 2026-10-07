const { Router } = require('express');
const { z } = require('zod');
const validate = require('../../middleware/validate.middleware');
const { requireUser, requireActiveMembership } = require('../../middleware/userAuth.middleware');
const { requirePermission } = require('../../middleware/permission.middleware');
const controller = require('./shop-members.controller');

const inviteSchema = z.object({
  phone: z.string().min(1),
  role: z.enum(['OWNER', 'MANAGER', 'CASHIER']),
});
const changeRoleSchema = z.object({ role: z.enum(['OWNER', 'MANAGER', 'CASHIER']) });
const setPermissionSchema = z.object({ permission: z.string().min(1), granted: z.boolean() });

// Mounted at /api/shop/members. Every route requires requireUser first;
// shopId always comes from req.membership.shopId (the verified active
// membership), never a client-supplied value — see requireActiveMembership.
const membersRouter = Router();
membersRouter.use(requireUser, requireActiveMembership);

membersRouter.get('/', requirePermission('member.view'), controller.listMembers);
membersRouter.get('/quota', requirePermission('member.invite'), controller.getStaffQuota);
membersRouter.post('/invite', requirePermission('member.invite'), validate(inviteSchema), controller.invite);
membersRouter.post('/invite/:id/revoke', requirePermission('member.invite'), controller.revokeInvite);
membersRouter.post('/leave', controller.leave); // no extra permission — anyone can leave their own membership
membersRouter.patch(
  '/:shopUserId/role',
  requirePermission('member.permission.manage'),
  validate(changeRoleSchema),
  controller.changeRole
);
membersRouter.patch(
  '/:shopUserId/permissions',
  requirePermission('member.permission.manage'),
  validate(setPermissionSchema),
  controller.setPermission
);
membersRouter.delete('/:shopUserId', requirePermission('member.remove'), controller.removeMember);

// Mounted at /api/shop/invitations. requireUser only — someone who isn't a
// member of the shop yet (the whole point) has no active membership to
// verify, so requireActiveMembership never applies here.
const invitationsRouter = Router();
invitationsRouter.use(requireUser);

invitationsRouter.get('/', controller.listMyInvitations);
invitationsRouter.post('/:id/accept', controller.acceptInvitation);
invitationsRouter.post('/:id/reject', controller.rejectInvitation);

module.exports = { membersRouter, invitationsRouter };
