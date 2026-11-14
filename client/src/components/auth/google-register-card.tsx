'use client';

import React, { useState, useEffect } from 'react';
import { ArrowRight, GraduationCap, ArrowLeft } from 'lucide-react';
import { AuthInput } from './auth-input';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { authService } from '../../services/auth.services';

interface GoogleUser {
  google_id: string;
  email: string;
  name?: string;
  picture?: string;
}

export function GoogleRegisterCard() {
  const navigate = useNavigate();
  const location = useLocation();

  const [credential, setCredential] = useState<string>('');
  const [googleUser, setGoogleUser] = useState<GoogleUser | null>(null);

  const [formData, setFormData] = useState({
    school: '',
    student_id: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // 1. Try reading from navigation state
    const state = location.state as {
      credential?: string;
      google_user?: GoogleUser;
    } | null;
    let cred = state?.credential;
    let gUser = state?.google_user;

    // 2. Fallback to sessionStorage
    if (!cred) {
      try {
        const stored = sessionStorage.getItem('google_registration_data');
        if (stored) {
          const parsed = JSON.parse(stored);
          cred = parsed.credential;
          gUser = parsed.google_user;
        }
      } catch (err) {
        console.error('Error reading registration data:', err);
      }
    }

    if (cred) {
      setCredential(cred);
      if (gUser) {
        setGoogleUser(gUser);
        const domain = gUser.email?.trim().toLowerCase().split('@')[1] || '';
        if (!domain.endsWith('.edu.vn') || domain === 'edu.vn') {
          alert('Hệ thống chỉ chấp nhận email trường học có đuôi .edu.vn.');
          navigate('/login');
          return;
        }
      }
    } else {
      // If no registration data available, redirect to login
      alert('Không tìm thấy thông tin xác thực Google. Vui lòng đăng nhập lại.');
      navigate('/login');
    }
  }, [location, navigate]);

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));

    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const newErrors: Record<string, string> = {};
    if (!formData.school.trim()) {
      newErrors.school = 'Vui lòng nhập tên trường đại học';
    }
    if (!formData.student_id.trim()) {
      newErrors.student_id = 'Vui lòng nhập mã số sinh viên';
    } else if (formData.student_id.trim().length < 5 || formData.student_id.trim().length > 10) {
      newErrors.student_id = 'Mã số sinh viên phải từ 5 đến 10 ký tự';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    if (!credential) {
      alert('Thiếu thông tin xác thực Google. Vui lòng đăng nhập lại.');
      navigate('/login');
      return;
    }

    setLoading(true);

    try {
      const res = await authService.googleRegister({
        credential,
        school: formData.school.trim(),
        student_id: formData.student_id.trim(),
      });

      const result = res.data.result;

      // Store tokens and user using existing convention
      localStorage.setItem(
        'userInfo',
        JSON.stringify({
          access_token: result.access_token,
          refresh_token: result.refresh_token,
        })
      );
      localStorage.setItem('user', JSON.stringify(result.user));

      // Clean up temporary registration data
      sessionStorage.removeItem('google_registration_data');

      navigate('/profile');
      window.location.reload();
    } catch (error: any) {
      const errorData = error.response?.data;
      if (errorData?.errors) {
        setErrors(errorData.errors);
      } else {
        const msg = errorData?.message || error.message || 'Đăng ký tài khoản thất bại';
        alert(msg);
      }
    } finally {
      setLoading(false);
    }
  };

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
        <div className="mb-6 text-center">
          <div className="w-12 h-12 bg-blue-50 text-[#1E40AF] mx-auto mb-3 flex items-center justify-center rounded-full">
            <GraduationCap size={28} />
          </div>
          <h1 className="text-xl font-bold text-[#191C1F]">Hoàn tất đăng ký sinh viên</h1>
          <p className="text-sm text-[#686868] mt-1">
            Xác nhận thông tin trường học để kích hoạt tài khoản
          </p>
        </div>

        {/* Google User Info Badge */}
        {googleUser && (
          <div className="mb-6 p-3 bg-gray-50 border border-gray-200 flex items-center gap-3">
            {googleUser.picture ? (
              <img
                src={googleUser.picture}
                alt={googleUser.name || 'Google Avatar'}
                className="w-10 h-10 rounded-full object-cover shrink-0"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-[#1E40AF] text-white flex items-center justify-center font-bold text-sm shrink-0">
                {(googleUser.name || googleUser.email || 'G')[0].toUpperCase()}
              </div>
            )}
            <div className="overflow-hidden text-left">
              <p className="text-sm font-semibold text-[#191C1F] truncate">
                {googleUser.name || 'Người dùng Google'}
              </p>
              <p className="text-xs text-[#686868] truncate">{googleUser.email}</p>
            </div>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <AuthInput
            label="Trường Đại học"
            type="text"
            placeholder="Ví dụ: Đại học Bách Khoa TP.HCM"
            value={formData.school}
            onChange={(value) => handleInputChange('school', value)}
            error={errors.school}
          />

          <AuthInput
            label="Mã số sinh viên (MSSV)"
            type="text"
            placeholder="Ví dụ: 2110001"
            value={formData.student_id}
            onChange={(value) => handleInputChange('student_id', value)}
            error={errors.student_id}
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#1E40AF] text-[#FFFFFF] font-bold py-3 px-4 rounded-none hover:bg-[#1530a0] transition flex items-center justify-center gap-2 mt-6 cursor-pointer disabled:opacity-70"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <>
                HOÀN TẤT ĐĂNG KÝ
                <ArrowRight size={20} />
              </>
            )}
          </button>

          <div className="mt-4 text-center">
            <Link
              to="/login"
              className="inline-flex items-center gap-1.5 text-sm text-[#1E40AF] hover:underline font-medium"
            >
              <ArrowLeft size={16} />
              Quay lại đăng nhập
            </Link>
          </div>
        </form>
      </div>

      {/* Footer Links */}
      <div className="flex justify-center gap-6 mt-8 pt-6 border-t border-[#C9CFD2]">
        <a href="#" className="text-[#191C1F] hover:text-[#686868] transition text-sm font-medium">
          Privacy
        </a>
        <a href="#" className="text-[#191C1F] hover:text-[#686868] transition text-sm font-medium">
          Term
        </a>
        <a href="#" className="text-[#191C1F] hover:text-[#686868] transition text-sm font-medium">
          Contact
        </a>
      </div>
    </div>
  );
}
