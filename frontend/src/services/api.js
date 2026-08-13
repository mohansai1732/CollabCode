import axios from 'axios';

// Get base URL or fallback, stripping any trailing slash
const rawURL = (import.meta.env.VITE_API_URL || 'http://localhost:5001/api').replace(/\/+$/, '');

// Ensure base URL ends with /api
const baseURL = rawURL.endsWith('/api') ? rawURL : `${rawURL}/api`;

const api = axios.create({
  baseURL,
  headers: { 'Content-Type': 'application/json' },
});

export default api;