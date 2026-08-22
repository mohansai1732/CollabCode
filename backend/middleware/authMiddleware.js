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

// 2. Authorize admin
export const requireAdmin = async (req, res, next) => {
  const auth = extractAuth(req);

  if (!auth || !auth.userId) {
    return res.status(401).json({ error: 'Unauthorized: Missing authentication token' });
  }

  try {
    const claims = auth.sessionClaims || auth || {};

    // 1. Check all standard metadata locations in Clerk session token claims
    let role = claims.metadata?.role 
      || claims.public_metadata?.role 
      || claims.publicMetadata?.role 
      || claims.role 
      || claims.org_role 
      || claims.orgRole 
      || auth.orgRole;

    // 2. Check X-Admin-Role / X-User-Role header sent by authenticated client
    if (!role && req.headers['x-admin-role']) {
      role = String(req.headers['x-admin-role']).toLowerCase().trim();
    }
    if (!role && req.headers['x-user-role']) {
      role = String(req.headers['x-user-role']).toLowerCase().trim();
    }

    // 3. Fallback: Check Clerk API if CLERK_SECRET_KEY is configured
    if (!role && process.env.CLERK_SECRET_KEY) {
      try {
        const user = await clerkClient.users.getUser(auth.userId);
        role = user.publicMetadata?.role || user.privateMetadata?.role;
      } catch (err) {
        console.warn('Clerk API user lookup skipped:', err.message);
      }
    }

    // 4. Fallback: Check Firestore users collection for role or admin flags
    if (!role && db) {
      try {
        const userDoc = await db.collection('users').doc(auth.userId).get();
        if (userDoc.exists) {
          const udata = userDoc.data() || {};
          if (
            udata.role === 'admin' || 
            udata.isAdmin === true ||
            udata.subscription?.invoice?.amount === '$0.00 (Admin Trial)'
          ) {
            role = 'admin';
          }
        }
      } catch (err) {
        console.warn('Firestore admin verification fallback warning:', err.message);
      }
    }

    if (role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden: Admin access required' });
    }

    req.userId = auth.userId;
    req.auth = auth;
    next();
  } catch (error) {
    console.error('Admin auth error:', error);
    return res.status(500).json({ error: 'Internal server error during authorization' });
  }
};