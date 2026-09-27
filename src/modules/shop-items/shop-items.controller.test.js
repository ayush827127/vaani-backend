const mockRecord = jest.fn();
jest.mock('../../services/auditLog.service', () => ({ record: mockRecord }));

const mockService = {
  create: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
  getById: jest.fn(),
};
jest.mock('./shop-items.service', () => mockService);

const controller = require('./shop-items.controller');

function mockRes() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn() };
}
function mockReq(overrides) {
  return { params: { shopId: 'shop-1', id: 'item-1' }, admin: { id: 'admin-1', email: 'admin@vaani.app' }, body: {}, ...overrides };
}

beforeEach(() => {
  jest.clearAllMocks();
});

test('create: audits CREATE_ITEM with the created item\'s id, then responds normally', async () => {
  mockService.create.mockResolvedValue({ id: 'item-new', name: 'Dosa' });
  const req = mockReq();
  const res = mockRes();

  await controller.create(req, res, jest.fn());

  expect(mockRecord).toHaveBeenCalledWith(
    expect.objectContaining({
      shopId: 'shop-1',
      action: 'CREATE_ITEM',
      entityType: 'Item',
      entityId: 'item-new',
      metadata: { actorType: 'ADMIN', adminId: 'admin-1', adminEmail: 'admin@vaani.app' },
    })
  );
  expect(res.status).toHaveBeenCalledWith(201);
  expect(res.json).toHaveBeenCalledWith({ success: true, data: { id: 'item-new', name: 'Dosa' } });
});

test('update: audits UPDATE_ITEM with the updated item\'s id', async () => {
  mockService.update.mockResolvedValue({ id: 'item-1', name: 'Dosa (updated)' });
  const req = mockReq();
  const res = mockRes();

  await controller.update(req, res, jest.fn());

  expect(mockRecord).toHaveBeenCalledWith(expect.objectContaining({ action: 'UPDATE_ITEM', entityId: 'item-1' }));
  expect(res.json).toHaveBeenCalledWith({ success: true, data: { id: 'item-1', name: 'Dosa (updated)' } });
});

test('remove: snapshots the name before deleting, then audits DELETE_ITEM', async () => {
  mockService.getById.mockResolvedValue({ id: 'item-1', name: 'Dosa' });
  mockService.remove.mockResolvedValue(undefined);
  const req = mockReq();
  const res = mockRes();

  await controller.remove(req, res, jest.fn());

  expect(mockService.getById).toHaveBeenCalledWith('shop-1', 'item-1');
  expect(mockService.remove).toHaveBeenCalledWith('shop-1', 'item-1');
  expect(mockRecord).toHaveBeenCalledWith(
    expect.objectContaining({
      action: 'DELETE_ITEM',
      entityId: 'item-1',
      metadata: expect.objectContaining({ name: 'Dosa' }),
    })
  );
  expect(res.json).toHaveBeenCalledWith({ success: true, data: { deleted: true } });
});
