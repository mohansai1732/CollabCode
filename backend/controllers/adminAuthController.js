import crypto from 'crypto';
import { db } from '../config/firebaseAdmin.js';
import { getClientIp, parseUserAgent, getApproximateLocation } from '../utils/geoAndDevice.js';
import { sendAdminLoginAlert } from '../services/emailService.js';

// In-memory fallback if Firestore is disconnected in non-production environments
const memoryLockout = {
  failedAttempts: 0,
  lockedUntil: null,
};
const memorySessions = new Map();

/**
 * Timing-safe password verification
 * Compares against ADMIN_PASSWORD_HASH (SHA-256) or ADMIN_PASSWORD (via SHA-256 digest comparison)
 */
function verifyAdminSecret(inputPassword) {
  if (!inputPassword || typeof inputPassword !== 'string') return false;

  // 1. Preferred: compare against ADMIN_PASSWORD_HASH
  if (process.env.ADMIN_PASSWORD_HASH) {
    const inputHash = crypto.createHash('sha256').update(inputPassword).digest('hex');
    const expectedHash = process.env.ADMIN_PASSWORD_HASH.trim();
    const inputBuf = Buffer.from(inputHash, 'utf8');
    const expectedBuf = Buffer.from(expectedHash, 'utf8');
    if (inputBuf.length !== expectedBuf.length) return false;
    return crypto.timingSafeEqual(inputBuf, expectedBuf);
  }

  // 2. Compare against ADMIN_PASSWORD
  if (process.env.ADMIN_PASSWORD) {
    const inputBuf = crypto.createHash('sha256').update(inputPassword).digest();
    const expectedBuf = crypto.createHash('sha256').update(process.env.ADMIN_PASSWORD).digest();
    return crypto.timingSafeEqual(inputBuf, expectedBuf);
  }

  return false;
}

/**
 * Generates a cryptographically signed Admin Session Token
 */
function createSessionToken(sessionId, expiresAt) {
  const sessionSecret = process.env.ADMIN_SESSION_SECRET || 'collabcode-admin-session-secret-fallback-key';
  const payload = JSON.stringify({
    admin: true,
    sessionId,
    expiresAt,
    issuedAt: Date.now(),
  });
  const payloadB64 = Buffer.from(payload).toString('base64url');
  const signature = crypto.createHmac('sha256', sessionSecret).update(payloadB64).digest('base64url');
  return `${payloadB64}.${signature}`;
}

/**
 * Validates a cryptographically signed Admin Session Token
 */
export async function verifyAdminSessionToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [payloadB64, signature] = parts;
  const sessionSecret = process.env.ADMIN_SESSION_SECRET || 'collabcode-admin-session-secret-fallback-key';
  const expectedSignature = crypto.createHmac('sha256', sessionSecret).update(payloadB64).digest('base64url');

  const sigBuf = Buffer.from(signature, 'utf8');
  const expBuf = Buffer.from(expectedSignature, 'utf8');
  if (sigBuf.length !== expBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expBuf)) return null;

  try {
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    if (!payload.admin || !payload.sessionId || !payload.expiresAt) return null;
    if (Date.now() > payload.expiresAt) return null;

    // Verify session revocation in Firestore
    if (db) {
      const sessionDoc = await db.collection('admin_sessions').doc(payload.sessionId).get();
      if (!sessionDoc.exists || sessionDoc.data()?.revoked === true) {
        return null;
      }
    } else {
      const mem = memorySessions.get(payload.sessionId);
      if (!mem || mem.revoked) return null;
    }

    return payload;
  } catch (err) {
    return null;
  }
}

/**
 * POST /api/admin/login
 * Handles Admin password verification, concurrency-safe lockout, and security alert generation
 */
