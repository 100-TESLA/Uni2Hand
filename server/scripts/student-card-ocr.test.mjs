import assert from 'node:assert/strict';
import { test } from 'node:test';
import sharp from 'sharp';
import { QRCodeWriter, Code128Reader, BarcodeFormat } from '@zxing/library';
import { extractHcmutStudentId, hcmutIdFromCode, verifyIdentityCodes } from '../dist/src/utils/student-card-codes.js';
import { decodeStudentCardCode, parseStudentCardDetections } from '../dist/src/utils/student-card-ocr.js';
import { verifyCardText, verifyHcmutEmailName, verifyCardUniversityText, hasCardUniversityText } from '../dist/src/utils/student-identity.js';
import { assessStudentCardImage, assertStudentCardImageQuality } from '../dist/src/utils/student-card-quality.js';
import { universities } from '../dist/src/data/universities.js';

const id = '2345678';
const school = universities.find((entry) => entry.code === 'hcmut');
const text = `HO CHI MINH CITY UNIVERSITY OF TECHNOLOGY\nSTUDENT ID CARD\nMSSV: ${id}\nFull name: TRAN VAN MINH`;

test('HCMUT ID: strip labels/spacing, preserve zeros, reject extra digits and guessed letters', () => {
  for (const input of [id, `Mã số / ID ${id}`, `MSSV: ${id}`, '234 5678']) {
    assert.equal(extractHcmutStudentId(input), id);
  }
  assert.equal(extractHcmutStudentId('0012345'), '0012345');
  for (const input of ['12345678', '234567', 'O234567', '2345678 8765432', '10/2028', '1/02/2028', '234.5678', '']) {
    assert.equal(extractHcmutStudentId(input), null);
  }
});

test('QR: accept explicit ID fields, reject arbitrary or conflicting digits', () => {
  for (const input of [id, `MSSV: ${id}`, `{"student_id":"${id}"}`,
    `https://example.edu.vn/card?mssv=${id}`, `{"mssv":"${id}","id":"${id}"}`]) {
    assert.equal(hcmutIdFromCode(input), id);
  }
  for (const input of [`https://example.edu.vn/${id}`, `{"phone":"${id}"}`,
    `{"mssv":"${id}","id":"8765432"}`, `https://example.edu.vn/?id=${id}&id=8765432`,
    `{"mssv":"${id}","id":null}`, 'https://example.edu.vn/?year=2028']) {
    assert.equal(hcmutIdFromCode(input), null);
  }
});

test('All three codes must be read independently and match exactly', () => {
  const codes = { id: `Mã số / ID ${id}`, qrContent: `{"mssv":"${id}"}`, barcodeContent: id };
  assert.equal(verifyIdentityCodes(codes, 'hcmut'), id);
  assert.throws(() => verifyIdentityCodes({ ...codes, id: `1${id}` }, 'hcmut'), /7 chữ số/);
  assert.throws(() => verifyIdentityCodes({ ...codes, id: null }, 'hcmut'), /Không đọc đầy đủ/);
  assert.throws(() => verifyIdentityCodes({ ...codes, barcodeContent: null }, 'hcmut'), /Không đọc đầy đủ/);
  assert.throws(() => verifyIdentityCodes({ ...codes, qrContent: '8765432' }, 'hcmut'), /không trùng khớp/);
  assert.throws(() => verifyIdentityCodes({ ...codes, barcodeContent: '8765432' }, 'hcmut'), /không trùng khớp/);
});

