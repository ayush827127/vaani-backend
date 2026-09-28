const mockPrisma = {
  auditLog: { findMany: jest.fn(), count: jest.fn() },
};
jest.mock('../../config/prisma', () => mockPrisma);

const service = require('./admin-audit-log.service');

beforeEach(() => {
  jest.clearAllMocks();
});

test('scopes every query to the given shopId and applies pagination', async () => {
  mockPrisma.auditLog.findMany.mockResolvedValue([{ id: 'log-1' }]);
  mockPrisma.auditLog.count.mockResolvedValue(1);

  const result = await service.list('shop-1', { page: 2, limit: 10 });

  expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
    expect.objectContaining({ where: { shopId: 'shop-1' }, skip: 10, take: 10, orderBy: { createdAt: 'desc' } })
  );
  expect(mockPrisma.auditLog.count).toHaveBeenCalledWith({ where: { shopId: 'shop-1' } });
  expect(result).toEqual({ entries: [{ id: 'log-1' }], total: 1, page: 2, limit: 10 });
});

test('defaults to page 1, limit 50', async () => {
  mockPrisma.auditLog.findMany.mockResolvedValue([]);
  mockPrisma.auditLog.count.mockResolvedValue(0);

  await service.list('shop-1');

  expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 0, take: 50 }));
});
