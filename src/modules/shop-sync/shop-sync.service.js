const prisma = require('../../config/prisma');
const { resolveOwnerUserId } = require('../user-auth/user-auth.service');
const auditLog = require('../../services/auditLog.service');
const { resolveEffectivePermissions } = require('../../services/permissions');

// Applied only on create (see upsertBatch's buildCreateOnlyFields param) —
// createdByUserId is creation-time attribution, never touched again by a
// later push that only updates the row. Omits the key entirely (rather than
// setting null) when there's nothing to attribute to, so a plain object
// spread never clobbers an already-set value on a row this same batch
// happens to also update elsewhere — though in practice a create and an
// update for the same (shopId, localId) can never both happen in one batch.
function createAttributionFields(attributedUserId) {
  return attributedUserId ? { createdByUserId: attributedUserId } : {};
}

// The inverse of createAttributionFields — applied only on update (see
// upsertBatch's buildUpdateOnlyFields param).
function updateAttributionFields(attributedUserId) {
  return attributedUserId ? { updatedByUserId: attributedUserId } : {};
}

function itemFields(p) {
  return {
    name: p.name,
    sku: p.sku ?? null,
    barcode: p.barcode ?? null,
    category: p.category ?? null,
    costPrice: p.costPrice,
    sellingPrice: p.sellingPrice,
    // Unlike imagePath/imageUrl below, this is a plain user-entered field
    // the phone is always authoritative for (including "not set"), so it's
    // sent and overwritten unconditionally, same as costPrice/sellingPrice.
    mrp: p.mrp ?? null,
    // Same "phone is always authoritative, including not set" reasoning as
    // mrp above.
    description: p.description ?? null,
    gstRate: p.gstRate,
    stockQuantity: p.stockQuantity,
    reorderLevel: p.reorderLevel,
    // Omitted (not set to null) when the phone doesn't have a value —
    // upsertBatch below uses this same field set for both create and
    // update. On create, Prisma's nullable-column default already lands on
    // null either way; on update, unconditionally sending `?? null` here
    // meant any push where the phone's local copy hadn't caught up yet
    // (right after a fresh login, before the next pull restores it) wiped
    // an already-uploaded image on the existing row. This was a real,
    // confirmed data-loss bug — a shop's item photo (and the shop logo,
    // fixed the same way) could vanish from the backend after logging out
    // and back in.
    ...(p.imagePath ? { imagePath: p.imagePath } : {}),
    ...(p.imageUrl ? { imageUrl: p.imageUrl } : {}),
    itemType: p.itemType ?? 'PRODUCT',
    inventoryEnabled: p.inventoryEnabled ?? true,
    aliases: p.aliases ?? [],
    // Same reasoning as imagePath/imageUrl above — only overwrite when this
    // push actually carries images, so a phone that hasn't uploaded its
    // gallery yet (or is on an older build that never sends this field)
    // never wipes an already-synced gallery on an update.
    ...(p.images && p.images.length ? { images: p.images } : {}),
    isActive: p.isActive,
    localCreatedAt: new Date(p.createdAt),
    localUpdatedAt: new Date(p.updatedAt),
  };
}

function customerFields(c) {
  return {
    name: c.name,
    phone: c.phone ?? null,
    email: c.email ?? null,
    address: c.address ?? null,
    totalPurchases: c.totalPurchases,
    totalBills: c.totalBills,
    totalOutstanding: c.totalOutstanding,
    advanceBalance: c.advanceBalance,
    lastVisit: c.lastVisit ? new Date(c.lastVisit) : null,
    // Same reasoning as imageUrl in itemFields() above — never wipe an
    // already-uploaded photo just because this push's phone-side copy
    // hasn't caught up with it yet.
    ...(c.imageUrl ? { imageUrl: c.imageUrl } : {}),
    localCreatedAt: new Date(c.createdAt),
    localUpdatedAt: new Date(c.updatedAt),
  };
}

