const mockGetStatus = jest.fn();
jest.mock('../modules/shop-status/shop-status.service', () => ({ getStatus: (...args) => mockGetStatus(...args) }));

const { requireModule } = require('./shopAuth.middleware');

function mockReq(shopId) {
  return { shop: { id: shopId } };
}
function mockNext() {
  return jest.fn();
}

beforeEach(() => {
  jest.clearAllMocks();
});

test('calls next() with no error when the module is enabled', async () => {
  mockGetStatus.mockResolvedValue({ modules: ['billing', 'inventory'] });
  const next = mockNext();

  await requireModule('billing')(mockReq('shop-1'), {}, next);

  expect(mockGetStatus).toHaveBeenCalledWith('shop-1');
  expect(next).toHaveBeenCalledWith();
});

test('calls next() with a 403 AppError naming the module when it is not enabled', async () => {
  mockGetStatus.mockResolvedValue({ modules: ['inventory', 'customers'] });
  const next = mockNext();

  await requireModule('billing')(mockReq('shop-1'), {}, next);

  expect(next).toHaveBeenCalledWith(
    expect.objectContaining({ status: 403, message: expect.stringContaining('billing') })
  );
});

test('a locked-out shop (empty modules list) is rejected for any module key', async () => {
  mockGetStatus.mockResolvedValue({ modules: [] });
  const next = mockNext();

  await requireModule('printer')(mockReq('shop-1'), {}, next);

  expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
});

test('propagates a getStatus failure to next() rather than throwing unhandled', async () => {
  const dbError = new Error('db unreachable');
  mockGetStatus.mockRejectedValue(dbError);
  const next = mockNext();

  await requireModule('billing')(mockReq('shop-1'), {}, next);

  expect(next).toHaveBeenCalledWith(dbError);
});

test('checks the module against the shop id from req.shop, never a client-supplied value', async () => {
  mockGetStatus.mockResolvedValue({ modules: ['reports'] });
  const next = mockNext();

  await requireModule('reports')(mockReq('shop-42'), {}, next);

  expect(mockGetStatus).toHaveBeenCalledWith('shop-42');
});
