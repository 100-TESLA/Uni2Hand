import { ObjectId } from 'mongodb';
import database from './database.services.js';
import { schoolCodeFromEmail } from '../data/universities.js';
import { normalizeStudentId } from '../utils/student-identity.js';

export async function updateStudentProfile(userId: string, payload: Record<string, unknown>) {
  const _id = new ObjectId(userId);
  const user = await database.users.findOne({ _id });
  if (!user) throw new Error('Không tìm thấy tài khoản.');
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Thông tin hồ sơ không hợp lệ.');
  const limits: Record<string, number> = { username: 100, first_name: 100, last_name: 100, phone_number: 20,
    avatar: 7_000_000, student_id: 20, school_code: 40, university_name: 250, address: 500 };
  const editable: Record<string, string | boolean | Date> = {};
  for (const [key, limit] of Object.entries(limits)) {
    if (!(key in payload)) continue;
    const value = payload[key];
    if (typeof value !== 'string' || value.length > limit) throw new Error(`Thông tin ${key} không hợp lệ hoặc quá dài.`);
    editable[key] = value.trim();
  }
  if (typeof editable.school_code === 'string') {
    editable.school_code = editable.school_code.toLowerCase();
    if (editable.school_code && !/^[a-z0-9-]{2,40}$/.test(editable.school_code)) throw new Error('Mã trường chỉ gồm chữ cái, số và dấu gạch ngang.');
  }
  if (typeof editable.student_id === 'string') {
    editable.student_id = normalizeStudentId(editable.student_id);
    if (editable.student_id && !/^(?=[A-Z0-9]*\d)[A-Z0-9]{5,20}$/.test(editable.student_id)) throw new Error('MSSV phải gồm 5–20 chữ cái/số và có ít nhất một chữ số.');
  }
  const code = String(editable.school_code ?? user.school_code ?? schoolCodeFromEmail(user.email));
  const id = String(editable.student_id ?? user.student_id ?? '');
  if (code && id) {
    const claim = await database.studentIdentities.findOne({ school_code: code, student_id: id });
    if (claim && !claim.user_id.equals(_id)) throw new Error('Cặp mã trường/MSSV đã được xác thực bởi tài khoản khác.');
  }
  const identityChanged = ['school_code', 'student_id', 'university_name'].some(key =>
    key in editable && editable[key] !== ((user as any)[key] || ''));
  if (identityChanged && user.is_verified === true) {
    throw new Error('MSSV, mã trường và tên trường đã được xác thực và không thể thay đổi.');
  }
  if (identityChanged) editable.is_verified = false;
  try {
    const updated = await database.users.findOneAndUpdate({ _id, profile_revision: user.profile_revision ?? null }, {
      $set: { ...editable, updated_at: new Date() }, $inc: { profile_revision: 1 },
    }, { returnDocument: 'after', projection: {
      password: 0, email_verify_token: 0, forgot_password_token: 0, otp_code_hash: 0, otp_expires_at: 0, otp_attempts: 0, otp_resend_at: 0,
    } });
    if (!updated) throw new Error('Hồ sơ vừa thay đổi. Vui lòng tải lại trang rồi lưu lại.');
    return updated;
  } catch (error: any) {
    if (error.code === 11000) throw new Error('Cặp mã trường và MSSV này đã được sử dụng bởi tài khoản khác.');
    throw error;
  }
}
