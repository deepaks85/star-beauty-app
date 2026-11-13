import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import {
  SEED_REVIEWS,
  SEED_SERVICES,
  SEED_STAFF,
  buildSeedAppointments,
  buildSeedAttendance,
  buildSeedCustomers,
} from '../data/seedSalonData';
import { OperationType, auth, db, functions, handleFirestoreError } from '../lib/firebase';
import {
  Appointment,
  AppointmentStatus,
  AttendanceRecord,
  AttendanceStatus,
  ClientReview,
  CustomerProfile,
  EmailLog,
  FIELD_LIMITS,
  PaymentMethod,
  PaymentPlan,
  ServiceItem,
  StaffMember,
  sanitizeId,
} from '../types/salon';

function clip(val: string, max: number): string {
  return val.trim().slice(0, max);
}

// ============================================================================
// Real-time Subscriptions
// ============================================================================

export function subscribeServices(
  onData: (services: ServiceItem[]) => void,
  onError?: (err: unknown) => void
): () => void {
  const path = 'services';
  return onSnapshot(
    collection(db, path),
    (snap) => {
      const items = snap.docs.map((d) => d.data() as ServiceItem);
      items.sort((a, b) => Number(b.featured) - Number(a.featured) || a.name.localeCompare(b.name));
      onData(items);
    },
    (error) => {
      if (onError) onError(error);
      else handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export function subscribeStaff(
  onData: (staff: StaffMember[]) => void,
  onError?: (err: unknown) => void
): () => void {
  const path = 'staff';
  return onSnapshot(
    collection(db, path),
    (snap) => {
      const items = snap.docs.map((d) => d.data() as StaffMember);
      items.sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
      onData(items);
    },
    (error) => {
      if (onError) onError(error);
      else handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export function subscribeCustomerAppointments(
  uid: string,
  onData: (appointments: Appointment[]) => void,
  onError?: (err: unknown) => void
): () => void {
  const path = 'appointments';
  const q = query(collection(db, path), where('customerUid', '==', uid));
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((d) => d.data() as Appointment);
      items.sort((a, b) =>
        `${b.appointmentDate} ${b.appointmentTime}`.localeCompare(
          `${a.appointmentDate} ${a.appointmentTime}`
        )
      );
      onData(items);
    },
    (error) => {
      if (onError) onError(error);
      else handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export function subscribeAllAppointments(
  onData: (appointments: Appointment[]) => void,
  onError?: (err: unknown) => void
): () => void {
  const path = 'appointments';
  return onSnapshot(
    collection(db, path),
    (snap) => {
      const items = snap.docs.map((d) => d.data() as Appointment);
      items.sort((a, b) =>
        `${b.appointmentDate} ${b.appointmentTime}`.localeCompare(
          `${a.appointmentDate} ${a.appointmentTime}`
        )
      );
      onData(items);
    },
    (error) => {
      if (onError) onError(error);
      else handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export function subscribeAllCustomers(
  onData: (customers: CustomerProfile[]) => void,
  onError?: (err: unknown) => void
): () => void {
  const path = 'customers';
  return onSnapshot(
    collection(db, path),
    (snap) => {
      const items = snap.docs.map((d) => d.data() as CustomerProfile);
      items.sort((a, b) => a.name.localeCompare(b.name));
      onData(items);
    },
    (error) => {
      if (onError) onError(error);
      else handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export function subscribeAllAttendance(
  onData: (records: AttendanceRecord[]) => void,
  onError?: (err: unknown) => void
): () => void {
  const path = 'attendance';
  return onSnapshot(
    collection(db, path),
    (snap) => {
      const items = snap.docs.map((d) => d.data() as AttendanceRecord);
      items.sort((a, b) => b.date.localeCompare(a.date) || a.staffName.localeCompare(b.staffName));
      onData(items);
    },
    (error) => {
      if (onError) onError(error);
      else handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export function subscribeReviews(
  onData: (reviews: ClientReview[]) => void,
  onError?: (err: unknown) => void
): () => void {
  const path = 'reviews';
  return onSnapshot(
    collection(db, path),
    (snap) => {
      const items = snap.docs.map((d) => d.data() as ClientReview);
      items.sort((a, b) => {
        const aSec = a.createdAt?.seconds ?? 0;
        const bSec = b.createdAt?.seconds ?? 0;
        return bSec - aSec || b.rating - a.rating;
      });
      onData(items);
    },
    (error) => {
      if (onError) onError(error);
      else handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export function subscribeEmailLogs(
  onData: (logs: EmailLog[]) => void,
  onError?: (err: unknown) => void
): () => void {
  const path = 'emailLogs';
  return onSnapshot(
    collection(db, path),
    (snap) => {
      const items = snap.docs.map((d) => d.data() as EmailLog);
      items.sort((a, b) => {
        const aSec = a.createdAt?.seconds ?? 0;
        const bSec = b.createdAt?.seconds ?? 0;
        return bSec - aSec;
      });
      onData(items);
    },
    (error) => {
      if (onError) onError(error);
      else handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

// ============================================================================
// Admin Bootstrapping & Seed Management
// ============================================================================

export async function ensureStudioSeededIfEmpty(force = false): Promise<boolean> {
  try {
    const servicesSnap = await getDocs(collection(db, 'services'));
    const staffSnap = await getDocs(collection(db, 'staff'));

    if (!force && !servicesSnap.empty && !staffSnap.empty) {
      return false;
    }

    const batch = writeBatch(db);

    if (force || servicesSnap.empty) {
      for (const svc of SEED_SERVICES) {
        batch.set(doc(db, 'services', svc.id), {
          ...svc,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    }

    if (force || staffSnap.empty) {
      for (const stf of SEED_STAFF) {
        batch.set(doc(db, 'staff', stf.id), {
          ...stf,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    }

    const custSnap = await getDocs(collection(db, 'customers'));
    if (force || custSnap.empty) {
      for (const c of buildSeedCustomers()) {
        batch.set(doc(db, 'customers', c.id), {
          ...c,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    }

    const aptSnap = await getDocs(collection(db, 'appointments'));
    if (force || aptSnap.empty) {
      for (const apt of buildSeedAppointments()) {
        const cleanApt: Record<string, unknown> = {
          id: apt.id,
          customerUid: apt.customerUid,
          customerName: apt.customerName,
          customerEmail: apt.customerEmail,
          customerPhone: apt.customerPhone,
          serviceId: apt.serviceId,
          serviceName: apt.serviceName,
          serviceCategory: apt.serviceCategory,
          staffId: apt.staffId,
          staffName: apt.staffName,
          appointmentDate: apt.appointmentDate,
          appointmentTime: apt.appointmentTime,
          durationMins: apt.durationMins,
          totalAmount: apt.totalAmount,
          paymentPlan: apt.paymentPlan,
          amountPaid: apt.amountPaid,
          balanceDue: apt.balanceDue,
          paymentMethod: apt.paymentMethod,
          paymentStatus: apt.paymentStatus,
          transactionRef: apt.transactionRef,
          status: apt.status,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        if (apt.notes) cleanApt.notes = apt.notes;
        batch.set(doc(db, 'appointments', apt.id), cleanApt);
      }
    }

    const attSnap = await getDocs(collection(db, 'attendance'));
    if (force || attSnap.empty) {
      for (const rec of buildSeedAttendance()) {
        const cleanRec: Record<string, unknown> = {
          id: rec.id,
          staffId: rec.staffId,
          staffName: rec.staffName,
          date: rec.date,
          status: rec.status,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        if (rec.checkIn) cleanRec.checkIn = rec.checkIn;
        if (rec.checkOut) cleanRec.checkOut = rec.checkOut;
        if (rec.notes) cleanRec.notes = rec.notes;
        batch.set(doc(db, 'attendance', rec.id), cleanRec);
      }
    }

    const revSnap = await getDocs(collection(db, 'reviews'));
    if (force || revSnap.empty) {
      for (const rev of SEED_REVIEWS) {
        batch.set(doc(db, 'reviews', rev.id), {
          ...rev,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    }

    await batch.commit();
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'seed');
  }
}

// ============================================================================
// Customer Booking & Payment
// ============================================================================

export interface CreateBookingInput {
  service: ServiceItem;
  staff: StaffMember;
  appointmentDate: string;
  appointmentTime: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  paymentPlan: PaymentPlan;
  paymentMethod: PaymentMethod;
  notes?: string;
  asAdminWalkIn?: boolean;
  customerUidOverride?: string;
}

export async function createAppointmentBooking(
  input: CreateBookingInput
): Promise<Appointment> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Authentication required before confirming a booking.');
  }

  const appointmentId = sanitizeId(
    `apt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
  );
  const customerUid = input.asAdminWalkIn && input.customerUidOverride
    ? sanitizeId(input.customerUidOverride)
    : sanitizeId(user.uid);

  const totalAmount = Number(input.service.price);
  const amountPaid =
    input.paymentPlan === 'full' ? totalAmount : Math.round(totalAmount * 0.3);
  const balanceDue = Math.max(0, totalAmount - amountPaid);
  const paymentStatus =
    input.paymentPlan === 'full' ? 'Paid in Full' : 'Advance Paid';
  const transactionRef = sanitizeId(
    `TXN_SB_${Date.now().toString().slice(-6)}_${Math.floor(100 + Math.random() * 899)}`
  );

  const payload: Record<string, unknown> = {
    id: appointmentId,
    customerUid,
    customerName: clip(input.customerName, FIELD_LIMITS.nameMax),
    customerEmail: clip(input.customerEmail, FIELD_LIMITS.emailMax),
    customerPhone: clip(input.customerPhone, FIELD_LIMITS.phoneMax),
    serviceId: sanitizeId(input.service.id),
    serviceName: clip(input.service.name, FIELD_LIMITS.serviceNameMax),
    serviceCategory: input.service.category,
    staffId: sanitizeId(input.staff.id),
    staffName: clip(input.staff.name, FIELD_LIMITS.nameMax),
    appointmentDate: input.appointmentDate,
    appointmentTime: input.appointmentTime,
    durationMins: Number(input.service.durationMins),
    totalAmount,
    paymentPlan: input.paymentPlan,
    amountPaid,
    balanceDue,
    paymentMethod: input.paymentMethod,
    paymentStatus,
    transactionRef,
    status: 'Confirmed' as AppointmentStatus,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (input.notes && input.notes.trim().length > 0) {
    payload.notes = clip(input.notes, FIELD_LIMITS.notesMax);
  }

  const aptPath = `appointments/${appointmentId}`;
  try {
    await setDoc(doc(db, 'appointments', appointmentId), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, aptPath);
  }

  // Upsert customer profile cleanly
  const custPath = `customers/${customerUid}`;
  try {
    const custRef = doc(db, 'customers', customerUid);
    const existingCust = await getDoc(custRef);
    if (!existingCust.exists()) {
      await setDoc(custRef, {
        id: customerUid,
        uid: customerUid,
        name: clip(input.customerName, FIELD_LIMITS.nameMax),
        email: clip(input.customerEmail, FIELD_LIMITS.emailMax),
        phone: clip(input.customerPhone, FIELD_LIMITS.phoneMax),
        preferredStylist: clip(input.staff.name, FIELD_LIMITS.nameMax),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(custRef, {
        name: clip(input.customerName, FIELD_LIMITS.nameMax),
        phone: clip(input.customerPhone, FIELD_LIMITS.phoneMax),
        preferredStylist: clip(input.staff.name, FIELD_LIMITS.nameMax),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, custPath);
  }

  return {
    ...(payload as unknown as Appointment),
    createdAt: null,
    updatedAt: null,
  };
}

export async function cancelCustomerAppointment(appointmentId: string): Promise<void> {
  const path = `appointments/${appointmentId}`;
  try {
    await updateDoc(doc(db, 'appointments', appointmentId), {
      status: 'Cancelled',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

// ============================================================================
// Admin Operations: Appointments, Services, Staff, Customers, Attendance
// ============================================================================

export async function adminUpdateAppointmentStatus(
  appointment: Appointment,
  status: AppointmentStatus,
  collectRemainingBalance = false
): Promise<void> {
  const path = `appointments/${appointment.id}`;
  try {
    const updates: Record<string, unknown> = {
      status,
      updatedAt: serverTimestamp(),
    };
    if (collectRemainingBalance && appointment.balanceDue > 0) {
      updates.amountPaid = appointment.totalAmount;
      updates.balanceDue = 0;
      updates.paymentStatus = 'Paid in Full';
    }
    await updateDoc(doc(db, 'appointments', appointment.id), updates);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function saveServiceItem(
  service: Omit<ServiceItem, 'createdAt' | 'updatedAt'>,
  isNew: boolean
): Promise<void> {
  const id = sanitizeId(service.id);
  const path = `services/${id}`;
  try {
    if (isNew) {
      await setDoc(doc(db, 'services', id), {
        id,
        name: clip(service.name, FIELD_LIMITS.serviceNameMax),
        category: service.category,
        description: clip(service.description, FIELD_LIMITS.descMax),
        durationMins: Math.max(15, Math.min(480, Number(service.durationMins))),
        price: Math.max(1, Number(service.price)),
        featured: Boolean(service.featured),
        active: Boolean(service.active),
        imageKey: service.imageKey,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(doc(db, 'services', id), {
        name: clip(service.name, FIELD_LIMITS.serviceNameMax),
        category: service.category,
        description: clip(service.description, FIELD_LIMITS.descMax),
        durationMins: Math.max(15, Math.min(480, Number(service.durationMins))),
        price: Math.max(1, Number(service.price)),
        featured: Boolean(service.featured),
        active: Boolean(service.active),
        imageKey: service.imageKey,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, isNew ? OperationType.CREATE : OperationType.UPDATE, path);
  }
}

export async function deleteServiceItem(serviceId: string): Promise<void> {
  const path = `services/${serviceId}`;
  try {
    await deleteDoc(doc(db, 'services', serviceId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function saveStaffMember(
  staff: Omit<StaffMember, 'createdAt' | 'updatedAt'>,
  isNew: boolean
): Promise<void> {
  const id = sanitizeId(staff.id);
  const path = `staff/${id}`;
  try {
    if (isNew) {
      await setDoc(doc(db, 'staff', id), {
        id,
        name: clip(staff.name, FIELD_LIMITS.nameMax),
        role: clip(staff.role, FIELD_LIMITS.nameMax),
        specialty: clip(staff.specialty, 140),
        shiftDays: staff.shiftDays.slice(0, 7),
        shiftStart: staff.shiftStart,
        shiftEnd: staff.shiftEnd,
        active: Boolean(staff.active),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(doc(db, 'staff', id), {
        name: clip(staff.name, FIELD_LIMITS.nameMax),
        role: clip(staff.role, FIELD_LIMITS.nameMax),
        specialty: clip(staff.specialty, 140),
        shiftDays: staff.shiftDays.slice(0, 7),
        shiftStart: staff.shiftStart,
        shiftEnd: staff.shiftEnd,
        active: Boolean(staff.active),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, isNew ? OperationType.CREATE : OperationType.UPDATE, path);
  }
}

export async function saveCustomerProfile(
  customer: Omit<CustomerProfile, 'createdAt' | 'updatedAt'>,
  isNew: boolean
): Promise<void> {
  const id = sanitizeId(customer.id);
  const path = `customers/${id}`;
  try {
    const base: Record<string, unknown> = {
      name: clip(customer.name, FIELD_LIMITS.nameMax),
      email: clip(customer.email, FIELD_LIMITS.emailMax),
      phone: clip(customer.phone, FIELD_LIMITS.phoneMax),
      updatedAt: serverTimestamp(),
    };
    if (customer.preferredStylist?.trim()) {
      base.preferredStylist = clip(customer.preferredStylist, FIELD_LIMITS.nameMax);
    }
    if (customer.notes?.trim()) {
      base.notes = clip(customer.notes, FIELD_LIMITS.customerNotesMax);
    }

    if (isNew) {
      await setDoc(doc(db, 'customers', id), {
        id,
        uid: sanitizeId(customer.uid || id),
        ...base,
        createdAt: serverTimestamp(),
      });
    } else {
      await updateDoc(doc(db, 'customers', id), base);
    }
  } catch (error) {
    handleFirestoreError(error, isNew ? OperationType.CREATE : OperationType.UPDATE, path);
  }
}

export async function upsertAttendanceRecord(params: {
  staff: StaffMember;
  date: string;
  status: AttendanceStatus;
  checkIn?: string;
  checkOut?: string;
  notes?: string;
}): Promise<void> {
  const id = sanitizeId(`${params.staff.id}_${params.date}`);
  const path = `attendance/${id}`;
  try {
    const ref = doc(db, 'attendance', id);
    const snap = await getDoc(ref);
    const fields: Record<string, unknown> = {
      status: params.status,
      updatedAt: serverTimestamp(),
    };
    if (params.checkIn !== undefined) fields.checkIn = clip(params.checkIn, 10);
    if (params.checkOut !== undefined) fields.checkOut = clip(params.checkOut, 10);
    if (params.notes !== undefined) {
      fields.notes = clip(params.notes, FIELD_LIMITS.attendanceNotesMax);
    }

    if (!snap.exists()) {
      await setDoc(ref, {
        id,
        staffId: sanitizeId(params.staff.id),
        staffName: clip(params.staff.name, FIELD_LIMITS.nameMax),
        date: params.date,
        ...fields,
        createdAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, fields);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function createClientReview(input: {
  service: ServiceItem;
  clientName: string;
  clientContext: string;
  rating: number;
  comment: string;
}): Promise<void> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Authentication required to submit a review.');
  }

  const id = sanitizeId(`rev_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);
  const path = `reviews/${id}`;
  const now = new Date();
  const visitDate = now.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

  try {
    await setDoc(doc(db, 'reviews', id), {
      id,
      reviewerUid: sanitizeId(user.uid),
      clientName: clip(input.clientName, FIELD_LIMITS.nameMax),
      clientContext: clip(input.clientContext, FIELD_LIMITS.nameMax),
      serviceId: sanitizeId(input.service.id),
      serviceName: clip(input.service.name, FIELD_LIMITS.serviceNameMax),
      rating: Math.max(1, Math.min(5, Number(input.rating))),
      comment: clip(input.comment, FIELD_LIMITS.descMax),
      visitDate: clip(visitDate, 20),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function triggerManualReminderEmail(appointmentId: string): Promise<void> {
  const callable = httpsCallable<{ appointmentId: string }, { ok: boolean }>(
    functions,
    'sendManualReminderEmail'
  );
  await callable({ appointmentId });
}
