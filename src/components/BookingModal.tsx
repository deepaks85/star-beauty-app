import { useEffect, useMemo, useState } from 'react';
import { User } from 'firebase/auth';
import {
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  CreditCard,
  Lock,
  Smartphone,
  Building2,
  X,
  Banknote,
  MailCheck,
} from 'lucide-react';
import {
  Appointment,
  PaymentMethod,
  PaymentPlan,
  ServiceItem,
  StaffMember,
  formatCurrency,
  formatIndiaPhone,
  getDayCodeFromDate,
  getLocalIsoDate,
  isValidIndiaPhoneDigits,
  normalizeIndiaDigits,
} from '../types/salon';
import { createAppointmentBooking } from '../services/salonApi';
import { IndiaPhoneInput } from './IndiaPhoneInput';

interface BookingModalProps {
  open: boolean;
  onClose: () => void;
  services: ServiceItem[];
  staff: StaffMember[];
  initialService?: ServiceItem | null;
  initialStaff?: StaffMember | null;
  user: User | null;
  onRequireSignIn: () => Promise<User | null>;
  asAdminWalkIn?: boolean;
  onSuccess?: (appointment: Appointment) => void;
  onViewMyBookings?: () => void;
}

function generateTimeSlots(shiftStart: string, shiftEnd: string): string[] {
  const [startH, startM] = shiftStart.split(':').map(Number);
  const [endH, endM] = shiftEnd.split(':').map(Number);
  const startTotal = (startH || 9) * 60 + (startM || 0);
  const endTotal = (endH || 19) * 60 + (endM || 0) - 60;
  const slots: string[] = [];
  for (let m = startTotal; m <= endTotal; m += 30) {
    const h = Math.floor(m / 60);
    const min = m % 60;
    slots.push(`${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`);
  }
  return slots.length > 0 ? slots : ['10:00', '11:30', '13:00', '15:00', '16:30'];
}

