import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { defineSecret, defineString } from 'firebase-functions/params';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as logger from 'firebase-functions/logger';
import nodemailer from 'nodemailer';

const DATABASE_ID = 'ai-studio-60a0bbe6-c834-4ad2-96e3-81afece332a6';
const ADMIN_EMAIL = 'deepaks85@gmail.com';

initializeApp();
const db = getFirestore(DATABASE_ID);

// Configure via:
// firebase functions:secrets:set SMTP_USER
// firebase functions:secrets:set SMTP_PASS
const smtpHost = defineString('SMTP_HOST', { default: 'smtp.gmail.com' });
const smtpPort = defineString('SMTP_PORT', { default: '465' });
const smtpFrom = defineString('SMTP_FROM', {
  default: 'Star Beauty Make-Up Studio <bookings@starbeautystudio.in>',
});
const smtpUser = defineSecret('SMTP_USER');
const smtpPass = defineSecret('SMTP_PASS');

interface AppointmentDoc {
  id: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  serviceName: string;
  serviceCategory: string;
  staffName: string;
  appointmentDate: string;
  appointmentTime: string;
  durationMins: number;
  totalAmount: number;
  paymentPlan: 'advance' | 'full';
  amountPaid: number;
  balanceDue: number;
  paymentMethod: string;
  paymentStatus: string;
  transactionRef: string;
  status: string;
}

function formatInr(amount: number): string {
  return `₹${Math.round(amount).toLocaleString('en-IN')}`;
}