test('HCMUT email: compare the given name only; ignore every suffix digit and word', () => {
  assert.equal(verifyCardText(text, 'minh.tran241005@hcmut.edu.vn', school).student_id, id);
  assert.equal(verifyCardText(text, 'minh.anything8765432@hcmut.edu.vn', school).student_id, id);
  assert.equal(verifyCardText(text, 'minh.vutakeshi@hcmut.edu.vn', school).student_id, id);
  assert.throws(() => verifyCardText(text, 'another.person241005@hcmut.edu.vn', school), /Tên trên thẻ/);
  assert.throws(() => verifyCardText(text, '8765432@hcmut.edu.vn', school), /Không xác định được tên/);
  assert.throws(() => verifyCardText(text, 'student@hcmut.edu.vn', school), /Tên trên thẻ/);
  assert.throws(() => verifyCardText(text.replace('HO CHI MINH CITY UNIVERSITY OF TECHNOLOGY', 'OTHER SCHOOL'),
    'minh.tran@hcmut.edu.vn', school), { code: 'CARD_SCHOOL_UNREADABLE' });
});

test('An unreadable school is not reported as a conflicting university', () => {
  assert.throws(() => verifyCardUniversityText('Tuo oA! HOC BACH KHOA DHQG-HCM', school),
    { code: 'CARD_SCHOOL_UNREADABLE' });
  assert.throws(() => verifyCardUniversityText('UNREADABLE SCHOOL', school),
    { code: 'CARD_SCHOOL_UNREADABLE' });
  assert.doesNotThrow(() => verifyCardUniversityText('TRUONG DAI HOC BACH KHOA - DHQG-HCM', school));
  assert.throws(() => verifyCardUniversityText('HANOI UNIVERSITY OF SCIENCE AND TECHNOLOGY', school),
    { code: 'CARD_SCHOOL_MISMATCH' });
  assert.equal(hasCardUniversityText('HO CHI MINH CITY UNIVERSITY OF TECHNOLOGY AND EDUCATION', school), false);
  assert.throws(() => verifyCardUniversityText('HO CHI MINH CITY UNIVERSITY OF TECHNOLOGY AND EDUCATION', school),
    { code: 'CARD_SCHOOL_MISMATCH' });
});

test('Image quality distinguishes readable detail, severe blur, low contrast and insufficient resolution', async () => {
  const width = 800, height = 500;
  const pixels = Buffer.alloc(width * height, 240);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if ((Math.floor(x / 50) + Math.floor(y / 50)) % 2 === 0) pixels[y * width + x] = 25;
  }
  const clear = await sharp(pixels, { raw: { width, height, channels: 1 } }).png().toBuffer();
  const quality = await assessStudentCardImage(clear);
  assert.equal(quality.problem, null);
  assert.doesNotThrow(() => assertStudentCardImageQuality(quality));
  const blurred = await assessStudentCardImage(await sharp(clear).blur(8).png().toBuffer());
  assert.equal(blurred.problem, 'blurred');
  assert.throws(() => assertStudentCardImageQuality(blurred), { code: 'CARD_IMAGE_BLURRY' });
  const tiny = await assessStudentCardImage(await sharp(clear).resize({ width: 170 }).png().toBuffer());
  assert.equal(tiny.problem, 'too_small');
  assert.throws(() => assertStudentCardImageQuality(tiny), { code: 'CARD_IMAGE_TOO_SMALL' });
  const blank = await sharp({ create: { width, height, channels: 3, background: 'white' } }).png().toBuffer();
  const contrast = await assessStudentCardImage(blank);
  assert.equal(contrast.problem, 'low_contrast');
  assert.throws(() => assertStudentCardImageQuality(contrast), { code: 'CARD_IMAGE_LOW_CONTRAST' });
});

