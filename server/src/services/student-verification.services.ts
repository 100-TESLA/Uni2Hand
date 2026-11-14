import { ObjectId } from "mongodb";
import database from "./database.services.js";
import { universityFromEmail } from "../data/universities.js";
import {
  decodeCardImage,
  verifyCardText,
  verifyHcmutEmailName,
} from "../utils/student-identity.js";
import {
  processStudentCard,
  MIN_OCR_CONFIDENCE,
  type StudentCardOcrResult,
} from "../utils/student-card-ocr.js";
import { verifyIdentityCodes } from "../utils/student-card-codes.js";
import { StudentCardError } from "../utils/student-card-errors.js";
import { assertStudentCardImageQuality } from "../utils/student-card-quality.js";

let activeWorkers = 0;

/**
 * Kiểm tra YOLO đã phát hiện đầy đủ các vùng bắt buộc trên mặt thẻ.
 */
function verifyRequiredCardFields(
  result: StudentCardOcrResult,
) {
  const missingFields: string[] = [];

  if (!result.card) {
    missingFields.push("toàn bộ thẻ");
  }

  if (!result.face) {
    missingFields.push("ảnh khuôn mặt");
  }

  if (!result.logo) {
    missingFields.push("logo");
  }

  if (!result.idDetected || !result.id) {
    missingFields.push("MSSV");
  }

  if (!result.nameDetected || !result.name) {
    missingFields.push("họ tên");
  }

  if (!result.expiryDetected || !result.expiry) {
    missingFields.push("thời hạn");
  }

  if (!result.qrDetected) {
    missingFields.push("QR");
  }

  if (!result.barcodeDetected) {
    missingFields.push("Barcode");
  }

  if (missingFields.length > 0) {
    throw new StudentCardError("CARD_TEMPLATE_INCOMPLETE",
      `Chưa nhận diện đầy đủ thông tin trên mẫu thẻ HCMUT: ${missingFields.join(", ")}. Vui lòng chụp rõ toàn bộ mặt trước thẻ, không che hoặc cắt mất các góc thẻ.`,
    );
  }

  return true;
}

/**
 * Chạy pipeline YOLO + OCR/QR/Barcode và trả về dữ liệu dùng để xác thực thẻ.
 */
