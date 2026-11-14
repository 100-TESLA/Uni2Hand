export type StudentCardErrorCode =
  | "CARD_IMAGE_TOO_SMALL"
  | "CARD_IMAGE_BLURRY"
  | "CARD_IMAGE_LOW_CONTRAST"
  | "CARD_TEMPLATE_UNSUPPORTED"
  | "CARD_TEMPLATE_INCOMPLETE"
  | "CARD_SCHOOL_UNREADABLE"
  | "CARD_SCHOOL_MISMATCH";

/** Stable public reason codes; raw OCR and image metrics stay on the server. */
export class StudentCardError extends Error {
  constructor(public readonly code: StudentCardErrorCode, message: string) {
    super(message);
    this.name = "StudentCardError";
  }
}
