import axios from 'axios';

const rawURL = (import.meta.env.VITE_API_URL || 'http://localhost:5001').replace(/\/+$/, '');
const baseURL = rawURL.endsWith('/api') ? rawURL : `${rawURL}/api`;

const api = axios.create({
  baseURL,
  headers: {
    'Content-Type': 'application/json',
  },
});

let clerkTokenGetter = null;

export const setClerkTokenGetter = (getTokenFn) => {
  clerkTokenGetter = getTokenFn;
};

api.interceptors.request.use(
  async (config) => {
    if (clerkTokenGetter) {
      try {
        const token = await clerkTokenGetter();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
      } catch (error) {
        console.error('Failed to attach Clerk token:', error);
        return Promise.reject(error);
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

export default api;