function invoiceFields(inv) {
  return {
    invoiceNumber: inv.invoiceNumber,
    localCustomerId: inv.customerId ?? null,
    customerName: inv.customerName,
    subtotal: inv.subtotal,
    discountType: inv.discountType,
    discountValue: inv.discountValue,
    discountAmount: inv.discountAmount,
    gstAmount: inv.gstAmount,
    grandTotal: inv.grandTotal,
    receivedAmount: inv.receivedAmount,
    pendingAmount: inv.pendingAmount,
    paymentMode: inv.paymentMode,
    status: inv.status,
    notes: inv.notes ?? null,
    // Counted by shop-voice.service.js's Basic-plan quota check — must
    // reflect exactly what the phone marked at checkout, never inferred
    // here.
    isVoiceCreated: inv.isVoiceCreated ?? false,
    localCreatedAt: new Date(inv.createdAt),
    localUpdatedAt: new Date(inv.updatedAt),
  };
}

function inventoryTransactionFields(t) {
  return {
    localItemId: t.itemId,
    localInvoiceId: t.invoiceId ?? null,
    type: t.type,
    reason: t.reason ?? null,
    quantityChange: t.quantityChange,
    stockBefore: t.stockBefore,
    stockAfter: t.stockAfter,
    notes: t.notes ?? null,
    localCreatedAt: new Date(t.createdAt),
  };
}

function paymentTransactionFields(p) {
  return {
    localCustomerId: p.customerId,
    localInvoiceId: p.invoiceId ?? null,
    type: p.type,
    amount: p.amount,
    paymentMode: p.paymentMode,
    notes: p.notes ?? null,
    localCreatedAt: new Date(p.createdAt),
    // Unlike item/customer/invoice, this was never wired through here —
    // every payment ever pushed landed with localUpdatedAt still null, which
    // is exactly what the phone's pull-merge (DateTime.parse on a required
    // field) crashes on for every shop with payment history.
    localUpdatedAt: new Date(p.updatedAt ?? p.createdAt),
    // Captured once by the phone's PaymentTransactionRepository.insert() —
    // an older app build that never sends these simply omits them (never
    // sent as null), so financial-conflict detection below can tell "can't
    // check" apart from "checked and it's zero".
    ...(p.customerOutstandingBefore != null
      ? { customerOutstandingBefore: p.customerOutstandingBefore }
      : {}),
    ...(p.customerAdvanceBefore != null ? { customerAdvanceBefore: p.customerAdvanceBefore } : {}),
  };
}

// Maps an entity's create/update/delete actions onto the permission
// vocabulary (services/permissions.js) — only ever consulted when the push
// came in on a User-token (req.membership set); a legacy Shop-token push
// passes no canApply at all, so upsertBatch behaves exactly as it always
// has. isDeleteRecord is optional — only items have a real "delete" concept
// on the sync path (isActive flipping to false); every other entity here is
// only ever created or updated from the phone.
function makeCanApply(effectivePermissions, { create, update, delete: del, isDeleteRecord }) {
  return (record, isCreate) => {
    if (isCreate) return effectivePermissions.has(create);
    if (isDeleteRecord && isDeleteRecord(record)) return effectivePermissions.has(del ?? update);
    return effectivePermissions.has(update);
  };
}

// Batches upserts for entities keyed on (shopId, localId): one existence
// check across the whole batch, then a single createMany for everything new
// and per-row updates only for rows that already exist. An upsert() does its
// own existence check internally, so N of them is up to 2N round-trips; this
// collapses the check into one query and, for a first sync or any batch
// that's mostly-new (the exact shape that blew the invoice-items timeout),
// most of the work becomes a single createMany instead of N upserts.
//
// Returns { created, updated, skipped } — the original record objects for
// created/updated (so the caller can emit audit rows without a second
// lookup), and { record, isCreate } for anything canApply rejected.
async function upsertBatch(
  tx,
  model,
  shopId,
  records,
  buildFields,
  buildCreateOnlyFields,
  buildUpdateOnlyFields,
  canApply
) {
  const outcome = { created: [], updated: [], skipped: [] };
  if (!records.length) return outcome;
  const localIds = records.map((r) => r.localId);
  const existing = await tx[model].findMany({
    where: { shopId, localId: { in: localIds } },
    select: { localId: true },
  });
  const existingIds = new Set(existing.map((e) => e.localId));

  const toCreate = [];
  const toUpdate = [];
  for (const r of records) {
    const isCreate = !existingIds.has(r.localId);
    if (canApply && !canApply(r, isCreate)) {
      outcome.skipped.push({ record: r, isCreate });
      continue;
    }
    (isCreate ? toCreate : toUpdate).push(r);
  }

  if (toCreate.length) {
    await tx[model].createMany({
      data: toCreate.map((r) => ({
        shopId,
        localId: r.localId,
        ...buildFields(r),
        ...(buildCreateOnlyFields ? buildCreateOnlyFields(r) : {}),
      })),
    });
    outcome.created = toCreate;
  }
  for (const r of toUpdate) {
    await tx[model].update({
      where: { shopId_localId: { shopId, localId: r.localId } },
      data: { ...buildFields(r), ...(buildUpdateOnlyFields ? buildUpdateOnlyFields(r) : {}) },
    });
  }
  outcome.updated = toUpdate;

  return outcome;
}

