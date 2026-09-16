// `page`/`limit` query params were passed straight through `Number(...)`
// with no validation — a caller sending `page=0`, a negative value, or
// non-numeric junk produced a negative/NaN Prisma `skip`, which throws and
// falls through to a bare 500 instead of just... being ignored like any
// other malformed pagination request should be.
function parsePagination(query, { defaultLimit = 20, maxLimit = 100 } = {}) {
  const page = Math.max(1, Math.trunc(Number(query.page)) || 1);
  const rawLimit = Math.trunc(Number(query.limit)) || defaultLimit;
  const limit = Math.min(maxLimit, Math.max(1, rawLimit));
  return { page, limit };
}

module.exports = { parsePagination };
