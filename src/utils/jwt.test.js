const { signUserToken, verifyToken } = require('./jwt');

describe('signUserToken', () => {
  const user = { id: 'user-1', phone: '9876543210' };

  test('round-trips userId/phone/scope, with activeShopId set', () => {
    const token = signUserToken(user, 'shop-1');
    const decoded = verifyToken(token);
    expect(decoded).toMatchObject({
      userId: 'user-1',
      phone: '9876543210',
      activeShopId: 'shop-1',
      scope: 'user',
    });
  });

  test('activeShopId defaults to null when not selected yet', () => {
    const token = signUserToken(user, null);
    const decoded = verifyToken(token);
    expect(decoded.activeShopId).toBeNull();
  });

  test('activeShopId defaults to null when omitted entirely', () => {
    const token = signUserToken(user, undefined);
    const decoded = verifyToken(token);
    expect(decoded.activeShopId).toBeNull();
  });
});
