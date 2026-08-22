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
let clerkUserGetter = null;

export const setClerkTokenGetter = (getTokenFn, getUserFn) => {
  clerkTokenGetter = getTokenFn;
  if (getUserFn) {
    clerkUserGetter = getUserFn;
  }
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
      }
    }

    if (clerkUserGetter) {
      try {
        const user = typeof clerkUserGetter === 'function' ? clerkUserGetter() : clerkUserGetter;
        if (user?.publicMetadata?.role) {
          config.headers['X-Admin-Role'] = user.publicMetadata.role;
        }
      } catch (e) {
        // ignore
      }
    }

    return config;
  },
  (error) => Promise.reject(error)
);

export default api;