// Manually maintained OpenAPI 3.0 spec, served via swagger-ui-express at
// /api-docs (see app.js). Not generated from the Zod validators or route
// files — those stay the actual source of truth for real request handling;
// this exists purely so the API surface can be browsed and test-called
// without needing a REST client already wired up with the right headers.
// Update it alongside any route/schema change that affects the wire shape.
//
// One bearer scheme is used for every endpoint rather than three separate
// ones, since the mechanic (Authorization: Bearer <token>) is identical —
// each tag's description says which token type that group actually needs.
const envelope = (dataSchema) => ({
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    data: dataSchema,
  },
});

const errorEnvelope = {
  type: 'object',
  properties: {
    success: { type: 'boolean', example: false },
    error: {
      type: 'object',
      properties: { message: { type: 'string' } },
    },
  },
};

const idParam = (name, description) => ({
  name,
  in: 'path',
  required: true,
  schema: { type: 'string' },
  description,
});

const errorResponses = {
  400: { description: 'Validation error', content: { 'application/json': { schema: errorEnvelope } } },
  401: { description: 'Missing/invalid/expired token', content: { 'application/json': { schema: errorEnvelope } } },
  403: { description: 'Authenticated but not authorized for this action', content: { 'application/json': { schema: errorEnvelope } } },
  404: { description: 'Not found', content: { 'application/json': { schema: errorEnvelope } } },
};

function op({ summary, tag, security = true, body, params = [], query = [], responseSchema, extraResponses }) {
  return {
    summary,
    tags: [tag],
    ...(security ? { security: [{ bearerAuth: [] }] } : {}),
    ...(params.length || query.length ? { parameters: [...params, ...query] } : {}),
    ...(body ? { requestBody: { required: true, content: { 'application/json': { schema: body } } } } : {}),
    responses: {
      200: {
        description: 'Success',
        content: { 'application/json': { schema: envelope(responseSchema || { type: 'object' }) } },
      },
      ...errorResponses,
      ...(extraResponses || {}),
    },
  };
}

const roleEnum = { type: 'string', enum: ['OWNER', 'MANAGER', 'CASHIER'] };
const shopStatusEnum = { type: 'string', enum: ['TRIAL', 'ACTIVE', 'SUSPENDED', 'CANCELLED'] };

