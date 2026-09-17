const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Neon's pooled endpoint drops idle connections when its compute auto-
// suspends (independent of Render's own idle-sleep) — the *first* query
// after any gap regularly throws a raw P1001 ("Can't reach database
// server") or P1017 ("Server has closed the connection"), even though a
// second attempt moments later succeeds. Reproduced directly against
// production from a dev machine (no Render, no mobile network involved),
// so this isn't a Render- or network-specific flake. Nothing upstream
// wraps these in AppError, so uncaught they became a bare, unexplained 500
// on essentially any endpoint that touches the database — this middleware
// retries once, transparently, before that ever reaches a client.
prisma.$use(async (params, next) => {
  try {
    return await next(params);
  } catch (err) {
    if (err.code === 'P1001' || err.code === 'P1017') {
      await new Promise((resolve) => setTimeout(resolve, 400));
      return await next(params);
    }
    throw err;
  }
});

module.exports = prisma;
