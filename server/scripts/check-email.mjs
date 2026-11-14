import 'dotenv/config';
import { verifyEmailService } from '../dist/src/utils/email.js';

// Authenticates the configured SMTP connection without sending an email.
try {
  await verifyEmailService();
  console.log('SMTP authentication OK. No email was sent.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
