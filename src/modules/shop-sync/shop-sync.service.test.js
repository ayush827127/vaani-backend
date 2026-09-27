const mockResolveOwnerUserId = jest.fn();
jest.mock('../user-auth/user-auth.service', () => ({ resolveOwnerUserId: mockResolveOwnerUserId }));

const mockAuditRecord = jest.fn();
jest.mock('../../services/auditLog.service', () => ({ record: mockAuditRecord }));

const mockTx = {
  syncedItem: { findMany: jest.fn(), createMany: jest.fn(), update: jest.fn() },
  syncedCustomer: { findMany: jest.fn(), createMany: jest.fn(), update: jest.fn() },
  syncedInvoice: { findMany: jest.fn(), createMany: jest.fn(), update: jest.fn() },
  syncedInvoiceItem: { deleteMany: jest.fn(), createMany: jest.fn() },
  syncedInventoryTransaction: { findMany: jest.fn(), createMany: jest.fn(), update: jest.fn() },
  syncedPaymentTransaction: { findMany: jest.fn(), createMany: jest.fn(), update: jest.fn() },
  $executeRaw: jest.fn(),
};
const mockPrisma = {
  $transaction: jest.fn((fn) => fn(mockTx)),
  shopUserPermission: { findMany: jest.fn() },
};
jest.mock('../../config/prisma', () => mockPrisma);

const { syncData } = require('./shop-sync.service');

beforeEach(() => {
  jest.clearAllMocks();
  mockTx.syncedItem.findMany.mockResolvedValue([]); // nothing pre-existing, by default
  mockTx.syncedCustomer.findMany.mockResolvedValue([]);
  mockTx.syncedInvoice.findMany.mockResolvedValue([]);
  mockTx.syncedInventoryTransaction.findMany.mockResolvedValue([]);
  mockTx.syncedPaymentTransaction.findMany.mockResolvedValue([]);
  mockPrisma.shopUserPermission.findMany.mockResolvedValue([]); // no overrides, by default
});

