import { randomInt } from "node:crypto";
import nodemailer from "nodemailer";
import { sha256 } from "./crypto.js";
import { emailLogo } from "../assets/email-logo.js";

export function createEmailTransport() {
  const host = process.env.EMAIL_HOST?.trim();
  const user = process.env.EMAIL_USER?.trim();
  const pass = process.env.EMAIL_PASS?.trim();
  const port = Number(process.env.EMAIL_PORT || 587);
  if (!host || !user || !pass || !process.env.EMAIL_FROM?.trim()) {
    throw new Error(
      "Thiếu cấu hình EMAIL_HOST, EMAIL_USER, EMAIL_PASS hoặc EMAIL_FROM trong server/.env.",
    );
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("EMAIL_PORT trong server/.env không hợp lệ.");
  }
  if (host === "smtp-relay.brevo.com" && pass.startsWith("xkeysib-")) {
    throw new Error(
      "EMAIL_PASS phải là SMTP key của Brevo, không phải API key.",
    );
  }
  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    requireTLS: port !== 465,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
    auth: { user, pass },
  });
}

export function emailDeliveryError(error: unknown): Error {
  const { code, responseCode, command } = (error || {}) as {
    code?: string;
    responseCode?: number;
    command?: string;
  };
  // Never log credentials, SMTP AUTH payloads, email addresses, or OTP content.
  console.error("[email] Delivery failed", { code, responseCode, command });
  if (code === "EAUTH" || responseCode === 535) {
    return new Error(
      "Brevo từ chối xác thực SMTP (535). Quản trị viên cần kiểm tra EMAIL_USER (SMTP login) và EMAIL_PASS (SMTP key) trong server/.env.",
    );
  }
  if (
    [
      "ETIMEDOUT",
      "ECONNECTION",
      "ESOCKET",
      "EDNS",
      "ENOTFOUND",
      "ECONNREFUSED",
    ].includes(code || "")
  ) {
    return new Error(
      "Không kết nối được máy chủ email. Vui lòng kiểm tra mạng và cấu hình SMTP hoặc thử lại sau.",
    );
  }
  if (code === "EENVELOPE" || responseCode === 550 || responseCode === 553) {
    return new Error(
      "Dịch vụ email từ chối địa chỉ gửi hoặc nhận. Vui lòng kiểm tra EMAIL_FROM đã được xác minh trên Brevo và địa chỉ người nhận.",
    );
  }
  return new Error("Không thể gửi email xác nhận. Vui lòng thử lại sau.");
}

export async function verifyEmailService() {
  const transporter = createEmailTransport();
  try {
    await transporter.verify();
  } catch (error) {
    throw emailDeliveryError(error);
  } finally {
    transporter.close();
  }
}

export const generateOtpCode = () => {
  return randomInt(0, 1000000).toString().padStart(6, "0");
};

export const hashOtpCode = (otp: string) => {
  return sha256(otp.trim());
};