function createTransporter() {
  const user = smtpUser.value();
  const pass = smtpPass.value();
  if (!user || !pass) {
    throw new Error('SMTP_USER and SMTP_PASS secrets are not configured.');
  }
  const port = Number(smtpPort.value() || '465');
  return nodemailer.createTransport({
    host: smtpHost.value() || 'smtp.gmail.com',
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

function buildConfirmationHtml(apt: AppointmentDoc): string {
  return `
  <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; background: #FAF7F4; color: #1C1917; border: 1px solid #E5DDD5; border-radius: 10px; overflow: hidden;">
    <div style="background: #8E3B46; color: #FFFFFF; padding: 24px 28px;">
      <p style="margin: 0; font-family: sans-serif; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase;">Star Beauty Make-Up Studio</p>
      <h1 style="margin: 6px 0 0; font-size: 26px; font-weight: 600;">Appointment Confirmed</h1>
    </div>
    <div style="padding: 24px 28px; font-family: sans-serif; font-size: 14px; line-height: 1.6;">
      <p>Dear ${apt.customerName},</p>
      <p>Thank you for reserving your session at <strong>Star Beauty Make-Up Studio</strong>. Your booking and payment details are confirmed below:</p>
      <table style="width: 100%; border-collapse: collapse; margin: 18px 0; background: #FFFFFF; border: 1px solid #E5DDD5;">
        <tr><td style="padding: 10px 14px; border-bottom: 1px solid #E5DDD5; color: #57534E;">Treatment</td><td style="padding: 10px 14px; border-bottom: 1px solid #E5DDD5; font-weight: 600;">${apt.serviceName}</td></tr>
        <tr><td style="padding: 10px 14px; border-bottom: 1px solid #E5DDD5; color: #57534E;">Artist</td><td style="padding: 10px 14px; border-bottom: 1px solid #E5DDD5;">${apt.staffName}</td></tr>
        <tr><td style="padding: 10px 14px; border-bottom: 1px solid #E5DDD5; color: #57534E;">Date & Time</td><td style="padding: 10px 14px; border-bottom: 1px solid #E5DDD5;">${apt.appointmentDate} at ${apt.appointmentTime} (${apt.durationMins} mins)</td></tr>
        <tr><td style="padding: 10px 14px; border-bottom: 1px solid #E5DDD5; color: #57534E;">Amount Paid (${apt.paymentMethod})</td><td style="padding: 10px 14px; border-bottom: 1px solid #E5DDD5; font-weight: 600; color: #15803D;">${formatInr(apt.amountPaid)} (${apt.paymentStatus})</td></tr>
        <tr><td style="padding: 10px 14px; border-bottom: 1px solid #E5DDD5; color: #57534E;">Balance Due at Studio</td><td style="padding: 10px 14px; border-bottom: 1px solid #E5DDD5;">${formatInr(apt.balanceDue)}</td></tr>
        <tr><td style="padding: 10px 14px; color: #57534E;">Transaction Ref</td><td style="padding: 10px 14px; font-family: monospace;">${apt.transactionRef}</td></tr>
      </table>
      <p style="font-size: 13px; color: #57534E;">Please arrive 10 minutes prior to your scheduled time. Registered mobile: ${apt.customerPhone}.</p>
      <p style="margin-top: 20px;">Warm regards,<br/><strong>Star Beauty Make-Up Studio</strong></p>
    </div>
  </div>`;
}

function buildReminderHtml(apt: AppointmentDoc): string {
  return `
  <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; background: #FAF7F4; color: #1C1917; border: 1px solid #E5DDD5; border-radius: 10px; overflow: hidden;">
    <div style="background: #1C1917; color: #FFFFFF; padding: 24px 28px;">
      <p style="margin: 0; font-family: sans-serif; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase;">Appointment Reminder</p>
      <h1 style="margin: 6px 0 0; font-size: 26px; font-weight: 600;">See You Tomorrow at Star Beauty</h1>
    </div>
    <div style="padding: 24px 28px; font-family: sans-serif; font-size: 14px; line-height: 1.6;">
      <p>Dear ${apt.customerName},</p>
      <p>This is a friendly reminder for your upcoming appointment tomorrow at <strong>Star Beauty Make-Up Studio</strong>:</p>
      <table style="width: 100%; border-collapse: collapse; margin: 18px 0; background: #FFFFFF; border: 1px solid #E5DDD5;">
        <tr><td style="padding: 10px 14px; border-bottom: 1px solid #E5DDD5; color: #57534E;">Treatment</td><td style="padding: 10px 14px; border-bottom: 1px solid #E5DDD5; font-weight: 600;">${apt.serviceName}</td></tr>
        <tr><td style="padding: 10px 14px; border-bottom: 1px solid #E5DDD5; color: #57534E;">Artist</td><td style="padding: 10px 14px; border-bottom: 1px solid #E5DDD5;">${apt.staffName}</td></tr>
        <tr><td style="padding: 10px 14px; border-bottom: 1px solid #E5DDD5; color: #57534E;">Date & Time</td><td style="padding: 10px 14px; border-bottom: 1px solid #E5DDD5;">${apt.appointmentDate} at ${apt.appointmentTime}</td></tr>
        <tr><td style="padding: 10px 14px; color: #57534E;">Balance Due at Studio</td><td style="padding: 10px 14px;">${formatInr(apt.balanceDue)}</td></tr>
      </table>
      <p style="font-size: 13px; color: #57534E;">If you need to reschedule, please manage your booking from the My Bookings page.</p>
      <p style="margin-top: 20px;">Warm regards,<br/><strong>Star Beauty Make-Up Studio</strong></p>
    </div>
  </div>`;
}

async function writeEmailLog(params: {
  logId: string;
  appointment: AppointmentDoc;
  emailType: 'confirmation' | 'reminder';
  subject: string;
  status: 'Sent' | 'Failed';
  errorMessage?: string;
}) {
  const payload: Record<string, unknown> = {
    id: params.logId,
    appointmentId: params.appointment.id,
    customerName: params.appointment.customerName,
    recipientEmail: params.appointment.customerEmail,
    emailType: params.emailType,
    subject: params.subject,
    status: params.status,
    scheduledDate: params.appointment.appointmentDate,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (params.errorMessage) {
    payload.errorMessage = params.errorMessage.slice(0, 300);
  }
  await db.collection('emailLogs').doc(params.logId).set(payload, { merge: true });
}

/**
 * 1. Firestore Trigger: Sends automated booking confirmation email when an appointment is created.
 */
export const onAppointmentCreated = onDocumentCreated(
  {
    document: 'appointments/{appointmentId}',
    database: DATABASE_ID,
    secrets: [smtpUser, smtpPass],
  },
  async (event) => {
    const data = event.data?.data() as AppointmentDoc | undefined;
    if (!data || !data.customerEmail) return;

    const subject = `Booking Confirmed: ${data.serviceName} on ${data.appointmentDate}`;
    const logId = `conf_${data.id}`;

    try {
      const transporter = createTransporter();
      await transporter.sendMail({
        from: smtpFrom.value(),
        to: data.customerEmail,
        subject,
        text: `Hi ${data.customerName}, your ${data.serviceName} appointment with ${data.staffName} on ${data.appointmentDate} at ${data.appointmentTime} is confirmed. Paid: ${formatInr(data.amountPaid)}. Ref: ${data.transactionRef}.`,
        html: buildConfirmationHtml(data),
      });

      await writeEmailLog({
        logId,
        appointment: data,
        emailType: 'confirmation',
        subject,
        status: 'Sent',
      });
      logger.info('Sent booking confirmation email', { appointmentId: data.id });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('Failed booking confirmation email', { appointmentId: data.id, error: msg });
      await writeEmailLog({
        logId,
        appointment: data,
        emailType: 'confirmation',
        subject,
        status: 'Failed',
        errorMessage: msg,
      });
    }
  }
);

/**
 * 2. Scheduled Function: Dispatches appointment reminder emails 24 hours prior to the visit.
 */
export const sendAppointmentReminders = onSchedule(
  {
    schedule: 'every 1 hours',
    timeZone: 'Asia/Kolkata',
    secrets: [smtpUser, smtpPass],
  },
  async () => {
    const now = new Date();
    const istOffsetMs = 5.5 * 60 * 60 * 1000;
    const tomorrowIst = new Date(now.getTime() + istOffsetMs + 24 * 60 * 60 * 1000);
    const tomorrowStr = tomorrowIst.toISOString().slice(0, 10);

    const snap = await db
      .collection('appointments')
      .where('appointmentDate', '==', tomorrowStr)
      .where('status', '==', 'Confirmed')
      .get();

    if (snap.empty) {
      logger.info('No confirmed appointments found for reminder window', { tomorrowStr });
      return;
    }

    let transporter: nodemailer.Transporter;
    try {
      transporter = createTransporter();
    } catch (err) {
      logger.error('SMTP secrets missing for reminder run', err);
      return;
    }

    for (const docSnap of snap.docs) {
      const apt = docSnap.data() as AppointmentDoc;
      if (!apt.customerEmail) continue;

      const logId = `rem_${apt.id}`;
      const existingLog = await db.collection('emailLogs').doc(logId).get();
      if (existingLog.exists && existingLog.data()?.status === 'Sent') {
        continue;
      }

      const subject = `Reminder: ${apt.serviceName} tomorrow at ${apt.appointmentTime}`;
      try {
        await transporter.sendMail({
          from: smtpFrom.value(),
          to: apt.customerEmail,
          subject,
          text: `Reminder: ${apt.customerName}, you have ${apt.serviceName} with ${apt.staffName} tomorrow (${apt.appointmentDate}) at ${apt.appointmentTime}.`,
          html: buildReminderHtml(apt),
        });

        await writeEmailLog({
          logId,
          appointment: apt,
          emailType: 'reminder',
          subject,
          status: 'Sent',
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await writeEmailLog({
          logId,
          appointment: apt,
          emailType: 'reminder',
          subject,
          status: 'Failed',
          errorMessage: msg,
        });
      }
    }
  }
);

/**
 * 3. Callable Function: Allows Admin Studio to send an immediate appointment reminder email.
 */
export const sendManualReminderEmail = onCall(
  {
    secrets: [smtpUser, smtpPass],
  },
  async (request) => {
    const email = request.auth?.token?.email;
    const verified = request.auth?.token?.email_verified;
    if (!request.auth || !verified || email !== ADMIN_EMAIL) {
      throw new HttpsError('permission-denied', 'Admin authentication required.');
    }

    const appointmentId = String(request.data?.appointmentId || '').trim();
    if (!appointmentId) {
      throw new HttpsError('invalid-argument', 'appointmentId is required.');
    }

    const aptSnap = await db.collection('appointments').doc(appointmentId).get();
    if (!aptSnap.exists) {
      throw new HttpsError('not-found', 'Appointment not found.');
    }

    const apt = aptSnap.data() as AppointmentDoc;
    const subject = `Reminder: ${apt.serviceName} on ${apt.appointmentDate} at ${apt.appointmentTime}`;
    const logId = `rem_${apt.id}`;

    const transporter = createTransporter();
    await transporter.sendMail({
      from: smtpFrom.value(),
      to: apt.customerEmail,
      subject,
      text: `Reminder: ${apt.customerName}, your ${apt.serviceName} appointment with ${apt.staffName} is scheduled for ${apt.appointmentDate} at ${apt.appointmentTime}.`,
      html: buildReminderHtml(apt),
    });

    await writeEmailLog({
      logId,
      appointment: apt,
      emailType: 'reminder',
      subject,
      status: 'Sent',
    });

    return { ok: true, logId };
  }
);
