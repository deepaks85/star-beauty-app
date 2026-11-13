import { Timestamp } from 'firebase/firestore';

export const ADMIN_EMAIL = 'deepaks85@gmail.com';

export type ServiceCategory = 'Makeup' | 'Hair Artistry' | 'Facial & Skin' | 'Nails & Lashes';
export type ImageKey = 'bridal_makeup' | 'hair_spa' | 'skincare_facial' | 'nail_lash';
export type DayCode = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';

export type PaymentPlan = 'advance' | 'full';
export type PaymentMethod = 'Card' | 'UPI' | 'NetBanking' | 'Cash';
export type PaymentStatus = 'Advance Paid' | 'Paid in Full' | 'Pending' | 'Refunded';
export type AppointmentStatus = 'Confirmed' | 'In Progress' | 'Completed' | 'Cancelled';
export type AttendanceStatus = 'Present' | 'Half Day' | 'Absent' | 'On Leave';

export const SERVICE_CATEGORIES: ServiceCategory[] = [
  'Makeup',
  'Hair Artistry',
  'Facial & Skin',
  'Nails & Lashes',
];

export const ALL_DAYS: DayCode[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export const IMAGE_MAP: Record<ImageKey | 'hero', string> = {
  hero: '/src/assets/images/hero_beauty_studio_1794566054805.jpg',
  bridal_makeup: '/src/assets/images/service_bridal_makeup_1794566055161.jpg',
  hair_spa: '/src/assets/images/service_hair_spa_1794566054616.jpg',
  skincare_facial: '/src/assets/images/service_skincare_facial_1794566055105.jpg',
  nail_lash: '/src/assets/images/service_nail_lash_1794566056138.jpg',
};

export const CATEGORY_DEFAULT_IMAGE: Record<ServiceCategory, ImageKey> = {
  Makeup: 'bridal_makeup',
  'Hair Artistry': 'hair_spa',
  'Facial & Skin': 'skincare_facial',
  'Nails & Lashes': 'nail_lash',
};

export interface ServiceItem {
  id: string;
  name: string;
  category: ServiceCategory;
  description: string;
  durationMins: number;
  price: number;
  featured: boolean;
  active: boolean;
  imageKey: ImageKey;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface StaffMember {
  id: string;
  name: string;
  role: string;
  specialty: string;
  shiftDays: DayCode[];
  shiftStart: string;
  shiftEnd: string;
  active: boolean;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface CustomerProfile {
  id: string;
  uid: string;
  name: string;
  email: string;
  phone: string;
  preferredStylist?: string;
  notes?: string;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface Appointment {
  id: string;
  customerUid: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  serviceId: string;
  serviceName: string;
  serviceCategory: ServiceCategory;
  staffId: string;
  staffName: string;
  appointmentDate: string; // YYYY-MM-DD
  appointmentTime: string; // HH:mm
  durationMins: number;
  totalAmount: number;
  paymentPlan: PaymentPlan;
  amountPaid: number;
  balanceDue: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  transactionRef: string;
  status: AppointmentStatus;
  notes?: string;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface AttendanceRecord {
  id: string;
  staffId: string;
  staffName: string;
  date: string; // YYYY-MM-DD
  status: AttendanceStatus;
  checkIn?: string;
  checkOut?: string;
  notes?: string;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface ClientReview {
  id: string;
  reviewerUid: string;
  clientName: string;
  clientContext: string;
  serviceId: string;
  serviceName: string;
  rating: number;
  comment: string;
  visitDate: string;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface EmailLog {
  id: string;
  appointmentId: string;
  customerName: string;
  recipientEmail: string;
  emailType: 'confirmation' | 'reminder';
  subject: string;
  status: 'Queued' | 'Sent' | 'Failed';
  scheduledDate: string;
  errorMessage?: string;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export const FIELD_LIMITS = {
  idMax: 64,
  idPattern: /^[a-zA-Z0-9_-]+$/,
  nameMax: 80,
  serviceNameMax: 100,
  descMax: 400,
  emailMax: 120,
  phoneMax: 30,
  notesMax: 300,
  customerNotesMax: 500,
  attendanceNotesMax: 200,
  datePattern: /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/,
  timePattern: /^[0-9]{2}:[0-9]{2}$/,
} as const;

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(Math.round(amount));
}

export function getDayCodeFromDate(dateStr: string): DayCode {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  const idx = dt.getDay(); // 0 = Sun
  const map: DayCode[] = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return map[idx] ?? 'Mon';
}

export function getLocalIsoDate(offsetDays = 0): string {
  const dt = new Date();
  dt.setDate(dt.getDate() + offsetDays);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function sanitizeId(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, FIELD_LIMITS.idMax);
}

export function normalizeIndiaDigits(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) {
    return digits.slice(2, 12);
  }
  return digits.slice(0, 10);
}

export function formatIndiaPhone(digits: string): string {
  const clean = normalizeIndiaDigits(digits);
  return clean ? `+91${clean}` : '+91';
}

export function isValidIndiaPhoneDigits(digits: string): boolean {
  return /^[0-9]{10}$/.test(digits);
}

