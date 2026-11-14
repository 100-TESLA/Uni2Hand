import * as ort from "onnxruntime-node";
import sharp from "sharp";
import { createWorker, PSM, type Worker } from "tesseract.js";
import {
  QRCodeReader, MultiFormatReader, BarcodeFormat, RGBLuminanceSource,
  BinaryBitmap, HybridBinarizer, GlobalHistogramBinarizer, DecodeHintType,
} from "@zxing/library";
import { extractHcmutStudentId } from "./student-card-codes.js";
import { universities } from "../data/universities.js";
import { hasCardUniversityText } from "./student-identity.js";
import { assessStudentCardImage, assertStudentCardImageQuality, type StudentCardImageQuality } from "./student-card-quality.js";

const CLASS_NAMES = ["barcode", "card", "expiry", "face", "id", "logo", "name", "qr"] as const;
const MODEL_SIZE = 640;
export const MIN_OCR_CONFIDENCE = 55;
const HCMUT_SCHOOL = universities.find((school) => school.code === "hcmut")!;

export interface StudentCardOcrResult {
  id: string | null;
  idText: string | null;
  name: string | null;
  expiry: string | null;
  cardText: string;
  cardTextConfidence: number;
  schoolText: string;
  schoolConfidence: number;
  quality: StudentCardImageQuality;
  idConfidence: number;
  nameConfidence: number;
  qrContent: string | null;
  barcodeContent: string | null;
  card: boolean;
  face: boolean;
  logo: boolean;
  idDetected: boolean;
  nameDetected: boolean;
  expiryDetected: boolean;
  qrDetected: boolean;
  qrDecoded: boolean;
  barcodeDetected: boolean;
  barcodeDecoded: boolean;
}

