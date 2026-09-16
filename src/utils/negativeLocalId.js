// Admin-created records (from the web panel, not the phone) need a localId
// that can never collide with a real phone-originated SQLite autoincrement
// id — those are always positive. Negative ids are reserved for this.
async function nextNegativeLocalId(client, model, shopId) {
  const result = await client[model].aggregate({
    where: { shopId },
    _min: { localId: true },
  });
  const min = result._min.localId ?? 0;
  return Math.min(min, 0) - 1;
}

// Wraps a whole create (plus whatever else needs to happen alongside it —
// see shop-payments' balance reconciliation) with an id-collision retry.
// nextNegativeLocalId() reads MIN(localId) with no row lock, so two
// concurrent admin creates for the same shop can read the same value and
// race to insert the same negative id; the loser hit the @@unique
// constraint as an unhandled P2002 (a bare 500). Retrying the *whole*
// transaction (not just the insert) is required — once a query inside a
// Postgres transaction errors, that transaction is aborted and nothing else
// in it can run, so a fresh attempt needs a fresh $transaction.
async function createWithNegativeLocalId(prismaClient, model, shopId, work, { retries = 3 } = {}) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await prismaClient.$transaction(async (tx) => {
        const localId = await nextNegativeLocalId(tx, model, shopId);
        return work(tx, localId);
      });
    } catch (err) {
      if (err.code === 'P2002' && attempt < retries) continue;
      throw err;
    }
  }
}

module.exports = { nextNegativeLocalId, createWithNegativeLocalId };
