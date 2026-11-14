import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { processStudentCard, MIN_OCR_CONFIDENCE } from '../dist/src/utils/student-card-ocr.js';
import { verifyIdentityCodes } from '../dist/src/utils/student-card-codes.js';
import { verifyCardText, verifyHcmutEmailName } from '../dist/src/utils/student-identity.js';
import { universities } from '../dist/src/data/universities.js';

const [imagePath, email, ...options] = process.argv.slice(2);
const verifiedEmail = email && email !== '--variants' ? email : undefined;
if (!imagePath) {
  console.error('Usage: npm run test:ocr:sample -- "path/to/card.jpg" [verified-email] [--variants]');
  process.exitCode = 1;
} else {
  const image = await readFile(imagePath);
  const model = fileURLToPath(new URL('../src/models/student-card/best.onnx', import.meta.url));
  const school = universities.find((entry) => entry.code === 'hcmut');
  const variants = [['original', image]];
  if (email === '--variants' || options.includes('--variants')) {
    variants.push(['width-800', await sharp(image).resize({ width: 800 }).toBuffer()]);
    // EXIF rotation represents how phone photos are commonly stored.
    variants.push(['exif-rotation', await sharp(image).rotate(90).withMetadata({ orientation: 8 }).jpeg().toBuffer()]);
  }
  for (const [variant, buffer] of variants) {
    const started = performance.now();
    const result = await processStudentCard(buffer, model);
    console.log(JSON.stringify({ variant, elapsedMs: Math.round(performance.now() - started), ...result }, null, 2));
    if (verifiedEmail) verifyHcmutEmailName(result.name, verifiedEmail);
    const id = verifyIdentityCodes(result, 'hcmut');
    for (const field of ['card', 'face', 'logo', 'idDetected', 'nameDetected', 'expiryDetected', 'qrDecoded', 'barcodeDecoded']) {
      assert.equal(result[field], true, `Missing field: ${field}`);
    }
    assert.ok(result.name && result.expiry);
    const text = [result.cardTextConfidence >= MIN_OCR_CONFIDENCE ? result.cardText : '',
      result.schoolConfidence >= MIN_OCR_CONFIDENCE ? result.schoolText : '',
      `MSSV: ${id}`, `Full name: ${result.name}`].join('\n');
    if (verifiedEmail) {
      const identity = verifyCardText(text, verifiedEmail, school);
      console.log(JSON.stringify({ variant, identity, emailChecked: true }));
    } else {
      console.log(JSON.stringify({ variant, id, emailChecked: false }));
    }
  }
}
