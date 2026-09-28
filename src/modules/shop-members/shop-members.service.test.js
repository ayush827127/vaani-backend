const mockPrisma = {
  shopUser: { findMany: jest.fn(), findFirst: jest.fn(), update: jest.fn(), create: jest.fn() },
  invitation: { findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
  user: { findUnique: jest.fn() },
  shop: { findUnique: jest.fn() },
  shopUserPermission: { findMany: jest.fn(), upsert: jest.fn() },
};
jest.mock('../../config/prisma', () => mockPrisma);

const mockRecord = jest.fn();
jest.mock('../../services/auditLog.service', () => ({ record: mockRecord }));

const service = require('./shop-members.service');

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.shopUserPermission.findMany.mockResolvedValue([]); // no overrides, by default
  mockPrisma.shop.findUnique.mockResolvedValue({ name: 'ABC Store', ownerName: 'Ramesh' });
});

describe('inviteMember', () => {
  const baseArgs = {
    shopId: 'shop-1',
    actorUserId: 'user-owner',
    actorShopUserId: 'su-owner',
    actorRole: 'OWNER',
    phone: '9876543210',
    role: 'CASHIER',
  };

  test('rejects an invalid phone', async () => {
    await expect(service.inviteMember({ ...baseArgs, phone: '123' })).rejects.toMatchObject({ status: 400 });
  });

  test('rejects a duplicate pending invitation', async () => {
    mockPrisma.shopUser.findFirst.mockResolvedValue(null);
    mockPrisma.invitation.findFirst.mockResolvedValue({ id: 'inv-existing', status: 'PENDING' });

    await expect(service.inviteMember(baseArgs)).rejects.toMatchObject({ status: 409 });
  });

  test('rejects a phone already an active member', async () => {
    mockPrisma.shopUser.findFirst.mockResolvedValue({ id: 'su-existing', status: 'ACTIVE' });

    await expect(service.inviteMember(baseArgs)).rejects.toMatchObject({ status: 409 });
  });

  test('rejects an OWNER invite from a non-owner-equivalent actor', async () => {
    mockPrisma.shopUser.findFirst.mockResolvedValue(null);
    mockPrisma.invitation.findFirst.mockResolvedValue(null);

    await expect(
      service.inviteMember({ ...baseArgs, actorRole: 'MANAGER', role: 'OWNER' })
    ).rejects.toMatchObject({ status: 403 });
  });

  test('a MANAGER can invite a CASHIER, and it audits with the real actor userId', async () => {
    mockPrisma.shopUser.findFirst.mockResolvedValue(null);
    mockPrisma.invitation.findFirst.mockResolvedValue(null);
    mockPrisma.invitation.create.mockResolvedValue({ id: 'inv-1' });

    await service.inviteMember({ ...baseArgs, actorRole: 'MANAGER', role: 'CASHIER' });

    expect(mockRecord).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-owner', action: 'MEMBER_INVITED' })
    );
  });

  test('adminInitiated skips the owner-invite-permission check entirely (no actor at all)', async () => {
    mockPrisma.shopUser.findFirst.mockResolvedValue(null);
    mockPrisma.invitation.findFirst.mockResolvedValue(null);
    mockPrisma.invitation.create.mockResolvedValue({ id: 'inv-1' });

    await service.inviteMember({
      shopId: 'shop-1',
      phone: '9876543210',
      role: 'OWNER',
      adminInitiated: true,
      auditMeta: { actorType: 'ADMIN', adminId: 'admin-1' },
    });

    expect(mockPrisma.shopUserPermission.findMany).not.toHaveBeenCalled();
    expect(mockRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: null,
        action: 'MEMBER_INVITED',
        metadata: expect.objectContaining({ actorType: 'ADMIN', adminId: 'admin-1' }),
      })
    );
  });
});