const baseItem = {
  localId: 1,
  name: 'Dosa',
  costPrice: 10,
  sellingPrice: 20,
  gstRate: 5,
  stockQuantity: 10,
  reorderLevel: 2,
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

test('a brand-new item gets createdByUserId set from the resolved owner', async () => {
  mockResolveOwnerUserId.mockResolvedValue('user-owner-1');

  await syncData('shop-1', { items: [baseItem] });

  expect(mockTx.syncedItem.createMany).toHaveBeenCalledWith({
    data: [expect.objectContaining({ localId: 1, createdByUserId: 'user-owner-1' })],
  });
});

test('an existing item going through update() never has createdByUserId touched', async () => {
  mockResolveOwnerUserId.mockResolvedValue('user-owner-1');
  mockTx.syncedItem.findMany.mockResolvedValue([{ localId: 1 }]); // already exists

  await syncData('shop-1', { items: [baseItem] });

  expect(mockTx.syncedItem.createMany).not.toHaveBeenCalled();
  expect(mockTx.syncedItem.update).toHaveBeenCalledWith(
    expect.objectContaining({
      where: { shopId_localId: { shopId: 'shop-1', localId: 1 } },
      data: expect.not.objectContaining({ createdByUserId: expect.anything() }),
    })
  );
});

test('resolveOwnerUserId returning null leaves createdByUserId unset, not an error', async () => {
  mockResolveOwnerUserId.mockResolvedValue(null);

  await syncData('shop-1', { items: [baseItem] });

  const created = mockTx.syncedItem.createMany.mock.calls[0][0].data[0];
  expect(created).not.toHaveProperty('createdByUserId');
});

test('resolveOwnerUserId is called exactly once per sync call, not once per record', async () => {
  mockResolveOwnerUserId.mockResolvedValue('user-owner-1');

  await syncData('shop-1', { items: [baseItem, { ...baseItem, localId: 2 }] });

  expect(mockResolveOwnerUserId).toHaveBeenCalledTimes(1);
});

test('an explicit attributed user id (User-token path) is used verbatim, and resolveOwnerUserId is not called at all', async () => {
  await syncData('shop-1', { items: [baseItem] }, 'user-invited-cashier');

  expect(mockResolveOwnerUserId).not.toHaveBeenCalled();
  expect(mockTx.syncedItem.createMany).toHaveBeenCalledWith({
    data: [expect.objectContaining({ createdByUserId: 'user-invited-cashier' })],
  });
});

describe('inventory conflict detection', () => {
  const baseTx = {
    localId: 1,
    itemId: 1,
    type: 'sale',
    quantityChange: -2,
    stockBefore: 10,
    stockAfter: 8,
    createdAt: '2026-01-01T00:00:00.000Z',
  };

  test('no conflict when the pushed transaction\'s stockBefore matches current stock', async () => {
    mockResolveOwnerUserId.mockResolvedValue('user-owner-1');
    // Only the conflict-detection query runs here — no items array is
    // pushed in these tests, so upsertBatch('syncedItem', ...) never calls
    // findMany itself (it returns early on an empty records array).
    mockTx.syncedItem.findMany.mockResolvedValueOnce([{ localId: 1, stockQuantity: 10 }]);

    await syncData('shop-1', { inventoryTransactions: [baseTx] });

    expect(mockAuditRecord).not.toHaveBeenCalled();
  });

  test('a mismatch records exactly one INVENTORY_CONFLICT_DETECTED audit entry, after the transaction commits', async () => {
    mockResolveOwnerUserId.mockResolvedValue('user-owner-1');
    mockTx.syncedItem.findMany.mockResolvedValueOnce([{ localId: 1, stockQuantity: 7 }]); // server actually has 7, this push assumed 10

    await syncData('shop-1', { inventoryTransactions: [baseTx] });

    expect(mockAuditRecord).toHaveBeenCalledTimes(1);
    expect(mockAuditRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        shopId: 'shop-1',
        userId: 'user-owner-1',
        action: 'INVENTORY_CONFLICT_DETECTED',
        module: 'inventory',
        metadata: { localItemId: 1, expectedStockBefore: 10, actualStock: 7, quantityChange: -2 },
      })
    );
  });

  test('a brand-new item (no existing SyncedItem row) is never flagged as a conflict', async () => {
    mockResolveOwnerUserId.mockResolvedValue('user-owner-1');
    mockTx.syncedItem.findMany.mockResolvedValueOnce([]); // item doesn't exist yet at all

    await syncData('shop-1', { inventoryTransactions: [{ ...baseTx, itemId: 99, stockBefore: 0 }] });

    expect(mockAuditRecord).not.toHaveBeenCalled();
  });

  test('multiple transactions for the same item in one push only checks the earliest one', async () => {
    mockResolveOwnerUserId.mockResolvedValue('user-owner-1');
    // Current stock matches the EARLIER transaction's stockBefore (10) — if
    // the later one (stockBefore 8) were wrongly checked instead, this would
    // incorrectly report a conflict.
    mockTx.syncedItem.findMany.mockResolvedValueOnce([{ localId: 1, stockQuantity: 10 }]);

    await syncData('shop-1', {
      inventoryTransactions: [
        { ...baseTx, localId: 2, stockBefore: 8, stockAfter: 7, createdAt: '2026-01-01T00:05:00.000Z' },
        { ...baseTx, localId: 1, stockBefore: 10, stockAfter: 8, createdAt: '2026-01-01T00:00:00.000Z' },
      ],
    });

    expect(mockAuditRecord).not.toHaveBeenCalled();
  });
});

