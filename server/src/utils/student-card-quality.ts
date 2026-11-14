import sharp from "sharp";
import { StudentCardError } from "./student-card-errors.js";

export interface StudentCardImageQuality {
  width: number;
  height: number;
  sharpness: number;
  contrast: number;
  problem: "too_small" | "low_contrast" | "blurred" | null;
}

/**
 * Measure the original pixels, before OCR enhancement. Downsample large images
 * consistently; never upscale a small image to make it pass the resolution test.
 * Sharp's sharpness is a Laplacian standard deviation. These conservative
 * thresholds identify severe degradation, not every possible unreadable photo.
 */
export async function assessStudentCardImage(buffer: Buffer): Promise<StudentCardImageQuality> {
  const { width = 0, height = 0 } = await sharp(buffer).metadata();
  const sample = await sharp(buffer).flatten({ background: "white" }).greyscale()
    .resize({ width: 640, height: 640, fit: "inside", withoutEnlargement: true })
    .png().toBuffer();
  const stats = await sharp(sample).stats();
  const sharpness = stats.sharpness;
  const contrast = stats.channels[0].stdev;
  const problem = Math.max(width, height) < 350 || Math.min(width, height) < 200
    ? "too_small" : contrast < 8 ? "low_contrast" : sharpness < 0.7 ? "blurred" : null;
  return { width, height, sharpness, contrast, problem };
}

export function assertStudentCardImageQuality(quality: StudentCardImageQuality): void {
  switch (quality.problem) {
    case "too_small":
      throw new StudentCardError("CARD_IMAGE_TOO_SMALL",
        "Ảnh thẻ có độ phân giải quá thấp hoặc thẻ chiếm quá ít diện tích ảnh. Vui lòng chụp gần hơn, lấy rõ toàn bộ mặt trước thẻ và dùng ảnh gốc.");
    case "low_contrast":
      throw new StudentCardError("CARD_IMAGE_LOW_CONTRAST",
        "Ảnh thẻ thiếu tương phản nên chưa đọc được thông tin. Vui lòng chụp ở nơi đủ sáng, tránh lóa và không che mặt thẻ.");
    case "blurred":
      throw new StudentCardError("CARD_IMAGE_BLURRY",
        "Ảnh thẻ bị mờ hoặc mất nét, chưa đủ rõ để xác thực. Vui lòng giữ máy ổn định, lấy nét vào chữ trên thẻ và chụp lại ảnh gốc.");
  }
}
