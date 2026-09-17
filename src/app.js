const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const env = require('./config/env');
const prisma = require('./config/prisma');
const { globalLimiter, createAuthLimiter } = require('./middleware/rateLimit.middleware');

// Independent counters — a burst on one shouldn't lock out the other.
const adminAuthLimiter = createAuthLimiter();
const shopAuthLimiter = createAuthLimiter();

const adminAuthRoutes = require('./modules/admin-auth/admin-auth.routes');
const shopsRoutes = require('./modules/shops/shops.routes');
const plansRoutes = require('./modules/plans/plans.routes');
const modulesRoutes = require('./modules/modules-catalog/modules.routes');
const subscriptionsRoutes = require('./modules/subscriptions/subscriptions.routes');
const shopUsersRoutes = require('./modules/shop-users/shop-users.routes');
const shopAuthRoutes = require('./modules/shop-auth/shop-auth.routes');
const shopOtpRoutes = require('./modules/shop-otp/shop-otp.routes');
const shopStatusRoutes = require('./modules/shop-status/shop-status.routes');
const shopSyncRoutes = require('./modules/shop-sync/shop-sync.routes');
const shopVoiceRoutes = require('./modules/shop-voice/shop-voice.routes');
const shopProductsRoutes = require('./modules/shop-products/shop-products.routes');
const shopCustomersRoutes = require('./modules/shop-customers/shop-customers.routes');
const shopInvoicesRoutes = require('./modules/shop-invoices/shop-invoices.routes');
const shopPaymentsRoutes = require('./modules/shop-payments/shop-payments.routes');
const shopSubscriptionRoutes = require('./modules/shop-subscription/shop-subscription.routes');
const adminPaymentClaimsRoutes = require('./modules/admin-payment-claims/admin-payment-claims.routes');

const notFoundMiddleware = require('./middleware/notFound.middleware');
const errorMiddleware = require('./middleware/error.middleware');

const app = express();

app.use(helmet());
// Only matters for browser clients (admin panel / future shop web portal) —
// native app HTTP clients aren't subject to CORS at all. Open to all origins:
// auth is a Bearer token (not cookies), so there's no credentialed-CORS risk.
app.use(cors({ origin: '*' }));
// Full data-sync batches (invoices + items, products, customers) can exceed
// the 100kb default body limit for shops with a lot of history.
app.use(express.json({ limit: '15mb' }));
app.use(morgan('dev'));
app.use('/api', globalLimiter);

// Used by the app to poll "is it safe to retry yet" after a cold-start 5xx —
// deliberately checks the database too (not just that Express is up), since
// Neon's own autosuspend means the process can be listening and answering
// requests seconds before Prisma can actually reach it. A client that treats
// a DB-blind health check as "ready" can retry straight into the same
// connection error it was just waiting out.
app.get('/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ success: true, data: { status: 'ok' } });
  } catch (err) {
    res.status(503).json({ success: false, error: { message: 'Database not ready' } });
  }
});

app.use('/api/admin/auth', adminAuthLimiter, adminAuthRoutes);
app.use('/api/admin/shops', shopsRoutes);
app.use('/api/admin/shops/:shopId/users', shopUsersRoutes);
app.use('/api/admin/shops/:shopId/products', shopProductsRoutes);
app.use('/api/admin/shops/:shopId/customers', shopCustomersRoutes);
app.use('/api/admin/shops/:shopId/invoices', shopInvoicesRoutes);
app.use('/api/admin/shops/:shopId/payments', shopPaymentsRoutes);
app.use('/api/admin/plans', plansRoutes);
app.use('/api/admin/modules', modulesRoutes);
app.use('/api/admin', subscriptionsRoutes);
app.use('/api/admin/payment-claims', adminPaymentClaimsRoutes);

app.use('/api/shop/auth', shopAuthLimiter, shopAuthRoutes);
app.use('/api/shop/auth', shopAuthLimiter, shopOtpRoutes);
app.use('/api/shop', shopStatusRoutes);
app.use('/api/shop', shopSyncRoutes);
app.use('/api/shop', shopVoiceRoutes);
app.use('/api/shop', shopSubscriptionRoutes);

app.use(notFoundMiddleware);
app.use(errorMiddleware);

module.exports = app;
