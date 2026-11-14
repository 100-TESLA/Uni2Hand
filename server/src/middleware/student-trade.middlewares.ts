import type { Request, Response, NextFunction } from 'express';
import { ObjectId } from 'mongodb';
import database from '../services/database.services.js';

export function canTrade(user: any): boolean {
  return Boolean(user && user.email_verified === true && user.is_verified === true &&
    user.ocr_verification_version === 2 && user.student_card_image &&
    user.school_code && user.student_id && user.status === 'Active');
}

export async function requireVerifiedStudent(req: Request, res: Response, next: NextFunction) {
  try {
    const id = (req as any).decoded_authorization?.user_id;
    if (!id || !ObjectId.isValid(id)) return res.status(401).json({ message: 'Vui lòng đăng nhập.' });
    const user = await database.users.findOne({ _id: new ObjectId(id) });
    if (!canTrade(user)) return res.status(403).json({ code: 'STUDENT_VERIFICATION_REQUIRED',
      message: 'Bạn cần xác thực thẻ sinh viên thành công trong Hồ sơ cá nhân trước khi mua hoặc bán.', profile_url: '/profile' });
    next();
  } catch (error) { next(error); }
}
