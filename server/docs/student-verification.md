# Student verification

Both form registration (after email OTP) and Google registration use
`POST /users/me/verify-student-card`. The request accepts a JPG/PNG data URL,
at most 5 MB. It never fetches a user-supplied URL.

## Profile and identity

Before OCR, `student_id`, `school_code`, `university_name` allow free typing and
university suggestions. After OCR succeeds, all three fields are read-only;
the API also rejects changes, including clearing values. Sending unchanged values
is allowed when saving other profile fields such as `address`. A revision check
rejects stale profile writes racing with OCR. Profile inputs are never evidence
of ownership.

The successfully verified card image is immutable too: the UI removes the
file picker, remove button and drag/drop behavior, and shows a green verified
status below the image. The verification API rejects further uploads, with an
atomic `is_verified != true` condition protecting concurrent submissions.

Buying/selling mutations require a current, active account with verified email,
v2 OCR, student identity fields, and its stored card image. Product creation,
editing, status changes/deletion, order creation/status updates and payment URL
creation enforce this on the server. Browse/profile access remains available.
Checkout and listing creation show an invitation to verify when not eligible.
The order buyer comes from the authenticated token; both buyer and actual seller
must be verified, and product ownership must match. Product mutations are scoped
to the authenticated seller. Payment provider callbacks retain their signature
verification and do not require a browser session.

OCR derives the trusted university from the verified email domain, checks the
card's university, and extracts a labelled MSSV and a labelled or unambiguous
standalone Vietnamese name. For the current HCMUT workflow, ownership is checked
using only the given name: the last word of the card's full name must equal the
email component before the first dot, ignoring case and Vietnamese accents.
For example, `khoa.tran241005@hcmut.edu.vn` supplies `khoa`. Everything after the
first dot is ignored, including nicknames, concatenated names, birth dates and
numbers that resemble MSSVs. No numeric email-to-MSSV comparison is performed.
Numeric-only email addresses cannot substitute for this name check. The account's
verified email is used; editable profile names and IDs are never evidence.
MSSV/QR/barcode comparisons within the card still preserve leading zeros.
University-specific formats supplied for this project:

- HUST (`sis.hust.edu.vn`): dotted/underscored name parts plus three trailing
  digits; both the name and the last three MSSV digits must match.
- HCMUS (`student.hcmus.edu.vn`): exact MSSV or MSSV plus exactly two CCCD digits.
  The extra digits are not independently verified from the student card.
- UEH (`st.ueh.edu.vn`): name initials (family-first or given-first) plus the
  full learner number. Unrecognized abbreviation styles require support.
- UIT, UET, UEL, UEF, HCMUSSH, HCMUTE: the email local part must equal the MSSV.
- UET maps `vnu.edu.vn` to candidate code `uet`; because this is a shared domain,
  the card must also contain a UET alias. A VNU address alone is insufficient.
  Source: https://uet.vnu.edu.vn/huong-dan-thu-tuc-nhap-hoc/

MongoDB constraints:

- `users`: unique `(school_code, student_id)` for non-empty strings.
- `student_identities`: unique `(school_code, student_id)` and unique `user_id`.
  This record permanently retains the identity claim.
  A failed final profile write can retain a claim for the same owner; retrying the
  same card completes verification. It never releases the card to another user.
- A profile revision check prevents OCR from overwriting a concurrent edit.

## University catalogue

`universities` is a trusted collection, served read-only by
`GET /common/universities`. The initial catalogue includes hcmut, hcmus, uit,
hust, hcmute, hcmussh, ueh, uef, uel and uet. It is not a complete national catalogue.
Each entry includes `code`, `name`, `domains`, `card_aliases`, and `source_url`.
Sources are official university websites, recorded on every entry.

