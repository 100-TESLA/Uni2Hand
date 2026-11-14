import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { GraduationCap, LoaderCircle } from "lucide-react";
import { authService } from "../../services/auth.services";

export default function VerifiedTrade({ children }: { children: ReactNode }) {
  const [state, setState] = useState<
    "loading" | "ready" | "verify" | "login" | "error"
  >("loading");
  useEffect(() => {
    let active = true;
    authService
      .getMe()
      .then(({ data }) => {
        if (!active) return;
        const user = data.result;
        setState(
          user?.is_verified === true &&
            user.ocr_verification_version === 2 &&
            user.student_card_image
            ? "ready"
            : "verify",
        );
      })
      .catch((error) => {
        if (active)
          setState(error.response?.status === 401 ? "login" : "error");
      });
    return () => {
      active = false;
    };
  }, []);
  if (state === "ready") return <>{children}</>;
  if (state === "loading")
    return (
      <div
        role="status"
        className="flex min-h-[50vh] items-center justify-center gap-3 text-blue-800"
      >
        <LoaderCircle className="animate-spin" />
        Đang kiểm tra quyền mua bán…
      </div>
    );
  return (
    <section className="mx-auto my-12 max-w-xl rounded-2xl border border-blue-200 bg-blue-50 p-8 text-center">
      <GraduationCap className="mx-auto mb-4 text-blue-800" size={40} />
      <h1 className="text-xl font-bold text-blue-900">
        {state === "error"
          ? "Chưa thể kiểm tra tài khoản"
          : state === "login"
            ? "Đăng nhập để tiếp tục"
            : "Xác thực sinh viên để mua bán"}
      </h1>
      <p className="mt-3 leading-7 text-slate-700">
        {state === "error"
          ? "Không thể kết nối máy chủ. Vui lòng tải lại trang và thử lại."
          : "Uni2Hand chỉ cho phép mua và bán sau khi xác thực thẻ sinh viên thành công trong Hồ sơ cá nhân."}
      </p>
      <Link
        to={state === "login" ? "/login" : "/profile"}
        className="mt-6 inline-block rounded-lg bg-blue-800 px-6 py-3 font-bold text-white"
      >
        {state === "login" ? "Đăng nhập" : "Đến hồ sơ cá nhân"}
      </Link>
    </section>
  );
}