// A first-ever (or otherwise very large) historical sync shouldn't flood the
// audit log with one row per record — this is a simple, self-contained
// heuristic (no new wire-format field needed) for "routine, incremental
// sync" vs. "bulk history dump".
const AUDIT_CRUD_BATCH_THRESHOLD = 50;

async function syncData(
  shopId,
  {
    shopProfile,
    items = [],
    customers = [],
    invoices = [],
    inventoryTransactions = [],
    paymentTransactions = [],
  },
  explicitUserId,
  membership
) {
  // explicitUserId is the real authenticated person when this request came
  // in on a User-token with an active membership (requireShopOrUserContext)
  // — more accurate than guessing, since it might not be the owner at all.
  // Falls back to Phase 6's owner-resolution only for a legacy Shop-token
  // request, exactly as before. Resolved once per sync call, not per
  // record — this transaction already has a documented history of timeout
  // problems under real invoice-history load (see the timeout comment
  // below), so this must never become O(n).
  const attributedUserId = explicitUserId ?? (await resolveOwnerUserId(shopId));
  const buildCreateFields = () => createAttributionFields(attributedUserId);
  const buildUpdateFields = () => updateAttributionFields(attributedUserId);

  // Only a User-token push carries a membership (see
  // requireShopOrUserContext) — a legacy Shop-token push (the shop's own
  // device) gets every canApply left undefined below, so upsertBatch never
  // filters anything, byte-for-byte the same as before this existed.
  let canApplyItem;
  let canApplyCustomer;
  let canApplyInvoice;
  let canApplyPayment;
  let canApplyInventoryTx;
  if (membership) {
    const overrides = await prisma.shopUserPermission.findMany({
      where: { shopUserId: membership.shopUserId },
      select: { permission: true, granted: true },
    });
    const effectivePermissions = resolveEffectivePermissions(membership.role, overrides);
    canApplyItem = makeCanApply(effectivePermissions, {
      create: 'item.create',
      update: 'item.update',
      delete: 'item.delete',
      isDeleteRecord: (r) => r.isActive === false,
    });
    canApplyCustomer = makeCanApply(effectivePermissions, {
      create: 'customer.create',
      update: 'customer.update',
    });
    canApplyInvoice = makeCanApply(effectivePermissions, { create: 'bill.create', update: 'bill.update' });
    canApplyPayment = makeCanApply(effectivePermissions, {
      create: 'payment.create',
      update: 'payment.update',
    });
    canApplyInventoryTx = makeCanApply(effectivePermissions, {
      create: 'inventory.create',
      update: 'inventory.update',
    });
  }

  const inventoryConflicts = [];
  const financialConflicts = [];
  const invoiceNumberConflicts = [];
  const rejectedForPermission = [];

  const result = await prisma.$transaction(
    async (tx) => {
      // Detects (never corrects) a concurrent-write conflict: if this push's
      // earliest transaction for an item assumed a stockBefore that doesn't
      // match what the server currently has, another device's change landed
      // here first and this push doesn't know about it. Must run before the
      // syncedItem upsert below, which is about to overwrite stockQuantity
      // with whatever this push believes it should be regardless. One
      // batched query — not per-transaction — same discipline as every
      // other addition to this already-timeout-sensitive transaction.
      const earliestTxByItem = new Map();
      for (const t of inventoryTransactions) {
        const existing = earliestTxByItem.get(t.itemId);
        if (!existing || new Date(t.createdAt) < new Date(existing.createdAt)) {
          earliestTxByItem.set(t.itemId, t);
        }
      }
      const referencedLocalIds = [...earliestTxByItem.keys()];
      const currentStockRows = referencedLocalIds.length
        ? await tx.syncedItem.findMany({
            where: { shopId, localId: { in: referencedLocalIds } },
            select: { localId: true, stockQuantity: true },
          })
        : [];
      const currentStockByLocalId = new Map(currentStockRows.map((r) => [r.localId, r.stockQuantity]));
      for (const [localItemId, t] of earliestTxByItem) {
        const currentStock = currentStockByLocalId.get(localItemId);
        // undefined (not just a mismatch) is deliberately excluded — a
        // brand new item, not yet in syncedItem at all, is never a conflict.
        if (currentStock !== undefined && currentStock !== t.stockBefore) {
          inventoryConflicts.push({
            localItemId,
            expectedStockBefore: t.stockBefore,
            actualStock: currentStock,
            quantityChange: t.quantityChange,
          });
        }
      }

      // Same idea, for a customer's running balance — only checkable for a
      // payment transaction that actually carries the snapshot fields (an
      // older app build never sends them, and that's "can't check", never
      // treated as a mismatch). Must run before the syncedCustomer upsert
      // below overwrites totalOutstanding/advanceBalance regardless. A
      // small epsilon (not strict equality) since these are stored as
      // floating-point currency amounts.
      const earliestPaymentTxByCustomer = new Map();
      for (const p of paymentTransactions) {
        if (p.customerOutstandingBefore == null && p.customerAdvanceBefore == null) continue;
        const existing = earliestPaymentTxByCustomer.get(p.customerId);
        if (!existing || new Date(p.createdAt) < new Date(existing.createdAt)) {
          earliestPaymentTxByCustomer.set(p.customerId, p);
        }
      }
      const referencedCustomerLocalIds = [...earliestPaymentTxByCustomer.keys()];
      const currentCustomerRows = referencedCustomerLocalIds.length
        ? await tx.syncedCustomer.findMany({
            where: { shopId, localId: { in: referencedCustomerLocalIds } },
            select: { localId: true, totalOutstanding: true, advanceBalance: true },
          })
        : [];
      const currentByCustomerLocalId = new Map(currentCustomerRows.map((r) => [r.localId, r]));
      const EPSILON = 0.01;
      for (const [customerLocalId, p] of earliestPaymentTxByCustomer) {
        const current = currentByCustomerLocalId.get(customerLocalId);
        if (!current) continue; // brand-new customer — never a conflict
        const outstandingMismatch =
          p.customerOutstandingBefore != null &&
          Math.abs(current.totalOutstanding - p.customerOutstandingBefore) > EPSILON;
        const advanceMismatch =
          p.customerAdvanceBefore != null && Math.abs(current.advanceBalance - p.customerAdvanceBefore) > EPSILON;
        if (outstandingMismatch || advanceMismatch) {
          financialConflicts.push({
            localCustomerId: customerLocalId,
            expectedOutstandingBefore: p.customerOutstandingBefore,
            actualOutstanding: current.totalOutstanding,
            expectedAdvanceBefore: p.customerAdvanceBefore,
            actualAdvance: current.advanceBalance,
          });
        }
      }

      // Detects (never corrects, never blocks) two different local
      // invoices in the same shop claiming the same invoiceNumber —
      // invoiceNumber has no uniqueness constraint today (client-generated,
      // no backend sequence). Must run before the syncedInvoice upsert
      // below, against the shop's pre-push active invoices.
      const pushedInvoiceNumbers = [...new Set(invoices.map((inv) => inv.invoiceNumber))];
      const existingInvoicesWithSameNumbers = pushedInvoiceNumbers.length
        ? await tx.syncedInvoice.findMany({
            where: { shopId, invoiceNumber: { in: pushedInvoiceNumbers }, deletedAt: null },
            select: { localId: true, invoiceNumber: true },
          })
        : [];
      const localIdsByInvoiceNumber = new Map();
      for (const row of existingInvoicesWithSameNumbers) {
        if (!localIdsByInvoiceNumber.has(row.invoiceNumber)) {
          localIdsByInvoiceNumber.set(row.invoiceNumber, new Set());
        }
        localIdsByInvoiceNumber.get(row.invoiceNumber).add(row.localId);
      }
      for (const inv of invoices) {
        const existingLocalIds = localIdsByInvoiceNumber.get(inv.invoiceNumber);
        if (!existingLocalIds) continue;
        const conflicting = [...existingLocalIds].filter((id) => id !== inv.localId);
        if (conflicting.length) {
          invoiceNumberConflicts.push({
            invoiceNumber: inv.invoiceNumber,
            pushedLocalId: inv.localId,
            conflictingLocalIds: conflicting,
          });
        }
      }

      const itemsOutcome = await upsertBatch(
        tx,
        'syncedItem',
        shopId,
        items,
        itemFields,
        buildCreateFields,
        buildUpdateFields,
        canApplyItem
      );
      const customersOutcome = await upsertBatch(
        tx,
        'syncedCustomer',
        shopId,
        customers,
        customerFields,
        buildCreateFields,
        buildUpdateFields,
        canApplyCustomer
      );

      // Invoices themselves are batched the same way as items/customers
      // above. Items are immutable once created — simplest correct approach is
      // to replace them wholesale rather than diff/upsert each one — batched
      // across *all* invoices (one deleteMany + one createMany) rather than 2
      // extra queries per invoice: with real invoice history that was enough
      // sequential round-trips inside one interactive transaction to blow past
      // Prisma's timeout and get the transaction killed mid-sync (surfaced to
      // the client as a bare HTTP 500).
      const invoicesOutcome = await upsertBatch(
        tx,
        'syncedInvoice',
        shopId,
        invoices,
        invoiceFields,
        buildCreateFields,
        buildUpdateFields,
        canApplyInvoice
      );
      const appliedInvoices = [...invoicesOutcome.created, ...invoicesOutcome.updated];
      const syncedInvoiceRows = appliedInvoices.length
        ? await tx.syncedInvoice.findMany({
            where: { shopId, localId: { in: appliedInvoices.map((inv) => inv.localId) } },
            select: { id: true, localId: true },
          })
        : [];
      const invoiceIdByLocalId = new Map(syncedInvoiceRows.map((row) => [row.localId, row.id]));
      const syncedInvoices = appliedInvoices.map((inv) => ({
        inv,
        invoiceId: invoiceIdByLocalId.get(inv.localId),
      }));

      if (syncedInvoices.length) {
        await tx.syncedInvoiceItem.deleteMany({
          where: { invoiceId: { in: syncedInvoices.map((s) => s.invoiceId) } },
        });
        const allItems = syncedInvoices.flatMap(({ inv, invoiceId }) =>
          (inv.items ?? []).map((item) => ({
            invoiceId,
            localId: item.localId,
            localItemId: item.itemId,
            itemName: item.itemName,
            itemType: item.itemType ?? 'PRODUCT',
            quantity: item.quantity,
            sellingPrice: item.sellingPrice,
            gstRate: item.gstRate,
            gstAmount: item.gstAmount,
            lineTotal: item.lineTotal,
          })),
        );
        if (allItems.length) {
          await tx.syncedInvoiceItem.createMany({ data: allItems });
        }
      }

      const inventoryTxOutcome = await upsertBatch(
        tx,
        'syncedInventoryTransaction',
        shopId,
        inventoryTransactions,
        inventoryTransactionFields,
        buildCreateFields,
        buildUpdateFields,
        canApplyInventoryTx
      );
      const paymentsOutcome = await upsertBatch(
        tx,
        'syncedPaymentTransaction',
        shopId,
        paymentTransactions,
        paymentTransactionFields,
        buildCreateFields,
        buildUpdateFields,
        canApplyPayment
      );

      for (const outcome of [itemsOutcome, customersOutcome, invoicesOutcome, inventoryTxOutcome, paymentsOutcome]) {
        rejectedForPermission.push(...outcome.skipped);
      }

      const syncedAt = new Date();

      // lastDataSyncAt is routine bookkeeping that happens on every sync
      // whether or not the profile itself changed — written via raw SQL
      // specifically so it does NOT trip Shop.updatedAt's @updatedAt directive.
      // If it went through a normal Prisma update() (even one that touches no
      // other field), updatedAt would bump on every single sync regardless of
      // whether the profile actually changed, making the phone's pull-sync
      // think the shop profile is "newer" and re-fetch/re-merge it every
      // cycle — harmless once the phone compares timestamps before applying,
      // but pure waste. updatedAt should only change when the profile does.
      await tx.$executeRaw`UPDATE "Shop" SET "lastDataSyncAt" = ${syncedAt} WHERE "id" = ${shopId}`;

      if (shopProfile) {
        await tx.shop.update({
          where: { id: shopId },
          data: {
            name: shopProfile.name,
            ownerName: shopProfile.ownerName,
            address: shopProfile.address ?? null,
            gstNumber: shopProfile.gstNumber ?? null,
            ...(shopProfile.currency !== undefined ? { currency: shopProfile.currency } : {}),
            ...(shopProfile.gstEnabled !== undefined ? { gstEnabled: shopProfile.gstEnabled } : {}),
            ...(shopProfile.defaultGstRate !== undefined
              ? { defaultGstRate: shopProfile.defaultGstRate }
              : {}),
            ...(shopProfile.upiId !== undefined ? { upiId: shopProfile.upiId ?? null } : {}),
            ...(shopProfile.categories !== undefined ? { categories: shopProfile.categories } : {}),
            ...(shopProfile.logoUrl !== undefined ? { logoUrl: shopProfile.logoUrl ?? null } : {}),
          },
        });
      }

      return {
        received: {
          items: itemsOutcome.created.length + itemsOutcome.updated.length,
          customers: customersOutcome.created.length + customersOutcome.updated.length,
          invoices: invoicesOutcome.created.length + invoicesOutcome.updated.length,
          inventoryTransactions: inventoryTxOutcome.created.length + inventoryTxOutcome.updated.length,
          paymentTransactions: paymentsOutcome.created.length + paymentsOutcome.updated.length,
        },
        rejected: rejectedForPermission.length,
        syncedAt,
        // Internal handoff to the audit-emission code below, after the
        // transaction commits — deleted before this ever reaches the caller,
        // never part of the public response shape the phone parses.
        __outcomes: { itemsOutcome, customersOutcome, invoicesOutcome, paymentsOutcome },
      };
    },
    {
      // Default interactive-transaction timeout is 5s — every record here is a
      // separate sequential await (an invoice alone is 3 queries: upsert,
      // deleteMany, createMany), so any shop with a real amount of history
      // blows past that and Prisma kills the transaction mid-sync with
      // "Transaction not found" (surfaces to the client as a bare HTTP 500).
      // 60s — generous on purpose: this runs as a background sync (the app
      // already shows "Syncing…" rather than blocking), and per-query latency
      // varies a lot with where the request originates relative to the DB.
      timeout: 60000,
    },
  );

  // Everything below is fired after the transaction commits, not inside it —
  // auditLog.record is already best-effort/error-swallowing, and all of this
  // is pure observability, never something the sync's own success should
  // wait on or be affected by.
  for (const conflict of inventoryConflicts) {
    await auditLog.record({
      shopId,
      userId: attributedUserId,
      action: 'INVENTORY_CONFLICT_DETECTED',
      module: 'inventory',
      entityType: 'Item',
      metadata: conflict,
    });
  }
  for (const conflict of financialConflicts) {
    await auditLog.record({
      shopId,
      userId: attributedUserId,
      action: 'FINANCIAL_CONFLICT_DETECTED',
      module: 'payment',
      entityType: 'Customer',
      metadata: conflict,
    });
  }
  for (const conflict of invoiceNumberConflicts) {
    await auditLog.record({
      shopId,
      userId: attributedUserId,
      action: 'INVOICE_NUMBER_CONFLICT_DETECTED',
      module: 'invoice',
      entityType: 'Invoice',
      metadata: conflict,
    });
  }
  for (const { record, isCreate } of rejectedForPermission) {
    await auditLog.record({
      shopId,
      userId: attributedUserId,
      action: 'SYNC_RECORD_REJECTED_INSUFFICIENT_PERMISSION',
      module: 'sync',
      metadata: { localId: record.localId, isCreate },
    });
  }

  const { itemsOutcome, customersOutcome, invoicesOutcome, paymentsOutcome } = result.__outcomes;
  const totalForAudit =
    itemsOutcome.created.length +
    itemsOutcome.updated.length +
    customersOutcome.created.length +
    customersOutcome.updated.length +
    invoicesOutcome.created.length +
    invoicesOutcome.updated.length +
    paymentsOutcome.created.length +
    paymentsOutcome.updated.length;
  if (totalForAudit > 0 && totalForAudit <= AUDIT_CRUD_BATCH_THRESHOLD) {
    for (const item of itemsOutcome.created) {
      await auditLog.record({
        shopId,
        userId: attributedUserId,
        action: 'CREATE_ITEM',
        module: 'item',
        entityType: 'Item',
        metadata: { localId: item.localId },
      });
    }
    for (const item of itemsOutcome.updated) {
      await auditLog.record({
        shopId,
        userId: attributedUserId,
        action: item.isActive === false ? 'DELETE_ITEM' : 'UPDATE_ITEM',
        module: 'item',
        entityType: 'Item',
        metadata: { localId: item.localId },
      });
    }
    for (const c of customersOutcome.created) {
      await auditLog.record({
        shopId,
        userId: attributedUserId,
        action: 'CREATE_CUSTOMER',
        module: 'customer',
        entityType: 'Customer',
        metadata: { localId: c.localId },
      });
    }
    for (const c of customersOutcome.updated) {
      await auditLog.record({
        shopId,
        userId: attributedUserId,
        action: 'UPDATE_CUSTOMER',
        module: 'customer',
        entityType: 'Customer',
        metadata: { localId: c.localId },
      });
    }
    for (const inv of invoicesOutcome.created) {
      await auditLog.record({
        shopId,
        userId: attributedUserId,
        action: 'CREATE_BILL',
        module: 'invoice',
        entityType: 'Invoice',
        metadata: { localId: inv.localId, invoiceNumber: inv.invoiceNumber },
      });
    }
    for (const inv of invoicesOutcome.updated) {
      await auditLog.record({
        shopId,
        userId: attributedUserId,
        action: 'UPDATE_BILL',
        module: 'invoice',
        entityType: 'Invoice',
        metadata: { localId: inv.localId, invoiceNumber: inv.invoiceNumber },
      });
    }
    for (const p of paymentsOutcome.created) {
      await auditLog.record({
        shopId,
        userId: attributedUserId,
        action: 'PAYMENT_RECEIVED',
        module: 'payment',
        entityType: 'PaymentTransaction',
        metadata: { localId: p.localId, type: p.type, amount: p.amount },
      });
    }
    for (const p of paymentsOutcome.updated) {
      await auditLog.record({
        shopId,
        userId: attributedUserId,
        action: 'PAYMENT_UPDATED',
        module: 'payment',
        entityType: 'PaymentTransaction',
        metadata: { localId: p.localId, type: p.type, amount: p.amount },
      });
    }
  }

  delete result.__outcomes;
  return result;
}

