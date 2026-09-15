const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const env = require('./config/env');
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

app.get('/health', (req, res) => res.json({ success: true, data: { status: 'ok' } }));

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

app.use('/api/shop/auth', shopAuthLimiter, shopAuthRoutes);
app.use('/api/shop/auth', shopAuthLimiter, shopOtpRoutes);
app.use('/api/shop', shopStatusRoutes);
app.use('/api/shop', shopSyncRoutes);
app.use('/api/shop', shopVoiceRoutes);

app.use(notFoundMiddleware);
app.use(errorMiddleware);

module.exports = app;
