import axios from 'axios';

/**
 * Extracts the real client IP from incoming request
 */
export function getClientIp(req) {
  let ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || req.ip || '';
  if (ip.includes(',')) {
    ip = ip.split(',')[0].trim();
  }
  // Strip IPv6-mapped IPv4 prefix if present
  if (ip.startsWith('::ffff:')) {
    ip = ip.substring(7);
  }
  if (ip === '::1') {
    ip = '127.0.0.1';
  }
  return ip || 'Unknown IP';
}

/**
 * Parses user-agent header into readable device, browser, and OS strings
 */
export function parseUserAgent(userAgentString = '') {
  const ua = userAgentString || '';
  
  // 1. Device Type
  let device = 'Desktop';
  if (/iPad|Tablet|(android(?!.*mobile))/i.test(ua)) {
    device = 'Tablet';
  } else if (/Mobile|iP(hone|od)|Android|BlackBerry|IEMobile|Kindle|NetFront|Silk-Accelerated|(hpw|web)OS|Fennec|Minimo|Opera M(obi|ini)|Blazer/i.test(ua)) {
    device = 'Mobile';
  } else if (/curl|Postman|insomnia|node-fetch|axios/i.test(ua)) {
    device = 'API Client / Script';
  }

  // 2. Operating System
  let os = 'Unknown OS';
  if (/Windows NT 10.0/i.test(ua)) os = 'Windows 10/11';
  else if (/Windows NT 6.3/i.test(ua)) os = 'Windows 8.1';
  else if (/Windows NT 6.2/i.test(ua)) os = 'Windows 8';
  else if (/Windows NT 6.1/i.test(ua)) os = 'Windows 7';
  else if (/Windows/i.test(ua)) os = 'Windows';
  else if (/Mac OS X ([\d_]+)/i.test(ua)) {
    const ver = ua.match(/Mac OS X ([\d_]+)/i)?.[1]?.replace(/_/g, '.') || '';
    os = ver ? `macOS ${ver}` : 'macOS';
  } else if (/iPhone OS ([\d_]+)/i.test(ua)) {
    const ver = ua.match(/iPhone OS ([\d_]+)/i)?.[1]?.replace(/_/g, '.') || '';
    os = ver ? `iOS ${ver}` : 'iOS';
  } else if (/Android ([\d.]+)/i.test(ua)) {
    const ver = ua.match(/Android ([\d.]+)/i)?.[1] || '';
    os = ver ? `Android ${ver}` : 'Android';
  } else if (/CrOS/i.test(ua)) os = 'Chrome OS';
  else if (/Linux/i.test(ua)) os = 'Linux';

  // 3. Browser
  let browser = 'Unknown Browser';
  if (/Edg\/([\d.]+)/i.test(ua)) {
    browser = `Microsoft Edge ${ua.match(/Edg\/([\d.]+)/i)?.[1] || ''}`.trim();
  } else if (/OPR\/([\d.]+)|Opera\/([\d.]+)/i.test(ua)) {
    browser = `Opera ${ua.match(/OPR\/([\d.]+)|Opera\/([\d.]+)/i)?.[1] || ''}`.trim();
  } else if (/Chrome\/([\d.]+)/i.test(ua) && !/Chromium|Edg|OPR/i.test(ua)) {
    browser = `Chrome ${ua.match(/Chrome\/([\d.]+)/i)?.[1] || ''}`.trim();
  } else if (/Safari\/([\d.]+)/i.test(ua) && !/Chrome|Chromium|Edg|OPR/i.test(ua)) {
    browser = `Safari ${ua.match(/Version\/([\d.]+)/i)?.[1] || ''}`.trim();
  } else if (/Firefox\/([\d.]+)/i.test(ua)) {
    browser = `Firefox ${ua.match(/Firefox\/([\d.]+)/i)?.[1] || ''}`.trim();
  } else if (/PostmanRuntime/i.test(ua)) {
    browser = 'Postman';
  } else if (/curl/i.test(ua)) {
    browser = 'curl';
  }

  return { device, browser, os };
}

/**
 * Checks if an IP is in a private/local range
 */
function isPrivateIp(ip) {
  if (!ip || ip === 'Unknown IP') return true;
  if (ip === '127.0.0.1' || ip === '::1' || ip === 'localhost') return true;
  if (ip.startsWith('10.') || ip.startsWith('192.168.')) return true;
  if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(ip)) return true;
  return false;
}

/**
 * Fetches approximate location from IP without requiring external keys
 * Gracefully falls back to 'Unavailable' if offline, timeout, or private IP
 */
export async function getApproximateLocation(ip) {
  if (isPrivateIp(ip)) {
    return 'Localhost / Private Network';
  }

  try {
    const res = await axios.get(`http://ip-api.com/json/${ip}?fields=status,country,regionName,city`, {
      timeout: 2500,
    });
    if (res.data && res.data.status === 'success') {
      const parts = [res.data.city, res.data.regionName, res.data.country].filter(Boolean);
      return parts.length ? parts.join(', ') : 'Unavailable';
    }
    return 'Unavailable';
  } catch (err) {
    // Geolocation failure must never interrupt authentication
    return 'Unavailable';
  }
}
