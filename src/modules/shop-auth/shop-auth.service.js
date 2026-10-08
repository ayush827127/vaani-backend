const prisma = require('../../config/prisma');
const AppError = require('../../utils/AppError');
const { signShopToken } = require('../../utils/jwt');

async function register({ name, ownerName, phone, address }) {
  let shop = await prisma.shop.findUnique({ where: { phone } });
  let isNew = false;

  if (!shop) {
    // No automatic trial subscription here any more — a new shop starts
    // on Basic (shop-status.service.js's own fallback, no Subscription row
    // needed for that) and opts into its one 14-day Pro trial explicitly
    // via trial.service.js's startTrial, same as any existing shop. status:
    // 'ACTIVE' (not 'TRIAL') because this shop isn't actually in a trial
    // period yet — it just exists and hasn't started one.
    shop = await prisma.shop.create({
      data: { name, ownerName, phone, address, status: 'ACTIVE' },
    });
    isNew = true;
  } else {
    shop = await prisma.shop.update({
      where: { id: shop.id },
      data: { name, ownerName, address },
    });
  }

  if (isNew) {
    // Keeps the User/ShopUser model in sync for every shop created from
    // here on — Phase 1's backfill only covered shops that already existed
    // at that moment; without this, every later signup would never resolve
    // an owner (see resolveOwnerUserId in user-auth.service.js), silently
    // breaking sync attribution for any shop registered after that backfill
    // ran. Best-effort: a failure here must never block registration, which
    // matters far more than attribution metadata existing from day one.
    try {
      const user = await prisma.user.upsert({
        where: { phone },
        create: { phone, name: ownerName },
        update: {}, // never overwrite an existing User's name/phone
      });
      await prisma.shopUser.create({
        data: { shopId: shop.id, userId: user.id, name: ownerName, phone, role: 'OWNER', status: 'ACTIVE' },
      });
    } catch (err) {
      console.error('[register] failed to create User/ShopUser for new shop', shop.id, err);
    }
  }

  const token = signShopToken(shop);
  return { token, shop };
}

async function login(phone) {
  const shop = await prisma.shop.findUnique({ where: { phone } });
  if (!shop) {
    throw new AppError('Shop not found', 404);
  }
  const token = signShopToken(shop);
  return { token, shop };
}

// The phone app used to update the shop's phone number locally only,
// leaving the backend's copy stale — the next login attempt with the new
// number would 404 (see shop-auth.service.js's login()) and get treated as
// a brand-new signup, orphaning the shop's cloud data. [newPhone] must
// already be OTP-verified — see the route's requireOtpVerified. The JWT
// embeds phone (see signShopToken), so a fresh token is issued: the old one
// would otherwise carry a phone that no longer matches this shop's row.
async function changePhone(shopId, newPhone) {
  const existing = await prisma.shop.findUnique({ where: { phone: newPhone } });
  if (existing && existing.id !== shopId) {
    throw new AppError('This phone number is already registered to another shop', 409);
  }
  const shop = await prisma.shop.update({ where: { id: shopId }, data: { phone: newPhone } });
  const token = signShopToken(shop);
  return { token, shop };
}

module.exports = { register, login, changePhone };
