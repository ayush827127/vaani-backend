// The permission vocabulary for shop-staff authorization (spec §14) — a
// single source of truth every role-default template and future
// enforcement point reads from, so the vocabulary never drifts between them.
const ALL_PERMISSIONS = [
  'customer.view', 'customer.create', 'customer.update', 'customer.delete',
  'bill.view', 'bill.create', 'bill.update', 'bill.delete',
  'item.view', 'item.create', 'item.update', 'item.delete',
  'inventory.view', 'inventory.create', 'inventory.update', 'inventory.delete',
  'payment.view', 'payment.create', 'payment.update', 'payment.delete',
  'ledger.view', 'ledger.create', 'ledger.update', 'ledger.delete',
  'report.view',
  'member.view', 'member.invite', 'member.update', 'member.remove', 'member.permission.manage',
  'business.view', 'business.update',
  'settings.view', 'settings.update',
];

// Role provides the DEFAULT template (spec §13); ShopUserPermission rows
// then override individual keys on top of it. OWNER's template is
// deliberately "everything" — it's what makes wiring future enforcement in
// a no-op for every shop's existing owner, who has always implicitly had
// full access.
const ROLE_DEFAULTS = {
  OWNER: new Set(ALL_PERMISSIONS),
  // Day-to-day operational control, not account/ownership-level changes.
  MANAGER: new Set(
    ALL_PERMISSIONS.filter(
      (p) => !['member.permission.manage', 'member.remove', 'business.update', 'settings.update'].includes(p)
    )
  ),
  // Narrow — no updates/deletes, no member/business/settings access at all.
  CASHIER: new Set([
    'customer.view', 'customer.create',
    'bill.view', 'bill.create',
    'item.view',
    'payment.view', 'payment.create',
    'report.view',
  ]),
};

/**
 * @param {string} role - ShopUserRole ('OWNER' | 'MANAGER' | 'CASHIER')
 * @param {Array<{permission: string, granted: boolean}>} overrides - this
 *   ShopUser's ShopUserPermission rows. Pure function — takes already-fetched
 *   data, no DB access, so it's directly unit-testable.
 * @returns {Set<string>} the effective granted-permission set
 */
function resolveEffectivePermissions(role, overrides = []) {
  const defaults = ROLE_DEFAULTS[role] || new Set();
  const effective = new Set(defaults);
  for (const { permission, granted } of overrides) {
    if (granted) effective.add(permission);
    else effective.delete(permission);
  }
  return effective;
}

function hasPermission(role, overrides, key) {
  return resolveEffectivePermissions(role, overrides).has(key);
}

module.exports = { ALL_PERMISSIONS, ROLE_DEFAULTS, resolveEffectivePermissions, hasPermission };
