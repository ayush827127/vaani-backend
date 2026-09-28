const { Router } = require('express');
const { z } = require('zod');
const validate = require('../../middleware/validate.middleware');
const { requireAdmin } = require('../../middleware/auth.middleware');
const controller = require('./shop-members-admin.controller');

const roleEnum = z.enum(['OWNER', 'MANAGER', 'CASHIER']);
const inviteSchema = z.object({ phone: z.string().min(1), role: roleEnum });
const changeRoleSchema = z.object({ role: roleEnum });

// Mounted at /api/admin/shops/:shopId/members
const router = Router({ mergeParams: true });

router.use(requireAdmin);

router.get('/', controller.listMembers);
router.post('/invite', validate(inviteSchema), controller.invite);
router.patch('/:shopUserId/role', validate(changeRoleSchema), controller.changeRole);
router.delete('/:shopUserId', controller.removeMember);
router.get('/invitations', controller.listInvitations);
router.post('/invitations/:id/revoke', controller.revokeInvitation);

module.exports = router;
