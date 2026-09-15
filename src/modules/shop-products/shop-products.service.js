const prisma = require('../../config/prisma');
const AppError = require('../../utils/AppError');
const { nextNegativeLocalId } = require('../../utils/negativeLocalId');
const { replaceImage, deleteImage } = require('../../utils/cloudinaryImage');

async function list(shopId, { search, page = 1, limit = 20 }) {
  const where = {
    shopId,
    deletedAt: null,
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { sku: { contains: search, mode: 'insensitive' } },
            { barcode: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    prisma.syncedProduct.findMany({ where, skip, take: limit, orderBy: { name: 'asc' } }),
    prisma.syncedProduct.count({ where }),
  ]);
  return { items, total, page, limit };
}

async function getById(shopId, id) {
  const product = await prisma.syncedProduct.findFirst({ where: { id, shopId } });
  if (!product) throw new AppError('Product not found', 404);
  return product;
}

async function create(shopId, data) {
  const localId = await nextNegativeLocalId(prisma, 'syncedProduct', shopId);
  const now = new Date();
  return prisma.syncedProduct.create({
    data: {
      shopId,
      localId,
      name: data.name,
      sku: data.sku ?? null,
      barcode: data.barcode ?? null,
      category: data.category ?? null,
      costPrice: data.costPrice,
      sellingPrice: data.sellingPrice,
      gstRate: data.gstRate,
      stockQuantity: data.stockQuantity,
      reorderLevel: data.reorderLevel,
      imagePath: data.imagePath ?? null,
      isActive: data.isActive ?? true,
      localCreatedAt: now,
      localUpdatedAt: now,
    },
  });
}

async function update(shopId, id, data) {
  await getById(shopId, id);
  return prisma.syncedProduct.update({
    where: { id },
    data: { ...data, localUpdatedAt: new Date() },
  });
}

async function remove(shopId, id) {
  await getById(shopId, id);
  // Soft delete — a tombstone the phone's pull-sync can see. Never a hard
  // delete: that would leave the phone with no way to find out this product
  // was removed on the admin side.
  await prisma.syncedProduct.update({
    where: { id },
    data: { deletedAt: new Date(), localUpdatedAt: new Date() },
  });
}

async function setImage(shopId, id, buffer) {
  const product = await getById(shopId, id);
  const imageUrl = await replaceImage({
    buffer,
    folder: `vaani/shops/${shopId}/products`,
    previousUrl: product.imageUrl,
  });
  return prisma.syncedProduct.update({
    where: { id },
    data: { imageUrl, localUpdatedAt: new Date() },
  });
}

async function clearImage(shopId, id) {
  const product = await getById(shopId, id);
  await deleteImage(product.imageUrl);
  return prisma.syncedProduct.update({
    where: { id },
    data: { imageUrl: null, localUpdatedAt: new Date() },
  });
}

module.exports = { list, getById, create, update, remove, setImage, clearImage };