export const adminLogin = async (req, res) => {
  const { password } = req.body || {};
  const ip = getClientIp(req);
  const ua = parseUserAgent(req.headers['user-agent']);
  
  // Asynchronously resolve approximate location
  const location = await getApproximateLocation(ip);

  // Check if server has Admin secret configured
  if (!process.env.ADMIN_PASSWORD && !process.env.ADMIN_PASSWORD_HASH) {
    console.error('[Admin Auth] Missing ADMIN_PASSWORD or ADMIN_PASSWORD_HASH in environment');
    return res.status(500).json({
      error: 'Admin authentication is not configured on the server. Please set ADMIN_PASSWORD or ADMIN_PASSWORD_HASH.',
    });
  }

  let attemptResult;

  if (db) {
    // Persistent Firestore Atomic Transaction
    const lockoutRef = db.collection('admin_security').doc('lockout');
    try {
      attemptResult = await db.runTransaction(async (transaction) => {
        const doc = await transaction.get(lockoutRef);
        const data = doc.exists ? doc.data() : { failedAttempts: 0, lockedUntil: null };
        const now = Date.now();

        // 1. Active lockout check
        if (data.lockedUntil && now < data.lockedUntil) {
          const remainingMs = data.lockedUntil - now;
          return {
            status: 'LOCKED',
            lockedUntil: data.lockedUntil,
            remainingSeconds: Math.ceil(remainingMs / 1000),
            failedAttempts: data.failedAttempts || 3,
          };
        }

        // 2. Expired lockout reset
        let currentAttempts = data.failedAttempts || 0;
        if (data.lockedUntil && now >= data.lockedUntil) {
          currentAttempts = 0;
        }

        // 3. Verify password
        const isMatch = verifyAdminSecret(password);

        if (!isMatch) {
          const nextAttempts = currentAttempts + 1;
          const isNowLocked = nextAttempts >= 3;
          const newLockedUntil = isNowLocked ? now + 3600000 : null; // 1 hour

          transaction.set(lockoutRef, {
            failedAttempts: nextAttempts,
            lockedUntil: newLockedUntil,
            lastFailedAt: now,
            updatedAt: new Date().toISOString(),
          }, { merge: true });

          return {
            status: 'FAILED',
            attemptsRemaining: Math.max(0, 3 - nextAttempts),
            isLocked: isNowLocked,
            lockedUntil: newLockedUntil,
            remainingSeconds: isNowLocked ? 3600 : 0,
            failedAttempts: nextAttempts,
          };
        }

        // 4. Correct password! Reset failed attempts
        transaction.set(lockoutRef, {
          failedAttempts: 0,
          lockedUntil: null,
          lastSuccessAt: now,
          updatedAt: new Date().toISOString(),
        }, { merge: true });

        return {
          status: 'SUCCESS',
        };
      });
    } catch (txErr) {
      console.error('[Admin Auth] Firestore transaction error:', txErr);
      return res.status(500).json({ error: 'Database error processing login attempt' });
    }
  } else {
    // Memory fallback if db is not initialized
    const now = Date.now();
    if (memoryLockout.lockedUntil && now < memoryLockout.lockedUntil) {
      const remainingMs = memoryLockout.lockedUntil - now;
      attemptResult = {
        status: 'LOCKED',
        lockedUntil: memoryLockout.lockedUntil,
        remainingSeconds: Math.ceil(remainingMs / 1000),
        failedAttempts: memoryLockout.failedAttempts || 3,
      };
    } else {
      if (memoryLockout.lockedUntil && now >= memoryLockout.lockedUntil) {
        memoryLockout.failedAttempts = 0;
        memoryLockout.lockedUntil = null;
      }
      const isMatch = verifyAdminSecret(password);
      if (!isMatch) {
        memoryLockout.failedAttempts = (memoryLockout.failedAttempts || 0) + 1;
        const isNowLocked = memoryLockout.failedAttempts >= 3;
        const newLockedUntil = isNowLocked ? now + 3600000 : null;
        memoryLockout.lockedUntil = newLockedUntil;
        attemptResult = {
          status: 'FAILED',
          attemptsRemaining: Math.max(0, 3 - memoryLockout.failedAttempts),
          isLocked: isNowLocked,
          lockedUntil: newLockedUntil,
          remainingSeconds: isNowLocked ? 3600 : 0,
          failedAttempts: memoryLockout.failedAttempts,
        };
      } else {
        memoryLockout.failedAttempts = 0;
        memoryLockout.lockedUntil = null;
        attemptResult = { status: 'SUCCESS' };
      }
    }
  }

  // 1. LOCKED (Rejected immediately without evaluating credentials or bypassing)
  if (attemptResult.status === 'LOCKED') {
    // Email notification for rejected attempt during active lockout
    sendAdminLoginAlert({
      status: 'FAILED',
      ip,
      location,
      device: ua.device,
      browser: ua.browser,
      os: ua.os,
      isLocked: true,
      attemptsCount: attemptResult.failedAttempts,
    }).catch(() => null);

    return res.status(429).json({
      error: `Admin login is locked due to 3 failed attempts. Please try again in ${Math.ceil(attemptResult.remainingSeconds / 60)} minutes.`,
      locked: true,
      lockedUntil: attemptResult.lockedUntil,
      remainingSeconds: attemptResult.remainingSeconds,
    });
  }

  // 2. FAILED (Wrong password)
  if (attemptResult.status === 'FAILED') {
    sendAdminLoginAlert({
      status: 'FAILED',
      ip,
      location,
      device: ua.device,
      browser: ua.browser,
      os: ua.os,
      isLocked: attemptResult.isLocked,
      attemptsCount: attemptResult.failedAttempts,
    }).catch(() => null);

    if (attemptResult.isLocked) {
      return res.status(429).json({
        error: 'Too many failed attempts. Admin login is locked for 1 hour.',
        locked: true,
        lockedUntil: attemptResult.lockedUntil,
        remainingSeconds: attemptResult.remainingSeconds,
        attemptsRemaining: 0,
      });
    }

    return res.status(401).json({
      error: `Incorrect Admin password. ${attemptResult.attemptsRemaining} attempt(s) remaining before a 1-hour lockout.`,
      locked: false,
      attemptsRemaining: attemptResult.attemptsRemaining,
    });
  }

  // 3. SUCCESS (Correct password)
  const sessionId = crypto.randomUUID();
  const now = Date.now();
  const expiresAt = now + (8 * 3600 * 1000); // 8-hour session
  const token = createSessionToken(sessionId, expiresAt);

  // Store session in Firestore
  if (db) {
    try {
      await db.collection('admin_sessions').doc(sessionId).set({
        createdAt: now,
        expiresAt,
        ip,
        userAgent: req.headers['user-agent'] || '',
        revoked: false,
      });
    } catch (err) {
      console.warn('[Admin Auth] Session record warning:', err.message);
    }
  } else {
    memorySessions.set(sessionId, { createdAt: now, expiresAt, revoked: false });
  }

  // Dispatch SUCCESS email alert
  sendAdminLoginAlert({
    status: 'SUCCESS',
    ip,
    location,
    device: ua.device,
    browser: ua.browser,
    os: ua.os,
    isLocked: false,
    attemptsCount: 0,
  }).catch(() => null);

  return res.status(200).json({
    success: true,
    message: 'Admin authentication successful',
    token,
    session: {
      expiresAt,
    },
  });
};

