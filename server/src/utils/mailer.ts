import fs from 'node:fs';
import path from 'node:path';
import nodemailer from 'nodemailer';
import config from '../config/index.js';

export const isSmtpConfigured = (): boolean => {
  return !!(config.SMTP_USER && config.SMTP_PASS && config.SMTP_USER.trim() !== '' && config.SMTP_PASS.trim() !== '');
};

export const sendOtpEmail = async (email: string, otp: string): Promise<boolean> => {
  const hasSmtp = isSmtpConfigured();

  // If console OTP mode is enabled or SMTP is unconfigured, print clearly to stdout
  if (config.DEV_OTP_CONSOLE || !hasSmtp) {
    console.log('\n======================================================');
    console.log(`🔐 [DEV MODE] ONE-TIME PASSWORD (OTP) FOR: ${email}`);
    console.log(`🔑 CODE:  [ ${otp} ]`);
    console.log(`⏱️  VALID FOR: ${config.OTP_EXPIRY_MINUTES} minutes`);
    if (!hasSmtp) {
      console.log('ℹ️  SMTP_USER / SMTP_PASS not set in .env. Real email delivery skipped.');
    }
    console.log('======================================================\n');
  }

  // If real SMTP is configured, send the actual email
  if (hasSmtp) {
    try {
      const isGmail = config.SMTP_HOST.includes('gmail.com');
      const transporter = nodemailer.createTransport(
        isGmail
          ? {
              service: 'gmail',
              auth: {
                user: config.SMTP_USER,
                pass: config.SMTP_PASS,
              },
            }
          : {
              host: config.SMTP_HOST,
              port: config.SMTP_PORT,
              secure: config.SMTP_SECURE,
              auth: {
                user: config.SMTP_USER,
                pass: config.SMTP_PASS,
              },
            }
      );

      await transporter.sendMail({
        from: config.SMTP_FROM,
        to: email,
        subject: `Your VIT Cloud Storage Verification Code: ${otp}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px;">
            <h2 style="color: #0284c7; margin-bottom: 8px;">VIT Private Cloud Storage</h2>
            <p style="color: #475569; font-size: 14px;">Use the following One-Time Password to complete your sign-in to your private storage vault.</p>
            <div style="background-color: #f0f9ff; padding: 16px; border-radius: 8px; text-align: center; margin: 24px 0;">
              <span style="font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #0369a1;">${otp}</span>
            </div>
            <p style="color: #64748b; font-size: 12px;">This code will expire in ${config.OTP_EXPIRY_MINUTES} minutes. If you did not request this login, please ignore this email.</p>
          </div>
        `,
      });
      console.log(`✉️  [SMTP SUCCESS] Real email dispatched to ${email}`);
    } catch (error) {
      console.error('⚠️  Failed to dispatch email via SMTP:', error);
    }
  }

  // Always write latest OTP locally for presentation backup & development
  const otpDetails = `Email: ${email}\nOTP: ${otp}\nGenerated: ${new Date().toLocaleTimeString()}\nValid For: ${config.OTP_EXPIRY_MINUTES} minutes\n`;
  try {
    fs.writeFileSync(path.resolve(process.cwd(), 'storage/latest_otp.txt'), otpDetails);
  } catch {}
  try {
    fs.writeFileSync(path.resolve(process.cwd(), '../storage/latest_otp.txt'), otpDetails);
  } catch {}

  return true;
};

export default { isSmtpConfigured, sendOtpEmail };
