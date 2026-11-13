# Firebase Cloud Functions — Star Beauty Make-Up Studio

Automated email notifications for booking confirmations (`onAppointmentCreated`), scheduled 24-hour appointment reminders (`sendAppointmentReminders`), and admin-triggered reminders (`sendManualReminderEmail`).

## Setup & Deployment

1. Enable **Phone Authentication** in the Firebase Console (`gen-lang-client-0621241830` → Authentication → Sign-in method → Phone). For sandbox/local testing, add Firebase test phone numbers with `+91` (e.g. `+919876543210` with OTP `123456`).
2. Install function dependencies:
   ```bash
   cd functions && npm install
   ```
3. Configure SMTP secrets for Nodemailer:
   ```bash
   firebase functions:secrets:set SMTP_USER
   firebase functions:secrets:set SMTP_PASS
   ```
4. Deploy functions to Firebase:
   ```bash
   firebase deploy --only functions
   ```