module.exports = {
  openapi: '3.0.3',
  info: {
    title: 'VAANI Backend API',
    version: '1.0.0',
    description:
      'Billing/inventory backend for the VAANI shopkeeper app (native mobile clients, ' +
      'legacy Shop-token and newer User-token auth) and the separate admin panel ' +
      '(email/password Admin-token). Paste a token via Authorize to try an endpoint here.',
  },
  servers: [
    { url: 'https://vaani-backend-oton.onrender.com', description: 'Production (Render)' },
    { url: 'http://localhost:4000', description: 'Local dev' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
  },
  tags: [
    { name: 'Health', description: 'No auth required.' },
    { name: 'Shop OTP', description: 'No auth required — phone verification shared by shop-auth and user-auth login.' },
    { name: 'Shop Auth (legacy)', description: 'No auth except /change-phone, which needs a Shop token. Issues the legacy Shop-scoped token (owner-only, 180-day expiry).' },
    { name: 'User Auth', description: 'Issues/refreshes the newer User-scoped token (any member, carries the active shopId). /login needs no token; the rest need a User token.' },
    { name: 'Shop Members', description: 'Needs a User token with an active membership on the shop.' },
    { name: 'Shop Invitations', description: 'Needs a User token (no active membership required — the whole point).' },
    { name: 'Shop Sync', description: 'Needs a Shop token OR a User token with an active membership.' },
    { name: 'Shop Voice', description: 'Needs a Shop token; also requires the "billing" module to be enabled for the shop.' },
    { name: 'Shop Status', description: 'Needs a Shop token.' },
    { name: 'Shop Self-Service Subscription', description: 'Needs a Shop token — a shop managing its own plan/payment claims.' },
    { name: 'Admin Auth', description: 'Email/password login for the separate admin panel.' },
    { name: 'Admin: Shops', description: 'Needs an Admin token.' },
    { name: 'Admin: Shop Items', description: 'Needs an Admin token. Mounted per-shop.' },
    { name: 'Admin: Shop Customers', description: 'Needs an Admin token. Mounted per-shop.' },
    { name: 'Admin: Shop Invoices', description: 'Needs an Admin token. Mounted per-shop.' },
    { name: 'Admin: Shop Payments', description: 'Needs an Admin token. Mounted per-shop.' },
    { name: 'Admin: Shop Members', description: 'Needs an Admin token. The new User/ShopUser/Invitation system — invite, change role, remove, list pending invitations. Distinct from the legacy "Admin: Shop Users" group below.' },
    { name: 'Admin: Audit Log', description: 'Needs an Admin token. Read-only history of sync CRUD, conflict detections, and permission rejections for a shop.' },
    { name: 'Admin: Shop Users', description: 'Needs an Admin token. Mounted per-shop. Legacy admin-managed ShopUser rows — predates the User/Invitation-based member system above.' },
    { name: 'Admin: Plans', description: 'Needs an Admin token.' },
    { name: 'Admin: Modules', description: 'Needs an Admin token.' },
    { name: 'Admin: Subscriptions', description: 'Needs an Admin token.' },
    { name: 'Admin: Payment Claims', description: 'Needs an Admin token — confirming/rejecting a shop\'s self-reported UPI payment.' },
    { name: 'Admin: Dashboard', description: 'Needs an Admin token.' },
  ],
  paths: {
    '/health': {
      get: op({ summary: 'Liveness + DB connectivity check', tag: 'Health', security: false }),
    },

    '/api/shop/auth/send-otp': {
      post: op({
        summary: 'Send a 6-digit OTP to a phone number',
        tag: 'Shop OTP',
        security: false,
        body: { type: 'object', required: ['phone'], properties: { phone: { type: 'string', minLength: 10, maxLength: 10 } } },
      }),
    },
    '/api/shop/auth/verify-otp': {
      post: op({
        summary: 'Verify an OTP, returns a short-lived otpToken for register/login',
        tag: 'Shop OTP',
        security: false,
        body: {
          type: 'object',
          required: ['phone', 'otp'],
          properties: { phone: { type: 'string', minLength: 10, maxLength: 10 }, otp: { type: 'string', minLength: 6, maxLength: 6 } },
        },
      }),
    },

    '/api/shop/auth/register': {
      post: op({
        summary: 'Register a new shop (owner) — requires a verified otpToken',
        tag: 'Shop Auth (legacy)',
        security: false,
        body: {
          type: 'object',
          required: ['name', 'ownerName', 'phone', 'otpToken'],
          properties: {
            name: { type: 'string' },
            ownerName: { type: 'string' },
            phone: { type: 'string' },
            address: { type: 'string' },
            otpToken: { type: 'string' },
          },
        },
      }),
    },
    '/api/shop/auth/login': {
      post: op({
        summary: 'Log in an existing shop by phone — requires a verified otpToken',
        tag: 'Shop Auth (legacy)',
        security: false,
        body: { type: 'object', required: ['phone', 'otpToken'], properties: { phone: { type: 'string' }, otpToken: { type: 'string' } } },
      }),
    },
    '/api/shop/auth/change-phone': {
      post: op({
        summary: "Change the logged-in shop's phone number — requires a fresh otpToken for the NEW number",
        tag: 'Shop Auth (legacy)',
        body: { type: 'object', required: ['phone', 'otpToken'], properties: { phone: { type: 'string' }, otpToken: { type: 'string' } } },
      }),
    },

    '/api/user/auth/login': {
      post: op({
        summary: 'Log in (or auto-create) a User by phone — requires a verified otpToken. Returns activeShopId when exactly one active membership exists, plus the full memberships list.',
        tag: 'User Auth',
        security: false,
        body: { type: 'object', required: ['phone', 'otpToken'], properties: { phone: { type: 'string' }, otpToken: { type: 'string' } } },
      }),
    },
    '/api/user/auth/select-shop': {
      post: op({
        summary: 'Switch the active shop on a User token (first selection or later switching)',
        tag: 'User Auth',
        body: { type: 'object', required: ['shopId'], properties: { shopId: { type: 'string' } } },
      }),
    },
    '/api/user/auth/me': {
      get: op({ summary: 'Current User profile + active memberships', tag: 'User Auth' }),
    },

    '/api/shop/members': {
      get: op({ summary: 'List members of the active shop', tag: 'Shop Members' }),
    },
    '/api/shop/members/quota': {
      get: op({
        summary: "Server-computed staff usage against the active shop's plan cap (Basic = 0 additional staff)",
        tag: 'Shop Members',
      }),
    },
    '/api/shop/members/invite': {
      post: op({
        summary: 'Invite a phone number to join the active shop with a role',
        tag: 'Shop Members',
        body: { type: 'object', required: ['phone', 'role'], properties: { phone: { type: 'string' }, role: roleEnum } },
      }),
    },
    '/api/shop/members/invite/{id}/revoke': {
      post: op({ summary: 'Revoke a pending invitation', tag: 'Shop Members', params: [idParam('id', 'Invitation id')] }),
    },
    '/api/shop/members/leave': {
      post: op({ summary: "Leave the caller's own membership on the active shop", tag: 'Shop Members' }),
    },
    '/api/shop/members/{shopUserId}/role': {
      patch: op({
        summary: "Change a member's role",
        tag: 'Shop Members',
        params: [idParam('shopUserId', 'ShopUser id')],
        body: { type: 'object', required: ['role'], properties: { role: roleEnum } },
      }),
    },
    '/api/shop/members/{shopUserId}/permissions': {
      patch: op({
        summary: 'Grant/revoke a single permission override for a member',
        tag: 'Shop Members',
        params: [idParam('shopUserId', 'ShopUser id')],
        body: { type: 'object', required: ['permission', 'granted'], properties: { permission: { type: 'string' }, granted: { type: 'boolean' } } },
      }),
    },
    '/api/shop/members/{shopUserId}': {
      delete: op({ summary: 'Remove a member from the shop', tag: 'Shop Members', params: [idParam('shopUserId', 'ShopUser id')] }),
    },

    '/api/shop/invitations': {
      get: op({ summary: "List the caller's own pending invitations (by phone)", tag: 'Shop Invitations' }),
    },
    '/api/shop/invitations/{id}/accept': {
      post: op({ summary: 'Accept an invitation — returns the new membership + enough shop profile to create it locally', tag: 'Shop Invitations', params: [idParam('id', 'Invitation id')] }),
    },
    '/api/shop/invitations/{id}/reject': {
      post: op({ summary: 'Reject an invitation', tag: 'Shop Invitations', params: [idParam('id', 'Invitation id')] }),
    },

    '/api/shop/sync': {
      post: op({
        summary: 'Push local changes (items/customers/invoices/payments/inventory transactions/shop profile) since the last sync',
        tag: 'Shop Sync',
        body: { type: 'object', description: 'See shop-sync.routes.js syncSchema for the full per-entity shape.' },
        responseSchema: {
          type: 'object',
          properties: {
            received: { type: 'object' },
            rejected: { type: 'integer', description: 'Records skipped for insufficient permission (User-token push only)' },
            syncedAt: { type: 'string', format: 'date-time' },
          },
        },
      }),
    },
    '/api/shop/sync/pull': {
      get: op({
        summary: 'Pull cloud-side changes since a given time (full pull if omitted)',
        tag: 'Shop Sync',
        query: [{ name: 'since', in: 'query', required: false, schema: { type: 'string', format: 'date-time' } }],
      }),
    },

    '/api/shop/voice/parse': {
      post: op({
        summary: 'Parse a natural-language voice prompt into billing actions (Groq-backed) — costs real API money per call',
        tag: 'Shop Voice',
        body: { type: 'object', required: ['prompt'], properties: { prompt: { type: 'string' } } },
        extraResponses: { 403: { description: '"billing" module not enabled for this shop (also covers suspended/cancelled/expired)', content: { 'application/json': { schema: errorEnvelope } } } },
      }),
    },

    '/api/shop/me/status': {
      get: op({
        summary: "This shop's effective plan, subscription, and enabled module keys right now",
        tag: 'Shop Status',
        responseSchema: {
          type: 'object',
          properties: {
            shopStatus: shopStatusEnum,
            subscription: { type: 'object', nullable: true },
            effectivePlanName: { type: 'string', nullable: true },
            modules: { type: 'array', items: { type: 'string' } },
          },
        },
      }),
    },

    '/api/shop/plans': {
      get: op({ summary: 'List active plans available to self-serve into', tag: 'Shop Self-Service Subscription' }),
    },
    '/api/shop/subscription/switch-free': {
      post: op({
        summary: 'Switch immediately to a free plan (no payment claim needed)',
        tag: 'Shop Self-Service Subscription',
        body: { type: 'object', required: ['planId'], properties: { planId: { type: 'string', format: 'uuid' } } },
      }),
    },
    '/api/shop/payment-claims': {
      post: op({
        summary: 'Claim a UPI payment was made for a plan (admin reviews and confirms/rejects it separately — see Admin: Payment Claims)',
        tag: 'Shop Self-Service Subscription',
        body: {
          type: 'object',
          required: ['planId', 'reference', 'amount'],
          properties: { planId: { type: 'string', format: 'uuid' }, reference: { type: 'string', minLength: 8, maxLength: 128 }, amount: { type: 'number' } },
        },
      }),
      get: op({ summary: "List the caller's own payment claims", tag: 'Shop Self-Service Subscription' }),
    },
    '/api/shop/subscription/voice-usage': {
      get: op({ summary: "This shop's voice-invoice usage against its plan's quota", tag: 'Shop Self-Service Subscription' }),
    },

    '/api/admin/auth/login': {
      post: op({
        summary: 'Admin email/password login',
        tag: 'Admin Auth',
        security: false,
        body: { type: 'object', required: ['email', 'password'], properties: { email: { type: 'string', format: 'email' }, password: { type: 'string' } } },
      }),
    },
    '/api/admin/auth/me': {
      get: op({ summary: 'Current admin profile', tag: 'Admin Auth' }),
    },

    '/api/admin/shops': {
      get: op({ summary: 'List shops', tag: 'Admin: Shops' }),
      post: op({
        summary: 'Create a shop',
        tag: 'Admin: Shops',
        body: {
          type: 'object',
          required: ['name', 'ownerName', 'phone'],
          properties: { name: { type: 'string' }, ownerName: { type: 'string' }, phone: { type: 'string' }, email: { type: 'string', format: 'email' }, address: { type: 'string' }, status: shopStatusEnum },
        },
      }),
    },
    '/api/admin/shops/{id}': {
      get: op({ summary: 'Get a shop by id', tag: 'Admin: Shops', params: [idParam('id', 'Shop id')] }),
      patch: op({
        summary: 'Update a shop',
        tag: 'Admin: Shops',
        params: [idParam('id', 'Shop id')],
        body: {
          type: 'object',
          properties: { name: { type: 'string' }, ownerName: { type: 'string' }, phone: { type: 'string' }, email: { type: 'string', nullable: true }, address: { type: 'string', nullable: true }, status: shopStatusEnum },
        },
      }),
    },
    '/api/admin/shops/{id}/status': {
      patch: op({
        summary: "Change a shop's status directly (TRIAL/ACTIVE/SUSPENDED/CANCELLED)",
        tag: 'Admin: Shops',
        params: [idParam('id', 'Shop id')],
        body: { type: 'object', required: ['status'], properties: { status: shopStatusEnum } },
      }),
    },
    '/api/admin/shops/{id}/modules/{moduleId}': {
      patch: op({
        summary: 'Set a per-shop module override (on top of whatever the plan grants)',
        tag: 'Admin: Shops',
        params: [idParam('id', 'Shop id'), idParam('moduleId', 'Module id')],
        body: { type: 'object', required: ['enabled'], properties: { enabled: { type: 'boolean' } } },
      }),
      delete: op({ summary: 'Remove a per-shop module override', tag: 'Admin: Shops', params: [idParam('id', 'Shop id'), idParam('moduleId', 'Module id')] }),
    },
    '/api/admin/shops/{id}/logo': {
      post: op({ summary: "Upload a shop's logo (multipart/form-data)", tag: 'Admin: Shops', params: [idParam('id', 'Shop id')] }),
      delete: op({ summary: "Remove a shop's logo", tag: 'Admin: Shops', params: [idParam('id', 'Shop id')] }),
    },

    '/api/admin/shops/{shopId}/items': {
      get: op({ summary: "List a shop's items", tag: 'Admin: Shop Items', params: [idParam('shopId', 'Shop id')] }),
      post: op({
        summary: 'Create an item for a shop',
        tag: 'Admin: Shop Items',
        params: [idParam('shopId', 'Shop id')],
        body: {
          type: 'object',
          required: ['name', 'costPrice', 'sellingPrice', 'gstRate', 'stockQuantity', 'reorderLevel'],
          properties: {
            name: { type: 'string' }, sku: { type: 'string', nullable: true }, barcode: { type: 'string', nullable: true },
            category: { type: 'string', nullable: true }, costPrice: { type: 'number' }, sellingPrice: { type: 'number' },
            mrp: { type: 'number', nullable: true, description: 'Printed maximum retail price' },
            description: { type: 'string', nullable: true },
            gstRate: { type: 'number' }, stockQuantity: { type: 'integer' }, reorderLevel: { type: 'integer' },
            itemType: { type: 'string', enum: ['PRODUCT', 'SERVICE'] }, inventoryEnabled: { type: 'boolean' }, isActive: { type: 'boolean' },
          },
        },
      }),
    },
    '/api/admin/shops/{shopId}/items/{id}': {
      get: op({ summary: 'Get an item', tag: 'Admin: Shop Items', params: [idParam('shopId', 'Shop id'), idParam('id', 'Item id')] }),
      patch: op({ summary: 'Update an item (all fields optional)', tag: 'Admin: Shop Items', params: [idParam('shopId', 'Shop id'), idParam('id', 'Item id')] }),
      delete: op({ summary: 'Delete (soft) an item', tag: 'Admin: Shop Items', params: [idParam('shopId', 'Shop id'), idParam('id', 'Item id')] }),
    },
    '/api/admin/shops/{shopId}/items/{id}/image': {
      post: op({ summary: "Upload an item's image (multipart/form-data)", tag: 'Admin: Shop Items', params: [idParam('shopId', 'Shop id'), idParam('id', 'Item id')] }),
      delete: op({ summary: "Remove an item's image", tag: 'Admin: Shop Items', params: [idParam('shopId', 'Shop id'), idParam('id', 'Item id')] }),
    },

    '/api/admin/shops/{shopId}/customers': {
      get: op({ summary: "List a shop's customers", tag: 'Admin: Shop Customers', params: [idParam('shopId', 'Shop id')] }),
      post: op({
        summary: 'Create a customer for a shop',
        tag: 'Admin: Shop Customers',
        params: [idParam('shopId', 'Shop id')],
        body: {
          type: 'object',
          required: ['name'],
          properties: { name: { type: 'string' }, phone: { type: 'string', nullable: true }, email: { type: 'string', nullable: true }, address: { type: 'string', nullable: true }, lastVisit: { type: 'string', nullable: true } },
        },
      }),
    },
    '/api/admin/shops/{shopId}/customers/{id}': {
      get: op({ summary: 'Get a customer', tag: 'Admin: Shop Customers', params: [idParam('shopId', 'Shop id'), idParam('id', 'Customer id')] }),
      patch: op({ summary: 'Update a customer (all fields optional; balance fields not admin-editable — see the route file)', tag: 'Admin: Shop Customers', params: [idParam('shopId', 'Shop id'), idParam('id', 'Customer id')] }),
      delete: op({ summary: 'Delete (soft) a customer', tag: 'Admin: Shop Customers', params: [idParam('shopId', 'Shop id'), idParam('id', 'Customer id')] }),
    },

    '/api/admin/shops/{shopId}/invoices': {
      get: op({ summary: "List a shop's invoices", tag: 'Admin: Shop Invoices', params: [idParam('shopId', 'Shop id')] }),
      post: op({
        summary: 'Create an invoice for a shop',
        tag: 'Admin: Shop Invoices',
        params: [idParam('shopId', 'Shop id')],
        body: {
          type: 'object',
          required: ['items'],
          properties: {
            customerId: { type: 'integer', nullable: true }, customerName: { type: 'string' }, paymentMode: { type: 'string' },
            status: { type: 'string' }, notes: { type: 'string', nullable: true }, discountType: { type: 'string', enum: ['none', 'percent', 'flat'] },
            discountValue: { type: 'number' }, receivedAmount: { type: 'number' },
            items: {
              type: 'array', minItems: 1,
              items: { type: 'object', required: ['itemId', 'itemName', 'quantity', 'sellingPrice'], properties: { itemId: { type: 'integer' }, itemName: { type: 'string' }, itemType: { type: 'string', enum: ['PRODUCT', 'SERVICE'] }, quantity: { type: 'integer' }, sellingPrice: { type: 'number' }, gstRate: { type: 'number' } } },
            },
          },
        },
      }),
    },
    '/api/admin/shops/{shopId}/invoices/{id}': {
      get: op({ summary: 'Get an invoice', tag: 'Admin: Shop Invoices', params: [idParam('shopId', 'Shop id'), idParam('id', 'Invoice id')] }),
      patch: op({ summary: 'Update an invoice (all fields optional)', tag: 'Admin: Shop Invoices', params: [idParam('shopId', 'Shop id'), idParam('id', 'Invoice id')] }),
      delete: op({ summary: 'Delete (soft) an invoice', tag: 'Admin: Shop Invoices', params: [idParam('shopId', 'Shop id'), idParam('id', 'Invoice id')] }),
    },

    '/api/admin/shops/{shopId}/payments': {
      get: op({ summary: "List a shop's payment transactions", tag: 'Admin: Shop Payments', params: [idParam('shopId', 'Shop id')] }),
      post: op({
        summary: 'Create a payment transaction for a shop',
        tag: 'Admin: Shop Payments',
        params: [idParam('shopId', 'Shop id')],
        body: {
          type: 'object',
          required: ['customerId', 'type', 'amount', 'paymentMode'],
          properties: { customerId: { type: 'integer' }, invoiceId: { type: 'integer', nullable: true }, type: { type: 'string' }, amount: { type: 'number' }, paymentMode: { type: 'string' }, notes: { type: 'string', nullable: true } },
        },
      }),
    },
    '/api/admin/shops/{shopId}/payments/{id}': {
      get: op({ summary: 'Get a payment transaction', tag: 'Admin: Shop Payments', params: [idParam('shopId', 'Shop id'), idParam('id', 'Payment id')] }),
      patch: op({ summary: 'Update a payment transaction (all fields optional)', tag: 'Admin: Shop Payments', params: [idParam('shopId', 'Shop id'), idParam('id', 'Payment id')] }),
      delete: op({ summary: 'Delete (soft) a payment transaction', tag: 'Admin: Shop Payments', params: [idParam('shopId', 'Shop id'), idParam('id', 'Payment id')] }),
    },

    '/api/admin/shops/{shopId}/members': {
      get: op({ summary: "List a shop's active members (the new User/ShopUser system)", tag: 'Admin: Shop Members', params: [idParam('shopId', 'Shop id')] }),
    },
    '/api/admin/shops/{shopId}/members/invite': {
      post: op({
        summary: 'Invite a phone number to join the shop with a role — bypasses the "only an owner can invite an owner" in-app rule, since an admin already has full authority',
        tag: 'Admin: Shop Members',
        params: [idParam('shopId', 'Shop id')],
        body: { type: 'object', required: ['phone', 'role'], properties: { phone: { type: 'string' }, role: roleEnum } },
      }),
    },
    '/api/admin/shops/{shopId}/members/{shopUserId}/role': {
      patch: op({
        summary: "Change a member's role — still blocked from demoting a shop's sole remaining owner",
        tag: 'Admin: Shop Members',
        params: [idParam('shopId', 'Shop id'), idParam('shopUserId', 'ShopUser id')],
        body: { type: 'object', required: ['role'], properties: { role: roleEnum } },
      }),
    },
    '/api/admin/shops/{shopId}/members/{shopUserId}': {
      delete: op({ summary: "Remove a member — still blocked from removing a shop's sole remaining owner", tag: 'Admin: Shop Members', params: [idParam('shopId', 'Shop id'), idParam('shopUserId', 'ShopUser id')] }),
    },
    '/api/admin/shops/{shopId}/members/invitations': {
      get: op({ summary: "List a shop's pending invitations", tag: 'Admin: Shop Members', params: [idParam('shopId', 'Shop id')] }),
    },
    '/api/admin/shops/{shopId}/members/invitations/{id}/revoke': {
      post: op({ summary: 'Revoke a pending invitation', tag: 'Admin: Shop Members', params: [idParam('shopId', 'Shop id'), idParam('id', 'Invitation id')] }),
    },

    '/api/admin/shops/{shopId}/audit-log': {
      get: op({
        summary: "A shop's audit history — sync CRUD, inventory/financial/invoice-number conflict detections, and permission-rejection events, newest first",
        tag: 'Admin: Audit Log',
        params: [idParam('shopId', 'Shop id')],
        query: [
          { name: 'page', in: 'query', required: false, schema: { type: 'integer', minimum: 1, default: 1 } },
          { name: 'limit', in: 'query', required: false, schema: { type: 'integer', minimum: 1, maximum: 100, default: 50 } },
        ],
        responseSchema: {
          type: 'object',
          properties: {
            entries: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, action: { type: 'string' }, module: { type: 'string', nullable: true }, entityType: { type: 'string', nullable: true }, entityId: { type: 'string', nullable: true }, userId: { type: 'string', nullable: true }, metadata: { type: 'object', nullable: true }, createdAt: { type: 'string', format: 'date-time' } } } },
            total: { type: 'integer' },
            page: { type: 'integer' },
            limit: { type: 'integer' },
          },
        },
      }),
    },

    '/api/admin/shops/{shopId}/users': {
      get: op({ summary: "List a shop's members (legacy admin-managed ShopUser rows)", tag: 'Admin: Shop Users', params: [idParam('shopId', 'Shop id')] }),
      post: op({
        summary: 'Create a member for a shop',
        tag: 'Admin: Shop Users',
        params: [idParam('shopId', 'Shop id')],
        body: { type: 'object', required: ['name', 'phone'], properties: { name: { type: 'string' }, phone: { type: 'string' }, role: roleEnum } },
      }),
    },
    '/api/admin/shops/{shopId}/users/{id}': {
      patch: op({ summary: 'Update a member', tag: 'Admin: Shop Users', params: [idParam('shopId', 'Shop id'), idParam('id', 'ShopUser id')] }),
    },
    '/api/admin/shops/{shopId}/users/{id}/access': {
      patch: op({
        summary: "Set a member's per-module view/edit access",
        tag: 'Admin: Shop Users',
        params: [idParam('shopId', 'Shop id'), idParam('id', 'ShopUser id')],
        body: { type: 'object', required: ['moduleId'], properties: { moduleId: { type: 'string', format: 'uuid' }, canView: { type: 'boolean' }, canEdit: { type: 'boolean' } } },
      }),
    },

    '/api/admin/plans': {
      get: op({ summary: 'List plans', tag: 'Admin: Plans' }),
      post: op({
        summary: 'Create a plan',
        tag: 'Admin: Plans',
        body: {
          type: 'object',
          required: ['name', 'price'],
          properties: { name: { type: 'string' }, price: { type: 'number' }, billingCycle: { type: 'string', enum: ['MONTHLY', 'YEARLY'] }, isActive: { type: 'boolean' }, moduleIds: { type: 'array', items: { type: 'string', format: 'uuid' } } },
        },
      }),
    },
    '/api/admin/plans/{id}': {
      get: op({ summary: 'Get a plan', tag: 'Admin: Plans', params: [idParam('id', 'Plan id')] }),
      patch: op({ summary: 'Update a plan (all fields optional)', tag: 'Admin: Plans', params: [idParam('id', 'Plan id')] }),
      delete: op({ summary: 'Delete a plan', tag: 'Admin: Plans', params: [idParam('id', 'Plan id')] }),
    },

    '/api/admin/modules': {
      get: op({ summary: 'List the module catalog', tag: 'Admin: Modules' }),
      post: op({
        summary: 'Create a module',
        tag: 'Admin: Modules',
        body: { type: 'object', required: ['key', 'name'], properties: { key: { type: 'string' }, name: { type: 'string' }, description: { type: 'string' } } },
      }),
    },
    '/api/admin/modules/{id}': {
      patch: op({
        summary: 'Update a module (key is immutable — not accepted here)',
        tag: 'Admin: Modules',
        params: [idParam('id', 'Module id')],
        body: { type: 'object', properties: { name: { type: 'string' }, description: { type: 'string', nullable: true } } },
      }),
    },

    '/api/admin/shops/{shopId}/subscriptions': {
      get: op({ summary: "List a shop's subscription history", tag: 'Admin: Subscriptions', params: [idParam('shopId', 'Shop id')] }),
    },
    '/api/admin/subscriptions': {
      post: op({
        summary: 'Create a subscription for a shop',
        tag: 'Admin: Subscriptions',
        body: {
          type: 'object',
          required: ['shopId', 'planId'],
          properties: {
            shopId: { type: 'string', format: 'uuid' }, planId: { type: 'string', format: 'uuid' },
            status: { type: 'string', enum: ['TRIAL', 'ACTIVE', 'EXPIRED', 'CANCELLED'] },
            startDate: { type: 'string', format: 'date-time' }, endDate: { type: 'string', format: 'date-time' }, autoRenew: { type: 'boolean' },
          },
        },
      }),
    },
    '/api/admin/subscriptions/{id}': {
      patch: op({
        summary: 'Update a subscription (all fields optional; endDate accepts null to clear it)',
        tag: 'Admin: Subscriptions',
        params: [idParam('id', 'Subscription id')],
      }),
    },

    '/api/admin/payment-claims': {
      get: op({ summary: 'List UPI payment claims awaiting review', tag: 'Admin: Payment Claims' }),
    },
    '/api/admin/payment-claims/{id}/confirm': {
      post: op({ summary: 'Confirm a payment claim — activates the subscription it was for', tag: 'Admin: Payment Claims', params: [idParam('id', 'PaymentClaim id')] }),
    },
    '/api/admin/payment-claims/{id}/reject': {
      post: op({
        summary: 'Reject a payment claim',
        tag: 'Admin: Payment Claims',
        params: [idParam('id', 'PaymentClaim id')],
        body: { type: 'object', properties: { note: { type: 'string', maxLength: 500 } } },
      }),
    },

    '/api/admin/dashboard/summary': {
      get: op({ summary: 'Aggregate counts for the admin dashboard landing page', tag: 'Admin: Dashboard' }),
    },
  },
};
