require('dotenv').config();

const required = ['DATABASE_URL', 'JWT_SECRET'];

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

module.exports = {
  port: process.env.PORT || 4000,
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  // Deliberately separate from the admin token's expiry — the admin panel
  // is a short web session, but the phone app is expected to "stay logged
  // in" like any normal mobile app. Re-auth requires a fresh SMS OTP (no
  // refresh-token flow exists), so a short expiry here silently breaks
  // cloud sync for any shop that hasn't reopened the login screen recently,
  // with no prompt telling them why.
  shopJwtExpiresIn: process.env.SHOP_JWT_EXPIRES_IN || '180d',
  adminSeed: {
    name: process.env.ADMIN_SEED_NAME || 'Super Admin',
    email: process.env.ADMIN_SEED_EMAIL,
    password: process.env.ADMIN_SEED_PASSWORD,
  },
  // Used by shop-voice to proxy the LLM call so the key never ships in the app.
  groqApiKey: process.env.GROQ_API_KEY,
  // Used by shop-otp to send real SMS OTPs via NinzaSMS.
  ninzaSms: {
    apiKey: process.env.NINZA_SMS_API_KEY,
    senderId: process.env.NINZA_SMS_SENDER_ID,
  },
  // Admin-panel image uploads/deletes (product photos, shop logo) go through
  // the backend using the API key/secret — unlike the phone app, which
  // uploads straight to Cloudinary via an unsigned preset and never touches
  // these. cloudName is duplicated from the phone's own copy since this is a
  // separate .env; api key/secret must never ship client-side.
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET,
  },
};
