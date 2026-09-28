const mockService = {
  listMembers: jest.fn(),
  inviteMember: jest.fn(),
  changeRole: jest.fn(),
  removeMember: jest.fn(),
  listInvitations: jest.fn(),
  revokeInvitation: jest.fn(),
};
jest.mock('./shop-members-admin.service', () => mockService);

const controller = require('./shop-members-admin.controller');

function mockRes() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn() };
}
function mockReq(overrides) {
  return {
    params: { shopId: 'shop-1', shopUserId: 'su-1', id: 'inv-1' },
    admin: { id: 'admin-1', email: 'admin@vaani.app' },
    body: {},
    ...overrides,
  };
}
const adminMeta = { actorType: 'ADMIN', adminId: 'admin-1', adminEmail: 'admin@vaani.app' };

beforeEach(() => {
  jest.clearAllMocks();
});

test('invite: forwards shopId/phone/role and the admin actor metadata', async () => {
  mockService.inviteMember.mockResolvedValue({ id: 'inv-new' });
  const req = mockReq({ body: { phone: '9876543210', role: 'CASHIER' } });

  await controller.invite(req, mockRes(), jest.fn());

  expect(mockService.inviteMember).toHaveBeenCalledWith('shop-1', '9876543210', 'CASHIER', adminMeta);
});

test('changeRole: forwards shopId/shopUserId/role and the admin actor metadata', async () => {
  mockService.changeRole.mockResolvedValue({ id: 'su-1', role: 'MANAGER' });
  const req = mockReq({ body: { role: 'MANAGER' } });

  await controller.changeRole(req, mockRes(), jest.fn());

  expect(mockService.changeRole).toHaveBeenCalledWith('shop-1', 'su-1', 'MANAGER', adminMeta);
});

test('removeMember: forwards shopId/shopUserId and the admin actor metadata', async () => {
  const req = mockReq();

  await controller.removeMember(req, mockRes(), jest.fn());

  expect(mockService.removeMember).toHaveBeenCalledWith('shop-1', 'su-1', adminMeta);
});

test('revokeInvitation: forwards shopId/invitationId and the admin actor metadata', async () => {
  const req = mockReq();

  await controller.revokeInvitation(req, mockRes(), jest.fn());

  expect(mockService.revokeInvitation).toHaveBeenCalledWith('shop-1', 'inv-1', adminMeta);
});

test('listMembers/listInvitations: pass through shopId with no side effects', async () => {
  mockService.listMembers.mockResolvedValue([]);
  mockService.listInvitations.mockResolvedValue([]);
  const req = mockReq();

  await controller.listMembers(req, mockRes(), jest.fn());
  await controller.listInvitations(req, mockRes(), jest.fn());

  expect(mockService.listMembers).toHaveBeenCalledWith('shop-1');
  expect(mockService.listInvitations).toHaveBeenCalledWith('shop-1');
});
