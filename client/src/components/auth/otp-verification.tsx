import { useEffect, useState } from 'react';
import { CircleAlert, CircleCheck, Clock3, MailCheck, RefreshCw } from 'lucide-react';
import { authService } from '../../services/auth.services';

export type PendingOtp = { email: string; expiresAt: number; resendAt: number };
type OtpNotice = { text: string; tone: 'error' | 'info' | 'success' };
export function pendingOtpFromResponse(result: any): PendingOtp {
  const now = Date.now();
  const serverNow = Date.parse(result.server_time);
  return { email: result.email, expiresAt: now + Date.parse(result.otp_expires_at) - serverNow,
    resendAt: now + Date.parse(result.resend_available_at) - serverNow };
}

export function OtpVerification({ pending, onUpdate, onSuccess, onBack }: {
  pending: PendingOtp; onUpdate: (value: PendingOtp) => void;
  onSuccess: (result: any) => void; onBack: () => void;
}) {
  const [now, setNow] = useState(Date.now());
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<OtpNotice | null>(null);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, []);
  const remaining = Math.max(0, Math.ceil((pending.expiresAt - now) / 1000));
  const cooldown = Math.max(0, Math.ceil((pending.resendAt - now) / 1000));
  const visibleNotice: OtpNotice | null = !busy && remaining === 0 &&
    (!notice || notice.tone === 'success' || /mã otp không chính xác/i.test(notice.text))
    ? { text: 'Mã OTP đã hết hạn. Vui lòng gửi lại mã OTP.', tone: 'info' }
    : notice;
  const invalidOtp = visibleNotice?.tone === 'error';
  const NoticeIcon = visibleNotice?.tone === 'error' ? CircleAlert : visibleNotice?.tone === 'success' ? CircleCheck : Clock3;
  const submit = async (resend: boolean) => {
    if (busy || (resend && cooldown > 0)) return;
    setBusy(true); setNotice(null);
    try {
      if (resend) {
        const { data } = await authService.resendOtp({ email: pending.email });
        onUpdate(pendingOtpFromResponse(data.result));
        setOtp(''); setNow(Date.now());
        setNotice({ text: 'Đã gửi mã mới. Vui lòng kiểm tra hộp thư và thư rác.', tone: 'success' });
      } else {
        const { data } = await authService.verifyOtp({ email: pending.email, otp });
        onSuccess(data.result);
      }
    } catch (error: any) {
      const text = error.response?.data?.message || Object.values(error.response?.data?.errors || {}).join(' ') || 'Không thể kết nối. Vui lòng thử lại.';
      setNotice({ text, tone: /hết hạn|vượt quá 5 lần/i.test(text) ? 'info' : 'error' });
    } finally { setBusy(false); }
  };
  return <div className="rounded-2xl bg-white p-6 sm:p-8 shadow-xl border border-blue-100">
    <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 text-blue-700"><MailCheck size={32} /></div>
    <h1 className="text-center text-2xl font-bold text-slate-900">Xác nhận email</h1>
    <p className="mt-3 text-center text-sm text-slate-500">Nhập mã 6 số đã gửi đến<br /><strong className="break-all text-slate-800">{pending.email}</strong></p>
    <form onSubmit={e => { e.preventDefault(); void submit(false); }} className="mt-6">
      <label htmlFor="registration-otp" className="text-sm font-medium text-slate-700">Mã xác nhận</label>
      <input id="registration-otp" autoFocus autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required
        aria-invalid={invalidOtp}
        aria-describedby={visibleNotice ? 'otp-notice' : undefined}
        value={otp} onChange={e => {
          setOtp(e.target.value.replace(/\D/g, '').slice(0, 6));
          if (notice?.tone === 'error') setNotice(null);
        }}
        className={`mt-2 w-full rounded-xl border px-4 py-4 text-center text-3xl font-semibold tracking-[0.4em] outline-none transition-colors focus:ring-2 ${invalidOtp
          ? 'border-red-300 bg-red-50/50 text-red-800 focus:ring-red-500'
          : 'border-blue-200 bg-blue-50/50 text-blue-900 focus:ring-blue-500'}`} />
      <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
        <div className="flex items-center justify-between text-sm"><span className="flex items-center gap-2 text-slate-500"><Clock3 size={15} aria-hidden="true" />Thời hạn mã</span><span className={`font-bold tabular-nums ${remaining === 0 ? 'text-blue-800' : remaining <= 10 ? 'text-red-700' : 'text-blue-700'}`}>{remaining ? `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}` : 'Đã hết hạn'}</span></div>
        <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-slate-200"><div className={`h-full rounded-full transition-all duration-300 ${remaining <= 10 ? 'bg-red-400' : 'bg-blue-500'}`} style={{ width: `${Math.min(remaining / 60 * 100, 100)}%` }} /></div>
      </div>
      <div className="mt-4 min-h-[84px]" aria-live="polite" aria-atomic="true">
        {visibleNotice && <div id="otp-notice" className={`flex items-start gap-2.5 rounded-xl border p-3.5 text-sm leading-6 ${visibleNotice.tone === 'error'
          ? 'border-red-200 bg-red-50 text-red-800'
          : visibleNotice.tone === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
          : 'border-blue-200 bg-blue-50 text-blue-800'}`}>
          <NoticeIcon size={19} className="mt-0.5 shrink-0" aria-hidden="true" />
          <p className="font-bold">{visibleNotice.text}</p>
        </div>}
      </div>
      <button disabled={busy || otp.length !== 6 || remaining === 0} className="mt-2 w-full rounded-xl bg-blue-800 py-3 font-bold text-white transition hover:bg-blue-900 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">{busy ? 'Đang xử lý…' : 'Xác nhận & vào tài khoản'}</button>
    </form>
    <button type="button" onClick={() => void submit(true)} disabled={busy || cooldown > 0}
      className="relative mt-3 flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl border border-blue-100 py-3 text-sm font-semibold text-blue-700 transition hover:bg-blue-50 disabled:cursor-not-allowed">
      <span className="absolute inset-y-0 left-0 bg-blue-100/60 transition-all duration-300" style={{ width: `${cooldown / 15 * 100}%` }} />
      <RefreshCw size={16} className="relative" /><span className="relative">{cooldown ? `Gửi lại mã sau ${cooldown}s` : 'Gửi lại mã OTP'}</span>
    </button>
    <button type="button" disabled={busy} onClick={onBack} className="mt-5 w-full text-sm text-slate-500 hover:text-blue-700">Quay lại đăng ký</button>
  </div>;
}
