const prisma = require('../config/prisma');

// Best-effort — an audit-write failure must never fail the mutation it
// describes. shopId/userId must always be server-derived by the caller
// (URL param already trusted by requireAdmin/requireActiveMembership,
// never anything client-body-supplied) — never trust audit identity from
// the client.
async function record({ shopId, userId = null, action, module, entityType, entityId = null, metadata = null }) {
  try {
    await prisma.auditLog.create({
      data: { shopId, userId, action, module, entityType, entityId, metadata },
    });
  } catch (err) {
    console.error('[audit] failed to write audit log', action, shopId, err);
  }
}

module.exports = { record };
