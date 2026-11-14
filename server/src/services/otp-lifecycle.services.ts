import type { Collection, Filter } from 'mongodb';
import type User from '../models/users.schemas.js';
import { AccountStatus } from '../constants/enums.js';

export const OTP_RETENTION_SECONDS = 10 * 60;
export const pendingOtpFilter: Filter<User> = {
  status: AccountStatus.Pending,
  email_verified: false,
  otp_is_verified: false,
  google_id: null,
  otp_code_hash: { $type: 'string', $gt: '' },
};

export function expiredOtpFilter(now = new Date(), email?: string): Filter<User> {
  return {
    ...pendingOtpFilter,
    otp_expires_at: { $lte: new Date(now.getTime() - OTP_RETENTION_SECONDS * 1000) },
    ...(email ? { email } : {}),
  };
}

export async function deleteExpiredOtpRegistrations(users: Collection<User>, now = new Date(), email?: string) {
  // The predicate is evaluated atomically at deletion time, so a verified/resend account survives.
  return users.deleteMany(expiredOtpFilter(now, email));
}

export async function initializeOtpLifecycle(users: Collection<User>) {
  // Upgrade pending records from the earlier registration implementation.
  await users.updateMany({ status: 'pending_verification' as AccountStatus, google_id: null,
    email_verified: { $ne: true } }, { $set: { status: AccountStatus.Pending, email_verified: false } });
  // Before this flag existed, only form OTP verification set email_verified=true without Google.
  await users.updateMany({ otp_is_verified: { $exists: false }, email_verified: true,
    google_id: null, status: AccountStatus.Active, otp_code_hash: { $in: [null, ''] } },
  { $set: { otp_is_verified: true } });
  await users.updateMany({ otp_is_verified: { $exists: false } }, { $set: { otp_is_verified: false } });
  await users.updateMany({ otp_is_verified: true, email_verified: true }, {
    $unset: { otp_code_hash: '', otp_expires_at: '', otp_resend_at: '', otp_attempts: '' },
  });
  await users.createIndex({ otp_expires_at: 1 }, {
    name: 'pending_form_otp_expiry_ttl', expireAfterSeconds: OTP_RETENTION_SECONDS,
    partialFilterExpression: pendingOtpFilter,
  });
  await deleteExpiredOtpRegistrations(users);
}

export function startOtpCleanup(users: Collection<User>) {
  let running = false;
  // TTL still works while the app is down. This sweep reduces its normal ~60s delay.
  const timer = setInterval(async () => {
    if (running) return;
    running = true;
    try { await deleteExpiredOtpRegistrations(users); }
    catch { console.error('[otp] Pending registration cleanup failed; will retry.'); }
    finally { running = false; }
  }, 1000);
  timer.unref();
  return () => clearInterval(timer);
}