export function BookingModal({
  open,
  onClose,
  services,
  staff,
  initialService,
  initialStaff,
  user,
  onRequireSignIn,
  asAdminWalkIn = false,
  onSuccess,
  onViewMyBookings,
}: BookingModalProps) {
  const activeServices = useMemo(() => services.filter((s) => s.active), [services]);
  const activeStaff = useMemo(() => staff.filter((s) => s.active), [staff]);

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [selectedServiceId, setSelectedServiceId] = useState<string>('');
  const [selectedStaffId, setSelectedStaffId] = useState<string>('');
  const [appointmentDate, setAppointmentDate] = useState<string>(getLocalIsoDate(1));
  const [appointmentTime, setAppointmentTime] = useState<string>('11:00');

  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [notes, setNotes] = useState('');

  const [paymentPlan, setPaymentPlan] = useState<PaymentPlan>('advance');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('UPI');
  const [upiId, setUpiId] = useState('client@okaxis');
  const [cardNumber, setCardNumber] = useState('4532 •••• •••• 8910');
  const [cardExpiry, setCardExpiry] = useState('08/28');
  const [cardCvv, setCardCvv] = useState('412');
  const [bankName, setBankName] = useState('HDFC Bank');

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [confirmedAppointment, setConfirmedAppointment] = useState<Appointment | null>(null);

  useEffect(() => {
    if (!open) return;
    setStep(1);
    setErrorMsg(null);
    setConfirmedAppointment(null);

    const svc = initialService && initialService.active
      ? initialService
      : activeServices[0];
    if (svc) setSelectedServiceId(svc.id);

    const stf = initialStaff && initialStaff.active
      ? initialStaff
      : activeStaff[0];
    if (stf) setSelectedStaffId(stf.id);

    setAppointmentDate(getLocalIsoDate(1));

    if (!asAdminWalkIn && user) {
      setCustomerName(user.displayName || '');
      setCustomerEmail(user.email || '');
      setCustomerPhone(normalizeIndiaDigits(user.phoneNumber || ''));
    } else if (asAdminWalkIn) {
      setCustomerName('');
      setCustomerEmail('');
      setCustomerPhone('');
    }
  }, [open, initialService, initialStaff, activeServices, activeStaff, user, asAdminWalkIn]);

  const selectedService = useMemo(
    () => activeServices.find((s) => s.id === selectedServiceId) || activeServices[0],
    [activeServices, selectedServiceId]
  );

  const selectedStaff = useMemo(
    () => activeStaff.find((s) => s.id === selectedStaffId) || activeStaff[0],
    [activeStaff, selectedStaffId]
  );

  const dayCode = useMemo(() => getDayCodeFromDate(appointmentDate), [appointmentDate]);
  const isStaffWorkingOnDate = selectedStaff ? selectedStaff.shiftDays.includes(dayCode) : false;

  const availableSlots = useMemo(() => {
    if (!selectedStaff) return [];
    return generateTimeSlots(selectedStaff.shiftStart, selectedStaff.shiftEnd);
  }, [selectedStaff]);

  useEffect(() => {
    if (availableSlots.length > 0 && !availableSlots.includes(appointmentTime)) {
      setAppointmentTime(availableSlots[0]);
    }
  }, [availableSlots, appointmentTime]);

  if (!open || (!asAdminWalkIn && !user)) return null;

  const totalAmount = selectedService?.price ?? 0;
  const amountDueNow =
    paymentPlan === 'full' ? totalAmount : Math.round(totalAmount * 0.3);
  const balanceDue = Math.max(0, totalAmount - amountDueNow);

  const handleNextFromStep1 = () => {
    setErrorMsg(null);
    if (!selectedService || !selectedStaff) {
      setErrorMsg('Please select both a treatment and an artist.');
      return;
    }
    if (!appointmentDate) {
      setErrorMsg('Please choose a valid appointment date.');
      return;
    }
    if (!isStaffWorkingOnDate) {
      setErrorMsg(
        `${selectedStaff.name} is off on ${dayCode}. Please select another date or artist.`
      );
      return;
    }
    setStep(2);
  };

  const handleNextFromStep2 = () => {
    setErrorMsg(null);
    if (customerName.trim().length < 2) {
      setErrorMsg('Please enter your full name.');
      return;
    }
    if (!customerEmail.includes('@') || customerEmail.trim().length < 5) {
      setErrorMsg('Please enter a valid email address for confirmation and reminder emails.');
      return;
    }
    if (!isValidIndiaPhoneDigits(customerPhone)) {
      setErrorMsg('Please enter a valid 10-digit Indian mobile number (+91).');
      return;
    }
    setStep(3);
  };

  const handleConfirmAndPay = async () => {
    setErrorMsg(null);
    if (!selectedService || !selectedStaff) return;

    if (paymentMethod === 'UPI' && !upiId.includes('@')) {
      setErrorMsg('Please enter a valid UPI ID (for example, name@bank).');
      return;
    }
    if (paymentMethod === 'Card' && (cardNumber.trim().length < 12 || cardCvv.trim().length < 3)) {
      setErrorMsg('Please enter valid card details.');
      return;
    }

    setSubmitting(true);
    try {
      let currentUser = user;
      if (!currentUser) {
        currentUser = await onRequireSignIn();
        if (!currentUser) {
          setErrorMsg('Sign in with Google to confirm your appointment and secure your payment receipt.');
          setSubmitting(false);
          return;
        }
      }

      const created = await createAppointmentBooking({
        service: selectedService,
        staff: selectedStaff,
        appointmentDate,
        appointmentTime,
        customerName: customerName.trim(),
        customerEmail: customerEmail.trim(),
        customerPhone: formatIndiaPhone(customerPhone),
        paymentPlan,
        paymentMethod,
        notes: notes.trim(),
        asAdminWalkIn,
        customerUidOverride: asAdminWalkIn
          ? `walkin_${Date.now()}`
          : currentUser.uid,
      });

      setConfirmedAppointment(created);
      setStep(4);
      onSuccess?.(created);
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message.startsWith('{')
            ? 'Could not complete booking due to a permission or validation rule. Please verify your details.'
            : err.message
          : 'Failed to process booking.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#1C1917]/55 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="booking-modal-title"
    >
      <div className="relative w-full max-w-2xl bg-[#FAF7F4] border border-[#E5DDD5] rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-[#E5DDD5]">
          <div>
            <p className="text-xs text-[#57534E] tracking-wide">
              {asAdminWalkIn ? 'Studio Desk Booking' : 'Star Beauty Make-Up Studio'}
            </p>
            <h2 id="booking-modal-title" className="font-display text-2xl font-semibold text-[#1C1917]">
              {step === 4 ? 'Appointment Confirmed' : 'Reserve Your Appointment'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close booking dialog"
            className="w-10 h-10 flex items-center justify-center rounded-lg text-[#57534E] hover:text-[#1C1917] hover:bg-[#F2ECE6] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Progress Steps */}
        {step < 4 && (
          <div className="grid grid-cols-3 border-b border-[#E5DDD5] bg-[#F2ECE6]/60 text-xs font-medium">
            {[
              { num: 1, label: '01. Service & Time' },
              { num: 2, label: '02. Client Details' },
              { num: 3, label: '03. Advance / Full Pay' },
            ].map((item) => {
              const active = step === item.num;
              const done = step > item.num;
              return (
                <div
                  key={item.num}
                  className={`px-4 py-2.5 text-center border-b-2 transition-colors whitespace-nowrap truncate ${
                    active
                      ? 'border-[#8E3B46] text-[#8E3B46] bg-white/70'
                      : done
                      ? 'border-[#15803D]/40 text-[#1C1917]'
                      : 'border-transparent text-[#57534E]'
                  }`}
                >
                  {item.label}
                </div>
              );
            })}
          </div>
        )}

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {errorMsg && (
            <div
              role="alert"
              className="px-4 py-3 rounded-lg bg-[#FEE2E2]/70 border border-[#FCA5A5] text-[#991B1B] text-sm"
            >
              {errorMsg}
            </div>
          )}

          {step === 1 && (
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-[#1C1917] mb-1.5">
                  Select Treatment
                </label>
                <select
                  value={selectedService?.id || ''}
                  onChange={(e) => setSelectedServiceId(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-[#D6CEC5] rounded-lg text-sm text-[#1C1917] focus:outline-none focus:border-[#8E3B46]"
                >
                  {activeServices.map((svc) => (
                    <option key={svc.id} value={svc.id}>
                      {svc.name} · {svc.durationMins} mins · {formatCurrency(svc.price)}
                    </option>
                  ))}
                </select>
                {selectedService && (
                  <p className="mt-1.5 text-xs text-[#57534E] leading-relaxed">
                    {selectedService.description}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[#1C1917] mb-1.5">
                    Preferred Artist
                  </label>
                  <select
                    value={selectedStaff?.id || ''}
                    onChange={(e) => setSelectedStaffId(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white border border-[#D6CEC5] rounded-lg text-sm text-[#1C1917] focus:outline-none focus:border-[#8E3B46]"
                  >
                    {activeStaff.map((stf) => (
                      <option key={stf.id} value={stf.id}>
                        {stf.name} ({stf.role})
                      </option>
                    ))}
                  </select>
                  {selectedStaff && (
                    <p className="mt-1.5 text-xs text-[#57534E]">
                      Shift: {selectedStaff.shiftDays.join(', ')} · {selectedStaff.shiftStart}–{selectedStaff.shiftEnd}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#1C1917] mb-1.5">
                    Appointment Date
                  </label>
                  <div className="relative">
                    <input
                      type="date"
                      min={asAdminWalkIn ? undefined : getLocalIsoDate(0)}
                      value={appointmentDate}
                      onChange={(e) => setAppointmentDate(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-white border border-[#D6CEC5] rounded-lg text-sm text-[#1C1917] tabular-nums focus:outline-none focus:border-[#8E3B46]"
                    />
                  </div>
                  <p className="mt-1.5 text-xs text-[#57534E]">
                    Selected day: <span className="font-medium text-[#1C1917]">{dayCode}</span>{' '}
                    {isStaffWorkingOnDate ? '· Artist available' : '· Artist off duty'}
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-[#1C1917] mb-2">
                  Available Time Slots
                </label>
                {isStaffWorkingOnDate ? (
                  <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                    {availableSlots.map((slot) => {
                      const active = appointmentTime === slot;
                      return (
                        <button
                          key={slot}
                          type="button"
                          onClick={() => setAppointmentTime(slot)}
                          className={`py-2 px-2 rounded-lg text-xs font-mono tabular-nums border transition-colors cursor-pointer ${
                            active
                              ? 'bg-[#8E3B46] text-white border-[#8E3B46]'
                              : 'bg-white text-[#1C1917] border-[#D6CEC5] hover:border-[#8E3B46]'
                          }`}
                        >
                          {slot}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-4 rounded-lg bg-[#FEF3C7]/60 border border-[#F59E0B]/40 text-xs text-[#92400E]">
                    {selectedStaff?.name} does not work on {dayCode}. Choose another date or switch to an artist scheduled on {dayCode}.
                  </div>
                )}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[#1C1917] mb-1.5">
                    Full Name
                  </label>
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="e.g., Anjali Sharma"
                    maxLength={80}
                    className="w-full px-3.5 py-2.5 bg-white border border-[#D6CEC5] rounded-lg text-sm text-[#1C1917] focus:outline-none focus:border-[#8E3B46]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#1C1917] mb-1.5">
                    Mobile Number (+91 India · 10 digits)
                  </label>
                  <IndiaPhoneInput
                    valueDigits={customerPhone}
                    onChangeDigits={setCustomerPhone}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-[#1C1917] mb-1.5">
                  Email Address (Confirmation & 24h Reminder Emails)
                </label>
                <input
                  type="email"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  placeholder="client@example.com"
                  maxLength={120}
                  className="w-full px-3.5 py-2.5 bg-white border border-[#D6CEC5] rounded-lg text-sm text-[#1C1917] focus:outline-none focus:border-[#8E3B46]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[#1C1917] mb-1.5">
                  Skin / Hair Notes or Occasion Preferences (Optional)
                </label>
                <textarea
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  maxLength={300}
                  placeholder="Share skin sensitivities, bridal saree color, or hair reference details..."
                  className="w-full px-3.5 py-2.5 bg-white border border-[#D6CEC5] rounded-lg text-sm text-[#1C1917] focus:outline-none focus:border-[#8E3B46]"
                />
              </div>
            </div>
          )}

          {step === 3 && selectedService && selectedStaff && (
            <div className="space-y-5">
              {/* Summary line */}
              <div className="p-4 rounded-lg bg-white border border-[#E5DDD5] flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[#1C1917]">{selectedService.name}</p>
                  <p className="text-xs text-[#57534E] mt-0.5">
                    with {selectedStaff.name} · {appointmentDate} at {appointmentTime} ·{' '}
                    {selectedService.durationMins} mins
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-[#57534E]">Service Total</p>
                  <p className="font-mono text-base font-semibold text-[#1C1917] tabular-nums">
                    {formatCurrency(totalAmount)}
                  </p>
                </div>
              </div>

              {/* Payment Plan Selection */}
              <div>
                <label className="block text-sm font-medium text-[#1C1917] mb-2">
                  Choose Payment Option
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setPaymentPlan('advance')}
                    className={`p-4 rounded-lg border text-left transition-colors cursor-pointer ${
                      paymentPlan === 'advance'
                        ? 'bg-white border-[#8E3B46] ring-1 ring-[#8E3B46]'
                        : 'bg-white border-[#E5DDD5] hover:border-[#C5B9AD]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-[#1C1917]">
                        30% Advance Deposit
                      </span>
                      <span className="font-mono text-sm font-semibold text-[#8E3B46] tabular-nums">
                        {formatCurrency(Math.round(totalAmount * 0.3))}
                      </span>
                    </div>
                    <p className="text-xs text-[#57534E] mt-1.5">
                      Pay {formatCurrency(Math.round(totalAmount * 0.3))} now to lock your slot. Remaining{' '}
                      <span className="tabular-nums font-medium text-[#1C1917]">
                        {formatCurrency(totalAmount - Math.round(totalAmount * 0.3))}
                      </span>{' '}
                      due at the studio.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentPlan('full')}
                    className={`p-4 rounded-lg border text-left transition-colors cursor-pointer ${
                      paymentPlan === 'full'
                        ? 'bg-white border-[#8E3B46] ring-1 ring-[#8E3B46]'
                        : 'bg-white border-[#E5DDD5] hover:border-[#C5B9AD]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-[#1C1917]">
                        100% Full Payment
                      </span>
                      <span className="font-mono text-sm font-semibold text-[#8E3B46] tabular-nums">
                        {formatCurrency(totalAmount)}
                      </span>
                    </div>
                    <p className="text-xs text-[#57534E] mt-1.5">
                      Settle the complete treatment fee online now for express checkout after your session.
                    </p>
                  </button>
                </div>
              </div>

              {/* Payment Method */}
              <div>
                <label className="block text-sm font-medium text-[#1C1917] mb-2">
                  Payment Method
                </label>
                <div className="flex flex-wrap gap-2 mb-3">
                  {(
                    [
                      { id: 'UPI', label: 'UPI', icon: Smartphone },
                      { id: 'Card', label: 'Credit / Debit Card', icon: CreditCard },
                      { id: 'NetBanking', label: 'NetBanking', icon: Building2 },
                      ...(asAdminWalkIn
                        ? [{ id: 'Cash', label: 'Cash at Desk', icon: Banknote }]
                        : []),
                    ] as const
                  ).map((method) => {
                    const Icon = method.icon;
                    const active = paymentMethod === method.id;
                    return (
                      <button
                        key={method.id}
                        type="button"
                        onClick={() => setPaymentMethod(method.id as PaymentMethod)}
                        className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                          active
                            ? 'bg-[#1C1917] text-white border-[#1C1917]'
                            : 'bg-white text-[#1C1917] border-[#D6CEC5] hover:border-[#1C1917]'
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        {method.label}
                      </button>
                    );
                  })}
                </div>

                {paymentMethod === 'UPI' && (
                  <div className="p-4 rounded-lg bg-white border border-[#E5DDD5]">
                    <label className="block text-xs font-medium text-[#57534E] mb-1">
                      UPI ID (GPay, PhonePe, Paytm, BHIM)
                    </label>
                    <input
                      type="text"
                      value={upiId}
                      onChange={(e) => setUpiId(e.target.value)}
                      placeholder="yourname@okhdfcbank"
                      className="w-full px-3 py-2 bg-[#FAF7F4] border border-[#D6CEC5] rounded-lg text-sm text-[#1C1917] focus:outline-none focus:border-[#8E3B46]"
                    />
                  </div>
                )}

                {paymentMethod === 'Card' && (
                  <div className="p-4 rounded-lg bg-white border border-[#E5DDD5] space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-[#57534E] mb-1">
                        Card Number
                      </label>
                      <input
                        type="text"
                        value={cardNumber}
                        onChange={(e) => setCardNumber(e.target.value)}
                        className="w-full px-3 py-2 bg-[#FAF7F4] border border-[#D6CEC5] rounded-lg text-sm font-mono text-[#1C1917] focus:outline-none focus:border-[#8E3B46]"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-[#57534E] mb-1">
                          Expiry (MM/YY)
                        </label>
                        <input
                          type="text"
                          value={cardExpiry}
                          onChange={(e) => setCardExpiry(e.target.value)}
                          className="w-full px-3 py-2 bg-[#FAF7F4] border border-[#D6CEC5] rounded-lg text-sm font-mono text-[#1C1917] focus:outline-none focus:border-[#8E3B46]"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-[#57534E] mb-1">
                          CVV
                        </label>
                        <input
                          type="password"
                          maxLength={4}
                          value={cardCvv}
                          onChange={(e) => setCardCvv(e.target.value)}
                          className="w-full px-3 py-2 bg-[#FAF7F4] border border-[#D6CEC5] rounded-lg text-sm font-mono text-[#1C1917] focus:outline-none focus:border-[#8E3B46]"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {paymentMethod === 'NetBanking' && (
                  <div className="p-4 rounded-lg bg-white border border-[#E5DDD5]">
                    <label className="block text-xs font-medium text-[#57534E] mb-1">
                      Select Bank
                    </label>
                    <select
                      value={bankName}
                      onChange={(e) => setBankName(e.target.value)}
                      className="w-full px-3 py-2 bg-[#FAF7F4] border border-[#D6CEC5] rounded-lg text-sm text-[#1C1917] focus:outline-none focus:border-[#8E3B46]"
                    >
                      <option>HDFC Bank</option>
                      <option>ICICI Bank</option>
                      <option>State Bank of India</option>
                      <option>Axis Bank</option>
                      <option>Kotak Mahindra Bank</option>
                    </select>
                  </div>
                )}

                {paymentMethod === 'Cash' && (
                  <div className="p-4 rounded-lg bg-white border border-[#E5DDD5] text-xs text-[#57534E]">
                    Desk payment recorded immediately upon confirmation.
                  </div>
                )}
              </div>

              {!user && !asAdminWalkIn && (
                <div className="p-3.5 rounded-lg bg-[#F2ECE6] border border-[#E5DDD5] text-xs text-[#1C1917]">
                  You will be asked to sign in with Google when confirming so your booking receipt and balance history stay linked to your account.
                </div>
              )}
            </div>
          )}

          {step === 4 && confirmedAppointment && (
            <div className="space-y-5">
              <div className="flex items-start gap-3 p-4 rounded-lg bg-[#DCFCE7]/50 border border-[#86EFAC]">
                <div className="w-8 h-8 rounded-full bg-[#15803D] text-white flex items-center justify-center shrink-0">
                  <Check className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#14532D]">
                    Booking & Payment Confirmed
                  </p>
                  <p className="text-xs text-[#166534] mt-0.5">
                    Reference <span className="font-mono">{confirmedAppointment.transactionRef}</span> ·{' '}
                    {confirmedAppointment.paymentStatus}
                  </p>
                </div>
              </div>

              <div className="bg-white border border-[#E5DDD5] rounded-lg divide-y divide-[#E5DDD5] text-sm">
                <div className="flex justify-between px-4 py-3">
                  <span className="text-[#57534E]">Treatment</span>
                  <span className="font-medium text-[#1C1917]">{confirmedAppointment.serviceName}</span>
                </div>
                <div className="flex justify-between px-4 py-3">
                  <span className="text-[#57534E]">Artist</span>
                  <span className="font-medium text-[#1C1917]">{confirmedAppointment.staffName}</span>
                </div>
                <div className="flex justify-between px-4 py-3">
                  <span className="text-[#57534E] flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5" /> Date & Time
                  </span>
                  <span className="font-mono text-[#1C1917] tabular-nums">
                    {confirmedAppointment.appointmentDate} · {confirmedAppointment.appointmentTime}
                  </span>
                </div>
                <div className="flex justify-between px-4 py-3">
                  <span className="text-[#57534E] flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" /> Amount Paid ({confirmedAppointment.paymentMethod})
                  </span>
                  <span className="font-mono font-semibold text-[#15803D] tabular-nums">
                    {formatCurrency(confirmedAppointment.amountPaid)}
                  </span>
                </div>
                <div className="flex justify-between px-4 py-3">
                  <span className="text-[#57534E]">Balance Due at Studio</span>
                  <span className="font-mono font-medium text-[#1C1917] tabular-nums">
                    {formatCurrency(confirmedAppointment.balanceDue)}
                  </span>
                </div>
              </div>

              <div className="flex items-start gap-2.5 p-3.5 rounded-lg bg-[#F2ECE6] border border-[#E5DDD5] text-xs text-[#1C1917]">
                <MailCheck className="w-4 h-4 text-[#8E3B46] shrink-0 mt-0.5" />
                <span>
                  Automated booking confirmation email has been queued for{' '}
                  <strong>{confirmedAppointment.customerEmail}</strong>, along with a 24-hour reminder prior to your visit.
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-white border-t border-[#E5DDD5] flex items-center justify-between gap-4">
          {step < 4 ? (
            <>
              <div>
                {step > 1 ? (
                  <button
                    type="button"
                    onClick={() => setStep((s) => (s === 3 ? 2 : 1))}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-[#57534E] hover:text-[#1C1917] cursor-pointer whitespace-nowrap"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    Back
                  </button>
                ) : (
                  <div className="text-xs text-[#57534E] tabular-nums">
                    Total: <span className="font-semibold text-[#1C1917]">{formatCurrency(totalAmount)}</span>
                  </div>
                )}
              </div>

              {step === 1 && (
                <button
                  type="button"
                  onClick={handleNextFromStep1}
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-[#8E3B46] hover:bg-[#6E2C35] text-white text-sm font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  Continue
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}

              {step === 2 && (
                <button
                  type="button"
                  onClick={handleNextFromStep2}
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-[#8E3B46] hover:bg-[#6E2C35] text-white text-sm font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  Review & Pay
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}

              {step === 3 && (
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleConfirmAndPay}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#8E3B46] hover:bg-[#6E2C35] disabled:opacity-60 text-white text-sm font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Lock className="w-3.5 h-3.5" />
                  {submitting
                    ? 'Processing...'
                    : !user && !asAdminWalkIn
                    ? `Sign in & Pay ${formatCurrency(amountDueNow)}`
                    : `Pay ${formatCurrency(amountDueNow)} & Confirm`}
                </button>
              )}
            </>
          ) : (
            <div className="flex items-center justify-end gap-3 w-full">
              {onViewMyBookings && !asAdminWalkIn && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onViewMyBookings();
                  }}
                  className="px-4 py-2 rounded-lg border border-[#D6CEC5] text-sm font-medium text-[#1C1917] hover:bg-[#F2ECE6] transition-colors cursor-pointer whitespace-nowrap"
                >
                  View My Bookings
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2 rounded-lg bg-[#8E3B46] hover:bg-[#6E2C35] text-white text-sm font-medium transition-colors cursor-pointer whitespace-nowrap"
              >
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
