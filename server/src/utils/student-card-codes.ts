import { identityText, normalizeStudentId } from "./student-identity.js";

/** HCMUT's current card template uses seven digits. Preserve leading zeros. */
export function extractHcmutStudentId(value: string): string | null {
  const normalized = value
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d").toLowerCase().trim().replace(/\s+/g, " ")
    .replace(
      /^(?:mssv(?:[\s/]+student id)?|ma so(?: sinh vien| sv|[\s/]+id)?|student id(?: number)?|id(?: no)?)\b[\s:#/-]*/,
      "",
    ).replace(/^[\s():#]+|[\s().]+$/g, "");
  if (!/^\d(?:\s*\d){6}$/.test(normalized)) return null;
  return normalized.replace(/\s/g, "");
}

const idKey = (key: string) =>
  /^(?:mssv|studentid|studentcode|masosinhvien|id)$/.test(
    identityText(key).replace(/ /g, ""),
  );

/** Read explicit ID fields only; never take arbitrary digits from a URL/payload. */
export function hcmutIdFromCode(value: string): string | null {
  const plain = extractHcmutStudentId(value);
  if (plain) return plain;

  let fields: [string, unknown][];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    fields = Object.entries(parsed);
  } catch {
    try {
      const url = new URL(value);
      if (!["http:", "https:"].includes(url.protocol)) return null;
      fields = [...url.searchParams.entries()];
    } catch {
      return null;
    }
  }

  const ids = fields.filter(([key]) => idKey(key)).map(([, candidate]) =>
    typeof candidate === "string" || typeof candidate === "number"
      ? extractHcmutStudentId(String(candidate))
      : null,
  );
  if (!ids.length || ids.some((id) => !id)) return null;
  const unique = new Set(ids);
  return unique.size === 1 ? ids[0] : null;
}

export function verifyIdentityCodes(
  result: { id: string | null; qrContent: string | null; barcodeContent: string | null },
  schoolCode: string,
): string {
  if (!result.id || !result.qrContent || !result.barcodeContent) {
    throw new Error(
      "Không đọc đầy đủ MSSV, QR và Barcode trên thẻ. Vui lòng chụp lại toàn bộ thẻ rõ nét.",
    );
  }

  const id = schoolCode === "hcmut"
    ? extractHcmutStudentId(result.id)
    : normalizeStudentId(result.id);
  if (!id) {
    throw new Error("Không đọc rõ MSSV HCMUT gồm 7 chữ số. Vui lòng chụp rõ vùng mã số trên thẻ.");
  }

  const qr = schoolCode === "hcmut"
    ? hcmutIdFromCode(result.qrContent)
    : normalizeStudentId(result.qrContent);
  const barcode = schoolCode === "hcmut"
    ? extractHcmutStudentId(result.barcodeContent)
    : normalizeStudentId(result.barcodeContent);
  if (!qr || !barcode) {
    throw new Error("Không đọc được MSSV hợp lệ từ QR hoặc Barcode. Vui lòng chụp rõ cả hai mã trên thẻ.");
  }
  if (id !== qr || id !== barcode) {
    throw new Error("MSSV, QR và Barcode trên thẻ không trùng khớp. Xác thực thẻ thất bại.");
  }
  return id;
}
