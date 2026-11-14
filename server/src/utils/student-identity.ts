import { universities, type University } from "../data/universities.js";
import { StudentCardError } from "./student-card-errors.js";

/**
 * Chuẩn hóa text OCR để phục vụ việc so sánh không phân biệt dấu và hoa thường.
 */
export const identityText = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");

/**
 * Chuẩn hóa mã số sinh viên trước khi so sánh.
 */
export const normalizeStudentId = (value: string) =>
  value.trim().toUpperCase();

/**
 * Kiểm tra một giá trị có tồn tại như một cụm từ độc lập trong OCR text hay không.
 */
const phrase = (text: string, value: string) =>
  ` ${text} `.includes(
    ` ${identityText(value)} `,
  );

const matchesSchoolAlias = (text: string, school: University) =>
  school.card_aliases.some((parts) => parts.every((part) => phrase(text, part)));

export function hasCardUniversityText(text: string, school: University): boolean {
  const normalized = identityText(text);
  // HCMUTE's longer English name contains HCMUT's English name as a prefix.
  // A specific foreign-school alias takes precedence over that shared prefix.
  return matchesSchoolAlias(normalized, school)
    && !universities.some((other) => other.code !== school.code && matchesSchoolAlias(normalized, other));
}

export function verifyCardUniversityText(text: string, school: University): void {
  if (hasCardUniversityText(text, school)) return;
  const normalized = identityText(text);
  const other = universities.find((candidate) =>
    candidate.code !== school.code && matchesSchoolAlias(normalized, candidate));
  if (other) {
    throw new StudentCardError("CARD_SCHOOL_MISMATCH",
      `Trường trên thẻ được nhận diện là ${other.name}, không khớp trường của email đã xác nhận. Hiện hệ thống chỉ hỗ trợ xác thực thẻ HCMUT.`);
  }
  throw new StudentCardError("CARD_SCHOOL_UNREADABLE",
    "Chưa đọc rõ tên trường trên thẻ nên chưa thể xác thực. Vui lòng chụp rõ phần tên trường và logo, giữ ảnh nét, đủ sáng và tránh lóa. Hiện hệ thống chỉ hỗ trợ thẻ HCMUT.");
}

/**
 * Lấy các giá trị OCR nằm sau các label tương ứng trên thẻ.
 */
function labelledValue(
  lines: string[],
  label: RegExp,
  valid: (value: string) => boolean,
): string[] {
  const values: string[] = [];

  lines.forEach((line, index) => {
    const normalized = identityText(line);
    const match = normalized.match(label);

    if (!match) return;

    const rest = normalized
      .slice(match.index! + match[0].length)
      .trim();

    let candidate =
      rest ||
      identityText(lines[index + 1] || "");

    let repeated = candidate.match(label);

    while (repeated?.index === 0) {
      candidate = candidate
        .slice(repeated[0].length)
        .trim();

      repeated = candidate.match(label);
    }

    if (valid(candidate)) {
      values.push(candidate);
    }
  });

  return [...new Set(values)];
}

/** HCMUT: ten.<hậu tố bất kỳ>@hcmut.edu.vn; chỉ đối chiếu tên riêng. */
export function verifyHcmutEmailName(cardName: string | null, email: string): void {
  const normalizedName = identityText(cardName ?? "");
  if (!/^[a-z]+(?: [a-z]+){1,6}$/.test(normalizedName)) {
    throw new Error("Không đọc rõ họ tên trên thẻ. Vui lòng chụp lại ảnh có đầy đủ họ tên.");
  }

  const emailParts = email.trim().toLowerCase().split("@");
  const [local, domain = ""] = emailParts;
  const emailName = identityText(local.split(".")[0]);
  if (emailParts.length !== 2 || !/^[a-z]+$/.test(emailName)
    || !(domain === "hcmut.edu.vn" || domain.endsWith(".hcmut.edu.vn"))) {
    throw new Error("Không xác định được tên trong email HCMUT. Email cần có tên trước dấu chấm đầu tiên.");
  }

  // Compare the final word of the card's family-first full name with ONLY the
  // email prefix. Surnames, nicknames and all suffix digits are irrelevant.
  if (normalizedName.split(" ").at(-1) !== emailName) {
    const givenName = cardName!.trim().split(/\s+/).at(-1);
    throw new Error(
      `Tên trên thẻ (${givenName}) không khớp tên trong email HCMUT (${emailName}). Xác thực thẻ thất bại.`,
    );
  }
}

