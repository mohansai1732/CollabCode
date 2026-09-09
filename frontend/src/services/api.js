import axios from 'axios';

const rawURL = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');
const baseURL = rawURL ? (rawURL.endsWith('/api') ? rawURL : `${rawURL}/api`) : '/api';

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
    let token = null;

    if (clerkTokenGetter) {
      try {
        token = await clerkTokenGetter();
      } catch (error) {
        console.error('Failed to attach Clerk token from getter:', error);
      }
    }

    // Fallback if getter is not yet attached during early page mount/refresh
    if (!token && typeof window !== 'undefined' && window.Clerk?.session) {
      try {
        token = await window.Clerk.session.getToken();
      } catch (error) {
        // silently fallback
      }
    }

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    if (clerkUserGetter && config.url && config.url.includes('/admin')) {
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

// Response interceptor: retry once on 401 if session token was in the middle of refreshing
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (
      error.response?.status === 401 && 
      originalRequest && 
      !originalRequest._retry && 
      typeof window !== 'undefined' && 
      window.Clerk?.session
    ) {
      originalRequest._retry = true;
      try {
        const freshToken = await window.Clerk.session.getToken({ skipCache: true });
        if (freshToken) {
          originalRequest.headers.Authorization = `Bearer ${freshToken}`;
          return api(originalRequest);
        }
      } catch (retryError) {
        // pass original error through if retry token retrieval fails
      }
    }
    return Promise.reject(error);
  }
);

export default api;