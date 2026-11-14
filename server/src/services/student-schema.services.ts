import type { Db, ObjectId } from 'mongodb';
import { universities, schoolCodeFromEmail } from '../data/universities.js';

export interface StudentIdentity {
  user_id: ObjectId;
  school_code: string;
  student_id: string;
  university_name: string;
  card_name: string;
  verified_at: Date;
}

export async function initializeStudentSchema(db: Db) {
  const schools = db.collection('universities');
  await schools.createIndex({ code: 1 }, { unique: true, name: 'university_code_unique' });
  for (const school of universities) await schools.updateOne({ code: school.code }, { $set: school }, { upsert: true });
  const users = db.collection('users');
  // Fail before modifying existing profiles if normalizing old data would collide.
  const existing = await users.find({}, { projection: { email: 1, school_code: 1, student_id: 1 } }).toArray();
  const pairs = new Set<string>();
  for (const user of existing) {
    const code = String(user.school_code || schoolCodeFromEmail(user.email || '')).trim().toLowerCase();
    const id = String(user.student_id || '').trim().toUpperCase();
    if (code && id) {
      const key = `${code}:${id}`;
      if (pairs.has(key)) throw new Error('Dữ liệu cũ có cặp mã trường/MSSV trùng nhau. Cần xử lý trùng trước khi tạo unique index.');
      pairs.add(key);
    }
  }
  for (const user of existing) {
    const school_code = String(user.school_code || schoolCodeFromEmail(user.email || '')).trim().toLowerCase();
    const student_id = String(user.student_id || '').trim().toUpperCase();
    if (school_code) await users.updateOne({ _id: user._id }, { $set: { school_code, ...(student_id ? { student_id } : {}) } });
  }
  await users.createIndex({ school_code: 1, student_id: 1 }, { unique: true, name: 'school_code_student_id_unique',
    partialFilterExpression: { school_code: { $type: 'string', $gt: '' }, student_id: { $type: 'string', $gt: '' } } });
  // Replace former name-based identity indexes; names are editable and can change over time.
  const indexes = await users.listIndexes().toArray();
  for (const name of ['university_name_1_student_id_1', 'school_1_student_id_1']) {
    if (indexes.some(index => index.name === name)) await users.dropIndex(name);
  }
  const identities = db.collection<StudentIdentity>('student_identities');
  await identities.createIndex({ school_code: 1, student_id: 1 }, { unique: true, name: 'verified_school_student_unique' });
  await identities.createIndex({ user_id: 1 }, { unique: true, name: 'one_student_identity_per_user' });
  // Old OCR only checked for generic words, so it cannot grant the new ownership badge.
  await users.updateMany({ is_verified: true, ocr_verification_version: { $ne: 2 } }, { $set: { is_verified: false } });
}
