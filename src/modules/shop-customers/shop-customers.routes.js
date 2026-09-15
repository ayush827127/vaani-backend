const { Router } = require('express');
const { z } = require('zod');
const validate = require('../../middleware/validate.middleware');
const { requireAdmin } = require('../../middleware/auth.middleware');
const controller = require('./shop-customers.controller');

// totalPurchases/totalBills/totalOutstanding/advanceBalance are deliberately
// NOT accepted here — they're derived counters the phone maintains from real
// transactions (sales, payments), never legitimate hand-edited admin fields.
// Under two-way sync's whole-record last-write-wins, letting an admin PATCH
// these could carry a stale value back down and overwrite a customer's real
// balance the next time an unrelated field (e.g. phone number) is edited.
const createSchema = z.object({
  name: z.string().min(1),
  phone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  lastVisit: z.string().nullable().optional(),
});

const updateSchema = createSchema.partial();

// Mounted at /api/admin/shops/:shopId/customers
const router = Router({ mergeParams: true });

router.use(requireAdmin);

router.get('/', controller.list);
router.get('/:id', controller.getById);
router.post('/', validate(createSchema), controller.create);
router.patch('/:id', validate(updateSchema), controller.update);
router.delete('/:id', controller.remove);

module.exports = router;
