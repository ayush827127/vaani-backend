const AppError = require('../../utils/AppError');
const { signOtpToken } = require('../../utils/jwt');
const env = require('../../config/env');

const OTP_TTL_MS = 10 * 60 * 1000;
const MAX_SENDS_PER_WINDOW = 3;
const SEND_WINDOW_MS = 10 * 60 * 1000;

const PHONE_REGEX = /^[6-9]\d{9}$/;

// In-memory — short-lived, low-stakes data. Lost on server restart, which
// just means the user requests a fresh OTP; no durable store needed at this
// scale (mirrors the exact pattern the app used locally before this change).
const pendingOtps = new Map(); // phone -> { otp, expiresAt }
const sendCounts = new Map(); // phone -> { count, windowStart }

function checkRateLimit(phone) {
  const now = Date.now();
  const entry = sendCounts.get(phone);
  if (!entry || now - entry.windowStart > SEND_WINDOW_MS) {
    sendCounts.set(phone, { count: 1, windowStart: now });
    return;
  }
  if (entry.count >= MAX_SENDS_PER_WINDOW) {
    throw new AppError('Too many OTP requests for this number. Try again later.', 429);
  }
  entry.count += 1;
}

async function sendViaNinzaSms(phone, otp) {
  if (!env.ninzaSms.apiKey || !env.ninzaSms.senderId) {
    throw new AppError('SMS provider is not configured', 500);
  }

  const response = await fetch('https://ninzasms.in.net/auth/send_sms', {
    method: 'POST',
    headers: {
      Authorization: env.ninzaSms.apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sender_id: env.ninzaSms.senderId,
      numbers: phone,
      rout: 'sms',
      variables_values: otp,
    }),
  });

  const data = await response.json().catch(() => null);
  // Confirmed real response shape: { status: 1, msg: "..." } — status is
  // numeric, not the string "success" the API description implied. Accept
  // any truthy status (1, true, "success", ...) to be resilient to minor
  // shape variations; reject falsy/missing (0, false, absent).
  if (!response.ok || !data?.status) {
    throw new AppError('Failed to send OTP SMS', 502);
  }
}

async function sendOtp(phone) {
  if (!PHONE_REGEX.test(phone)) {
    throw new AppError('Enter a valid 10-digit Indian mobile number', 400);
  }
  checkRateLimit(phone);

  const otp = String(100000 + Math.floor(Math.random() * 900000));
  pendingOtps.set(phone, { otp, expiresAt: Date.now() + OTP_TTL_MS });

  await sendViaNinzaSms(phone, otp);
}

function verifyOtp(phone, entered) {
  const entry = pendingOtps.get(phone);
  if (!entry || entry.expiresAt < Date.now()) {
    pendingOtps.delete(phone);
    throw new AppError('OTP expired or not found — request a new one', 400);
  }
  if (entry.otp !== entered) {
    throw new AppError('Incorrect OTP', 400);
  }
  pendingOtps.delete(phone);
  return signOtpToken(phone);
}

module.exports = { sendOtp, verifyOtp };