describe('financial conflict detection', () => {
  const basePayment = {
    localId: 1,
    customerId: 1,
    type: 'bill_payment',
    amount: 100,
    paymentMode: 'cash',
    createdAt: '2026-01-01T00:00:00.000Z',
    customerOutstandingBefore: 500,
    customerAdvanceBefore: 0,
  };

  test('no conflict when the snapshot matches the current customer balance', async () => {
    mockResolveOwnerUserId.mockResolvedValue('user-owner-1');
    mockTx.syncedCustomer.findMany.mockResolvedValueOnce([{ localId: 1, totalOutstanding: 500, advanceBalance: 0 }]);

    await syncData('shop-1', { paymentTransactions: [basePayment] });

    expect(mockAuditRecord).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: 'FINANCIAL_CONFLICT_DETECTED' })
    );
  });

  test('a mismatch records FINANCIAL_CONFLICT_DETECTED', async () => {
    mockResolveOwnerUserId.mockResolvedValue('user-owner-1');
    // Server actually has 300, this push assumed 500.
    mockTx.syncedCustomer.findMany.mockResolvedValueOnce([{ localId: 1, totalOutstanding: 300, advanceBalance: 0 }]);

    await syncData('shop-1', { paymentTransactions: [basePayment] });

    expect(mockAuditRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'FINANCIAL_CONFLICT_DETECTED',
        metadata: expect.objectContaining({ localCustomerId: 1, expectedOutstandingBefore: 500, actualOutstanding: 300 }),
      })
    );
  });

  test('a payment transaction missing the snapshot fields (older app build) is never checked', async () => {
    mockResolveOwnerUserId.mockResolvedValue('user-owner-1');
    const legacyPayment = { ...basePayment };
    delete legacyPayment.customerOutstandingBefore;
    delete legacyPayment.customerAdvanceBefore;

    await syncData('shop-1', { paymentTransactions: [legacyPayment] });

    expect(mockTx.syncedCustomer.findMany).not.toHaveBeenCalled(); // never even queried — nothing to check
    expect(mockAuditRecord).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: 'FINANCIAL_CONFLICT_DETECTED' })
    );
  });

  test('a brand-new customer (no existing SyncedCustomer row) is never flagged', async () => {
    mockResolveOwnerUserId.mockResolvedValue('user-owner-1');
    mockTx.syncedCustomer.findMany.mockResolvedValueOnce([]); // doesn't exist yet

    await syncData('shop-1', { paymentTransactions: [{ ...basePayment, customerId: 99 }] });

    expect(mockAuditRecord).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: 'FINANCIAL_CONFLICT_DETECTED' })
    );
  });
});

describe('invoice-number conflict detection', () => {
  const baseInvoice = {
    localId: 1,
    invoiceNumber: 'INV-001',
    customerName: 'Walk-in',
    subtotal: 100,
    discountType: 'none',
    discountValue: 0,
    discountAmount: 0,
    gstAmount: 0,
    grandTotal: 100,
    receivedAmount: 100,
    pendingAmount: 0,
    paymentMode: 'cash',
    status: 'paid',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  test('no conflict for a genuinely unique invoice number', async () => {
    mockResolveOwnerUserId.mockResolvedValue('user-owner-1');
    mockTx.syncedInvoice.findMany
      .mockResolvedValueOnce([]) // conflict-detection query: nothing else has this number
      .mockResolvedValueOnce([]) // upsertBatch's own existence check
      .mockResolvedValueOnce([{ id: 'inv-uuid-1', localId: 1 }]); // post-upsert lookup for invoice items

    await syncData('shop-1', { invoices: [baseInvoice] });

    expect(mockAuditRecord).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: 'INVOICE_NUMBER_CONFLICT_DETECTED' })
    );
  });

  test('a different local invoice already using this number records INVOICE_NUMBER_CONFLICT_DETECTED', async () => {
    mockResolveOwnerUserId.mockResolvedValue('user-owner-1');
    mockTx.syncedInvoice.findMany
      .mockResolvedValueOnce([{ localId: 99, invoiceNumber: 'INV-001' }]) // another invoice already has this number
      .mockResolvedValueOnce([]) // this push's own invoice (localId 1) doesn't exist yet
      .mockResolvedValueOnce([{ id: 'inv-uuid-1', localId: 1 }]);

    await syncData('shop-1', { invoices: [baseInvoice] });

    expect(mockAuditRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'INVOICE_NUMBER_CONFLICT_DETECTED',
        metadata: { invoiceNumber: 'INV-001', pushedLocalId: 1, conflictingLocalIds: [99] },
      })
    );
  });

  test('the same local invoice being re-synced (an update) is never flagged as a conflict with itself', async () => {
    mockResolveOwnerUserId.mockResolvedValue('user-owner-1');
    mockTx.syncedInvoice.findMany
      .mockResolvedValueOnce([{ localId: 1, invoiceNumber: 'INV-001' }]) // conflict query finds only itself
      .mockResolvedValueOnce([{ localId: 1 }]) // already exists -> update path
      .mockResolvedValueOnce([{ id: 'inv-uuid-1', localId: 1 }]);

    await syncData('shop-1', { invoices: [baseInvoice] });

    expect(mockAuditRecord).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: 'INVOICE_NUMBER_CONFLICT_DETECTED' })
    );
  });
});

