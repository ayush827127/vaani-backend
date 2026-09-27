const mockPrisma = { shopUser: { findFirst: jest.fn() }, shop: { findUnique: jest.fn() } };
jest.mock('../config/prisma', () => mockPrisma);

const mockVerifyToken = jest.fn();
jest.mock('../utils/jwt', () => ({ verifyToken: (...args) => mockVerifyToken(...args) }));

const { requireShopOrUserContext } = require('./shopAuth.middleware');

function mockReq(token) {
  return { headers: { authorization: `Bearer ${token}` } };
}
function mockNext() {
  return jest.fn();
}

beforeEach(() => {
  jest.clearAllMocks();
});

test('a legacy Shop-token sets req.shop identically to today, never queries ShopUser', async () => {
  mockVerifyToken.mockReturnValue({ id: 'shop-1', phone: '9876543210', scope: 'shop' });
  const req = mockReq('legacy-token');
  const next = mockNext();

  await requireShopOrUserContext(req, {}, next);

  expect(req.shop).toEqual({ id: 'shop-1', phone: '9876543210', scope: 'shop' });
  expect(mockPrisma.shopUser.findFirst).not.toHaveBeenCalled();
  expect(next).toHaveBeenCalledWith();
});

test('a User-token with no activeShopId selected: 404', async () => {
  mockVerifyToken.mockReturnValue({ userId: 'user-1', activeShopId: null, scope: 'user' });
  const next = mockNext();

  await requireShopOrUserContext(mockReq('user-token'), {}, next);

  expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 404 }));
});

test('a User-token with an active, matching membership sets req.shop.id, req.attributedUserId, and req.membership', async () => {
  mockVerifyToken.mockReturnValue({ userId: 'user-1', activeShopId: 'shop-1', scope: 'user' });
  mockPrisma.shopUser.findFirst.mockResolvedValue({ id: 'su-1', shopId: 'shop-1', role: 'CASHIER', status: 'ACTIVE' });
  const req = mockReq('user-token');
  const next = mockNext();

  await requireShopOrUserContext(req, {}, next);

  expect(req.shop).toEqual({ id: 'shop-1', scope: 'user' });
  expect(req.attributedUserId).toBe('user-1');
  expect(req.membership).toEqual({ shopId: 'shop-1', shopUserId: 'su-1', role: 'CASHIER' });
  expect(next).toHaveBeenCalledWith();
});

test('a User-token whose membership was removed/deactivated: 403 (re-checked from the DB)', async () => {
  mockVerifyToken.mockReturnValue({ userId: 'user-1', activeShopId: 'shop-1', scope: 'user' });
  mockPrisma.shopUser.findFirst.mockResolvedValue({ id: 'su-1', status: 'REMOVED' });
  const next = mockNext();

  await requireShopOrUserContext(mockReq('user-token'), {}, next);

  expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
});

test('a User-token with no membership row at all: 403', async () => {
  mockVerifyToken.mockReturnValue({ userId: 'user-1', activeShopId: 'shop-1', scope: 'user' });
  mockPrisma.shopUser.findFirst.mockResolvedValue(null);
  const next = mockNext();

  await requireShopOrUserContext(mockReq('user-token'), {}, next);

  expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
});

test('an unrecognized scope: 401', async () => {
  mockVerifyToken.mockReturnValue({ scope: 'otp_verified' });
  const next = mockNext();

  await requireShopOrUserContext(mockReq('otp-token'), {}, next);

  expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 401 }));
});
