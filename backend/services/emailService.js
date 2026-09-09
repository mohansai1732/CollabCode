import nodemailer from 'nodemailer';
import { db } from '../config/firebaseAdmin.js';

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER || process.env.EMAIL_USER;
  const pass = process.env.SMTP_PASS || process.env.EMAIL_PASS;
  const port = Number(process.env.SMTP_PORT) || 587;
  const service = process.env.SMTP_SERVICE;

  if (host && user && pass) {
    transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });
  } else if (service && user && pass) {
    transporter = nodemailer.createTransport({
      service,
      auth: { user, pass },
    });
  } else {
    // Default fallback: jsonTransport formats email without sending to an external server
    transporter = nodemailer.createTransport({
      jsonTransport: true,
    });
  }

  return transporter;
}

/**
 * Sends an email notification for every Admin login attempt
 * Failure in email delivery is safely handled and never breaks authentication
 */
export async function sendAdminLoginAlert({
  status, // 'SUCCESS' | 'FAILED'
  ip,
  location,
  device,
  browser,
  os,
  isLocked = false,
  attemptsCount = 0,
}) {
  const timestamp = new Date().toISOString();
  const readableTime = new Date().toUTCString();
  const alertEmail = process.env.ADMIN_ALERT_EMAIL || process.env.ADMIN_EMAIL || process.env.SECURITY_EMAIL || 'security@collabcode.internal';

  const subject = `[Admin Alert] Login Attempt: ${status}${isLocked ? ' (LOCKED)' : ''}`;

  let lockoutNotice = '';
  if (isLocked) {
    lockoutNotice = '\n*** ALERT: 3 failed attempts reached. Admin portal login is LOCKED for 5 minutes. ***\n';
  } else if (status === 'FAILED') {
    lockoutNotice = `\n(Failed attempt ${attemptsCount} of 3 before lockout)\n`;
  }

  const plainText = [
    `Admin Login Attempt`,
    `Status: ${status}`,
    `Time: ${readableTime} (${timestamp})`,
    `IP: ${ip}`,
    `Approximate Location: ${location}`,
    `Device: ${device}`,
    `Browser: ${browser}`,
    `Operating System: ${os}`,
    lockoutNotice,
  ].filter(Boolean).join('\n');

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #09090b; color: #f4f4f5; border: 1px solid #27272a; border-radius: 12px; overflow: hidden;">
      <div style="padding: 20px 24px; background: ${status === 'SUCCESS' ? '#064e3b' : isLocked ? '#7f1d1d' : '#450a0a'}; border-bottom: 1px solid #27272a;">
        <h2 style="margin: 0; font-size: 20px; color: #ffffff;">Admin Login Attempt: ${status}</h2>
        <p style="margin: 4px 0 0 0; font-size: 13px; color: ${status === 'SUCCESS' ? '#a7f3d0' : '#fecaca'};">CollabCode Security Monitoring</p>
      </div>
      <div style="padding: 24px;">
        ${isLocked ? `
          <div style="background: #ef444420; border: 1px solid #ef4444; color: #fca5a5; padding: 12px 16px; border-radius: 8px; margin-bottom: 20px; font-weight: bold; font-size: 14px;">
            ⚠️ 3 consecutive failed attempts detected. Admin login is LOCKED for 5 minutes.
          </div>
        ` : ''}
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          <tr>
            <td style="padding: 8px 0; color: #a1a1aa; width: 160px; font-weight: 600;">Status</td>
            <td style="padding: 8px 0; color: ${status === 'SUCCESS' ? '#34d399' : '#f87171'}; font-weight: bold;">${status}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #a1a1aa; font-weight: 600;">Time</td>
            <td style="padding: 8px 0; color: #f4f4f5;">${readableTime}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #a1a1aa; font-weight: 600;">IP Address</td>
            <td style="padding: 8px 0; color: #60a5fa; font-family: monospace;">${ip}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #a1a1aa; font-weight: 600;">Approximate Location</td>
            <td style="padding: 8px 0; color: #f4f4f5;">${location}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #a1a1aa; font-weight: 600;">Device</td>
            <td style="padding: 8px 0; color: #f4f4f5;">${device}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #a1a1aa; font-weight: 600;">Browser</td>
            <td style="padding: 8px 0; color: #f4f4f5;">${browser}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #a1a1aa; font-weight: 600;">Operating System</td>
            <td style="padding: 8px 0; color: #f4f4f5;">${os}</td>
          </tr>
        </table>
      </div>
      <div style="padding: 14px 24px; background: #18181b; border-top: 1px solid #27272a; font-size: 12px; color: #71717a;">
        This automated security notification was triggered by an access attempt at the CollabCode Admin Portal.
      </div>
    </div>
  `;

  // 1. Record the security event in Firestore persistently
  try {
    if (db) {
      await db.collection('admin_security_logs').add({
        status,
        ip,
        location,
        device,
        browser,
        os,
        isLocked,
        attemptsCount,
        timestamp,
        recipient: alertEmail,
        createdAt: new Date(),
      });
    }
  } catch (logErr) {
    console.warn('[Admin Security] Firestore log warning:', logErr.message);
  }

  // 2. Dispatch email notification via nodemailer safely
  try {
    const mailer = getTransporter();
    const fromAddress = process.env.SMTP_FROM || process.env.SMTP_USER || 'CollabCode Security <no-reply@collabcode.internal>';

    const info = await mailer.sendMail({
      from: fromAddress,
      to: alertEmail,
      subject,
      text: plainText,
      html,
    });

    console.log(`[Admin Security Alert] Alert generated for ${status} from IP ${ip}. Message ID: ${info?.messageId || 'local-dispatch'}`);
    return { success: true, messageId: info?.messageId };
  } catch (emailErr) {
    console.error('[Admin Security Alert] Email dispatch warning (auth unaffected):', emailErr.message);
    return { success: false, error: emailErr.message };
  }
}