describe('acceptInvitation', () => {
  const invitation = {
    id: 'inv-1',
    shopId: 'shop-1',
    invitedPhone: '9876543210',
    role: 'CASHIER',
    status: 'PENDING',
    expiresAt: new Date(Date.now() + 86400000),
  };

  test('rejects an invitation not addressed to the caller\'s phone', async () => {
    mockPrisma.invitation.findUnique.mockResolvedValue(invitation);

    await expect(
      service.acceptInvitation({ invitationId: 'inv-1', userId: 'user-1', phone: '1111111111' })
    ).rejects.toMatchObject({ status: 404 });
  });

  test('rejects (and expires) a PENDING invitation past its expiresAt', async () => {
    mockPrisma.invitation.findUnique.mockResolvedValue({
      ...invitation,
      expiresAt: new Date(Date.now() - 1000),
    });

    await expect(
      service.acceptInvitation({ invitationId: 'inv-1', userId: 'user-1', phone: '9876543210' })
    ).rejects.toMatchObject({ status: 410 });
    expect(mockPrisma.invitation.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'EXPIRED' } })
    );
  });

  test('creates a fresh membership when nothing exists yet', async () => {
    mockPrisma.invitation.findUnique.mockResolvedValue(invitation);
    mockPrisma.shopUser.findFirst
      .mockResolvedValueOnce(null) // no existing {shopId, userId} membership
      .mockResolvedValueOnce(null); // no unlinked phone-matching row either
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1', name: 'Amit', phone: '9876543210' });
    mockPrisma.shopUser.create.mockResolvedValue({ id: 'su-new' });

    const result = await service.acceptInvitation({ invitationId: 'inv-1', userId: 'user-1', phone: '9876543210' });

    expect(result.id).toBe('su-new');
    expect(mockRecord).toHaveBeenCalledWith(expect.objectContaining({ action: 'MEMBER_ACCEPTED', userId: 'user-1' }));
  });

  test('the response is enriched with the shop\'s profile — the accepting device has no other way to learn it', async () => {
    mockPrisma.invitation.findUnique.mockResolvedValue(invitation);
    mockPrisma.shopUser.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1', name: 'Amit', phone: '9876543210' });
    mockPrisma.shopUser.create.mockResolvedValue({ id: 'su-new' });
    mockPrisma.shop.findUnique.mockResolvedValue({ name: 'ABC Store', ownerName: 'Ramesh' });

    const result = await service.acceptInvitation({ invitationId: 'inv-1', userId: 'user-1', phone: '9876543210' });

    expect(result.shop).toEqual({ name: 'ABC Store', ownerName: 'Ramesh' });
  });

  test('accepting twice is idempotent — the second call is a no-op, not a duplicate', async () => {
    mockPrisma.invitation.findUnique.mockResolvedValue(invitation);
    // Second call: a membership for {shopId, userId} already exists.
    mockPrisma.shopUser.findFirst.mockResolvedValue({ id: 'su-new', status: 'ACTIVE' });

    const result = await service.acceptInvitation({ invitationId: 'inv-1', userId: 'user-1', phone: '9876543210' });

    expect(result.id).toBe('su-new');
    expect(mockPrisma.shopUser.create).not.toHaveBeenCalled();
  });

  test('links an existing unlinked ShopUser row matching phone, rather than creating a duplicate', async () => {
    mockPrisma.invitation.findUnique.mockResolvedValue(invitation);
    mockPrisma.shopUser.findFirst
      .mockResolvedValueOnce(null) // no {shopId,userId} membership yet
      .mockResolvedValueOnce({ id: 'su-unlinked', phone: '9876543210', userId: null }); // pre-existing unlinked row
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1', phone: '9876543210' });
    mockPrisma.shopUser.update.mockResolvedValue({ id: 'su-unlinked', userId: 'user-1' });

    const result = await service.acceptInvitation({ invitationId: 'inv-1', userId: 'user-1', phone: '9876543210' });

    expect(result.id).toBe('su-unlinked');
    expect(mockPrisma.shopUser.create).not.toHaveBeenCalled();
  });
});

