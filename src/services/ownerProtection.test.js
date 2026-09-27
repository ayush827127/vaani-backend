const { assertNotRemovingLastOwner, assertCanChangeRole } = require('./ownerProtection');

describe('assertNotRemovingLastOwner', () => {
  const owner1 = { shopUserId: 'su-owner-1', role: 'OWNER' };
  const owner2 = { shopUserId: 'su-owner-2', role: 'OWNER' };
  const cashier = { shopUserId: 'su-cashier-1', role: 'CASHIER' };

  test('blocks removing the sole owner', () => {
    expect(() => assertNotRemovingLastOwner([owner1, cashier], 'su-owner-1')).toThrow(
      /last owner/i
    );
  });

  test('allows removing one of two owners', () => {
    expect(() => assertNotRemovingLastOwner([owner1, owner2, cashier], 'su-owner-1')).not.toThrow();
  });

  test('allows removing a non-owner freely', () => {
    expect(() => assertNotRemovingLastOwner([owner1, cashier], 'su-cashier-1')).not.toThrow();
  });
});

describe('assertCanChangeRole', () => {
  const owner = { shopUserId: 'su-owner-1', role: 'OWNER' };
  const manager = { shopUserId: 'su-manager-1', role: 'MANAGER' };
  const cashier = { shopUserId: 'su-cashier-1', role: 'CASHIER' };

  test('a CASHIER actor is always rejected', () => {
    expect(() => assertCanChangeRole(cashier, manager, 'OWNER', [owner, manager, cashier])).toThrow(
      /not authorized/i
    );
  });

  test('a MANAGER actor is always rejected (member.permission.manage is owner-only by default)', () => {
    expect(() => assertCanChangeRole(manager, cashier, 'MANAGER', [owner, manager, cashier])).toThrow(
      /not authorized/i
    );
  });

  test('an OWNER actor changing someone else\'s role succeeds', () => {
    expect(() => assertCanChangeRole(owner, cashier, 'MANAGER', [owner, manager, cashier])).not.toThrow();
  });

  test('an OWNER demoting themselves is blocked if no other owner remains', () => {
    expect(() => assertCanChangeRole(owner, owner, 'MANAGER', [owner, manager, cashier])).toThrow(
      /last owner/i
    );
  });

  test('an OWNER demoting themselves succeeds if another owner remains', () => {
    const owner2 = { shopUserId: 'su-owner-2', role: 'OWNER' };
    expect(() =>
      assertCanChangeRole(owner, owner, 'MANAGER', [owner, owner2, manager, cashier])
    ).not.toThrow();
  });
});