/**
 * Xác thực nội dung OCR của thẻ với email và thông tin trường đại học.
 */
export function verifyCardText(
  text: string,
  email: string,
  school: University,
) {
  const normalized = identityText(text);

  if (
    ![
      "the sinh vien",
      "student card",
      "student id card",
    ].some((label) =>
      phrase(normalized, label),
    )
  ) {
    throw new StudentCardError("CARD_TEMPLATE_INCOMPLETE",
      "Chưa đọc rõ dòng THẺ SINH VIÊN trên ảnh. Vui lòng chụp rõ toàn bộ mặt trước thẻ HCMUT, không che các vùng thông tin.",
    );
  }

  verifyCardUniversityText(text, school);

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const ids = labelledValue(
    lines,
    /\b(?:mssv student id|mssv|ma so sinh vien|ma sinh vien|ma so sv|ma so id|student id(?: number)?|student no|id no)\b/,
    (value) =>
      /^(?=[a-z0-9]*\d)[a-z0-9]{5,20}$/.test(
        value,
      ),
  );

  if (ids.length !== 1) {
    throw new Error(
      "Không đọc được duy nhất một MSSV rõ ràng trên thẻ. Vui lòng chụp lại ảnh, không che phần MSSV.",
    );
  }

  let names = labelledValue(
    lines,
    /\b(?:ho va ten|ho ten|full name|name)\b/,
    (value) =>
      /^[a-z]+(?: [a-z]+){1,6}$/.test(
        value,
      ),
  );

  if (!names.length) {
    const surnames =
      /^(?:nguyen|tran|le|pham|hoang|huynh|phan|vu|vo|dang|bui|do|ho|ngo|duong|ly|dinh|truong|mai|cao|luu|lam|ta|trinh|chau|to|ha) /;

    names = [
      ...new Set(
        lines
          .map((raw, index) => {
            const line = identityText(raw);

            if (
              !surnames.test(line) ||
              !/^[a-z]+(?: [a-z]+){1,6}$/.test(
                line,
              ) ||
              /\b(dai hoc|sinh vien|quoc gia|thanh pho|truong dai|university|city)\b/.test(
                line,
              )
            ) {
              return "";
            }

            const next = lines[index + 1] || "";
            const continuation =
              identityText(next);

            if (
              next === next.toUpperCase() &&
              /^[a-z]+(?: [a-z]+){0,2}$/.test(
                continuation,
              ) &&
              !surnames.test(continuation) &&
              !/\b(dai hoc|chinh quy|undergraduate|full time|ma so|mssv|id|hieu luc|valid|student|the|sinh vien)\b/.test(
                continuation,
              )
            ) {
              return `${line} ${continuation}`;
            }

            return line;
          })
          .filter(Boolean),
      ),
    ];
  }

  if (names.length !== 1) {
    throw new Error(
      "Không đọc rõ họ tên trên thẻ. Vui lòng chụp lại ảnh có đầy đủ họ tên.",
    );
  }

  const studentId = normalizeStudentId(
    ids[0],
  );

  if (school.code === "hcmut") {
    verifyHcmutEmailName(names[0], email);
  }

  return {
    school_code: school.code,
    university_name: school.name,
    student_id: studentId,
    card_name: names[0],
  };
}

/**
 * Decode ảnh thẻ dạng Base64 và kiểm tra định dạng JPG/PNG trước khi xử lý OCR.
 */
export function decodeCardImage(
  image: unknown,
): Buffer {
  if (typeof image !== "string") {
    throw new Error(
      "Vui lòng chọn ảnh thẻ sinh viên.",
    );
  }

  const match = image.match(
    /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/,
  );

  if (
    !match ||
    match[2].length > 7_000_000
  ) {
    throw new Error(
      "Chỉ chấp nhận ảnh JPG/PNG tối đa 5MB.",
    );
  }

  const buffer = Buffer.from(
    match[2],
    "base64",
  );

  const png = buffer
    .subarray(0, 8)
    .equals(
      Buffer.from([
        137, 80, 78, 71,
        13, 10, 26, 10,
      ]),
    );

  const jpeg =
    buffer[0] === 255 &&
    buffer[1] === 216 &&
    buffer[2] === 255;

  if (
    buffer.length > 5 * 1024 * 1024 ||
    (match[1] === "png" ? !png : !jpeg)
  ) {
    throw new Error(
      "Ảnh không hợp lệ hoặc vượt quá 5MB. Vui lòng chọn ảnh JPG/PNG.",
    );
  }

  return buffer;
}
