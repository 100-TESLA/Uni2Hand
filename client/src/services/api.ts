import { clearSession, readSession } from './session';
import axios, { InternalAxiosRequestConfig } from 'axios';

const getBaseURL = (): string => {
    const mode = import.meta.env.VITE_ENV_MODE || 'local';
    if (mode === 'production' || mode === 'prod') {
        return import.meta.env.VITE_API_BASE_URL_PROD || 'https://secondhand-ecommerce.onrender.com/';
    }
    if (mode === 'local') {
        return import.meta.env.VITE_API_BASE_URL_LOCAL || 'http://localhost:3001/';
    }
    return import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/';
};

const api = axios.create({
    baseURL: getBaseURL(),
});

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
    const session = readSession();
    if (session) config.headers.set('Authorization', `Bearer ${session.access_token}`);
    return config
});

api.interceptors.response.use(response => response, error => {
    if (error.response?.status === 401 && error.config?.headers?.Authorization) clearSession();
    return Promise.reject(error);
});

export default api