export interface DetectionBox {
  className: (typeof CLASS_NAMES)[number];
  confidence: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** ZXing expects one luminance byte per pixel, not an RGBA byte array. */
export async function decodeStudentCardCode(
  imageBuffer: Buffer,
  kind: "qr" | "barcode",
): Promise<string | null> {
  const stats = await sharp(imageBuffer).stats();
  if (stats.channels.every((channel) => channel.min === channel.max)) return null;
  const hints = new Map<DecodeHintType, unknown>();
  hints.set(DecodeHintType.TRY_HARDER, true);
  hints.set(DecodeHintType.POSSIBLE_FORMATS, kind === "qr"
    ? [BarcodeFormat.QR_CODE]
    : [BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.EAN_13,
      BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E, BarcodeFormat.ITF]);

  // First retain the original pixels. Enlarged/thresholded images are fallbacks.
  for (const size of [0, 600, 1200]) {
    for (const angle of kind === "qr" ? [0] : [0, 90, 180, 270]) {
      for (const threshold of [false, true]) {
        let image = sharp(imageBuffer).rotate(angle).flatten({ background: "white" });
        if (size) image = image.resize({ width: size, height: size, fit: "inside" });
        image = image.greyscale().normalize();
        if (threshold) image = image.threshold(128);
        const { data, info } = await image
          .extend({ top: 32, bottom: 32, left: 64, right: 64, background: "white" })
          .removeAlpha().raw().toBuffer({ resolveWithObject: true });
        if (info.channels !== 1 || data.length !== info.width * info.height) {
          throw new Error("Ảnh giải mã QR/Barcode phải có một kênh độ sáng.");
        }
        const source = new RGBLuminanceSource(new Uint8ClampedArray(data), info.width, info.height);
        for (const binarizer of [new HybridBinarizer(source), new GlobalHistogramBinarizer(source)]) {
          const reader = kind === "qr" ? new QRCodeReader() : new MultiFormatReader();
          try {
            const content = reader.decode(new BinaryBitmap(binarizer), hints).getText().trim();
            if (content) return content;
          } catch {
            // A decoding failure is expected; try the next bounded image variant.
          } finally {
            reader.reset();
          }
        }
      }
    }
  }
  return null;
}

function nms(boxes: DetectionBox[], iouThreshold = 0.45): DetectionBox[] {
  const remaining = [...boxes].sort((a, b) => b.confidence - a.confidence);
  const selected: DetectionBox[] = [];
  for (const box of remaining) {
    const overlaps = selected.some((current) => {
      if (box.className !== current.className) return false;
      const intersection = Math.max(0, Math.min(current.x2, box.x2) - Math.max(current.x1, box.x1))
        * Math.max(0, Math.min(current.y2, box.y2) - Math.max(current.y1, box.y1));
      const areaA = (current.x2 - current.x1) * (current.y2 - current.y1);
      const areaB = (box.x2 - box.x1) * (box.y2 - box.y1);
      return intersection / (areaA + areaB - intersection) >= iouThreshold;
    });
    if (!overlaps) selected.push(box);
  }
  return selected;
}

/** Map this model's [1, 12, N] output back through the letterbox padding. */
export function parseStudentCardDetections(
  data: Float32Array,
  dims: readonly number[],
  originalWidth: number,
  originalHeight: number,
  confThreshold = 0.5,
): DetectionBox[] {
  if (dims.length !== 3 || dims[0] !== 1 || dims[1] !== 4 + CLASS_NAMES.length
    || data.length !== dims[1] * dims[2]) {
    throw new Error("Model YOLO không đúng định dạng 8 lớp của thẻ sinh viên.");
  }
  const scale = Math.min(MODEL_SIZE / originalWidth, MODEL_SIZE / originalHeight);
  const resizedWidth = Math.round(originalWidth * scale);
  const resizedHeight = Math.round(originalHeight * scale);
  const padX = Math.floor((MODEL_SIZE - resizedWidth) / 2);
  const padY = Math.floor((MODEL_SIZE - resizedHeight) / 2);
  const numAnchors = dims[2];
  const boxes: DetectionBox[] = [];
  for (let anchor = 0; anchor < numAnchors; anchor++) {
    let confidence = 0;
    let classId = -1;
    for (let cls = 0; cls < CLASS_NAMES.length; cls++) {
      const score = data[(4 + cls) * numAnchors + anchor];
      if (score > confidence) { confidence = score; classId = cls; }
    }
    if (classId < 0 || confidence < confThreshold) continue;
    const cx = data[anchor], cy = data[numAnchors + anchor];
    const width = data[2 * numAnchors + anchor], height = data[3 * numAnchors + anchor];
    const box: DetectionBox = {
      className: CLASS_NAMES[classId], confidence,
      x1: Math.max(0, (cx - width / 2 - padX) / scale),
      y1: Math.max(0, (cy - height / 2 - padY) / scale),
      x2: Math.min(originalWidth, (cx + width / 2 - padX) / scale),
      y2: Math.min(originalHeight, (cy + height / 2 - padY) / scale),
    };
    if (Object.values(box).slice(1).every(Number.isFinite) && box.x2 > box.x1 && box.y2 > box.y1) {
      boxes.push(box);
    }
  }
  return nms(boxes);
}

async function detectCardRegions(imageBuffer: Buffer, width: number, height: number, modelPath: string, threshold: number) {
  const session = await ort.InferenceSession.create(modelPath);
  try {
    const scale = Math.min(MODEL_SIZE / width, MODEL_SIZE / height);
    const resizedWidth = Math.round(width * scale), resizedHeight = Math.round(height * scale);
    const padX = Math.floor((MODEL_SIZE - resizedWidth) / 2);
    const padY = Math.floor((MODEL_SIZE - resizedHeight) / 2);
    // Match Ultralytics: keep aspect ratio and fill the remaining area with 114.
    const pixels = await sharp(imageBuffer)
      .resize(resizedWidth, resizedHeight)
      .extend({ left: padX, right: MODEL_SIZE - resizedWidth - padX,
        top: padY, bottom: MODEL_SIZE - resizedHeight - padY, background: { r: 114, g: 114, b: 114 } })
      .removeAlpha().raw().toBuffer();
    const planeSize = MODEL_SIZE * MODEL_SIZE;
    const input = new Float32Array(3 * planeSize);
    for (let i = 0; i < planeSize; i++) {
      input[i] = pixels[i * 3] / 255;
      input[planeSize + i] = pixels[i * 3 + 1] / 255;
      input[2 * planeSize + i] = pixels[i * 3 + 2] / 255;
    }
    const outputs = await session.run({
      [session.inputNames[0]]: new ort.Tensor("float32", input, [1, 3, MODEL_SIZE, MODEL_SIZE]),
    });
    const output = outputs[session.outputNames[0]];
    return parseStudentCardDetections(output.data as Float32Array, output.dims, width, height, threshold);
  } finally {
    await session.release();
  }
}

async function cropDetection(imageBuffer: Buffer, box: DetectionBox, width: number, height: number): Promise<Buffer> {
  // Never expand the MSSV crop into the adjacent "ID" label. Add white margins
  // AFTER extraction for OCR; pixels from neighbouring fields corrupt digits.
  const padding = box.className === "id" || box.className === "card" ? 0
    : box.className === "qr" || box.className === "barcode" ? 0.15 : 0.03;
  const boxWidth = box.x2 - box.x1, boxHeight = box.y2 - box.y1;
  const left = Math.max(0, Math.floor(box.x1 - boxWidth * padding));
  const top = Math.max(0, Math.floor(box.y1 - boxHeight * padding));
  const right = Math.min(width, Math.ceil(box.x2 + boxWidth * padding));
  const bottom = Math.min(height, Math.ceil(box.y2 + boxHeight * padding));
  return sharp(imageBuffer).extract({ left, top, width: right - left, height: bottom - top }).png().toBuffer();
}

async function prepareTextCrop(crop: Buffer, kind: "id" | "name" | "expiry", threshold = false) {
  const { height = 1 } = await sharp(crop).metadata();
  let image = sharp(crop).resize({ height: Math.max(height, kind === "name" ? 160 : 110) })
    .greyscale().normalize();
  if (threshold) image = image.threshold(150);
  return image.extend({ top: 16, bottom: 16, left: 16, right: 16, background: "white" }).png().toBuffer();
}

async function recognizeSchoolHeader(worker: Worker, card: Buffer) {
  const { width = 1, height = 1 } = await sharp(card).metadata();
  let best = { text: "", confidence: 0 };
  // Only the header of the detected HCMUT card is read here. A high overall
  // confidence for names/IDs must not hide an unreadable university header.
  const variants = [
    { left: .12, top: .06, width: .56, height: .19, outputWidth: 1600, sharpen: true, psm: PSM.SINGLE_BLOCK },
    { left: .14, top: .09, width: .52, height: .12, outputWidth: 1200, sharpen: false, psm: PSM.SINGLE_BLOCK },
    { left: .14, top: .10, width: .52, height: .065, outputWidth: 1000, sharpen: false, psm: PSM.SINGLE_LINE },
  ];
  for (const variant of variants) {
    let image = sharp(card).extract({ left: Math.floor(width * variant.left), top: Math.floor(height * variant.top),
      width: Math.floor(width * variant.width), height: Math.floor(height * variant.height) })
      .resize({ width: variant.outputWidth }).greyscale().normalize();
    if (variant.sharpen) image = image.sharpen();
    const crop = await image.extend({ top: 16, bottom: 16, left: 16, right: 16, background: "white" }).png().toBuffer();
    await worker.setParameters({ tessedit_pageseg_mode: variant.psm });
    const { data } = await worker.recognize(crop);
    if (data.confidence > best.confidence) best = { text: data.text, confidence: data.confidence };
    if (data.confidence >= MIN_OCR_CONFIDENCE && hasCardUniversityText(data.text, HCMUT_SCHOOL)) {
      return { text: data.text, confidence: data.confidence };
    }
  }
  return best.confidence >= MIN_OCR_CONFIDENCE ? best : { text: "", confidence: best.confidence };
}

/** YOLO detects regions; Tesseract reads text; ZXing independently decodes codes. */
export async function processStudentCard(
  imageBuffer: Buffer,
  modelPath: string,
  confThreshold = 0.5,
): Promise<StudentCardOcrResult> {
  // Apply phone EXIF orientation once, before both detection and cropping.
  const { data: oriented, info } = await sharp(imageBuffer).rotate()
    .flatten({ background: "white" }).toColourspace("srgb").removeAlpha()
    .png().toBuffer({ resolveWithObject: true });
  const quality = await assessStudentCardImage(oriented);
  assertStudentCardImageQuality(quality);
  const boxes = await detectCardRegions(oriented, info.width, info.height, modelPath, confThreshold);
  // NMS sorts by confidence. Lower-scoring duplicates must not overwrite a field.
  const best = (kind: DetectionBox["className"]) => boxes.find((box) => box.className === kind);
  const result: StudentCardOcrResult = {
    id: null, idText: null, name: null, expiry: null, cardText: "",
    cardTextConfidence: 0, schoolText: "", schoolConfidence: 0, quality,
    idConfidence: 0, nameConfidence: 0, qrContent: null, barcodeContent: null,
    card: !!best("card"), face: !!best("face"), logo: !!best("logo"),
    idDetected: !!best("id"), nameDetected: !!best("name"), expiryDetected: !!best("expiry"),
    qrDetected: !!best("qr"), qrDecoded: false,
    barcodeDetected: !!best("barcode"), barcodeDecoded: false,
  };
  if (!result.card) return result;
  const card = await cropDetection(oriented, best("card")!, info.width, info.height);
  result.quality = await assessStudentCardImage(card);
  assertStudentCardImageQuality(result.quality);

  for (const kind of ["qr", "barcode"] as const) {
    const box = best(kind);
    if (!box) continue;
    const crop = await cropDetection(oriented, box, info.width, info.height);
    const content = await decodeStudentCardCode(crop, kind);
    if (kind === "qr") { result.qrContent = content; result.qrDecoded = !!content; }
    else { result.barcodeContent = content; result.barcodeDecoded = !!content; }
  }

  const worker = await createWorker(["vie", "eng"]);
  try {
    for (const kind of ["id", "name", "expiry"] as const) {
      const box = best(kind);
      if (!box) continue;
      const crop = await cropDetection(oriented, box, info.width, info.height);
      await worker.setParameters({ tessedit_pageseg_mode: kind === "name" ? PSM.SINGLE_BLOCK : PSM.SINGLE_LINE });
      for (const threshold of [false, true]) {
        const { data } = await worker.recognize(await prepareTextCrop(crop, kind, threshold));
        const text = data.text.trim().replace(/\s+/g, " ");
        if (kind === "id") {
          if (data.confidence > result.idConfidence) {
            result.idText = text;
            result.idConfidence = data.confidence;
          }
          const id = extractHcmutStudentId(text);
          if (id && data.confidence >= MIN_OCR_CONFIDENCE) {
            result.id = id; result.idText = text; result.idConfidence = data.confidence;
            break;
          }
        } else if (text && data.confidence >= MIN_OCR_CONFIDENCE) {
          if (kind === "name") { result.name = text; result.nameConfidence = data.confidence; }
          else result.expiry = text;
          break;
        }
      }
    }
    // School/title evidence must come from the photo, never the email catalogue.
    const cardImage = await sharp(card).resize({ width: 1800 }).greyscale().normalize().png().toBuffer();
    let bestConfidence = -1;
    for (const psm of [PSM.AUTO, PSM.SPARSE_TEXT]) {
      await worker.setParameters({ tessedit_pageseg_mode: psm });
      const { data } = await worker.recognize(cardImage);
      if (data.confidence > bestConfidence) { result.cardText = data.text; bestConfidence = data.confidence; }
      if (data.confidence >= MIN_OCR_CONFIDENCE) break;
    }
    if (bestConfidence < MIN_OCR_CONFIDENCE) result.cardText = "";
    result.cardTextConfidence = bestConfidence;
    if (!hasCardUniversityText(result.cardText, HCMUT_SCHOOL)) {
      const header = await recognizeSchoolHeader(worker, card);
      result.schoolText = header.text;
      result.schoolConfidence = header.confidence;
    }
  } finally {
    await worker.terminate();
  }
  return result;
}
