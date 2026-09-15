const bcrypt = require('bcrypt');
const prisma = require('../../config/prisma');
const AppError = require('../../utils/AppError');
const { signAdminToken } = require('../../utils/jwt');

async function login(email, password) {
  const admin = await prisma.adminUser.findUnique({ where: { email } });
  if (!admin) {
    throw new AppError('Invalid email or password', 401);
  }

  const matches = await bcrypt.compare(password, admin.password);
  if (!matches) {
    throw new AppError('Invalid email or password', 401);
  }

  const token = signAdminToken(admin);
  return {
    token,
    admin: { id: admin.id, name: admin.name, email: admin.email, role: admin.role },
  };
}

async function me(adminId) {
  const admin = await prisma.adminUser.findUnique({ where: { id: adminId } });
  if (!admin) {
    throw new AppError('Admin not found', 404);
  }
  return { id: admin.id, name: admin.name, email: admin.email, role: admin.role };
}

module.exports = { login, me };
