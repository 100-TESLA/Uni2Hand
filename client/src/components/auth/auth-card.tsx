'use client';

import { useState, useEffect, useRef } from 'react';
import { ArrowRight } from 'lucide-react';
import { OtpVerification, PendingOtp, pendingOtpFromResponse } from './otp-verification';
import { AuthTabs } from './auth-tabs';
import { AuthInput } from './auth-input';
import { Link, useNavigate } from 'react-router-dom';
import { authService } from '../../services/auth.services';


export function AuthCard({ initialTab = 'login' }: { initialTab?: 'login' | 'register' }) {
  const navigate= useNavigate()
  const [loading, setLoading] = useState(false);
  const [pendingOtp, setPendingOtp] = useState<PendingOtp | null>(() => {
    try {
      const pending = JSON.parse(sessionStorage.getItem('pending_registration') || 'null');
      return typeof pending?.email === 'string' && Number.isFinite(pending.expiresAt) && Number.isFinite(pending.resendAt) ? pending : null;
    }
    catch { return null; }
  });
  const updatePending = (value: PendingOtp) => {
    sessionStorage.setItem('pending_registration', JSON.stringify(value));
    setPendingOtp(value);
  };
  const [activeTab, setActiveTab] = useState<'login' | 'register'>(initialTab);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    phone_number: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [googleLoading, setGoogleLoading] = useState(false);
  const googleBtnContainerRef = useRef<HTMLDivElement>(null);

  const handleGoogleCredentialResponse = async (response: any) => {
    if (!response.credential) return;
    setGoogleLoading(true);
    try {
      const res = await authService.googleAuth(response.credential);
      const result = res.data.result;

      if (result.action === 'LOGIN') {
        handleAuthSuccess(result);
      } else if (result.action === 'GOOGLE_STUDENT_REGISTRATION') {
        sessionStorage.setItem(
          'google_registration_data',
          JSON.stringify({
            credential: response.credential,
            google_user: result.google_user,
          })
        );
        navigate('/google-register', {
          state: {
            credential: response.credential,
            google_user: result.google_user,
          },
        });
      }
    } catch (error: any) {
      const errorMsg =
        error.response?.data?.message || error.message || 'Xác thực Google thất bại';
      alert(errorMsg);
    } finally {
      setGoogleLoading(false);
    }
  };

  useEffect(() => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId) {
      return;
    }

    const initGsi = () => {
      if (window.google?.accounts?.id) {
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: handleGoogleCredentialResponse,
          auto_select: false,
          cancel_on_tap_outside: true,
        });

        if (googleBtnContainerRef.current) {
          googleBtnContainerRef.current.innerHTML = '';
          window.google.accounts.id.renderButton(googleBtnContainerRef.current, {
            type: 'standard',
            theme: 'outline',
            size: 'large',
            text: activeTab === 'login' ? 'signin_with' : 'signup_with',
            shape: 'rectangular',
            width: googleBtnContainerRef.current.offsetWidth || 380,
          });
        }
      }
    };

    if (window.google?.accounts?.id) {
      initGsi();
    } else {
      const interval = setInterval(() => {
        if (window.google?.accounts?.id) {
          clearInterval(interval);
          initGsi();
        }
      }, 200);
      return () => clearInterval(interval);
    }
  }, [activeTab, Boolean(pendingOtp)]);

  const handleCustomGoogleClick = () => {
    if (window.google?.accounts?.id) {
      window.google.accounts.id.prompt();
    } else {
      alert('Đang kết nối tới dịch vụ Google, vui lòng thử lại sau giây lát.');
    }
  };


  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
    // Real-time clear error when typing
    if (errors[field]) {
      setErrors(prev => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }

    // Real-time format validation (optional UX improvement)
    if (activeTab === 'register') {
      if (field === 'email' && value && !value.trim().toLowerCase().endsWith('.edu.vn')) {
        setErrors(prev => ({ ...prev, email: 'Email phải có đuôi .edu.vn mới được tạo tài khoản' }));
      } else if (field === 'name' && value.length > 100) {
        setErrors(prev => ({ ...prev, name: 'Tên người dùng không quá 100 kí tự' }));
      }
    }
    // Specific case for confirmPassword
    if (field === 'confirmPassword' && errors.confirm_password) {
      setErrors(prev => {
        const next = { ...prev };
        delete next.confirm_password;
        return next;
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setErrors({}); // Clear previous errors

    try {
      if (activeTab === 'login') {
        // Gọi API Login
        const res = await authService.login({
          email: formData.email,
          password: formData.password
        });
        handleAuthSuccess(res.data.result);
      } else {
        // Gọi API Register
        const res = await authService.register({
          name: formData.name,
          email: formData.email,
          password: formData.password,
          confirm_password: formData.confirmPassword, 
          phone_number: formData.phone_number        
        });
        updatePending(pendingOtpFromResponse(res.data.result));
      }
    } catch (error: any) {
      const errorData = error.response?.data;
      
      if (errorData?.errors) {
        // Backend returns errors object for validation (422)
        setErrors(errorData.errors);
      } else {
        // Handle general errors (500 or network)
        let errorMessage = 'Có lỗi xảy ra';
        if (errorData?.error) errorMessage = typeof errorData.error === 'string' ? errorData.error : JSON.stringify(errorData.error);
        else if (errorData?.message) errorMessage = errorData.message;
        else if (error.message) errorMessage = error.message;
        
        alert(errorMessage);
      }
    } finally { setLoading(false); }
  };

  const handleAuthSuccess = (result: any, destination = '/') => {
    if (!result?.access_token || !result?.refresh_token || !result?.user?._id) return;
    sessionStorage.removeItem('pending_registration');
    // Lưu token riêng
    localStorage.setItem('userInfo', JSON.stringify({
      access_token: result.access_token,
      refresh_token: result.refresh_token
    }));
    // Lưu thông tin user riêng để Checkout và các trang khác dùng
    localStorage.setItem('user', JSON.stringify(result.user));
    
    navigate(destination); // Chuyển về trang chủ
    window.location.reload(); // Reload để Navbar cập nhật trạng thái
  };

  if (pendingOtp) return <div className="relative z-10 w-full max-w-md">
    <OtpVerification pending={pendingOtp} onUpdate={updatePending}
      onSuccess={result => handleAuthSuccess(result, '/profile')}
      onBack={() => { sessionStorage.removeItem('pending_registration'); setPendingOtp(null); }} />
  </div>;

  return (
    <div className="relative z-10 w-full max-w-md">
      {/* Logo */}
      <div className="flex flex-col items-center justify-center mb-10">
        <Link to="/" className="flex flex-col items-center">
            <img src="/LOGOlongboldwhite.png" alt="Uni2hand Logo" className="h-14 w-auto" />
        </Link>
      </div>

      {/* Card */}
      <div className="bg-[#FFFFFF] rounded-none shadow-lg p-8">
        {/* Tabs */}
        <AuthTabs activeTab={activeTab} onTabChange={setActiveTab} />

        {/* Form */}
        <form onSubmit={handleSubmit}>
          {activeTab === 'login' ? (
            // Login Form
            <>
              <AuthInput
                label="Email sinh viên"
                type="email"
                placeholder="Nhập email sinh viên"
                value={formData.email}
                onChange={(value) => handleInputChange('email', value)}
                error={errors.email}
              />
              <AuthInput
                label="Mật khẩu"
                labelRight={
                  <Link to="/forgot-password" tabIndex={-1} title="Quên mật khẩu" className="text-sm font-medium text-[#1E40AF] hover:underline">
                    Quên mật khẩu?
                  </Link>
                }
                type="password"
                placeholder="Nhập mật khẩu"
                value={formData.password}
                onChange={(value) => handleInputChange('password', value)}
                showPasswordToggle
                error={errors.password}
              />
            </>
          ) : (
            // Register Form
            <>
              <AuthInput
                label="Tên người dùng"
                type="text"
                placeholder="Nhập tên người dùng"
                value={formData.name}
                onChange={(value) => handleInputChange('name', value)}
                error={errors.name}
              />
              <AuthInput
                label="Email sinh viên"
                type="email"
                placeholder="Nhập email sinh viên"
                value={formData.email}
                onChange={(value) => handleInputChange('email', value)}
                error={errors.email}
              />
              <AuthInput
                label="Mật khẩu"
                type="password"
                placeholder="Nhập mật khẩu"
                value={formData.password}
                onChange={(value) => handleInputChange('password', value)}
                showPasswordToggle
                error={errors.password}
              />
              <AuthInput
                label="Xác nhận mật khẩu"
                type="password"
                placeholder="Xác nhận mật khẩu"
                value={formData.confirmPassword}
                onChange={(value) => handleInputChange('confirmPassword', value)}
                showPasswordToggle
                error={errors.confirm_password}
              />
              <AuthInput
              label="Số điện thoại"
              type="text"
              placeholder="Nhập số điện thoại (10 số)"
              value={formData.phone_number}
              onChange={(value) => handleInputChange('phone_number', value)} 
              error={errors.phone_number}
            />
            </>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#1E40AF] text-[#FFFFFF] font-bold py-3 px-4 rounded-none hover:bg-[#1530a0] transition flex items-center justify-center gap-2 mt-6"
          >
            {loading ? 'Đang xử lý…' : activeTab === 'login' ? 'ĐĂNG NHẬP' : 'ĐĂNG KÝ'}
            <ArrowRight size={20} />
          </button>

          {/* OR Separator */}
          <div className="flex items-center my-6">
            <div className="flex-grow border-t border-[#C9CFD2]"></div>
            <span className="px-3 text-[#686868] text-sm font-medium">
              HOẶC
            </span>
            <div className="flex-grow border-t border-[#C9CFD2]"></div>
          </div>

          {/* Google Login Button */}
          <div className="relative w-full overflow-hidden">
            <button
              type="button"
              onClick={handleCustomGoogleClick}
              disabled={googleLoading}
              className="w-full bg-white border border-[#C9CFD2] text-[#191C1F] font-bold py-3 px-4 rounded-none hover:bg-gray-50 transition flex items-center justify-center gap-3 relative z-0 disabled:opacity-70"
            >
              {googleLoading ? (
                <div className="w-5 h-5 border-2 border-[#1E40AF] border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
              )}
              {activeTab === 'login' ? 'Đăng nhập với Google' : 'Đăng ký với Google'}
            </button>

            {/* Overlay to catch native click for Google Sign-In */}
            <div
              ref={googleBtnContainerRef}
              className="absolute inset-0 w-full h-full opacity-[0.001] cursor-pointer z-10 overflow-hidden flex items-center justify-center pointer-events-auto"
              title={activeTab === 'login' ? 'Đăng nhập với Google' : 'Đăng ký với Google'}
            />
          </div>
        </form>
      </div>

      {/* Footer Links */}
      <div className="flex justify-center gap-6 mt-8 pt-6 border-t border-[#C9CFD2]">
        <a
          href="#"
          className="text-[#191C1F] hover:text-[#686868] transition text-sm font-medium"
        >
          Privacy
        </a>
        <a
          href="#"
          className="text-[#191C1F] hover:text-[#686868] transition text-sm font-medium"
        >
          Term
        </a>
        <a
          href="#"
          className="text-[#191C1F] hover:text-[#686868] transition text-sm font-medium"
        >
          Contact
        </a>
      </div>
    </div>
  );
}