test('HCMUT supplied examples: initials, nicknames and numbers after the dot do not affect name matching', () => {
  for (const [name, email] of [
    ['TRẦN LÂM ANH KHOA', 'khoa.tran241005@hcmut.edu.vn'],
    ['ĐINH TRẦN ANH KHOA', 'khoa.dinhkaris222@hcmut.edu.vn'],
    ['HỒ ANH DŨNG', 'dung.hokhmt2k23@hcmut.edu.vn'],
    ['NGUYỄN VĂN TÀI', 'tai.nguyenanhthainat@hcmut.edu.vn'],
    ['NGUYỄN HOÀNG LONG', 'long.nguyen2352691@hcmut.edu.vn'],
    ['NGUYỄN NHẬT THÀNH', 'thanh.nguyen2353102@hcmut.edu.vn'],
    ['VŨ NHẬT MINH', 'minh.vutakeshi@hcmut.edu.vn'],
    ['NGUYỄN TRẦN MINH ANH', 'anh.nguyen225203704@hcmut.edu.vn'],
  ]) {
    assert.doesNotThrow(() => verifyHcmutEmailName(name, email), email);
    const card = text.replace('TRAN VAN MINH', name);
    assert.equal(verifyCardText(card, email, school).student_id, id);
  }
  assert.doesNotThrow(() => verifyHcmutEmailName('trần lâm anh khoa', ' KHOA.TRAN241005@HCMUT.EDU.VN '));
});

test('HCMUT name mismatch: Phat is not Khoa, and a middle name cannot substitute for the given name', () => {
  for (const name of ['NGUYỄN TẤN PHÁT', 'NGUYỄN KHOA PHÁT']) {
    assert.throws(() => verifyHcmutEmailName(name, 'khoa.tran241005@hcmut.edu.vn'),
      /Tên trên thẻ \(PHÁT\) không khớp tên trong email HCMUT \(khoa\)/);
  }
  for (const email of ['2345678@hcmut.edu.vn', '.tran@hcmut.edu.vn', 'khoa.tran@gmail.com']) {
    assert.throws(() => verifyHcmutEmailName('TRẦN LÂM ANH KHOA', email), /Không xác định được tên/);
  }
  assert.throws(() => verifyHcmutEmailName(null, 'khoa.tran241005@hcmut.edu.vn'), /Không đọc rõ họ tên/);
});

test('YOLO: reverse letterbox padding and keep the highest-confidence duplicate', () => {
  const anchors = 3;
  const values = new Float32Array(12 * anchors);
  const detection = (anchor, cls, score) => {
    [200, 435, 100, 30].forEach((value, channel) => { values[channel * anchors + anchor] = value; });
    values[(4 + cls) * anchors + anchor] = score;
  };
  detection(0, 4, 0.8); detection(1, 4, 0.95); detection(2, 6, 0.9);
  const boxes = parseStudentCardDetections(values, [1, 12, anchors], 1280, 800);
  assert.equal(boxes.length, 2);
  assert.deepEqual(boxes.map((box) => box.className), ['id', 'name']);
  assert.deepEqual([boxes[0].x1, boxes[0].y1, boxes[0].x2, boxes[0].y2], [300, 600, 500, 660]);
  assert.throws(() => parseStudentCardDetections(values, [1, 84, anchors], 1280, 800), /8 lớp/);
});

async function qrImage(content) {
  const matrix = new QRCodeWriter().encode(content, BarcodeFormat.QR_CODE, 240, 240, new Map());
  const width = matrix.getWidth(), height = matrix.getHeight();
  const pixels = Buffer.alloc(width * height, 255);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (matrix.get(x, y)) pixels[y * width + x] = 0;
  }
  return sharp(pixels, { raw: { width, height, channels: 1 } }).toColourspace('srgb').ensureAlpha().png().toBuffer();
}

// Encode a Code 128-B fixture with its required checksum and quiet zones.
async function barcodeImage(content) {
  const symbols = [104, ...Array.from(content, (char) => char.charCodeAt(0) - 32)];
  symbols.push(symbols.reduce((sum, code, index) => sum + (index ? code * index : code), 0) % 103, 106);
  const widths = symbols.flatMap((code) => Array.from(Code128Reader.CODE_PATTERNS[code]));
  const module = 3, quiet = 36, height = 90;
  const width = widths.reduce((sum, size) => sum + size * module, quiet * 2);
  const pixels = Buffer.alloc(width * height, 255);
  let x = quiet;
  widths.forEach((size, index) => {
    if (index % 2 === 0) for (let y = 0; y < height; y++) pixels.fill(0, y * width + x, y * width + x + size * module);
    x += size * module;
  });
  return sharp(pixels, { raw: { width, height, channels: 1 } }).png().toBuffer();
}