describe('per-action permission enforcement (User-token push only)', () => {
  const membership = { shopId: 'shop-1', shopUserId: 'su-cashier', role: 'CASHIER' };
  const baseCustomer = {
    localId: 1,
    name: 'Ramesh',
    totalPurchases: 0,
    totalBills: 0,
    totalOutstanding: 0,
    advanceBalance: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  test('a legacy Shop-token push (no membership) is never filtered, and never even resolves permissions', async () => {
    mockResolveOwnerUserId.mockResolvedValue('user-owner-1');
    mockTx.syncedItem.findMany.mockResolvedValue([{ localId: 1 }]); // existing item

    await syncData('shop-1', { items: [baseItem] }); // no explicitUserId, no membership

    expect(mockTx.syncedItem.update).toHaveBeenCalled();
    expect(mockPrisma.shopUserPermission.findMany).not.toHaveBeenCalled();
  });

  test('a CASHIER cannot update an item (lacks item.update) — excluded, not the whole sync rejected', async () => {
    mockTx.syncedItem.findMany.mockResolvedValue([{ localId: 1 }]); // existing -> this is an "update"
    mockTx.syncedCustomer.findMany.mockResolvedValue([]); // brand-new -> "create", CASHIER has customer.create

    await syncData('shop-1', { items: [baseItem], customers: [baseCustomer] }, 'user-cashier-1', membership);

    expect(mockTx.syncedItem.update).not.toHaveBeenCalled();
    expect(mockTx.syncedCustomer.createMany).toHaveBeenCalled(); // the customer create still went through
    expect(mockAuditRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'SYNC_RECORD_REJECTED_INSUFFICIENT_PERMISSION',
        metadata: { localId: 1, isCreate: false },
      })
    );
  });

  test('a CASHIER cannot push isActive:false for an item (needs item.delete, which CASHIER also lacks)', async () => {
    mockTx.syncedItem.findMany.mockResolvedValue([{ localId: 1 }]); // existing

    await syncData('shop-1', { items: [{ ...baseItem, isActive: false }] }, 'user-cashier-1', membership);

    expect(mockTx.syncedItem.update).not.toHaveBeenCalled();
  });

  test('an explicit permission override granting item.update lets a CASHIER push an item update', async () => {
    mockPrisma.shopUserPermission.findMany.mockResolvedValue([{ permission: 'item.update', granted: true }]);
    mockTx.syncedItem.findMany.mockResolvedValue([{ localId: 1 }]);

    await syncData('shop-1', { items: [baseItem] }, 'user-cashier-1', membership);

    expect(mockTx.syncedItem.update).toHaveBeenCalled();
  });
});
