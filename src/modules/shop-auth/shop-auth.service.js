const prisma = require('../../config/prisma');
const AppError = require('../../utils/AppError');
const { signShopToken } = require('../../utils/jwt');

const TRIAL_DAYS = 14;
const TRIAL_PLAN_NAME = 'Pro';

async function register({ name, ownerName, phone, address }) {
  let shop = await prisma.shop.findUnique({ where: { phone } });
  let isNew = false;

  if (!shop) {
    shop = await prisma.shop.create({
      data: { name, ownerName, phone, address, status: 'TRIAL' },
    });
    isNew = true;
  } else {
    shop = await prisma.shop.update({
      where: { id: shop.id },
      data: { name, ownerName, address },
    });
  }

  if (isNew) {
    const trialPlan = await prisma.plan.findUnique({ where: { name: TRIAL_PLAN_NAME } });
    if (trialPlan) {
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + TRIAL_DAYS);
      await prisma.subscription.create({
        data: { shopId: shop.id, planId: trialPlan.id, status: 'TRIAL', endDate },
      });
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