// ── Pull (cloud → phone) ─────────────────────────────────────────────────
// Mirrors the push side's JSON field names (localId, customerId/itemId
// rather than the DB's localCustomerId/localItemId, etc.) so the phone's
// merge code can reuse the same shape it already knows from building push
// payloads. Never include deletedAt in what push writes (see the field
// builders above) — it's only ever read here, on the way down.

function itemOut(p) {
  return {
    localId: p.localId,
    name: p.name,
    sku: p.sku,
    barcode: p.barcode,
    category: p.category,
    costPrice: p.costPrice,
    sellingPrice: p.sellingPrice,
    mrp: p.mrp,
    description: p.description,
    gstRate: p.gstRate,
    stockQuantity: p.stockQuantity,
    reorderLevel: p.reorderLevel,
    imagePath: p.imagePath,
    imageUrl: p.imageUrl,
    itemType: p.itemType,
    inventoryEnabled: p.inventoryEnabled,
    aliases: p.aliases,
    images: p.images,
    isActive: p.isActive,
    deletedAt: p.deletedAt,
    createdAt: p.localCreatedAt,
    updatedAt: p.localUpdatedAt,
  };
}

function customerOut(c) {
  return {
    localId: c.localId,
    name: c.name,
    phone: c.phone,
    email: c.email,
    address: c.address,
    totalPurchases: c.totalPurchases,
    totalBills: c.totalBills,
    totalOutstanding: c.totalOutstanding,
    advanceBalance: c.advanceBalance,
    lastVisit: c.lastVisit,
    imageUrl: c.imageUrl,
    deletedAt: c.deletedAt,
    createdAt: c.localCreatedAt,
    updatedAt: c.localUpdatedAt,
  };
}

