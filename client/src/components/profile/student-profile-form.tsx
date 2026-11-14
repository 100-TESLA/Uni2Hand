import { useEffect, useRef, useState } from "react";
import {
  CheckCircle,
  CircleAlert,
  GraduationCap,
  LoaderCircle,
  UploadCloud,
  X,
} from "lucide-react";
import Breadcrumbs from "../shop/Breadcrumbs";
import { ProfileSidebar } from "./profile-sidebar";
import { authService } from "../../services/auth.services";

type University = { code: string; name: string; domains: string[] };
type Notice = {
  tone: "success" | "error" | "info";
  title: string;
  text: string;
};
const emptyForm = {
  username: "",
  phone_number: "",
  email: "",
  address: "",
  student_id: "",
  school_code: "",
  university_name: "",
};
const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50 read-only:bg-slate-50 read-only:text-slate-600";

const ocrErrorTitles: Record<string, string> = {
  CARD_IMAGE_TOO_SMALL: "Ảnh thẻ có độ phân giải quá thấp",
  CARD_IMAGE_BLURRY: "Ảnh thẻ bị mờ hoặc mất nét",
  CARD_IMAGE_LOW_CONTRAST: "Ảnh thẻ chưa đủ rõ",
  CARD_TEMPLATE_UNSUPPORTED: "Chưa nhận diện được thẻ HCMUT",
  CARD_TEMPLATE_INCOMPLETE: "Chưa đọc đủ thông tin trên thẻ",
  CARD_SCHOOL_UNREADABLE: "Chưa đọc rõ tên trường",
  CARD_SCHOOL_MISMATCH: "Thẻ không thuộc trường được hỗ trợ",
};