export async function recognizeStudentCard(
  buffer: Buffer,
  modelPath: string,
): Promise<StudentCardOcrResult> {
  if (activeWorkers >= 2) {
    throw new Error(
      "Hệ thống OCR đang bận. Vui lòng thử lại sau ít phút.",
    );
  }

  if (!modelPath?.trim()) {
    throw new Error(
      "Chưa cấu hình đường dẫn model OCR/YOLO.",
    );
  }

  activeWorkers++;

  let timer:
    | ReturnType<typeof setTimeout>
    | undefined;

  try {
    const work = processStudentCard(
      buffer,
      modelPath,
      0.5,
    ).finally(() => {
      // A response timeout does not cancel native inference/Tesseract. Keep the
      // slot occupied until the worker has actually stopped.
      activeWorkers--;
    });

    return await Promise.race([
      work,
      new Promise<never>(
        (_, reject) => {
          timer = setTimeout(() => {
            reject(
              new Error(
                "OCR xử lý quá lâu. Vui lòng thử lại với ảnh rõ hơn.",
              ),
            );
          }, 90_000);
        },
      ),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Xác thực thẻ sinh viên trước khi giữ nguyên flow lưu dữ liệu hiện tại vào database.
 */
export async function verifyStudentIdentity(
  userId: string,
  image: unknown,
  modelPath: string,
  recognize = recognizeStudentCard,
) {
  const buffer = decodeCardImage(image);

  const _id = new ObjectId(userId);

  const user = await database.users.findOne({
    _id,
  });

  if (
    !user ||
    user.email_verified !== true
  ) {
    throw new Error(
      "Bạn cần xác nhận email trước khi xác thực thẻ sinh viên.",
    );
  }

  if (user.is_verified === true) {
    throw new Error(
      "Thẻ sinh viên đã được xác thực. Không thể xóa hoặc thay đổi ảnh thẻ.",
    );
  }

  const catalogue =
    await database.universities
      .find()
      .toArray();

  const school = universityFromEmail(
    user.email,
    catalogue,
  );

  if (!school) {
    throw new Error(
      "Trường của email chưa có trong danh mục xác thực. Vui lòng liên hệ hỗ trợ để bổ sung trường.",
    );
  }
  if (school.code !== "hcmut") {
    throw new StudentCardError("CARD_TEMPLATE_UNSUPPORTED",
      "Hiện hệ thống chỉ hỗ trợ xác thực thẻ sinh viên HCMUT (Đại học Bách khoa, ĐHQG TP.HCM) bằng email HCMUT.");
  }

  const now = new Date();

  const lease = new Date(
    +now + 100_000,
  );

  const locked =
    await database.users.findOneAndUpdate(
      {
        _id,
        is_verified: {
          $ne: true,
        },
        $or: [
          {
            ocr_retry_at: {
              $exists: false,
            },
          },
          {
            ocr_retry_at: {
              $lte: now,
            },
          },
        ],
      },
      {
        $set: {
          ocr_retry_at: lease,
        },
      },
      {
        returnDocument: "after",
      },
    );

  if (!locked) {
    throw new Error(
      "Yêu cầu xác thực trước đang được xử lý. Vui lòng chờ rồi thử lại.",
    );
  }

  try {
    const ocrResult =
      await recognize(
        buffer,
        modelPath,
      );

    assertStudentCardImageQuality(ocrResult.quality);
    if (!ocrResult.card) {
      throw new StudentCardError("CARD_TEMPLATE_UNSUPPORTED",
        "Chưa nhận diện được mẫu thẻ sinh viên HCMUT trong ảnh. Vui lòng chọn ảnh toàn bộ mặt trước thẻ HCMUT, chụp rõ và đặt thẻ ngay ngắn.");
    }

    // Check ownership against the verified account email before reporting
    // unrelated MSSV/QR/barcode problems. Mutable profile names are not used.
    if (school.code === "hcmut") {
      verifyHcmutEmailName(ocrResult.name, user.email);
    }

    verifyRequiredCardFields(
      ocrResult,
    );

    const studentId = verifyIdentityCodes(
      ocrResult,
      school.code,
    );

    if (!ocrResult.id) {
      throw new Error(
        "Không đọc được MSSV trên thẻ.",
      );
    }

    const textToVerify = [
      ocrResult.cardTextConfidence >= MIN_OCR_CONFIDENCE ? ocrResult.cardText : "",
      ocrResult.schoolConfidence >= MIN_OCR_CONFIDENCE ? ocrResult.schoolText : "",
      `MSSV: ${studentId}`,
      `Họ và tên: ${ocrResult.name ?? ""}`,
      `Hạn sử dụng: ${ocrResult.expiry ?? ""}`,
    ].join("\n");

    const identity = verifyCardText(
      textToVerify,
      user.email,
      school,
    );

    const normalizedOcrId = studentId;

    if (
      normalizedOcrId !==
      identity.student_id
    ) {
      throw new Error(
        "MSSV trích xuất từ OCR không khớp MSSV được xác thực.",
      );
    }

    const owner =
      await database.studentIdentities.findOne(
        {
          user_id: _id,
        },
      );

    if (
      owner &&
      (owner.school_code !==
        identity.school_code ||
        owner.student_id !==
        identity.student_id)
    ) {
      throw new Error(
        "Tài khoản đã gắn với một danh tính sinh viên khác. Không thể xác thực thêm thẻ cho tài khoản này.",
      );
    }

    const occupied =
      await database.users.findOne({
        _id: {
          $ne: _id,
        },
        school_code:
          identity.school_code,
        student_id:
          identity.student_id,
      });

    if (occupied) {
      throw new Error(
        "Cặp mã trường và MSSV này đã được sử dụng bởi tài khoản khác.",
      );
    }

    try {
      await database.studentIdentities.updateOne(
        {
          user_id: _id,
        },
        {
          $setOnInsert: {
            user_id: _id,
            ...identity,
            verified_at: new Date(),
          },
        },
        {
          upsert: true,
        },
      );

      const claim =
        await database.studentIdentities.findOne(
          {
            user_id: _id,
          },
        );

      if (
        !claim ||
        claim.school_code !==
        identity.school_code ||
        claim.student_id !==
        identity.student_id
      ) {
        throw new Error(
          "Tài khoản đã gắn với một danh tính sinh viên khác.",
        );
      }

      const result =
        await database.users.findOneAndUpdate(
          {
            _id,
            email: user.email,
            is_verified: {
              $ne: true,
            },
            profile_revision:
              user.profile_revision ??
              null,
          },
          {
            $set: {
              school_code:
                identity.school_code,
              student_id:
                identity.student_id,
              university_name:
                identity.university_name,
              is_verified: true,
              student_card_image:
                image as string,
              ocr_verification_version: 2,
              updated_at: new Date(),
            },
            $inc: {
              profile_revision: 1,
            },
          },
          {
            returnDocument: "after",
            projection: {
              password: 0,
              email_verify_token: 0,
              otp_code_hash: 0,
              otp_expires_at: 0,
              otp_attempts: 0,
              otp_resend_at: 0,
            },
          },
        );

      if (!result) {
        throw new Error(
          "Hồ sơ đã thay đổi trong lúc xác thực. Vui lòng tải lại trang và xác thực lại cùng thẻ.",
        );
      }

      return result;
    } catch (error: any) {
      if (error.code === 11000) {
        throw new Error(
          "Thẻ sinh viên hoặc cặp mã trường/MSSV đã được gắn với tài khoản khác.",
        );
      }

      throw error;
    }
  } finally {
    await database.users.updateOne(
      {
        _id,
        ocr_retry_at: lease,
      },
      {
        $set: {
          ocr_retry_at:
            new Date(
              Date.now() + 10_000,
            ),
        },
      },
    );
  }
}
