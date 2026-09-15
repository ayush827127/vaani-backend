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

module.exports = { register, login };