For a new university, add a reviewed entry with official domains and distinct
card name aliases. Each inner alias array is AND; the outer array is OR.
Keep former school names as OCR aliases for older cards. HCMUTE's current name
is Trường Đại học Công nghệ Kỹ thuật Thành phố Hồ Chí Minh; the Sư phạm Kỹ thuật
name is retained as a legacy alias (https://hcmute.edu.vn/).
User-entered school names do not create trusted catalogue records.

## Setup and checks

### HCMUT YOLO recognition

The bundled `src/models/student-card/best.onnx` is a YOLO11n detector with eight
classes and output shape `[1, 12, 8400]`. The current recognition pipeline targets
the HCMUT template with a seven-digit MSSV. It applies phone EXIF orientation,
letterboxes to 640 × 640 without stretching, and maps boxes back to the original
photo. The highest-confidence detection supplies each field.

The MSSV crop has no extra image padding: on the supplied photo, expanding it by
5% included part of the adjacent `ID` label and OCR read an extra leading `1`.
White margins are added after cropping instead. Tesseract uses single-line OCR
for MSSV/expiry and block OCR for wrapped names, with a grayscale/threshold
fallback and a minimum text confidence of 55. It never replaces unreadable
digits with QR/barcode data or drops digits to force a match.

ZXing receives one grayscale byte per pixel. Raw RGBA bytes in a
`Uint8ClampedArray` are not a valid luminance image. QR and barcode are decoded
independently, retain their aspect ratio, and update their `*Decoded` flags.
Comparison strips recognized MSSV labels/spacing while preserving leading zeros.
QR payloads may be a plain MSSV, a labelled MSSV, or explicit ID fields in JSON
or URL query parameters; conflicting fields or unrelated digits are rejected.
All three extracted IDs must match. School/title evidence comes from the photo;
the university catalogue is not inserted into that evidence. If full-card OCR
cannot identify the school, bounded header crops within the detected card are
read separately, using block/line segmentation and different enhancement scales.
A header candidate must have confidence at least 55 to supply evidence. A high
overall confidence for the name or MSSV cannot substitute for readable school
text. This recovers the small HCMUT school heading in the supplied Phát photos.

After image-quality and card-presence checks, the HCMUT given-name/email-prefix
check runs before field-completeness and code comparison errors. A card named
`NGUYỄN TẤN PHÁT` submitted by
`khoa.tran241005@hcmut.edu.vn` reports a name mismatch even if a code is also
unreadable or inconsistent. Cards with a matching name still require the card's
MSSV, QR and barcode to match before the identity can be saved.

### Capture quality and error reporting

The active model only supports HCMUT; other university email domains are rejected
before OCR. Quality is checked on both the input and the detected card crop,
before any sharpening or upscaling. Images with a long side below 350 pixels or
a short side below 200 pixels require a closer, higher-resolution photo. On a
grayscale sample with longest side at most 640 pixels, contrast below 8 or
Laplacian sharpness below 0.7 identifies very low contrast or severe blur. These
are conservative heuristics calibrated against the local sample photos and
synthetically degraded copies, not a universal guarantee that a photo is readable.
Sharp documents the measurement in its [image statistics API](https://sharp.pixelplumbing.com/api-input/#stats).

The verification API returns a stable `code` alongside its Vietnamese `message`;
the profile page uses it for an actionable error title:

- `CARD_IMAGE_TOO_SMALL`, `CARD_IMAGE_BLURRY`, `CARD_IMAGE_LOW_CONTRAST`: retake
  the original photo closer, in focus and under even lighting.
- `CARD_TEMPLATE_UNSUPPORTED`, `CARD_TEMPLATE_INCOMPLETE`: no supported card was
  detected, or required regions are missing/unreadable; capture the full HCMUT front.
- `CARD_SCHOOL_UNREADABLE`: the school text is missing/ambiguous after fallback;
  request a clearer header instead of asserting that the university is wrong.
- `CARD_SCHOOL_MISMATCH`: an explicit alias of a different catalogued university
  was recognized. HCMUTE's longer English school name must not pass merely because
  it contains the HCMUT name as a prefix.

Unknown text is never guessed into HCMUT. Confidence/quality metrics remain local
diagnostics; the API does not send raw OCR or thresholds to the profile page.

These checks do not connect to the database or modify an account:

```sh
cd server
npm run test:ocr
npm run test:ocr:sample -- "path/to/card.jpg" "verified-email@hcmut.edu.vn" --variants
```

The sample command accepts a local image path and an optional email; without
an email it checks card fields/codes and explicitly reports `emailChecked: false`.
It never invents an email from the card's MSSV. `--variants` also checks an
800-pixel copy and an EXIF-rotated copy in memory. It reports extracted fields,
confidence and timing, and fails if required evidence or any code does not match.
No personal image is bundled in the test suite.

From `server`:

```sh
npm run setup:students
npm run test:students
npm run test:trade
npm run test:auth
npm run test:ocr
npm run test:ocr:sample -- "path/to/card.jpg"
```

Setup also runs on server startup. It checks legacy pairs for collisions before
normalizing them, creates the new indexes, replaces name-based indexes, and
invalidates pre-v2 OCR badges. It does not delete user accounts or student cards.
Old badges need reverification because the old algorithm did not check ownership.

The OCR tests generate synthetic QR/barcode images and check normalization,
rotations, letterbox coordinates, conflicting codes, HCMUT email matching and the
verification service with in-memory database doubles. Full-card OCR uses automatic
page segmentation, with sparse-text fallback when confidence is low. No personal
values are hardcoded in production recognition code.
OCR/text matching is not document-forgery detection, face verification, or a
lookup against university enrolment records. Low-confidence or ambiguous text
fails closed and requires a clearer image or further support.
