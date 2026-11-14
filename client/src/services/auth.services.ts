import api from '../services/api';

export const authService = {
  login: (data: any) => {
    return api.post('/users/login', data);
  },

  register: (data: any) => {
    return api.post('/users/register', data);
  },

  verifyOtp: (data: any) => {
    return api.post('/users/verify-otp', data);
  },

  resendOtp: (data: any) => {
    return api.post('/users/resend-otp', data);
  },

  logout: (refreshToken: string) => {
    return api.post('/users/logout', { refresh_token: refreshToken });
  },

  getMe: () => {
    return api.get('/users/me');
  },
  getUniversities: () => api.get('/common/universities'),

  updateMe: (data: any) => {
    return api.patch('/users/me', data);
  },

  getAddresses: () => {
    return api.get('/users/me/addresses');
  },

  saveAddress: (data: any) => {
    return api.post('/users/me/address', data);
  },

  verifyStudentCard: (image: string) => {
    return api.post('/users/me/verify-student-card', { image });
  },

  googleAuth: (idToken: string) => {
    return api.post('/users/google-auth', { id_token: idToken });
  },

  googleRegister: (data: { credential: string; school: string; student_id: string }) => {
    return api.post('/users/google-register', data);
  }
};
