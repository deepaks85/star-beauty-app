import { useState } from 'react';
import { User } from 'firebase/auth';
import { Calendar, Clock, CreditCard, ArrowLeft } from 'lucide-react';
import { Appointment, formatCurrency } from '../types/salon';
import { cancelCustomerAppointment } from '../services/salonApi';

interface CustomerBookingsViewProps {
  user: User | null;
  appointments: Appointment[];
  loading: boolean;
  onSignIn: () => void;
  onBookNew: () => void;
  onBackHome: () => void;
}

export function CustomerBookingsView({
  user,
  appointments,
  loading,
  onSignIn,
  onBookNew,
  onBackHome,
}: CustomerBookingsViewProps) {
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleCancel = async (aptId: string) => {
    setCancellingId(aptId);
    setErrorMsg(null);
    try {
      await cancelCustomerAppointment(aptId);
    } catch {
      setErrorMsg('Unable to cancel appointment right now. Please try again.');
    } finally {
      setCancellingId(null);
    }
  };

  return (
    <section className="max-w-5xl mx-auto px-6 py-12 min-h-[70vh]">
      <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-[#E5DDD5]">
        <div>
          <button
            type="button"
            onClick={onBackHome}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[#57534E] hover:text-[#1C1917] mb-2 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Studio
          </button>
          <h1 className="font-display text-3xl sm:text-4xl font-semibold text-[#1C1917]">
            My Appointments & Receipts
          </h1>
        </div>
        <button
          type="button"
          onClick={onBookNew}
          className="px-5 py-2.5 rounded-lg bg-[#8E3B46] hover:bg-[#6E2C35] text-white text-sm font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0"
        >
          Book New Appointment
        </button>
      </div>

      {errorMsg && (
        <div className="mt-4 px-4 py-3 rounded-lg bg-[#FEE2E2]/70 border border-[#FCA5A5] text-sm text-[#991B1B]">
          {errorMsg}
        </div>
      )}

      {!user ? (
        <div className="mt-10 p-10 bg-white border border-[#E5DDD5] rounded-xl text-center max-w-lg mx-auto">
          <h2 className="font-display text-2xl font-semibold text-[#1C1917]">
            Sign in to view your bookings
          </h2>
          <p className="text-sm text-[#57534E] mt-2 leading-relaxed">
            Access your confirmed salon appointments, advance deposit balances, and digital payment receipts.
          </p>
          <button
            type="button"
            onClick={onSignIn}
            className="mt-6 px-6 py-2.5 rounded-lg bg-[#8E3B46] hover:bg-[#6E2C35] text-white text-sm font-medium transition-colors cursor-pointer"
          >
            Sign in with Mobile & OTP
          </button>
        </div>
      ) : loading ? (
        <div className="mt-8 space-y-4">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className="h-28 rounded-xl bg-[#F2ECE6] animate-pulse border border-[#E5DDD5]"
            />
          ))}
        </div>
      ) : appointments.length === 0 ? (
        <div className="mt-10 p-10 bg-white border border-[#E5DDD5] rounded-xl text-center max-w-lg mx-auto">
          <h2 className="font-display text-2xl font-semibold text-[#1C1917]">
            No appointments scheduled yet
          </h2>
          <p className="text-sm text-[#57534E] mt-2">
            Explore our bridal makeup, hair artistry, facial, and nail menus to reserve your first visit.
          </p>
          <button
            type="button"
            onClick={onBookNew}
            className="mt-6 px-6 py-2.5 rounded-lg bg-[#8E3B46] hover:bg-[#6E2C35] text-white text-sm font-medium transition-colors cursor-pointer"
          >
            Reserve First Appointment
          </button>
        </div>
      ) : (
        <div className="mt-8 space-y-4">
          {appointments.map((apt) => {
            const canCancel = apt.status === 'Confirmed';
            return (
              <div
                key={apt.id}
                className="p-5 bg-white border border-[#E5DDD5] rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-5"
              >
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-[#57534E]">
                    <span>{apt.serviceCategory}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono">{apt.transactionRef}</span>
                    <span aria-hidden="true">·</span>
                    <span
                      className={`font-medium ${
                        apt.status === 'Completed'
                          ? 'text-[#15803D]'
                          : apt.status === 'Cancelled'
                          ? 'text-[#B91C1C]'
                          : 'text-[#8E3B46]'
                      }`}
                    >
                      {apt.status}
                    </span>
                  </div>
                  <h3 className="font-display text-2xl font-semibold text-[#1C1917]">
                    {apt.serviceName}
                  </h3>
                  <div className="flex flex-wrap items-center gap-4 text-xs text-[#57534E]">
                    <span>Artist: {apt.staffName}</span>
                    <span className="inline-flex items-center gap-1 font-mono tabular-nums">
                      <Calendar className="w-3.5 h-3.5" />
                      {apt.appointmentDate}
                    </span>
                    <span className="inline-flex items-center gap-1 font-mono tabular-nums">
                      <Clock className="w-3.5 h-3.5" />
                      {apt.appointmentTime} ({apt.durationMins}m)
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap sm:flex-nowrap items-center gap-6 pt-3 md:pt-0 border-t md:border-t-0 border-[#E5DDD5]">
                  <div className="text-left md:text-right">
                    <div className="inline-flex items-center gap-1.5 text-xs text-[#57534E]">
                      <CreditCard className="w-3.5 h-3.5" />
                      <span>{apt.paymentStatus} ({apt.paymentMethod})</span>
                    </div>
                    <p className="font-mono text-base font-semibold text-[#1C1917] tabular-nums mt-0.5">
                      Paid {formatCurrency(apt.amountPaid)} / {formatCurrency(apt.totalAmount)}
                    </p>
                    {apt.balanceDue > 0 && apt.status !== 'Cancelled' && (
                      <p className="text-xs font-mono text-[#B45309] tabular-nums">
                        Balance at studio: {formatCurrency(apt.balanceDue)}
                      </p>
                    )}
                  </div>

                  {canCancel && (
                    <button
                      type="button"
                      disabled={cancellingId === apt.id}
                      onClick={() => handleCancel(apt.id)}
                      className="px-3.5 py-2 rounded-lg border border-[#D6CEC5] text-xs font-medium text-[#57534E] hover:text-[#B91C1C] hover:border-[#B91C1C] transition-colors cursor-pointer whitespace-nowrap shrink-0"
                    >
                      {cancellingId === apt.id ? 'Cancelling...' : 'Cancel Booking'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
