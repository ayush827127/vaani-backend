const prisma = require('../../config/prisma');
const AppError = require('../../utils/AppError');

async function list() {
  return prisma.module.findMany({ orderBy: { name: 'asc' } });
}

async function create(data) {
  return prisma.module.create({ data });
}

async function update(id, data) {
  const existing = await prisma.module.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError('Module not found', 404);
  }
  return prisma.module.update({ where: { id }, data });
}

module.exports = { list, create, update };
