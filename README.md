# Star Beauty Make-Up Studio

A full-featured web application and installable Progressive Web App (PWA) for **Star Beauty Make-Up Studio**, designed for ladies salon & bridal make-up booking, online advance/full payment tracking, verified client testimonials, automated email notifications, and studio administration.

---

## Key Features

### Customer Experience
- **Service Menu & Search**: Browse curated treatments across **Makeup**, **Hair Artistry**, **Facial & Skin**, and **Nails & Lashes**, with live keyword search, category filtering, duration, pricing, and 30% deposit estimates.
- **Mobile + 4-Digit OTP Authentication**: Customers sign in or sign up using a pre-filled `+91` (India) 10-digit mobile number and 4-digit OTP verification before booking appointments or posting reviews.
- **Online Appointment Booking & Payment Options**: Choose a treatment, specialist artist (filtered by weekly shift availability), date/time slot, and pay either **30% Advance Deposit** or **100% Full Payment** via UPI, Card, NetBanking, or Desk Cash.
- **My Bookings**: Authenticated customers can view upcoming and past appointments, payment balances, and transaction references.
- **Client Reviews & Testimonials**: Public testimonial showcase featuring verified client ratings, service tags, and review submission for signed-in customers.

### Admin Studio Console
Accessible to verified administrators (`deepaks85@gmail.com`) via Google Sign-In:
- **Appointments & Walk-In Desk**: Update booking statuses (`Confirmed`, `In Progress`, `Completed`, `Cancelled`), collect remaining balances, and register walk-in appointments.
- **Customer History**: Search customer profiles, preferred stylists, visit history, and lifetime spend.
- **Service Menu & Staff Schedules**: Add, edit, or toggle studio services and manage artist weekly shift days and hours.
- **Daily Staff Attendance**: Record `Present`, `Half Day`, `Absent`, or `On Leave` with check-in/check-out times.
- **Revenue Reports & CSV Export**: Track collected revenue, pending balances, and service-category breakdowns, with CSV export.
- **Automated Email Logs**: Audit booking confirmation and reminder emails dispatched via Firebase Cloud Functions.

### PWA & Google Play Store Readiness
- **Installable PWA**: Configured with `vite-plugin-pwa`, standalone app manifest, custom 192px/512px/maskable/Apple touch icons, offline detection banner, and in-app **Install App** button (`PWAInstallButton`).
- **Play Store Packaging**: Includes Bubblewrap Trusted Web Activity config (`twa-manifest.json`), Digital Asset Links template (`public/.well-known/assetlinks.json`), and step-by-step instructions in `PLAY_STORE_PUBLISHING_GUIDE.md`.

---

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS v4, Lucide Icons, Motion
- **Backend & Database**: Firebase Authentication (Phone OTP + Google Sign-In), Cloud Firestore (named database `ai-studio-60a0bbe6-c834-4ad2-96e3-81afece332a6`)
- **Cloud Functions**: Firebase Functions v2 (`firebase-admin`, `firebase-functions`, `nodemailer`) for automated emails
- **PWA / Mobile**: `vite-plugin-pwa` (Workbox), Trusted Web Activity (`twa-manifest.json`)

---

## Project Structure