export async function sendOtpEmail(email: string, otp: string) {
  if (!/^\d{6}$/.test(otp)) throw new Error("Mã OTP phải gồm 6 chữ số.");
  const transporter = createEmailTransport();
  try {
    const result = await transporter.sendMail({
      from: process.env.EMAIL_FROM!.trim(),
      to: email,
      subject: "Uni2Hand | Xác nhận email để hoàn tất đăng ký",
      text: [
        "Chào bạn,",
        "Chào mừng bạn đến với Uni2Hand!",
        "Cảm ơn bạn đã lựa chọn Uni2Hand — nơi sinh viên kết nối, trao đổi những món đồ còn giá trị và cùng xây dựng thói quen tiêu dùng bền vững. Chúng tôi rất vui được đồng hành cùng bạn.",
        `Mã xác nhận của bạn: ${otp}`,
        "Mã có hiệu lực trong 1 phút. Vui lòng quay lại trang đăng ký và nhập mã này để xác nhận email. Nếu mã hết hạn, bạn có thể chọn “Gửi lại mã OTP” trên trang đăng ký.",
        "Sau khi xác nhận email, bạn có thể vào mục Tài khoản để tiếp tục xác thực thẻ sinh viên.",
        "Để bảo vệ tài khoản, vui lòng không chia sẻ mã này với bất kỳ ai. Nếu bạn không yêu cầu đăng ký, hãy bỏ qua email này.",
        "Trân trọng,\nĐội ngũ Uni2Hand",
        "Kết nối sinh viên, tiếp nối giá trị.\nEmail này được gửi tự động để xác nhận đăng ký tài khoản.",
      ].join("\n\n"),
      html: `<!doctype html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Xác nhận email — Uni2Hand</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#334155;-webkit-text-size-adjust:100%;">
  <div style="display:none;font-size:1px;line-height:1px;color:#f1f5f9;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">Chào mừng bạn đến với Uni2Hand. Xác nhận email của bạn bằng mã có hiệu lực trong 1 phút.</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f1f5f9;">
    <tr><td align="center" style="padding:32px 12px;">
      <!-- Tables and inline styles keep the layout usable across email clients. -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;">
        <tr><td align="center" bgcolor="#1e40af" style="padding:20px 24px 26px;background-color:#1e40af;border-radius:16px 16px 0 0;">
          <img src="cid:uni2hand-logo" width="208" height="96" alt="Uni2Hand" style="display:block;width:208px;height:96px;max-width:100%;border:0;color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:28px;font-weight:bold;" />
          <p style="margin:0;color:#dbeafe;font-size:12px;line-height:20px;letter-spacing:1px;">KẾT NỐI SINH VIÊN, TIẾP NỐI GIÁ TRỊ</p>
        </td></tr>
        <tr><td style="padding:32px 24px 12px;">
          <p style="margin:0 0 12px;color:#1e40af;font-size:12px;line-height:18px;font-weight:bold;letter-spacing:1.5px;">XÁC NHẬN EMAIL ĐĂNG KÝ</p>
          <h1 style="margin:0 0 24px;color:#0f172a;font-family:Arial,Helvetica,sans-serif;font-size:26px;line-height:36px;font-weight:700;">Chào mừng bạn đến với Uni2Hand!</h1>
          <p style="margin:0 0 12px;font-size:15px;line-height:25px;">Chào bạn,</p>
          <p style="margin:0 0 16px;font-size:15px;line-height:25px;">Cảm ơn bạn đã lựa chọn <strong style="color:#1e40af;">Uni2Hand</strong> — nơi sinh viên kết nối, trao đổi những món đồ còn giá trị và cùng xây dựng thói quen tiêu dùng bền vững. Chúng tôi rất vui được đồng hành cùng bạn.</p>
          <p style="margin:0 0 12px;font-size:15px;line-height:25px;">Để hoàn tất đăng ký, vui lòng quay lại trang đăng ký và nhập mã xác nhận bên dưới:</p>
        </td></tr>
        <tr><td style="padding:8px 24px 24px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;">
            <tr><td align="center" style="padding:24px 12px;">
              <p style="margin:0 0 14px;color:#475569;font-size:12px;line-height:18px;font-weight:bold;letter-spacing:1px;">MÃ XÁC NHẬN CỦA BẠN</p>
              <p style="margin:0 0 14px;color:#1e3a8a;font-family:'Courier New',Courier,monospace;font-size:36px;line-height:46px;font-weight:700;letter-spacing:6px;white-space:nowrap;">${otp}</p>
              <p style="margin:0;color:#334155;font-size:14px;line-height:22px;">Mã có hiệu lực trong <strong style="color:#1e40af;">1 phút</strong>.</p>
            </td></tr>
          </table>
          <p style="margin:12px 0 0;color:#64748b;font-size:13px;line-height:22px;">Mã đã hết hạn? Chọn <strong>“Gửi lại mã OTP”</strong> trên trang đăng ký để nhận mã mới.</p>
        </td></tr>
        <tr><td style="padding:0 24px 28px;">
          <p style="margin:0 0 20px;font-size:14px;line-height:24px;">Sau khi xác nhận email, bạn có thể vào mục <strong>Tài khoản</strong> để tiếp tục xác thực thẻ sinh viên.</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f8fafc;border-left:3px solid #93c5fd;">
            <tr><td style="padding:14px 16px;">
              <p style="margin:0 0 4px;color:#334155;font-size:13px;line-height:21px;font-weight:bold;">Bảo vệ tài khoản của bạn</p>
              <p style="margin:0;color:#64748b;font-size:13px;line-height:21px;">Vui lòng không chia sẻ mã này với bất kỳ ai. Nếu bạn không yêu cầu đăng ký, hãy bỏ qua email này.</p>
            </td></tr>
          </table>
          <p style="margin:24px 0 0;font-size:14px;line-height:24px;">Trân trọng,<br /><strong style="color:#0f172a;">Đội ngũ Uni2Hand</strong></p>
        </td></tr>
        <tr><td align="center" style="padding:20px 24px;border-top:1px solid #e2e8f0;background-color:#f8fafc;border-radius:0 0 16px 16px;">
          <p style="margin:0 0 6px;color:#475569;font-size:12px;line-height:20px;font-weight:bold;">Uni2Hand · Kết nối sinh viên, tiếp nối giá trị.</p>
          <p style="margin:0;color:#64748b;font-size:12px;line-height:20px;">Email này được gửi tự động để xác nhận đăng ký tài khoản.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
      attachments: [
        {
          filename: "uni2hand-logo.png",
          content: emailLogo,
          contentType: "image/png",
          contentDisposition: "inline",
          cid: "uni2hand-logo",
        },
      ],
    });

    if (result?.rejected?.length || !result?.accepted?.length) {
      throw Object.assign(new Error("Recipient rejected"), {
        code: "EENVELOPE",
      });
    }
    return { emailId: result.messageId };
  } catch (error) {
    throw emailDeliveryError(error);
  } finally {
    transporter.close();
  }
}
export const OTP_TTL_MS = 60_000;
export const OTP_RESEND_MS = 15_000;
