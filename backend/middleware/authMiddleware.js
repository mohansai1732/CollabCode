import { getAuth } from '@clerk/express';

// 1. Authenticate user
export const requireAuth = (req, res, next) => {
  const auth = getAuth(req);

  if (!auth.userId) {
    return res.status(401).json({ error: 'Unauthorized: Invalid or missing token' });
  }

  req.userId = auth.userId;
  next();
};

// 2. Authorize admin
export const requireAdmin = (req, res, next) => {
  const auth = getAuth(req);

  if (!auth.userId) {
    return res.status(401).json({ error: 'Unauthorized: Missing token' });
  }

  // Check role from Clerk metadata / session claims
  const role = auth.sessionClaims?.metadata?.role || auth.orgRole;

  if (role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden: Admin access required' });
  }

  req.userId = auth.userId;
  next();
};