```text
├── public/
│   ├── .well-known/assetlinks.json   # Android Digital Asset Links template
│   ├── apple-touch-icon.png          # iOS home screen icon (180x180)
│   ├── icon.svg                      # Brand vector icon
│   ├── pwa-192x192.png               # Standard PWA icon (192x192)
│   ├── pwa-512x512.png               # Standard PWA icon (512x512)
│   └── pwa-maskable-512x512.png      # Android adaptive maskable icon (512x512)
├── src/
│   ├── assets/images/                # Studio & service category photography
│   ├── components/
│   │   ├── AdminDashboard.tsx        # Admin console (bookings, CRM, staff, attendance, revenue, emails)
│   │   ├── BookingModal.tsx          # Appointment scheduling & 30%/100% payment modal
│   │   ├── CustomerBookingsView.tsx  # Customer appointment & balance history
│   │   ├── IndiaPhoneInput.tsx       # +91 10-digit enforced phone field
│   │   ├── MobileAuthModal.tsx       # Mobile + 4-digit OTP sign-in/sign-up modal
│   │   ├── OfflineIndicator.tsx      # Offline status banner
│   │   ├── PWAInstallButton.tsx      # Android/Chrome install prompt & iOS Safari guide
│   │   ├── StudioImage.tsx           # Branded studio imagery wrapper
│   │   └── TestimonialsSection.tsx   # Client ratings & review submission section
│   ├── data/seedSalonData.ts         # Default service menu, staff, and review seed data
│   ├── hooks/usePWAInstall.ts        # PWA install prompt & standalone state hook
│   ├── lib/firebase.ts               # Firebase Auth & named Firestore client initialization
│   ├── services/salonApi.ts          # Firestore real-time subscriptions & CRUD operations
│   ├── types/salon.ts                # TypeScript domain models & currency/formatting helpers
│   ├── App.tsx                       # Storefront, navigation, and view routing
│   ├── index.css                     # Typography & theme styles
│   └── main.tsx                      # React entry point
├── functions/
│   ├── src/index.ts                  # Booking confirmation & reminder email Cloud Functions
│   ├── package.json                  # Cloud Functions dependencies
│   └── README.md                     # Functions deployment guide
├── firebase.json                     # Firestore rules & Functions configuration
├── firestore.rules                   # Role-based & customer-scoped Firestore security rules
├── firebase-blueprint.json           # Firestore schema blueprint
├── twa-manifest.json                 # Bubblewrap config for Google Play Store (.aab)
├── PLAY_STORE_PUBLISHING_GUIDE.md    # Step-by-step Play Store publishing instructions
└── vite.config.ts                    # Vite + Tailwind + VitePWA configuration
```

---

## Getting Started

### Prerequisites
- Node.js 18+ (Node.js 20 recommended for Firebase Cloud Functions)
- Firebase project configured in `firebase-applet-config.json`

### Install Dependencies & Run Locally

```bash
npm install
npm run dev
```

The development server runs on `http://localhost:3000`.

### Available Scripts

| Script | Description |
| :--- | :--- |
| `npm run dev` | Starts Vite development server on port `3000` |
| `npm run build` | Builds production web bundle and PWA service worker (`dist/`) |
| `npm run preview` | Previews the production build locally |
| `npm run lint` | Runs TypeScript type-checking (`tsc --noEmit`) |
| `npm run clean` | Removes build artifacts (`dist`, `server.js`) |

---

## Firebase & Cloud Functions Setup

1. **Authentication**:
   - Enable **Phone** authentication (for customer `+91` 10-digit OTP login) and **Google** authentication (for admin studio login) in Firebase Console.
2. **Firestore Security Rules**:
   - Rules are defined in `firestore.rules` targeting database `ai-studio-60a0bbe6-c834-4ad2-96e3-81afece332a6`.
   - Validate rules locally with ESLint:
     ```bash
     npx eslint firestore.rules
     ```
3. **Automated Emails (`functions/`)**:
   - `onAppointmentCreated`: Sends booking confirmation emails on new appointments.
   - `sendAppointmentReminders`: Scheduled reminder job for upcoming sessions.
   - `sendManualReminderEmail`: Admin-triggered reminder dispatch.
   - See `functions/README.md` for SMTP secret setup (`SMTP_USER`, `SMTP_PASS`) and deployment (`firebase deploy --only functions`).

---

## Publishing to Google Play Store

To package this PWA as a Google Play Store Android App Bundle (`.aab`) using **Bubblewrap (TWA)** or **Capacitor**, follow the instructions in `PLAY_STORE_PUBLISHING_GUIDE.md`.
