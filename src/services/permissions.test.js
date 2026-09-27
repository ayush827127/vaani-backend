const { ALL_PERMISSIONS, ROLE_DEFAULTS, resolveEffectivePermissions, hasPermission } = require('./permissions');

describe('role default templates', () => {
  test('OWNER gets every permission in the vocabulary', () => {
    expect([...ROLE_DEFAULTS.OWNER].sort()).toEqual([...ALL_PERMISSIONS].sort());
  });

  test('MANAGER gets everything except ownership-level actions', () => {
    const excluded = ['member.permission.manage', 'member.remove', 'business.update', 'settings.update'];
    for (const key of excluded) expect(ROLE_DEFAULTS.MANAGER.has(key)).toBe(false);
    for (const key of ALL_PERMISSIONS.filter((p) => !excluded.includes(p))) {
      expect(ROLE_DEFAULTS.MANAGER.has(key)).toBe(true);
    }
  });

  test('CASHIER is narrow: no updates, no deletes, no member/business/settings access', () => {
    const expected = new Set([
      'customer.view', 'customer.create',
      'bill.view', 'bill.create',
      'item.view',
      'payment.view', 'payment.create',
      'report.view',
    ]);
    expect(ROLE_DEFAULTS.CASHIER).toEqual(expected);
  });
});

describe('resolveEffectivePermissions', () => {
  test('with no overrides, matches the role default exactly', () => {
    const effective = resolveEffectivePermissions('CASHIER', []);
    expect(effective).toEqual(ROLE_DEFAULTS.CASHIER);
  });

  test('granted:true override adds a permission the role does not default to', () => {
    const effective = resolveEffectivePermissions('CASHIER', [{ permission: 'bill.delete', granted: true }]);
    expect(effective.has('bill.delete')).toBe(true);
  });

  test('granted:false override revokes a permission the role would otherwise have', () => {
    const effective = resolveEffectivePermissions('MANAGER', [{ permission: 'item.delete', granted: false }]);
    expect(effective.has('item.delete')).toBe(false);
    // everything else stays at the MANAGER default
    expect(effective.has('item.view')).toBe(true);
  });

  test('multiple overrides all apply, unambiguously (one row per permission key)', () => {
    const effective = resolveEffectivePermissions('CASHIER', [
      { permission: 'bill.delete', granted: true },
      { permission: 'customer.create', granted: false },
    ]);
    expect(effective.has('bill.delete')).toBe(true);
    expect(effective.has('customer.create')).toBe(false);
  });

  test('unknown role resolves to an empty permission set, not a crash', () => {
    expect(resolveEffectivePermissions('NOT_A_ROLE', []).size).toBe(0);
  });
});

describe('hasPermission', () => {
  test('convenience wrapper matches resolveEffectivePermissions', () => {
    expect(hasPermission('OWNER', [], 'settings.update')).toBe(true);
    expect(hasPermission('CASHIER', [], 'settings.update')).toBe(false);
    expect(hasPermission('CASHIER', [{ permission: 'settings.update', granted: true }], 'settings.update')).toBe(true);
  });
});
