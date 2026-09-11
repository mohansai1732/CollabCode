import { getAuth, clerkClient } from '@clerk/express';
import { db } from '../config/firebaseAdmin.js';

// Safe helper to extract auth object
function extractAuth(req) {
  if (process.env.CLERK_SECRET_KEY) {
    try {
      const clerkAuth = getAuth(req);
      if (clerkAuth && clerkAuth.userId) return clerkAuth;
    } catch (e) {
      // fall back to req.auth
    }
  }
  return req.auth || {};
}

// 1. Authenticate user
export const requireAuth = (req, res, next) => {
  const auth = extractAuth(req);

  if (!auth || !auth.userId) {
    return res.status(401).json({ error: 'Unauthorized: Invalid or missing authentication token' });
  }

  req.userId = auth.userId;
  req.auth = auth;
  next();
};
