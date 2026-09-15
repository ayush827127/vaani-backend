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
    imagePath: p.imagePath ?? null,
    imageUrl: p.imageUrl ?? null,
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
    for (const p of products) {
      await tx.syncedProduct.upsert({
        where: { shopId_localId: { shopId, localId: p.localId } },
        update: productFields(p),
        create: { shopId, localId: p.localId, ...productFields(p) },
      });
    }

    for (const c of customers) {
      await tx.syncedCustomer.upsert({
        where: { shopId_localId: { shopId, localId: c.localId } },
        update: customerFields(c),
        create: { shopId, localId: c.localId, ...customerFields(c) },
      });
    }

    // Items are immutable once created — simplest correct approach is to
    // replace them wholesale rather than diff/upsert each one. Batched across
    // *all* invoices (one deleteMany + one createMany) rather than 2 extra
    // queries per invoice inside the loop above — with real invoice history
    // that was enough sequential round-trips inside one interactive
    // transaction to blow past Prisma's timeout and get the transaction
    // killed mid-sync (surfaced to the client as a bare HTTP 500).
    const syncedInvoices = [];
    for (const inv of invoices) {
      const synced = await tx.syncedInvoice.upsert({
        where: { shopId_localId: { shopId, localId: inv.localId } },
        update: invoiceFields(inv),
        create: { shopId, localId: inv.localId, ...invoiceFields(inv) },
      });
      syncedInvoices.push({ inv, invoiceId: synced.id });
    }

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

    for (const t of inventoryTransactions) {
      await tx.syncedInventoryTransaction.upsert({
        where: { shopId_localId: { shopId, localId: t.localId } },
        update: inventoryTransactionFields(t),
        create: { shopId, localId: t.localId, ...inventoryTransactionFields(t) },
      });
    }

    for (const p of paymentTransactions) {
      await tx.syncedPaymentTransaction.upsert({
        where: { shopId_localId: { shopId, localId: p.localId } },
        update: paymentTransactionFields(p),
        create: { shopId, localId: p.localId, ...paymentTransactionFields(p) },
      });
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
