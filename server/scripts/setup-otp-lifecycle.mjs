import 'dotenv/config';
import database from '../dist/src/services/database.services.js';
import { initializeOtpLifecycle } from '../dist/src/services/otp-lifecycle.services.js';

try {
  await initializeOtpLifecycle(database.users);
  const indexes = await database.users.listIndexes().toArray();
  const ttl = indexes.find(index => index.name === 'pending_form_otp_expiry_ttl');
  console.log(JSON.stringify({
    otpFlagsMissing: await database.users.countDocuments({ otp_is_verified: { $exists: false } }),
    ttlIndex: ttl?.name, retentionSeconds: ttl?.expireAfterSeconds,
  }));
} catch (error) {
  console.error('OTP database setup failed:', { name: error.name, code: error.code, codeName: error.codeName });
  process.exitCode = 1;
} finally { await database.close(); }