function Feedback({ notice }: { notice: Notice | null }) {
  return (
    <div aria-live="polite" aria-atomic="true">
      {notice && (
        <div
          className={`my-5 flex items-start gap-3 rounded-xl border p-4 ${notice.tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : notice.tone === "error" ? "border-red-200 bg-red-50 text-red-800" : "border-blue-200 bg-blue-50 text-blue-800"}`}
        >
          {notice.tone === "success" ? (
            <CheckCircle size={22} className="mt-0.5 shrink-0" />
          ) : (
            <CircleAlert size={22} className="mt-0.5 shrink-0" />
          )}
          <div>
            <p className="font-bold">{notice.title}</p>
            <p className="mt-1 text-sm leading-6">{notice.text}</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default function StudentProfileForm() {
  const [form, setForm] = useState(emptyForm);
  const [schools, setSchools] = useState<University[]>([]);
  const [loading, setLoading] = useState(true);
  const [available, setAvailable] = useState(false);
  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [reading, setReading] = useState(false);
  const [verified, setVerified] = useState(false);
  const [savedIdentity, setSavedIdentity] = useState("");
  const [avatar, setAvatar] = useState("");
  const [image, setImage] = useState("");
  const [newImage, setNewImage] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [saveMessage, setSaveMessage] = useState<{
    success: boolean;
    text: string;
  } | null>(null);
  const [ocrNotice, setOcrNotice] = useState<Notice | null>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const readSequence = useRef(0);
  const busy = saving || verifying || reading;
  const identityKey = (value: typeof emptyForm) =>
    JSON.stringify([
      value.school_code,
      value.student_id,
      value.university_name,
    ]);
  const identityChanged = identityKey(form) !== savedIdentity;
  const displayedVerified = verified && !identityChanged;
  const errorText = (error: any) =>
    error.response?.data?.message ||
    "Không thể kết nối tới máy chủ. Vui lòng thử lại.";

  const applyUser = (user: any) => {
    const values = Object.fromEntries(
      Object.keys(emptyForm).map((key) => [key, user[key] || ""]),
    ) as typeof emptyForm;
    if (!values.school_code)
      values.school_code =
        (user.email?.split("@")[1] || "")
          .replace(/\.edu\.vn$/, "")
          .split(".")
          .pop() || "";
    setForm(values);
    setSavedIdentity(identityKey(values));
    setVerified(Boolean(user.is_verified));
    setAvatar(user.avatar || "");
    setImage(user.student_card_image || "");
    localStorage.setItem("user", JSON.stringify(user));
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [profile, catalogue] = await Promise.allSettled([
        authService.getMe(),
        authService.getUniversities(),
      ]);
      if (cancelled) return;
      if (profile.status === "fulfilled" && profile.value.data.result) {
        applyUser(profile.value.data.result);
        setAvailable(true);
      } else
        setNotice({
          tone: "error",
          title: "Không tải được hồ sơ",
          text: "Vui lòng đăng nhập lại hoặc tải lại trang.",
        });
      if (catalogue.status === "fulfilled")
        setSchools(catalogue.value.data.result);
      else
        setOcrNotice({
          tone: "info",
          title: "Chưa tải được danh mục trường",
          text: "Bạn vẫn có thể nhập thông tin. Vui lòng tải lại trang để xem các trường gợi ý.",
        });
      setLoading(false);
    })();
    return () => {
      cancelled = true;
      readSequence.current++;
    };
  }, []);

  const editSchool = (
    field: "school_code" | "university_name",
    value: string,
  ) => {
    if (verified) return;
    const match = schools.find((school) =>
      field === "school_code"
        ? school.code === value.trim().toLowerCase()
        : school.name === value,
    );
    setForm((previous) => ({
      ...previous,
      [field]: field === "school_code" ? value.toLowerCase() : value,
      ...(match
        ? { school_code: match.code, university_name: match.name }
        : {}),
    }));
  };

  const chooseFile = (file: File, forAvatar = false) => {
    if (busy || (verified && !forAvatar)) return;
    if (
      !["image/jpeg", "image/png"].includes(file.type) ||
      file.size > 5 * 1024 * 1024
    ) {
      const message: Notice = {
        tone: "error",
        title: "Ảnh không hợp lệ",
        text: "Vui lòng chọn ảnh JPG hoặc PNG, dung lượng tối đa 5MB.",
      };
      if (forAvatar) setNotice(message);
      else setOcrNotice(message);
      return;
    }
    const sequence = ++readSequence.current;
    setReading(true);
    const reader = new FileReader();
    reader.onload = () => {
      if (sequence !== readSequence.current) return;
      if (forAvatar) setAvatar(String(reader.result));
      else {
        setImage(String(reader.result));
        setNewImage(true);
        setOcrNotice(null);
      }
      setReading(false);
    };
    reader.onerror = () => {
      if (sequence !== readSequence.current) return;
      setReading(false);
      setNotice({
        tone: "error",
        title: "Không đọc được ảnh",
        text: "Vui lòng chọn lại tệp ảnh.",
      });
    };
    reader.readAsDataURL(file);
  };

  const save = async () => {
    if (busy || !available) return;
    setSaving(true);
    setNotice(null);
    setSaveMessage(null);
    try {
      const { email: _email, ...editable } = form;
      const { data } = await authService.updateMe({ ...editable, avatar });
      // Keep an image selected for OCR even when saving other profile fields.
      const selectedImage = image;
      applyUser(data.result);
      if (newImage) setImage(selectedImage);
      setNotice({
        tone: "success",
        title: "Đã lưu hồ sơ",
        text: identityChanged
          ? "Đã lưu thông tin sinh viên. Hãy xác thực thẻ để hoàn tất xác minh danh tính."
          : "Thông tin cá nhân và địa chỉ của bạn đã được cập nhật.",
      });
      setSaveMessage({ success: true, text: "Lưu thông tin thành công!" });
    } catch (error) {
      setNotice({
        tone: "error",
        title: "Không thể lưu hồ sơ",
        text: errorText(error),
      });
      setSaveMessage({
        success: false,
        text: `Lưu thông tin thất bại. ${errorText(error)}`,
      });
    } finally {
      setSaving(false);
    }
  };

  const verify = async () => {
    if (busy || verified || !image || !available) return;
    setVerifying(true);
    setOcrNotice(null);
    try {
      const { data } = await authService.verifyStudentCard(image);
      const user = data.result;
      const updated = {
        ...form,
        school_code: user.school_code,
        student_id: user.student_id,
        university_name: user.university_name,
      };
      setForm(updated);
      setSavedIdentity(identityKey(updated));
      setVerified(true);
      setNewImage(false);
      setImage(user.student_card_image);
      localStorage.setItem("user", JSON.stringify(user));
      setOcrNotice({
        tone: "success",
        title: "Xác thực sinh viên thành công",
        text: `Đã đối chiếu thẻ với email. MSSV ${user.student_id} · ${user.school_code.toUpperCase()}. MSSV, mã trường và tên trường đã được tự động điền, lưu và khóa chỉnh sửa.`,
      });
    } catch (error) {
      setOcrNotice({
        tone: "error",
        title: ocrErrorTitles[(error as any)?.response?.data?.code] || "Xác thực OCR thất bại",
        text: errorText(error),
      });
    } finally {
      setVerifying(false);
    }
  };

  if (loading)
    return (
      <div className="flex min-h-[60vh] items-center justify-center gap-3 text-blue-800">
        <LoaderCircle className="animate-spin" />
        Đang tải hồ sơ…
      </div>
    );
  return (
    <div className="min-h-screen bg-slate-50 font-roboto">
      <Breadcrumbs
        items={[
          { label: "Trang chủ", href: "/" },
          { label: "Tài khoản" },
          { label: "Hồ sơ cá nhân" },
        ]}
      />
      <div className="mx-auto flex max-w-7xl">
        <ProfileSidebar activeTab="profile" />
        <main className="min-w-0 flex-1 p-4 md:p-8">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-slate-900">Hồ sơ cá nhân</h1>
            <p className="mt-2 text-sm text-slate-500">
              Cập nhật thông tin và xác thực danh tính sinh viên của bạn.
            </p>
          </div>
          <Feedback notice={notice} />
          <fieldset
            disabled={busy || !available}
            className="rounded-2xl border border-slate-200 bg-white p-5 md:p-7"
          >
            <div className="mb-7 flex flex-wrap items-center gap-5">
              <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-blue-50 text-blue-700">
                {avatar ? (
                  <img
                    src={avatar}
                    alt="Ảnh đại diện"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <GraduationCap size={36} />
                )}
              </div>
              <div>
                <p className="flex items-center gap-2 text-3xl font-bold text-slate-900">
                  <span>{form.username || "Tài khoản của bạn"}</span>
                  {displayedVerified && (
                    <span
                      className="inline-flex shrink-0 text-green-700"
                      role="img"
                      aria-label="Đã xác thực sinh viên"
                      title="Đã xác thực sinh viên"
                    >
                      <CheckCircle
                        size={35}
                        strokeWidth={2.5}
                        aria-hidden="true"
                      />
                    </span>
                  )}
                </p>
                <label className="mt-2 inline-block cursor-pointer text-sm font-medium text-blue-700">
                  Thay ảnh đại diện
                  <input
                    type="file"
                    accept="image/jpeg,image/png"
                    className="sr-only"
                    onChange={(event) => {
                      if (event.target.files?.[0])
                        chooseFile(event.target.files[0], true);
                      event.target.value = "";
                    }}
                  />
                </label>
              </div>
              <span
                className={`rounded-full px-3 py-1.5 text-xs font-bold sm:ml-auto ${displayedVerified ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}
              >
                {displayedVerified
                  ? "✓ Đã xác thực sinh viên"
                  : "Chưa xác thực thông tin hiện tại"}
              </span>
            </div>
            <div className="grid gap-5 md:grid-cols-2">
              <label className="text-sm font-medium text-slate-700">
                Họ và tên
                <input
                  className={`${inputClass} mt-2`}
                  value={form.username}
                  maxLength={100}
                  onChange={(e) =>
                    setForm({ ...form, username: e.target.value })
                  }
                  autoComplete="name"
                />
              </label>
              <label className="text-sm font-medium text-slate-700">
                Số điện thoại
                <input
                  className={`${inputClass} mt-2`}
                  value={form.phone_number}
                  maxLength={20}
                  onChange={(e) =>
                    setForm({ ...form, phone_number: e.target.value })
                  }
                  type="tel"
                  autoComplete="tel"
                />
              </label>
              <label className="text-sm font-medium text-slate-700 md:col-span-2">
                Email đã xác nhận
                <input
                  className={`${inputClass} mt-2 bg-slate-50`}
                  value={form.email}
                  readOnly
                  type="email"
                />
                <span className="mt-2 block text-xs font-normal text-slate-500">
                  Email được dùng để đối chiếu trường và danh tính trên thẻ sinh
                  viên.
                </span>
              </label>
              <label className="text-sm font-medium text-slate-700 md:col-span-2">
                Địa chỉ
                <input
                  className={`${inputClass} mt-2`}
                  value={form.address}
                  maxLength={500}
                  placeholder="Nhập địa chỉ của bạn"
                  autoComplete="street-address"
                  onChange={(e) =>
                    setForm({ ...form, address: e.target.value })
                  }
                />
              </label>
            </div>
            <div className="my-7 border-t border-slate-100" />
            <h2 className="mb-2 flex items-center gap-2 font-bold text-slate-900">
              <GraduationCap size={21} className="text-blue-600" />
              Thông tin sinh viên
            </h2>
            <p className="mb-5 text-sm leading-6 text-slate-500">
              {verified
                ? "Thông tin sinh viên đã được xác thực và cố định. Bạn vẫn có thể cập nhật các thông tin cá nhân khác và địa chỉ."
                : "Bạn có thể chọn gợi ý hoặc tự nhập. Xác thực OCR thành công sẽ tự điền và khóa MSSV, mã trường, tên trường."}
            </p>
            <div className="grid gap-5 md:grid-cols-2">
              <label className="text-sm font-medium text-slate-700">
                Mã số sinh viên
                <input
                  className={`${inputClass} mt-2 uppercase`}
                  readOnly={verified}
                  maxLength={20}
                  value={form.student_id}
                  placeholder="Ví dụ: 2312345"
                  onChange={(e) => {
                    if (!verified)
                      setForm({
                        ...form,
                        student_id: e.target.value.toUpperCase(),
                      });
                  }}
                />
              </label>
              <label className="text-sm font-medium text-slate-700">
                Mã trường
                <input
                  className={`${inputClass} mt-2`}
                  readOnly={verified}
                  list={verified ? undefined : "university-codes"}
                  maxLength={40}
                  value={form.school_code}
                  placeholder="Chọn hoặc nhập mã trường"
                  onChange={(e) => editSchool("school_code", e.target.value)}
                />
                <datalist id="university-codes">
                  {schools.map((school) => (
                    <option key={school.code} value={school.code}>
                      {school.name}
                    </option>
                  ))}
                </datalist>
              </label>
              <label className="text-sm font-medium text-slate-700 md:col-span-2">
                Tên trường
                <input
                  className={`${inputClass} mt-2`}
                  readOnly={verified}
                  list={verified ? undefined : "university-names"}
                  maxLength={250}
                  value={form.university_name}
                  placeholder="Chọn hoặc nhập tên đầy đủ của trường"
                  onChange={(e) =>
                    editSchool("university_name", e.target.value)
                  }
                />
                <datalist id="university-names">
                  {schools.map((school) => (
                    <option key={school.code} value={school.name}>
                      {school.code.toUpperCase()}
                    </option>
                  ))}
                </datalist>
              </label>
            </div>
            {verified && (
              <p className="mt-4 flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-sm font-medium text-emerald-800">
                <CheckCircle size={18} className="shrink-0" />
                Đã xác thực · Ba thông tin sinh viên ở chế độ Read-Only.
              </p>
            )}
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => void save()}
                disabled={busy || !available}
                className="flex items-center gap-2 rounded-none bg-blue-800 px-10 py-4 text-sm font-bold text-white hover:bg-blue-900 disabled:opacity-50"
              >
                {saving && <LoaderCircle size={18} className="animate-spin" />}
                {saving ? "Đang lưu…" : "LƯU THÔNG TIN"}
              </button>
            </div>
            <div aria-live="polite" aria-atomic="true">
              {saveMessage && (
                <p
                  className={`mt-3 text-right text-sm font-bold leading-6 ${saveMessage.success ? "text-emerald-600" : "text-red-600"}`}
                >
                  {saveMessage.text}
                </p>
              )}
            </div>
          </fieldset>

          <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 md:p-7">
            <h2 className="text-lg font-bold text-slate-900">
              Xác thực thẻ sinh viên
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Hiện hỗ trợ thẻ sinh viên HCMUT (Đại học Bách khoa, ĐHQG TP.HCM).
              Chụp rõ toàn bộ mặt trước thẻ, dùng ảnh gốc, giữ máy ổn định và tránh
              lóa phần tên trường, họ tên, MSSV, QR và barcode. Hệ thống đối chiếu
              với email đã xác nhận; mỗi thẻ chỉ được gắn với một tài khoản.
            </p>
            <div
              className={`relative mt-5 rounded-xl border-2 border-dashed p-5 text-center transition ${dragging ? "border-blue-500 bg-blue-50" : "border-slate-200 bg-slate-50"}`}
              onDragOver={(e) => {
                e.preventDefault();
                if (!busy && !verified) setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                if (!busy && !verified && e.dataTransfer.files[0])
                  chooseFile(e.dataTransfer.files[0]);
              }}
            >
              {image ? (
                <>
                  <img
                    src={image}
                    alt="Ảnh thẻ sinh viên đã chọn"
                    className="mx-auto max-h-80 max-w-full rounded-lg object-contain"
                  />
                  {!verified && (
                    <button
                      type="button"
                      aria-label="Bỏ ảnh đã chọn"
                      disabled={busy}
                      className="absolute right-3 top-3 rounded-full bg-white p-2 text-red-600 shadow hover:bg-red-50 disabled:opacity-50"
                      onClick={() => {
                        setImage("");
                        setNewImage(false);
                        setOcrNotice(null);
                      }}
                    >
                      <X size={18} />
                    </button>
                  )}
                </>
              ) : (
                <div className="py-8">
                  <UploadCloud
                    size={40}
                    className="mx-auto mb-3 text-blue-500"
                  />
                  <p className="font-medium text-slate-700">
                    Kéo thả ảnh thẻ sinh viên vào đây
                  </p>
                  <p className="mt-2 text-xs text-slate-500">
                    JPG hoặc PNG · tối đa 5MB
                  </p>
                </div>
              )}
              {!verified && (
                <>
                  <input
                    ref={imageInput}
                    type="file"
                    accept="image/jpeg,image/png"
                    className="hidden"
                    disabled={busy || !available}
                    onChange={(e) => {
                      if (e.target.files?.[0]) chooseFile(e.target.files[0]);
                      e.target.value = "";
                    }}
                  />
                  <button
                    type="button"
                    disabled={busy || !available}
                    onClick={() => imageInput.current?.click()}
                    className="mt-4 rounded-lg border border-blue-200 bg-white px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                  >
                    {reading
                      ? "Đang đọc ảnh…"
                      : image
                        ? "Chọn ảnh khác"
                        : "Chọn ảnh thẻ"}
                  </button>
                </>
              )}
            </div>
            {verified && (
              <div
                role="status"
                className="mx-auto mt-5 flex w-fit items-center justify-center gap-2 border border-green-600 bg-green-50 px-6 py-3 text-sm font-bold text-green-800"
              >
                <CheckCircle size={18} />
                ĐÃ XÁC THỰC
              </div>
            )}
            <Feedback notice={ocrNotice} />
            {verifying && (
              <p
                role="status"
                className="my-4 flex items-center gap-2 rounded-xl bg-blue-50 p-4 text-sm font-semibold text-blue-800"
              >
                <LoaderCircle size={20} className="shrink-0 animate-spin" />
                Đang đọc thẻ và đối chiếu danh tính. Vui lòng giữ trang này mở…
              </p>
            )}
            {!verified && (
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => void verify()}
                  disabled={
                    busy ||
                    !available ||
                    !image ||
                    (displayedVerified && !newImage)
                  }
                  className="flex items-center gap-2 rounded-none bg-blue-800 px-6 py-3 text-sm font-bold text-white hover:bg-blue-900 disabled:opacity-50"
                >
                  {verifying ? (
                    <LoaderCircle size={18} className="animate-spin" />
                  ) : (
                    <CheckCircle size={18} />
                  )}
                  {verifying
                    ? "Đang xác thực…"
                    : displayedVerified && !newImage
                      ? "Đã xác thực"
                      : "Xác thực thẻ sinh viên"}
                </button>
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}
