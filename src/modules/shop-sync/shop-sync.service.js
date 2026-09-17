const prisma = require('../../config/prisma');

function productFields(p) {
  return {
    name: p.name,
    sku: p.sku ?? null,
    barcode: p.barcode ?? null,
    category: p.category ?? null,
    costPrice: p.costPrice,
    sellingPrice: p.sellingPrice,
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
    // confirmed data-loss bug — a shop's product photo (and the shop logo,
    // fixed the same way) could vanish from the backend after logging out
    // and back in.
    ...(p.imagePath ? { imagePath: p.imagePath } : {}),
    ...(p.imageUrl ? { imageUrl: p.imageUrl } : {}),
    aliases: p.aliases ?? [],
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
    localProductId: t.productId,
    localInvoiceId: t.invoiceId ?? null,
    type: t.type,
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
    // Unlike product/customer/invoice, this was never wired through here —
    // every payment ever pushed landed with localUpdatedAt still null, which
    // is exactly what the phone's pull-merge (DateTime.parse on a required
    // field) crashes on for every shop with payment history.
    localUpdatedAt: new Date(p.updatedAt ?? p.createdAt),
  };
}

// Batches upserts for entities keyed on (shopId, localId): one existence
// check across the whole batch, then a single createMany for everything new
// and per-row updates only for rows that already exist. An upsert() does its
// own existence check internally, so N of them is up to 2N round-trips; this
// collapses the check into one query and, for a first sync or any batch
// that's mostly-new (the exact shape that blew the invoice-items timeout),
// most of the work becomes a single createMany instead of N upserts.
async function upsertBatch(tx, model, shopId, records, buildFields) {
  if (!records.length) return;
  const localIds = records.map((r) => r.localId);
  const existing = await tx[model].findMany({
    where: { shopId, localId: { in: localIds } },
    select: { localId: true },
  });
  const existingIds = new Set(existing.map((e) => e.localId));

  const toCreate = records.filter((r) => !existingIds.has(r.localId));
  if (toCreate.length) {
    await tx[model].createMany({
      data: toCreate.map((r) => ({ shopId, localId: r.localId, ...buildFields(r) })),
    });
  }
  for (const r of records) {
    if (!existingIds.has(r.localId)) continue;
    await tx[model].update({
      where: { shopId_localId: { shopId, localId: r.localId } },
      data: buildFields(r),
    });
  }
}

async function syncData(
  shopId,
  {
    shopProfile,
    products = [],
    customers = [],
    invoices = [],
    inventoryTransactions = [],
    paymentTransactions = [],
  }
) {
  return prisma.$transaction(async (tx) => {
    await upsertBatch(tx, 'syncedProduct', shopId, products, productFields);
    await upsertBatch(tx, 'syncedCustomer', shopId, customers, customerFields);

    // Invoices themselves are batched the same way as products/customers
    // above. Items are immutable once created — simplest correct approach is
    // to replace them wholesale rather than diff/upsert each one — batched
    // across *all* invoices (one deleteMany + one createMany) rather than 2
    // extra queries per invoice: with real invoice history that was enough
    // sequential round-trips inside one interactive transaction to blow past
    // Prisma's timeout and get the transaction killed mid-sync (surfaced to
    // the client as a bare HTTP 500).
    await upsertBatch(tx, 'syncedInvoice', shopId, invoices, invoiceFields);
    const syncedInvoiceRows = invoices.length
      ? await tx.syncedInvoice.findMany({
          where: { shopId, localId: { in: invoices.map((inv) => inv.localId) } },
          select: { id: true, localId: true },
        })
      : [];
    const invoiceIdByLocalId = new Map(syncedInvoiceRows.map((row) => [row.localId, row.id]));
    const syncedInvoices = invoices.map((inv) => ({
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
          localProductId: item.productId,
          productName: item.productName,
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

    await upsertBatch(
      tx,
      'syncedInventoryTransaction',
      shopId,
      inventoryTransactions,
      inventoryTransactionFields
    );
    await upsertBatch(tx, 'syncedPaymentTransaction', shopId, paymentTransactions, paymentTransactionFields);

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
        products: products.length,
        customers: customers.length,
        invoices: invoices.length,
        inventoryTransactions: inventoryTransactions.length,
        paymentTransactions: paymentTransactions.length,
      },
      syncedAt,
    };
  }, {
    // Default interactive-transaction timeout is 5s — every record here is a
    // separate sequential await (an invoice alone is 3 queries: upsert,
    // deleteMany, createMany), so any shop with a real amount of history
    // blows past that and Prisma kills the transaction mid-sync with
    // "Transaction not found" (surfaces to the client as a bare HTTP 500).
    // 60s — generous on purpose: this runs as a background sync (the app
    // already shows "Syncing…" rather than blocking), and per-query latency
    // varies a lot with where the request originates relative to the DB.
    timeout: 60000,
  });
}

// ── Pull (cloud → phone) ─────────────────────────────────────────────────
// Mirrors the push side's JSON field names (localId, customerId/productId
// rather than the DB's localCustomerId/localProductId, etc.) so the phone's
// merge code can reuse the same shape it already knows from building push
// payloads. Never include deletedAt in what push writes (see the field
// builders above) — it's only ever read here, on the way down.

function productOut(p) {
  return {
    localId: p.localId,
    name: p.name,
    sku: p.sku,
    barcode: p.barcode,
    category: p.category,
    costPrice: p.costPrice,
    sellingPrice: p.sellingPrice,
    gstRate: p.gstRate,
    stockQuantity: p.stockQuantity,
    reorderLevel: p.reorderLevel,
    imagePath: p.imagePath,
    imageUrl: p.imageUrl,
    aliases: p.aliases,
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
      productId: item.localProductId,
      productName: item.productName,
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
  };
}

async function pullData(shopId, since) {
  // Captured before querying, same reasoning as syncData's syncedAt — a
  // write that lands mid-query is simply picked up by the next pull.
  const serverTime = new Date();
  const changedSince = since ? { gt: since } : undefined;

  const [shop, products, customers, invoices, payments] = await Promise.all([
    prisma.shop.findUnique({ where: { id: shopId } }),
    prisma.syncedProduct.findMany({
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
    products: products.map(productOut),
    customers: customers.map(customerOut),
    invoices: invoices.map(invoiceOut),
    payments: payments.map(paymentOut),
  };
}

module.exports = { syncData, pullData };