function invoiceOut(inv) {
  return {
    localId: inv.localId,
    invoiceNumber: inv.invoiceNumber,
    customerId: inv.localCustomerId,
    customerName: inv.customerName,
    subtotal: inv.subtotal,
    discountType: inv.discountType,
    discountValue: inv.discountValue,
    discountAmount: inv.discountAmount,
    gstAmount: inv.gstAmount,
    grandTotal: inv.grandTotal,
    receivedAmount: inv.receivedAmount,
    pendingAmount: inv.pendingAmount,
    paymentMode: inv.paymentMode,
    status: inv.status,
    notes: inv.notes,
    isVoiceCreated: inv.isVoiceCreated,
    deletedAt: inv.deletedAt,
    createdAt: inv.localCreatedAt,
    updatedAt: inv.localUpdatedAt,
    items: (inv.items ?? []).map((item) => ({
      itemId: item.localItemId,
      itemName: item.itemName,
      itemType: item.itemType,
      quantity: item.quantity,
      sellingPrice: item.sellingPrice,
      gstRate: item.gstRate,
      gstAmount: item.gstAmount,
      lineTotal: item.lineTotal,
    })),
  };
}

function paymentOut(p) {
  return {
    localId: p.localId,
    customerId: p.localCustomerId,
    invoiceId: p.localInvoiceId,
    type: p.type,
    amount: p.amount,
    paymentMode: p.paymentMode,
    notes: p.notes,
    deletedAt: p.deletedAt,
    createdAt: p.localCreatedAt,
    updatedAt: p.localUpdatedAt,
    customerOutstandingBefore: p.customerOutstandingBefore,
    customerAdvanceBefore: p.customerAdvanceBefore,
  };
}