/**
 * GET /api/admin/verify-session
 * Checks whether the current request holds a valid Admin session
 */
export const verifySessionEndpoint = async (req, res) => {
  const token = req.headers['x-admin-token'] || 
    (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.substring(7) : null);

  if (!token) {
    return res.status(401).json({ valid: false, error: 'No Admin session token provided' });
  }

  const session = await verifyAdminSessionToken(token);
  if (!session) {
    return res.status(401).json({ valid: false, error: 'Admin session is invalid or expired' });
  }

  return res.status(200).json({
    valid: true,
    expiresAt: session.expiresAt,
  });
};

/**
 * POST /api/admin/logout
 * Revokes the active Admin session
 */
export const adminLogout = async (req, res) => {
  const token = req.headers['x-admin-token'] || 
    (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.substring(7) : null);

  if (token) {
    try {
      const parts = token.split('.');
      if (parts.length === 2) {
        const payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
        if (payload?.sessionId) {
          if (db) {
            await db.collection('admin_sessions').doc(payload.sessionId).set({
              revoked: true,
              revokedAt: Date.now(),
            }, { merge: true });
          } else {
            const mem = memorySessions.get(payload.sessionId);
            if (mem) mem.revoked = true;
          }
        }
      }
    } catch (e) {
      // ignore
    }
  }

  return res.status(200).json({
    success: true,
    message: 'Admin session logged out successfully',
  });
};
