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

module.exports = { nextNegativeLocalId };
