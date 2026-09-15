const { Router } = require('express');
const { z } = require('zod');
const validate = require('../../middleware/validate.middleware');
const { requireShop } = require('../../middleware/shopAuth.middleware');
const controller = require('./shop-sync.controller');

const productSchema = z.object({
  localId: z.number().int(),
  name: z.string(),
  sku: z.string().nullable().optional(),
  barcode: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  costPrice: z.number(),
  sellingPrice: z.number(),
  gstRate: z.number(),
  stockQuantity: z.number().int(),
  reorderLevel: z.number().int(),
  imagePath: z.string().nullable().optional(),
  imageUrl: z.string().nullable().optional(),
  aliases: z.array(z.string()).optional(),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const customerSchema = z.object({
  localId: z.number().int(),
  name: z.string(),
  phone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  totalPurchases: z.number(),
  totalBills: z.number().int(),
  totalOutstanding: z.number(),
  advanceBalance: z.number(),
  lastVisit: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const invoiceItemSchema = z.object({
  localId: z.number().int(),
  productId: z.number().int(),
  productName: z.string(),
  quantity: z.number().int(),
  sellingPrice: z.number(),
  gstRate: z.number(),
  gstAmount: z.number(),
  lineTotal: z.number(),
});

const invoiceSchema = z.object({
  localId: z.number().int(),
  invoiceNumber: z.string(),
  customerId: z.number().int().nullable().optional(),
  customerName: z.string(),
  subtotal: z.number(),
  discountType: z.string(),
  discountValue: z.number(),
  discountAmount: z.number(),
  gstAmount: z.number(),
  grandTotal: z.number(),
  receivedAmount: z.number(),
  pendingAmount: z.number(),
  paymentMode: z.string(),
  status: z.string(),
  notes: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  items: z.array(invoiceItemSchema).optional(),
});

const inventoryTransactionSchema = z.object({
  localId: z.number().int(),
  productId: z.number().int(),
  invoiceId: z.number().int().nullable().optional(),
  type: z.string(),
  quantityChange: z.number().int(),
  stockBefore: z.number().int(),
  stockAfter: z.number().int(),
  notes: z.string().nullable().optional(),
  createdAt: z.string(),
});

const paymentTransactionSchema = z.object({
  localId: z.number().int(),
  customerId: z.number().int(),
  invoiceId: z.number().int().nullable().optional(),
  type: z.string(),
  amount: z.number(),
  paymentMode: z.string(),
  notes: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string().optional(),
});

const shopProfileSchema = z.object({
  name: z.string(),
  ownerName: z.string(),
  address: z.string().nullable().optional(),
  gstNumber: z.string().nullable().optional(),
  currency: z.string().optional(),
  gstEnabled: z.boolean().optional(),
  defaultGstRate: z.number().optional(),
  upiId: z.string().nullable().optional(),
  categories: z.array(z.string()).optional(),
  logoUrl: z.string().nullable().optional(),
});

const syncSchema = z.object({
  shopProfile: shopProfileSchema.optional(),
  products: z.array(productSchema).optional(),
  customers: z.array(customerSchema).optional(),
  invoices: z.array(invoiceSchema).optional(),
  inventoryTransactions: z.array(inventoryTransactionSchema).optional(),
  paymentTransactions: z.array(paymentTransactionSchema).optional(),
});

const router = Router();

router.post('/sync', requireShop, validate(syncSchema), controller.sync);
router.get('/sync/pull', requireShop, controller.pull);

module.exports = router;