async function pullData(shopId, since) {
  // Captured before querying, same reasoning as syncData's syncedAt — a
  // write that lands mid-query is simply picked up by the next pull.
  const serverTime = new Date();
  const changedSince = since ? { gt: since } : undefined;

  const [shop, items, customers, invoices, payments] = await Promise.all([
    prisma.shop.findUnique({ where: { id: shopId } }),
    prisma.syncedItem.findMany({
      where: { shopId, ...(changedSince ? { localUpdatedAt: changedSince } : {}) },
    }),
    prisma.syncedCustomer.findMany({
      where: { shopId, ...(changedSince ? { localUpdatedAt: changedSince } : {}) },
    }),
    prisma.syncedInvoice.findMany({
      where: { shopId, ...(changedSince ? { localUpdatedAt: changedSince } : {}) },
      include: { items: true },
    }),
    prisma.syncedPaymentTransaction.findMany({
      where: { shopId, ...(changedSince ? { localUpdatedAt: changedSince } : {}) },
    }),
  ]);

  const shopChanged = shop && (!since || shop.updatedAt > since);

  return {
    serverTime,
    shopProfile: shopChanged
      ? {
          name: shop.name,
          ownerName: shop.ownerName,
          address: shop.address,
          gstNumber: shop.gstNumber,
          currency: shop.currency,
          gstEnabled: shop.gstEnabled,
          defaultGstRate: shop.defaultGstRate,
          upiId: shop.upiId,
          categories: shop.categories,
          logoUrl: shop.logoUrl,
          updatedAt: shop.updatedAt,
        }
      : null,
    items: items.map(itemOut),
    customers: customers.map(customerOut),
    invoices: invoices.map(invoiceOut),
    payments: payments.map(paymentOut),
  };
}

module.exports = { syncData, pullData };