test('Decode an RGBA QR image using one luminance byte per pixel', async () => {
  const qr = await qrImage(id);
  assert.equal(await decodeStudentCardCode(qr, 'qr'), id);
  assert.equal(await decodeStudentCardCode(await sharp(qr).rotate(90).png().toBuffer(), 'qr'), id);
});

test('Decode a Code 128 image and a rotated barcode', async () => {
  const barcode = await barcodeImage(id);
  assert.equal(await decodeStudentCardCode(barcode, 'barcode'), id);
  assert.equal(await decodeStudentCardCode(await sharp(barcode).rotate(90).png().toBuffer(), 'barcode'), id);
});

test('An empty image must not produce a QR or barcode', async () => {
  const blank = await sharp({ create: { width: 100, height: 60, channels: 3, background: 'white' } }).png().toBuffer();
  assert.equal(await decodeStudentCardCode(blank, 'qr'), null);
  assert.equal(await decodeStudentCardCode(blank, 'barcode'), null);
});

test('Verification service saves matching evidence and rejects mismatches before claiming an identity', async (t) => {
  // No database connection: replace collection getters with in-memory doubles.
  process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/ocr-test';
  process.env.DB_NAME = 'ocr-test';
  const { default: database } = await import('../dist/src/services/database.services.js');
  const { verifyStudentIdentity } = await import('../dist/src/services/student-verification.services.js');
  const { ObjectId } = await import('mongodb');
  const user = { _id: new ObjectId(), email: 'minh.tran241005@hcmut.edu.vn', email_verified: true, profile_revision: 0 };
  const photo = await sharp({ create: { width: 100, height: 60, channels: 3, background: 'white' } }).png().toBuffer();
  const image = `data:image/png;base64,${photo.toString('base64')}`;
  const evidence = {
    id, name: 'TRAN VAN MINH', expiry: '10/2028', cardText: text,
    cardTextConfidence: 90, schoolText: '', schoolConfidence: 0,
    quality: { width: 800, height: 500, sharpness: 4, contrast: 40, problem: null },
    qrContent: id, barcodeContent: id, card: true, face: true, logo: true,
    idDetected: true, nameDetected: true, expiryDetected: true,
    qrDetected: true, qrDecoded: true, barcodeDetected: true, barcodeDecoded: true,
  };
  const descriptors = new Map(['users', 'universities', 'studentIdentities'].map((key) =>
    [key, Object.getOwnPropertyDescriptor(database, key)],
  ));
  try {
    for (const [label, changes, error, email = user.email] of [
      ['matching evidence', {}, null],
      ['matching name with unrelated numeric email suffix', {}, null, 'minh.nickname8765432@hcmut.edu.vn'],
      ['email outside HCMUT is unsupported by this model', {}, { code: 'CARD_TEMPLATE_UNSUPPORTED' }, 'minh@hcmute.edu.vn'],
      ['Khoa with nickname in email suffix', {
        name: 'TRẦN LÂM ANH KHOA', cardText: text.replace('TRAN VAN MINH', 'TRẦN LÂM ANH KHOA'),
      }, null, 'khoa.dinhkaris222@hcmut.edu.vn'],
      ['wrong QR', { qrContent: '8765432' }, /không trùng khớp/],
      ['wrong barcode', { barcodeContent: '8765432' }, /không trùng khớp/],
      ['unreadable MSSV', { id: null }, /MSSV/],
      ['no school evidence', { cardText: 'STUDENT ID CARD' }, { code: 'CARD_SCHOOL_UNREADABLE' }],
      ['foreign school explicitly recognized', {
        cardText: text.replace('HO CHI MINH CITY UNIVERSITY OF TECHNOLOGY', 'HANOI UNIVERSITY OF SCIENCE AND TECHNOLOGY'),
      }, { code: 'CARD_SCHOOL_MISMATCH' }],
      ['dedicated school crop recovers a noisy full-page header', {
        cardText: text.replace('HO CHI MINH CITY UNIVERSITY OF TECHNOLOGY', 'Tuo oA! HOC BACH KHOA DHQG-HCM'),
        schoolText: 'TRUONG DAI HOC BACH KHOA - DHQG-HCM', schoolConfidence: 67,
      }, null],
      ['low-confidence header cannot supply university evidence', {
        cardText: 'STUDENT ID CARD', schoolText: 'TRUONG DAI HOC BACH KHOA - DHQG-HCM', schoolConfidence: 30,
      }, { code: 'CARD_SCHOOL_UNREADABLE' }],
      ['an image with no detected card gets a template error', {
        card: false, name: null,
      }, { code: 'CARD_TEMPLATE_UNSUPPORTED' }],
      ['a missing card region gets a capture/layout error', {
        logo: false,
      }, { code: 'CARD_TEMPLATE_INCOMPLETE' }],
      ['blur is checked before comparing names or codes', {
        name: 'NGUYEN TAN PHAT', qrContent: '8765432', quality: { ...evidence.quality, problem: 'blurred' },
      }, { code: 'CARD_IMAGE_BLURRY' }],
      ['another person', { name: 'NGUYEN THI LAN', cardText: text.replace('TRAN VAN MINH', 'NGUYEN THI LAN') }, /Tên trên thẻ/],
      ['Phat vs Khoa takes priority over a wrong QR', {
        name: 'NGUYỄN TẤN PHÁT', qrContent: '8765432',
      }, /Tên trên thẻ \(PHÁT\).*email HCMUT \(khoa\)/, 'khoa.tran241005@hcmut.edu.vn'],
      ['Phat vs Khoa takes priority over unreadable MSSV/barcode', {
        name: 'NGUYỄN TẤN PHÁT', id: null, barcodeContent: null,
      }, /Tên trên thẻ \(PHÁT\).*email HCMUT \(khoa\)/, 'khoa.tran241005@hcmut.edu.vn'],
    ]) {
      await t.test(label, async () => {
        let claim;
        let saved;
        let recognitions = 0;
        // Changing the mutable profile name must never change the email check.
        const account = { ...user, email, name: 'NGUYỄN TẤN PHÁT' };
        const collections = {
          users: {
            findOne: async (filter) => filter._id instanceof ObjectId ? account : null,
            findOneAndUpdate: async (_filter, update) => {
              if (!update.$set.is_verified) return account;
              saved = { ...account, ...update.$set };
              return saved;
            },
            updateOne: async () => ({}),
          },
          universities: { find: () => ({ toArray: async () => universities }) },
          studentIdentities: {
            findOne: async () => claim,
            updateOne: async (_filter, update) => { claim = update.$setOnInsert; },
          },
        };
        for (const [key, value] of Object.entries(collections)) {
          Object.defineProperty(database, key, { configurable: true, value });
        }
        const work = verifyStudentIdentity(user._id.toHexString(), image, 'unused-model', async () => {
          recognitions++;
          return { ...evidence, ...changes };
        });
        if (error) {
          await assert.rejects(work, error);
          assert.equal(saved, undefined);
          assert.equal(claim, undefined);
          if (email === 'minh@hcmute.edu.vn') assert.equal(recognitions, 0);
        } else {
          const result = await work;
          assert.equal(result.is_verified, true);
          assert.equal(result.student_id, id);
          assert.equal(result.school_code, 'hcmut');
          assert.equal(result.student_card_image, image);
          assert.equal(claim.student_id, id);
        }
      });
    }
  } finally {
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(database, key, descriptor);
      else delete database[key];
    }
  }
});