describe('changeRole', () => {
  const memberships = [
    { id: 'su-owner', shopId: 'shop-1', role: 'OWNER' },
    { id: 'su-cashier', shopId: 'shop-1', role: 'CASHIER' },
  ];

  test('a CASHIER actor is rejected (not authorized)', async () => {
    mockPrisma.shopUser.findMany.mockResolvedValue(memberships);

    await expect(
      service.changeRole({
        shopId: 'shop-1',
        actorShopUserId: 'su-cashier',
        actorRole: 'CASHIER',
        actorUserId: 'user-cashier',
        targetShopUserId: 'su-owner',
        newRole: 'MANAGER',
      })
    ).rejects.toMatchObject({ status: 403 });
  });

  test('an OWNER actor changing a cashier\'s role succeeds and audits', async () => {
    mockPrisma.shopUser.findMany.mockResolvedValue(memberships);
    mockPrisma.shopUser.update.mockResolvedValue({ id: 'su-cashier', role: 'MANAGER' });

    await service.changeRole({
      shopId: 'shop-1',
      actorShopUserId: 'su-owner',
      actorRole: 'OWNER',
      actorUserId: 'user-owner',
      targetShopUserId: 'su-cashier',
      newRole: 'MANAGER',
    });

    expect(mockRecord).toHaveBeenCalledWith(expect.objectContaining({ action: 'ROLE_CHANGED' }));
  });

  test('demoting the sole owner is blocked', async () => {
    mockPrisma.shopUser.findMany.mockResolvedValue(memberships);

    await expect(
      service.changeRole({
        shopId: 'shop-1',
        actorShopUserId: 'su-owner',
        actorRole: 'OWNER',
        actorUserId: 'user-owner',
        targetShopUserId: 'su-owner',
        newRole: 'MANAGER',
      })
    ).rejects.toMatchObject({ status: 400 });
  });

  test('adminInitiated skips the actor-permission check but still blocks demoting the sole owner', async () => {
    mockPrisma.shopUser.findMany.mockResolvedValue(memberships);

    await expect(
      service.changeRole({
        shopId: 'shop-1',
        targetShopUserId: 'su-owner',
        newRole: 'MANAGER',
        adminInitiated: true,
      })
    ).rejects.toMatchObject({ status: 400 });
  });

  test('adminInitiated succeeds for a non-owner target with no actor at all, and audits with null userId', async () => {
    mockPrisma.shopUser.findMany.mockResolvedValue(memberships);
    mockPrisma.shopUser.update.mockResolvedValue({ id: 'su-cashier', role: 'MANAGER' });

    await service.changeRole({
      shopId: 'shop-1',
      targetShopUserId: 'su-cashier',
      newRole: 'MANAGER',
      adminInitiated: true,
      auditMeta: { actorType: 'ADMIN', adminId: 'admin-1' },
    });

    expect(mockRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: null,
        action: 'ROLE_CHANGED',
        metadata: expect.objectContaining({ actorType: 'ADMIN', adminId: 'admin-1' }),
      })
    );
  });
});

describe('removeMember / leaveShop', () => {
  const memberships = [
    { id: 'su-owner', role: 'OWNER' },
    { id: 'su-cashier', role: 'CASHIER' },
  ];

  test('removing the sole owner is blocked', async () => {
    mockPrisma.shopUser.findMany.mockResolvedValue([{ id: 'su-owner', role: 'OWNER' }]);

    await expect(
      service.removeMember({ shopId: 'shop-1', actorUserId: 'user-cashier', targetShopUserId: 'su-owner' })
    ).rejects.toMatchObject({ status: 400 });
  });

  test('removing a non-owner succeeds and audits', async () => {
    mockPrisma.shopUser.findMany.mockResolvedValue(memberships);

    await service.removeMember({ shopId: 'shop-1', actorUserId: 'user-owner', targetShopUserId: 'su-cashier' });

    expect(mockPrisma.shopUser.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'REMOVED' }) })
    );
    expect(mockRecord).toHaveBeenCalledWith(expect.objectContaining({ action: 'MEMBER_REMOVED' }));
  });

  test('admin removal (no actorUserId) audits with null userId and the admin auditMeta', async () => {
    mockPrisma.shopUser.findMany.mockResolvedValue(memberships);

    await service.removeMember({
      shopId: 'shop-1',
      targetShopUserId: 'su-cashier',
      auditMeta: { actorType: 'ADMIN', adminId: 'admin-1' },
    });

    expect(mockRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: null,
        action: 'MEMBER_REMOVED',
        metadata: expect.objectContaining({ actorType: 'ADMIN', adminId: 'admin-1', selfInitiated: false }),
      })
    );
  });

  test('a sole owner leaving the shop is blocked', async () => {
    mockPrisma.shopUser.findMany.mockResolvedValue([{ id: 'su-owner', role: 'OWNER' }]);

    await expect(
      service.leaveShop({ shopId: 'shop-1', actorUserId: 'user-owner', actorShopUserId: 'su-owner' })
    ).rejects.toMatchObject({ status: 400 });
  });

  test('a cashier can leave freely', async () => {
    mockPrisma.shopUser.findMany.mockResolvedValue(memberships);

    await service.leaveShop({ shopId: 'shop-1', actorUserId: 'user-cashier', actorShopUserId: 'su-cashier' });

    expect(mockRecord).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'MEMBER_REMOVED', metadata: expect.objectContaining({ selfInitiated: true }) })
    );
  });
});
