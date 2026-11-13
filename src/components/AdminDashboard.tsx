import { useMemo, useState } from 'react';
import {
  CalendarCheck,
  Users,
  Clock,
  ClipboardCheck,
  BarChart3,
  Search,
  Plus,
  Download,
  ArrowLeft,
  Check,
  X,
  RefreshCw,
  Mail,
} from 'lucide-react';
import {
  ALL_DAYS,
  Appointment,
  AppointmentStatus,
  AttendanceRecord,
  AttendanceStatus,
  CATEGORY_DEFAULT_IMAGE,
  CustomerProfile,
  DayCode,
  EmailLog,
  SERVICE_CATEGORIES,
  ServiceCategory,
  ServiceItem,
  StaffMember,
  formatCurrency,
  formatIndiaPhone,
  getLocalIsoDate,
  isValidIndiaPhoneDigits,
  sanitizeId,
} from '../types/salon';
import {
  adminUpdateAppointmentStatus,
  ensureStudioSeededIfEmpty,
  saveCustomerProfile,
  saveServiceItem,
  saveStaffMember,
  triggerManualReminderEmail,
  upsertAttendanceRecord,
} from '../services/salonApi';
import { IndiaPhoneInput } from './IndiaPhoneInput';

type AdminTab = 'appointments' | 'customers' | 'schedules' | 'attendance' | 'reports' | 'emails';

interface AdminDashboardProps {
  appointments: Appointment[];
  customers: CustomerProfile[];
  staff: StaffMember[];
  services: ServiceItem[];
  attendance: AttendanceRecord[];
  emailLogs: EmailLog[];
  onOpenWalkInBooking: () => void;
  onExitAdmin: () => void;
}

interface AggregatedCustomer {
  key: string;
  profile?: CustomerProfile;
  name: string;
  email: string;
  phone: string;
  preferredStylist: string;
  notes: string;
  visits: Appointment[];
  totalSpent: number;
  pendingBalance: number;
  lastVisitDate: string;
}

export function AdminDashboard({
  appointments,
  customers,
  staff,
  services,
  attendance,
  emailLogs,
  onOpenWalkInBooking,
  onExitAdmin,
}: AdminDashboardProps) {
  const [activeTab, setActiveTab] = useState<AdminTab>('appointments');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Appointments filters
  const [aptSearch, setAptSearch] = useState('');
  const [aptStatusFilter, setAptStatusFilter] = useState<'All' | AppointmentStatus>('All');

  // Customers state
  const [custSearch, setCustSearch] = useState('');
  const [selectedCustomerKey, setSelectedCustomerKey] = useState<string | null>(null);
  const [editingNotes, setEditingNotes] = useState('');
  const [editingPreferredStylist, setEditingPreferredStylist] = useState('');
  const [showNewCustomerForm, setShowNewCustomerForm] = useState(false);
  const [newCustName, setNewCustName] = useState('');
  const [newCustEmail, setNewCustEmail] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');
  const [newCustNotes, setNewCustNotes] = useState('');

  // Staff & Menu state
  const [scheduleSubTab, setScheduleSubTab] = useState<'staff' | 'menu'>('staff');
  const [staffDrafts, setStaffDrafts] = useState<Record<string, StaffMember>>({});
  const [showNewStaffForm, setShowNewStaffForm] = useState(false);
  const [newStaffName, setNewStaffName] = useState('');
  const [newStaffRole, setNewStaffRole] = useState('');
  const [newStaffSpecialty, setNewStaffSpecialty] = useState('');
  const [newStaffStart, setNewStaffStart] = useState('10:00');
  const [newStaffEnd, setNewStaffEnd] = useState('19:00');
  const [newStaffDays, setNewStaffDays] = useState<DayCode[]>(['Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);

  const [showNewServiceForm, setShowNewServiceForm] = useState(false);
  const [newSvcName, setNewSvcName] = useState('');
  const [newSvcCategory, setNewSvcCategory] = useState<ServiceCategory>('Makeup');
  const [newSvcPrice, setNewSvcPrice] = useState('3500');
  const [newSvcDuration, setNewSvcDuration] = useState('60');
  const [newSvcDesc, setNewSvcDesc] = useState('');

  // Attendance state
  const [attendanceDate, setAttendanceDate] = useState<string>(getLocalIsoDate(0));
  const [attDrafts, setAttDrafts] = useState<
    Record<string, { status: AttendanceStatus; checkIn: string; checkOut: string; notes: string }>
  >({});

  // Reports state
  const [reportRange, setReportRange] = useState<'today' | '7d' | '30d' | 'all' | 'custom'>('30d');
  const [customStart, setCustomStart] = useState(getLocalIsoDate(-30));
  const [customEnd, setCustomEnd] = useState(getLocalIsoDate(7));

  const notify = (msg: string) => {
    setFeedback(msg);
    setTimeout(() => {
      setFeedback((prev) => (prev === msg ? null : prev));
    }, 3500);
  };

  // =========================================================================
  // Appointments Logic
  // =========================================================================
  const filteredAppointments = useMemo(() => {
    const q = aptSearch.trim().toLowerCase();
    return appointments.filter((apt) => {
      if (aptStatusFilter !== 'All' && apt.status !== aptStatusFilter) return false;
      if (!q) return true;
      return (
        apt.customerName.toLowerCase().includes(q) ||
        apt.customerEmail.toLowerCase().includes(q) ||
        apt.serviceName.toLowerCase().includes(q) ||
        apt.staffName.toLowerCase().includes(q) ||
        apt.transactionRef.toLowerCase().includes(q)
      );
    });
  }, [appointments, aptSearch, aptStatusFilter]);

  const handleStatusChange = async (
    apt: Appointment,
    nextStatus: AppointmentStatus,
    collectBalance = false
  ) => {
    setBusyId(apt.id);
    try {
      await adminUpdateAppointmentStatus(apt, nextStatus, collectBalance);
      notify(
        collectBalance
          ? `Marked ${apt.customerName}'s session ${nextStatus} and settled ${formatCurrency(apt.balanceDue)} balance.`
          : `Appointment updated to ${nextStatus}.`
      );
    } catch {
      notify('Unable to update appointment status.');
    } finally {
      setBusyId(null);
    }
  };

  // =========================================================================
  // Customer History Aggregation
  // =========================================================================
  const aggregatedCustomers = useMemo<AggregatedCustomer[]>(() => {
    const map = new Map<string, AggregatedCustomer>();

    for (const c of customers) {
      const key = c.email.toLowerCase();
      map.set(key, {
        key,
        profile: c,
        name: c.name,
        email: c.email,
        phone: c.phone,
        preferredStylist: c.preferredStylist || 'Any Artist',
        notes: c.notes || '',
        visits: [],
        totalSpent: 0,
        pendingBalance: 0,
        lastVisitDate: '',
      });
    }

    for (const apt of appointments) {
      const key = apt.customerEmail.toLowerCase();
      let entry = map.get(key);
      if (!entry) {
        entry = {
          key,
          name: apt.customerName,
          email: apt.customerEmail,
          phone: apt.customerPhone,
          preferredStylist: apt.staffName,
          notes: '',
          visits: [],
          totalSpent: 0,
          pendingBalance: 0,
          lastVisitDate: '',
        };
        map.set(key, entry);
      }
      entry.visits.push(apt);
      if (apt.status !== 'Cancelled') {
        entry.totalSpent += apt.amountPaid;
        entry.pendingBalance += apt.balanceDue;
      }
      if (!entry.lastVisitDate || apt.appointmentDate > entry.lastVisitDate) {
        entry.lastVisitDate = apt.appointmentDate;
      }
    }

    const list = Array.from(map.values());
    list.forEach((c) => {
      c.visits.sort((a, b) =>
        `${b.appointmentDate} ${b.appointmentTime}`.localeCompare(
          `${a.appointmentDate} ${a.appointmentTime}`
        )
      );
    });

    const q = custSearch.trim().toLowerCase();
    return list
      .filter((c) => {
        if (!q) return true;
        return (
          c.name.toLowerCase().includes(q) ||
          c.email.toLowerCase().includes(q) ||
          c.phone.toLowerCase().includes(q) ||
          c.preferredStylist.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => b.totalSpent - a.totalSpent || a.name.localeCompare(b.name));
  }, [customers, appointments, custSearch]);

  const selectedCustomer = useMemo(
    () => aggregatedCustomers.find((c) => c.key === selectedCustomerKey) || null,
    [aggregatedCustomers, selectedCustomerKey]
  );

  const openCustomerDrawer = (cust: AggregatedCustomer) => {
    setSelectedCustomerKey(cust.key);
    setEditingNotes(cust.notes);
    setEditingPreferredStylist(cust.preferredStylist);
  };

  const handleSaveCustomerNotes = async () => {
    if (!selectedCustomer) return;
    setBusyId('save_cust_notes');
    try {
      const existingProfile = selectedCustomer.profile;
      const id = existingProfile?.id || sanitizeId(`cust_${selectedCustomer.email.split('@')[0]}_${Date.now()}`);
      await saveCustomerProfile(
        {
          id,
          uid: existingProfile?.uid || id,
          name: selectedCustomer.name,
          email: selectedCustomer.email,
          phone: selectedCustomer.phone,
          preferredStylist: editingPreferredStylist,
          notes: editingNotes,
        },
        !existingProfile
      );
      notify(`Saved beauty profile notes for ${selectedCustomer.name}.`);
    } catch {
      notify('Could not save customer notes.');
    } finally {
      setBusyId(null);
    }
  };

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      newCustName.trim().length < 2 ||
      !newCustEmail.includes('@') ||
      !isValidIndiaPhoneDigits(newCustPhone)
    ) {
      notify('Please enter name, valid email, and a 10-digit +91 mobile number.');
      return;
    }
    setBusyId('new_cust');
    try {
      const id = sanitizeId(`cust_${Date.now()}`);
      await saveCustomerProfile(
        {
          id,
          uid: id,
          name: newCustName.trim(),
          email: newCustEmail.trim(),
          phone: formatIndiaPhone(newCustPhone),
          notes: newCustNotes.trim(),
        },
        true
      );
      setShowNewCustomerForm(false);
      setNewCustName('');
      setNewCustEmail('');
      setNewCustPhone('');
      setNewCustNotes('');
      notify('New customer profile added.');
    } catch {
      notify('Failed to create customer profile.');
    } finally {
      setBusyId(null);
    }
  };

  // =========================================================================
  // Staff Schedules & Service Menu
  // =========================================================================
  const getStaffDraft = (s: StaffMember): StaffMember => staffDrafts[s.id] || s;

  const updateStaffDraft = (s: StaffMember, patch: Partial<StaffMember>) => {
    setStaffDrafts((prev) => ({
      ...prev,
      [s.id]: { ...(prev[s.id] || s), ...patch },
    }));
  };

  const toggleStaffDay = (s: StaffMember, day: DayCode) => {
    const current = getStaffDraft(s);
    const has = current.shiftDays.includes(day);
    const nextDays = has
      ? current.shiftDays.filter((d) => d !== day)
      : ALL_DAYS.filter((d) => d === day || current.shiftDays.includes(d));
    updateStaffDraft(s, { shiftDays: nextDays });
  };

  const handleSaveStaffRow = async (s: StaffMember) => {
    const draft = getStaffDraft(s);
    setBusyId(s.id);
    try {
      await saveStaffMember(draft, false);
      setStaffDrafts((prev) => {
        const copy = { ...prev };
        delete copy[s.id];
        return copy;
      });
      notify(`Updated schedule for ${draft.name}.`);
    } catch {
      notify('Failed to update staff schedule.');
    } finally {
      setBusyId(null);
    }
  };

  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newStaffName.trim().length < 2 || newStaffRole.trim().length < 2) {
      notify('Enter stylist name and role.');
      return;
    }
    setBusyId('add_staff');
    try {
      const id = sanitizeId(`stf_${newStaffName.toLowerCase().replace(/\s+/g, '_')}_${Date.now().toString().slice(-4)}`);
      await saveStaffMember(
        {
          id,
          name: newStaffName.trim(),
          role: newStaffRole.trim(),
          specialty: newStaffSpecialty.trim() || 'Signature Studio Services',
          shiftDays: newStaffDays,
          shiftStart: newStaffStart,
          shiftEnd: newStaffEnd,
          active: true,
        },
        true
      );
      setShowNewStaffForm(false);
      setNewStaffName('');
      setNewStaffRole('');
      setNewStaffSpecialty('');
      notify('Added new stylist to the studio roster.');
    } catch {
      notify('Failed to add staff member.');
    } finally {
      setBusyId(null);
    }
  };

  const handleAddService = async (e: React.FormEvent) => {
    e.preventDefault();
    const price = Number(newSvcPrice);
    const duration = Number(newSvcDuration);
    if (newSvcName.trim().length < 2 || !price || price <= 0) {
      notify('Enter a valid service name and price.');
      return;
    }
    setBusyId('add_service');
    try {
      const id = sanitizeId(`svc_${Date.now()}`);
      await saveServiceItem(
        {
          id,
          name: newSvcName.trim(),
          category: newSvcCategory,
          description: newSvcDesc.trim() || 'Bespoke beauty treatment curated at Star Beauty Make-Up Studio.',
          durationMins: Math.max(15, Math.min(480, duration || 60)),
          price,
          featured: false,
          active: true,
          imageKey: CATEGORY_DEFAULT_IMAGE[newSvcCategory],
        },
        true
      );
      setShowNewServiceForm(false);
      setNewSvcName('');
      setNewSvcDesc('');
      notify('Added new treatment to service menu.');
    } catch {
      notify('Failed to add service.');
    } finally {
      setBusyId(null);
    }
  };

  const handleToggleServiceActive = async (svc: ServiceItem) => {
    setBusyId(svc.id);
    try {
      await saveServiceItem({ ...svc, active: !svc.active }, false);
      notify(`${svc.name} is now ${!svc.active ? 'visible' : 'hidden'} on the menu.`);
    } catch {
      notify('Failed to update service.');
    } finally {
      setBusyId(null);
    }
  };

  // =========================================================================
  // Staff Attendance
  // =========================================================================
  const getAttendanceEntry = (staffId: string, staffDefaultStart: string) => {
    const key = `${staffId}_${attendanceDate}`;
    if (attDrafts[key]) return attDrafts[key];
    const existing = attendance.find((a) => a.staffId === staffId && a.date === attendanceDate);
    return {
      status: existing?.status || ('Present' as AttendanceStatus),
      checkIn: existing?.checkIn || staffDefaultStart,
      checkOut: existing?.checkOut || '',
      notes: existing?.notes || '',
      saved: Boolean(existing),
    };
  };

  const updateAttDraft = (
    staffMember: StaffMember,
    patch: Partial<{ status: AttendanceStatus; checkIn: string; checkOut: string; notes: string }>
  ) => {
    const key = `${staffMember.id}_${attendanceDate}`;
    const current = getAttendanceEntry(staffMember.id, staffMember.shiftStart);
    setAttDrafts((prev) => ({
      ...prev,
      [key]: {
        status: current.status,
        checkIn: current.checkIn,
        checkOut: current.checkOut,
        notes: current.notes,
        ...patch,
      },
    }));
  };

  const handleSaveAttendance = async (staffMember: StaffMember) => {
    const key = `${staffMember.id}_${attendanceDate}`;
    const entry = getAttendanceEntry(staffMember.id, staffMember.shiftStart);
    setBusyId(key);
    try {
      await upsertAttendanceRecord({
        staff: staffMember,
        date: attendanceDate,
        status: entry.status,
        checkIn: entry.checkIn,
        checkOut: entry.checkOut,
        notes: entry.notes,
      });
      setAttDrafts((prev) => {
        const copy = { ...prev };
        delete copy[key];
        return copy;
      });
      notify(`Saved attendance for ${staffMember.name} (${attendanceDate}).`);
    } catch {
      notify('Failed to save attendance record.');
    } finally {
      setBusyId(null);
    }
  };

  const attendanceSummary = useMemo(() => {
    return staff.map((s) => {
      const logs = attendance.filter((a) => a.staffId === s.id);
      return {
        staff: s,
        present: logs.filter((l) => l.status === 'Present').length,
        halfDay: logs.filter((l) => l.status === 'Half Day').length,
        absent: logs.filter((l) => l.status === 'Absent').length,
        leave: logs.filter((l) => l.status === 'On Leave').length,
        totalLogged: logs.length,
      };
    });
  }, [staff, attendance]);

  // =========================================================================
  // Revenue Reports
  // =========================================================================
  const reportAppointments = useMemo(() => {
    const today = getLocalIsoDate(0);
    const sevenAgo = getLocalIsoDate(-7);
    const thirtyAgo = getLocalIsoDate(-30);

    return appointments.filter((apt) => {
      if (apt.status === 'Cancelled') return false;
      if (reportRange === 'today') return apt.appointmentDate === today;
      if (reportRange === '7d') return apt.appointmentDate >= sevenAgo && apt.appointmentDate <= getLocalIsoDate(30);
      if (reportRange === '30d') return apt.appointmentDate >= thirtyAgo && apt.appointmentDate <= getLocalIsoDate(30);
      if (reportRange === 'custom') {
        return apt.appointmentDate >= customStart && apt.appointmentDate <= customEnd;
      }
      return true;
    });
  }, [appointments, reportRange, customStart, customEnd]);

  const reportMetrics = useMemo(() => {
    let grossValue = 0;
    let collected = 0;
    let pendingBalance = 0;
    let completedCount = 0;

    const byCategory = new Map<ServiceCategory, { revenue: number; count: number }>();
    SERVICE_CATEGORIES.forEach((cat) => byCategory.set(cat, { revenue: 0, count: 0 }));

    const byMethod = new Map<string, number>();
    const byStaff = new Map<string, { name: string; visits: number; collected: number; gross: number }>();
    const byDate = new Map<string, number>();

    for (const apt of reportAppointments) {
      grossValue += apt.totalAmount;
      collected += apt.amountPaid;
      pendingBalance += apt.balanceDue;
      if (apt.status === 'Completed') completedCount += 1;

      const catEntry = byCategory.get(apt.serviceCategory) || { revenue: 0, count: 0 };
      catEntry.revenue += apt.amountPaid;
      catEntry.count += 1;
      byCategory.set(apt.serviceCategory, catEntry);

      byMethod.set(apt.paymentMethod, (byMethod.get(apt.paymentMethod) || 0) + apt.amountPaid);

      const stfEntry = byStaff.get(apt.staffId) || {
        name: apt.staffName,
        visits: 0,
        collected: 0,
        gross: 0,
      };
      stfEntry.visits += 1;
      stfEntry.collected += apt.amountPaid;
      stfEntry.gross += apt.totalAmount;
      byStaff.set(apt.staffId, stfEntry);

      byDate.set(apt.appointmentDate, (byDate.get(apt.appointmentDate) || 0) + apt.amountPaid);
    }

    const dailySeries = Array.from(byDate.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-10);

    return {
      grossValue,
      collected,
      pendingBalance,
      completedCount,
      totalCount: reportAppointments.length,
      byCategory: Array.from(byCategory.entries()),
      byMethod: Array.from(byMethod.entries()),
      byStaff: Array.from(byStaff.values()).sort((a, b) => b.collected - a.collected),
      dailySeries,
    };
  }, [reportAppointments]);

  const handleExportCsv = () => {
    const headers = [
      'Appointment ID',
      'Date',
      'Time',
      'Customer',
      'Email',
      'Phone',
      'Service',
      'Category',
      'Artist',
      'Total Amount',
      'Paid Amount',
      'Balance Due',
      'Payment Plan',
      'Payment Method',
      'Payment Status',
      'Status',
      'Transaction Ref',
    ];
    const rows = reportAppointments.map((a) => [
      a.id,
      a.appointmentDate,
      a.appointmentTime,
      a.customerName,
      a.customerEmail,
      a.customerPhone,
      a.serviceName,
      a.serviceCategory,
      a.staffName,
      a.totalAmount,
      a.amountPaid,
      a.balanceDue,
      a.paymentPlan,
      a.paymentMethod,
      a.paymentStatus,
      a.status,
      a.transactionRef,
    ]);
    const csv = [headers, ...rows]
      .map((r) => r.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `star-beauty-revenue-${reportRange}-${getLocalIsoDate(0)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    notify('Revenue report CSV downloaded.');
  };

  const navItems: { id: AdminTab; label: string; icon: typeof CalendarCheck }[] = [
    { id: 'appointments', label: 'Appointments', icon: CalendarCheck },
    { id: 'customers', label: 'Customer History', icon: Users },
    { id: 'schedules', label: 'Staff & Menu', icon: Clock },
    { id: 'attendance', label: 'Attendance', icon: ClipboardCheck },
    { id: 'reports', label: 'Revenue Reports', icon: BarChart3 },
    { id: 'emails', label: 'Automated Emails', icon: Mail },
  ];

  const handleSendReminderNow = async (apt: Appointment) => {
    setBusyId(`rem_${apt.id}`);
    try {
      await triggerManualReminderEmail(apt.id);
      notify(`Reminder email sent to ${apt.customerEmail}.`);
    } catch {
      notify('Deploy Firebase Functions with SMTP secrets to send live reminder emails.');
    } finally {
      setBusyId(null);
    }
  };

  const maxDailyRev = Math.max(...reportMetrics.dailySeries.map((d) => d[1]), 1);

  return (
    <div className="min-h-[calc(100vh-73px)] flex flex-col lg:flex-row bg-[#FAF7F4]">
      {/* Left Workspace Sidebar */}
      <aside className="w-full lg:w-60 shrink-0 bg-white border-b lg:border-b-0 lg:border-r border-[#E5DDD5] p-4 flex flex-col justify-between">
        <div>
          <div className="px-2 pb-3 mb-3 border-b border-[#E5DDD5]">
            <p className="text-xs text-[#57534E]">Admin Studio Console</p>
            <p className="font-display text-lg font-semibold text-[#1C1917]">
              Star Beauty Operations
            </p>
          </div>
          <nav className="flex lg:flex-col gap-1 overflow-x-auto pb-1 lg:pb-0">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-[#8E3B46] text-white'
                      : 'text-[#57534E] hover:text-[#1C1917] hover:bg-[#F2ECE6]'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  {item.label}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="hidden lg:block pt-4 mt-6 border-t border-[#E5DDD5] space-y-2">
          <button
            type="button"
            onClick={async () => {
              setBusyId('reseed');
              try {
                await ensureStudioSeededIfEmpty(true);
                notify('Restored starter salon catalog & sample bookings.');
              } finally {
                setBusyId(null);
              }
            }}
            disabled={busyId === 'reseed'}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-[#E5DDD5] text-xs font-medium text-[#57534E] hover:text-[#1C1917] hover:bg-[#F2ECE6] transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh Demo Records
          </button>
          <button
            type="button"
            onClick={onExitAdmin}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-[#57534E] hover:text-[#1C1917] cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Return to Storefront
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 p-6 lg:p-8 max-w-6xl">
        {/* Top Action Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-[#E5DDD5]">
          <div>
            <p className="text-xs text-[#57534E]">
              Star Beauty Make-Up Studio / {navItems.find((n) => n.id === activeTab)?.label}
            </p>
            <h1 className="font-display text-3xl font-semibold text-[#1C1917] mt-0.5">
              {navItems.find((n) => n.id === activeTab)?.label}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            {activeTab === 'reports' ? (
              <button
                type="button"
                onClick={handleExportCsv}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#8E3B46] hover:bg-[#6E2C35] text-white text-sm font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <Download className="w-4 h-4" />
                Export CSV
              </button>
            ) : (
              <button
                type="button"
                onClick={onOpenWalkInBooking}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#8E3B46] hover:bg-[#6E2C35] text-white text-sm font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <Plus className="w-4 h-4" />
                New Desk Booking
              </button>
            )}
          </div>
        </div>

        {feedback && (
          <div className="mt-4 px-4 py-2.5 rounded-lg bg-[#1C1917] text-white text-xs font-medium">
            {feedback}
          </div>
        )}

        {/* TAB 1: APPOINTMENTS */}
        {activeTab === 'appointments' && (
          <div className="mt-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="relative flex-1 min-w-[240px] max-w-sm">
                <Search className="w-4 h-4 text-[#57534E] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={aptSearch}
                  onChange={(e) => setAptSearch(e.target.value)}
                  placeholder="Search client, service, artist, or ref..."
                  className="w-full pl-9 pr-3 py-2 bg-white border border-[#D6CEC5] rounded-lg text-sm text-[#1C1917] focus:outline-none focus:border-[#8E3B46]"
                />
              </div>

              <div className="flex items-center gap-1 p-1 bg-[#F2ECE6] rounded-lg border border-[#E5DDD5] overflow-x-auto">
                {(['All', 'Confirmed', 'In Progress', 'Completed', 'Cancelled'] as const).map(
                  (status) => (
                    <button
                      key={status}
                      type="button"
                      onClick={() => setAptStatusFilter(status)}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                        aptStatusFilter === status
                          ? 'bg-white text-[#1C1917] shadow-xs'
                          : 'text-[#57534E] hover:text-[#1C1917]'
                      }`}
                    >
                      {status}
                    </button>
                  )
                )}
              </div>
            </div>

            <div className="bg-white border border-[#E5DDD5] rounded-xl overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#E5DDD5] text-xs font-medium text-[#57534E] bg-[#FAF7F4]">
                    <th className="py-3 px-4">Date & Time</th>
                    <th className="py-3 px-4">Client</th>
                    <th className="py-3 px-4">Treatment & Artist</th>
                    <th className="py-3 px-4 text-right">Paid / Total</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5DDD5] text-sm">
                  {filteredAppointments.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-[#57534E]">
                        No appointments match the current filter.
                      </td>
                    </tr>
                  ) : (
                    filteredAppointments.map((apt) => (
                      <tr key={apt.id} className="hover:bg-[#FAF7F4]/70">
                        <td className="py-3 px-4 whitespace-nowrap font-mono text-xs tabular-nums text-[#1C1917]">
                          <div>{apt.appointmentDate}</div>
                          <div className="text-[#57534E]">{apt.appointmentTime}</div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-medium text-[#1C1917]">{apt.customerName}</div>
                          <div className="text-xs text-[#57534E]">{apt.customerPhone}</div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-medium text-[#1C1917]">{apt.serviceName}</div>
                          <div className="text-xs text-[#57534E]">
                            {apt.staffName} · <span className="font-mono">{apt.transactionRef}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap font-mono tabular-nums">
                          <div className="font-medium text-[#1C1917]">
                            {formatCurrency(apt.amountPaid)} / {formatCurrency(apt.totalAmount)}
                          </div>
                          <div className="text-xs text-[#57534E]">
                            {apt.balanceDue > 0 && apt.status !== 'Cancelled'
                              ? `Due ${formatCurrency(apt.balanceDue)}`
                              : apt.paymentStatus}
                          </div>
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap text-xs font-medium">
                          <span
                            className={
                              apt.status === 'Completed'
                                ? 'text-[#15803D]'
                                : apt.status === 'Cancelled'
                                ? 'text-[#B91C1C]'
                                : apt.status === 'In Progress'
                                ? 'text-[#B45309]'
                                : 'text-[#8E3B46]'
                            }
                          >
                            {apt.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap space-x-2">
                          {apt.status === 'Confirmed' && (
                            <button
                              type="button"
                              disabled={busyId === `rem_${apt.id}`}
                              onClick={() => handleSendReminderNow(apt)}
                              className="px-2.5 py-1 rounded border border-[#D6CEC5] text-xs font-medium text-[#57534E] hover:text-[#1C1917] hover:bg-[#F2ECE6] cursor-pointer"
                            >
                              {busyId === `rem_${apt.id}` ? 'Sending' : 'Remind'}
                            </button>
                          )}
                          {apt.status === 'Confirmed' && (
                            <button
                              type="button"
                              disabled={busyId === apt.id}
                              onClick={() => handleStatusChange(apt, 'In Progress')}
                              className="px-2.5 py-1 rounded border border-[#D6CEC5] text-xs font-medium text-[#1C1917] hover:bg-[#F2ECE6] cursor-pointer"
                            >
                              Start
                            </button>
                          )}
                          {(apt.status === 'Confirmed' || apt.status === 'In Progress') && (
                            <button
                              type="button"
                              disabled={busyId === apt.id}
                              onClick={() => handleStatusChange(apt, 'Completed', true)}
                              className="px-2.5 py-1 rounded bg-[#15803D] text-white text-xs font-medium hover:bg-[#166534] cursor-pointer"
                            >
                              {apt.balanceDue > 0 ? 'Complete & Settle' : 'Complete'}
                            </button>
                          )}
                          {(apt.status === 'Confirmed' || apt.status === 'In Progress') && (
                            <button
                              type="button"
                              disabled={busyId === apt.id}
                              onClick={() => handleStatusChange(apt, 'Cancelled')}
                              className="px-2.5 py-1 rounded border border-[#E5DDD5] text-xs font-medium text-[#B91C1C] hover:bg-[#FEE2E2]/50 cursor-pointer"
                            >
                              Cancel
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 2: CUSTOMER HISTORY TRACKER */}
        {activeTab === 'customers' && (
          <div className="mt-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="relative flex-1 min-w-[240px] max-w-sm">
                <Search className="w-4 h-4 text-[#57534E] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={custSearch}
                  onChange={(e) => setCustSearch(e.target.value)}
                  placeholder="Search any customer by name, phone, or email..."
                  className="w-full pl-9 pr-3 py-2 bg-white border border-[#D6CEC5] rounded-lg text-sm text-[#1C1917] focus:outline-none focus:border-[#8E3B46]"
                />
              </div>
              <button
                type="button"
                onClick={() => setShowNewCustomerForm((v) => !v)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[#D6CEC5] bg-white text-xs font-medium text-[#1C1917] hover:bg-[#F2ECE6] cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Customer Profile
              </button>
            </div>

            {showNewCustomerForm && (
              <form
                onSubmit={handleCreateCustomer}
                className="p-5 bg-white border border-[#E5DDD5] rounded-xl grid grid-cols-1 sm:grid-cols-4 gap-3"
              >
                <input
                  type="text"
                  placeholder="Full Name"
                  value={newCustName}
                  onChange={(e) => setNewCustName(e.target.value)}
                  className="px-3 py-2 bg-[#FAF7F4] border border-[#D6CEC5] rounded-lg text-sm"
                />
                <input
                  type="email"
                  placeholder="Email Address"
                  value={newCustEmail}
                  onChange={(e) => setNewCustEmail(e.target.value)}
                  className="px-3 py-2 bg-[#FAF7F4] border border-[#D6CEC5] rounded-lg text-sm"
                />
                <IndiaPhoneInput
                  valueDigits={newCustPhone}
                  onChangeDigits={setNewCustPhone}
                />
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Skin / Hair Notes"
                    value={newCustNotes}
                    onChange={(e) => setNewCustNotes(e.target.value)}
                    className="flex-1 px-3 py-2 bg-[#FAF7F4] border border-[#D6CEC5] rounded-lg text-sm"
                  />
                  <button
                    type="submit"
                    disabled={busyId === 'new_cust'}
                    className="px-4 py-2 rounded-lg bg-[#8E3B46] text-white text-xs font-medium cursor-pointer shrink-0"
                  >
                    Save
                  </button>
                </div>
              </form>
            )}

            <div className="bg-white border border-[#E5DDD5] rounded-xl overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#E5DDD5] text-xs font-medium text-[#57534E] bg-[#FAF7F4]">
                    <th className="py-3 px-4">Customer</th>
                    <th className="py-3 px-4">Preferred Artist</th>
                    <th className="py-3 px-4 text-right">Visits</th>
                    <th className="py-3 px-4 text-right">Total Paid</th>
                    <th className="py-3 px-4 text-right">Pending Balance</th>
                    <th className="py-3 px-4">Last Visit</th>
                    <th className="py-3 px-4 text-right">History</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5DDD5] text-sm">
                  {aggregatedCustomers.map((cust) => (
                    <tr key={cust.key} className="hover:bg-[#FAF7F4]/70">
                      <td className="py-3 px-4">
                        <div className="font-medium text-[#1C1917]">{cust.name}</div>
                        <div className="text-xs text-[#57534E]">
                          {cust.phone} · {cust.email}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-[#57534E]">{cust.preferredStylist}</td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-[#1C1917]">
                        {cust.visits.length}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-medium text-[#1C1917]">
                        {formatCurrency(cust.totalSpent)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-[#B45309]">
                        {cust.pendingBalance > 0 ? formatCurrency(cust.pendingBalance) : '—'}
                      </td>
                      <td className="py-3 px-4 font-mono text-xs tabular-nums text-[#57534E]">
                        {cust.lastVisitDate || 'New Profile'}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => openCustomerDrawer(cust)}
                          className="px-3 py-1.5 rounded-lg border border-[#D6CEC5] text-xs font-medium text-[#1C1917] hover:bg-[#F2ECE6] cursor-pointer whitespace-nowrap"
                        >
                          View History
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Customer Detail History Panel */}
            {selectedCustomer && (
              <div className="fixed inset-0 z-50 flex justify-end bg-[#1C1917]/40 backdrop-blur-xs">
                <div className="w-full max-w-xl bg-[#FAF7F4] h-full border-l border-[#E5DDD5] flex flex-col shadow-2xl">
                  <div className="px-6 py-4 bg-white border-b border-[#E5DDD5] flex items-center justify-between">
                    <div>
                      <p className="text-xs text-[#57534E]">Customer Visit Ledger</p>
                      <h2 className="font-display text-2xl font-semibold text-[#1C1917]">
                        {selectedCustomer.name}
                      </h2>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedCustomerKey(null)}
                      className="w-9 h-9 flex items-center justify-center rounded-lg text-[#57534E] hover:bg-[#F2ECE6] cursor-pointer"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="p-6 overflow-y-auto space-y-6 flex-1">
                    <div className="grid grid-cols-3 gap-3">
                      <div className="p-3.5 bg-white border border-[#E5DDD5] rounded-lg">
                        <p className="text-xs text-[#57534E]">Total Visits</p>
                        <p className="font-mono text-xl font-semibold tabular-nums text-[#1C1917] mt-1">
                          {selectedCustomer.visits.length}
                        </p>
                      </div>
                      <div className="p-3.5 bg-white border border-[#E5DDD5] rounded-lg">
                        <p className="text-xs text-[#57534E]">Lifetime Paid</p>
                        <p className="font-mono text-xl font-semibold tabular-nums text-[#15803D] mt-1">
                          {formatCurrency(selectedCustomer.totalSpent)}
                        </p>
                      </div>
                      <div className="p-3.5 bg-white border border-[#E5DDD5] rounded-lg">
                        <p className="text-xs text-[#57534E]">Balance Due</p>
                        <p className="font-mono text-xl font-semibold tabular-nums text-[#B45309] mt-1">
                          {formatCurrency(selectedCustomer.pendingBalance)}
                        </p>
                      </div>
                    </div>

                    <div className="p-4 bg-white border border-[#E5DDD5] rounded-lg space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-[#1C1917]">
                          Preferences & Consultation Notes
                        </h3>
                        <span className="text-xs text-[#57534E]">{selectedCustomer.phone}</span>
                      </div>
                      <div>
                        <label className="block text-xs text-[#57534E] mb-1">Preferred Artist</label>
                        <input
                          type="text"
                          value={editingPreferredStylist}
                          onChange={(e) => setEditingPreferredStylist(e.target.value)}
                          className="w-full px-3 py-2 bg-[#FAF7F4] border border-[#D6CEC5] rounded-lg text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-[#57534E] mb-1">
                          Skin Undertone, Hair History & Allergies
                        </label>
                        <textarea
                          rows={3}
                          value={editingNotes}
                          onChange={(e) => setEditingNotes(e.target.value)}
                          className="w-full px-3 py-2 bg-[#FAF7F4] border border-[#D6CEC5] rounded-lg text-sm"
                        />
                      </div>
                      <button
                        type="button"
                        disabled={busyId === 'save_cust_notes'}
                        onClick={handleSaveCustomerNotes}
                        className="px-4 py-2 rounded-lg bg-[#8E3B46] text-white text-xs font-medium hover:bg-[#6E2C35] cursor-pointer"
                      >
                        {busyId === 'save_cust_notes' ? 'Saving...' : 'Save Consultation Notes'}
                      </button>
                    </div>

                    <div className="space-y-3">
                      <h3 className="text-sm font-semibold text-[#1C1917]">
                        Appointment History ({selectedCustomer.visits.length})
                      </h3>
                      {selectedCustomer.visits.length === 0 ? (
                        <p className="text-sm text-[#57534E]">No recorded visits yet.</p>
                      ) : (
                        selectedCustomer.visits.map((visit) => (
                          <div
                            key={visit.id}
                            className="p-4 bg-white border border-[#E5DDD5] rounded-lg space-y-1"
                          >
                            <div className="flex items-center justify-between text-xs text-[#57534E]">
                              <span className="font-mono tabular-nums">
                                {visit.appointmentDate} · {visit.appointmentTime}
                              </span>
                              <span className="font-medium text-[#1C1917]">{visit.status}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <p className="font-medium text-sm text-[#1C1917]">{visit.serviceName}</p>
                              <p className="font-mono text-sm font-semibold tabular-nums text-[#1C1917]">
                                {formatCurrency(visit.amountPaid)} / {formatCurrency(visit.totalAmount)}
                              </p>
                            </div>
                            <p className="text-xs text-[#57534E]">
                              Artist: {visit.staffName} · {visit.paymentStatus} ({visit.paymentMethod}) ·{' '}
                              <span className="font-mono">{visit.transactionRef}</span>
                            </p>
                            {visit.notes && (
                              <p className="text-xs text-[#57534E] italic pt-1">Note: {visit.notes}</p>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: STAFF SCHEDULES & SERVICE MENU */}
        {activeTab === 'schedules' && (
          <div className="mt-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-1 p-1 bg-[#F2ECE6] rounded-lg border border-[#E5DDD5]">
                <button
                  type="button"
                  onClick={() => setScheduleSubTab('staff')}
                  className={`px-3.5 py-1.5 rounded-md text-xs font-medium cursor-pointer ${
                    scheduleSubTab === 'staff' ? 'bg-white text-[#1C1917] shadow-xs' : 'text-[#57534E]'
                  }`}
                >
                  Staff Weekly Schedules ({staff.length})
                </button>
                <button
                  type="button"
                  onClick={() => setScheduleSubTab('menu')}
                  className={`px-3.5 py-1.5 rounded-md text-xs font-medium cursor-pointer ${
                    scheduleSubTab === 'menu' ? 'bg-white text-[#1C1917] shadow-xs' : 'text-[#57534E]'
                  }`}
                >
                  Service Menu ({services.length})
                </button>
              </div>

              {scheduleSubTab === 'staff' ? (
                <button
                  type="button"
                  onClick={() => setShowNewStaffForm((v) => !v)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[#D6CEC5] bg-white text-xs font-medium text-[#1C1917] hover:bg-[#F2ECE6] cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Artist / Stylist
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowNewServiceForm((v) => !v)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[#D6CEC5] bg-white text-xs font-medium text-[#1C1917] hover:bg-[#F2ECE6] cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Service Treatment
                </button>
              )}
            </div>

            {scheduleSubTab === 'staff' && (
              <>
                {showNewStaffForm && (
                  <form
                    onSubmit={handleAddStaff}
                    className="p-5 bg-white border border-[#E5DDD5] rounded-xl space-y-4"
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <input
                        type="text"
                        placeholder="Stylist Name"
                        value={newStaffName}
                        onChange={(e) => setNewStaffName(e.target.value)}
                        className="px-3 py-2 bg-[#FAF7F4] border border-[#D6CEC5] rounded-lg text-sm"
                      />
                      <input
                        type="text"
                        placeholder="Role (e.g. Senior Hair Stylist)"
                        value={newStaffRole}
                        onChange={(e) => setNewStaffRole(e.target.value)}
                        className="px-3 py-2 bg-[#FAF7F4] border border-[#D6CEC5] rounded-lg text-sm"
                      />
                      <input
                        type="text"
                        placeholder="Specialty"
                        value={newStaffSpecialty}
                        onChange={(e) => setNewStaffSpecialty(e.target.value)}
                        className="px-3 py-2 bg-[#FAF7F4] border border-[#D6CEC5] rounded-lg text-sm"
                      />
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {ALL_DAYS.map((day) => {
                          const on = newStaffDays.includes(day);
                          return (
                            <button
                              key={day}
                              type="button"
                              onClick={() =>
                                setNewStaffDays((prev) =>
                                  prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
                                )
                              }
                              className={`px-2.5 py-1 rounded text-xs font-medium border cursor-pointer ${
                                on
                                  ? 'bg-[#8E3B46] text-white border-[#8E3B46]'
                                  : 'bg-[#FAF7F4] text-[#57534E] border-[#D6CEC5]'
                              }`}
                            >
                              {day}
                            </button>
                          );
                        })}
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="time"
                          value={newStaffStart}
                          onChange={(e) => setNewStaffStart(e.target.value)}
                          className="px-2.5 py-1.5 bg-[#FAF7F4] border border-[#D6CEC5] rounded-lg text-xs font-mono"
                        />
                        <span className="text-xs text-[#57534E]">to</span>
                        <input
                          type="time"
                          value={newStaffEnd}
                          onChange={(e) => setNewStaffEnd(e.target.value)}
                          className="px-2.5 py-1.5 bg-[#FAF7F4] border border-[#D6CEC5] rounded-lg text-xs font-mono"
                        />
                        <button
                          type="submit"
                          disabled={busyId === 'add_staff'}
                          className="px-4 py-2 rounded-lg bg-[#8E3B46] text-white text-xs font-medium cursor-pointer"
                        >
                          Add Stylist
                        </button>
                      </div>
                    </div>
                  </form>
                )}

                <div className="space-y-3">
                  {staff.map((member) => {
                    const draft = getStaffDraft(member);
                    const hasChanges = Boolean(staffDrafts[member.id]);
                    return (
                      <div
                        key={member.id}
                        className="p-4 bg-white border border-[#E5DDD5] rounded-xl flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                      >
                        <div className="space-y-0.5 min-w-[200px]">
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-[#1C1917]">{draft.name}</p>
                            <span
                              className={`text-xs font-medium ${
                                draft.active ? 'text-[#15803D]' : 'text-[#57534E]'
                              }`}
                            >
                              · {draft.active ? 'Active' : 'Inactive'}
                            </span>
                          </div>
                          <p className="text-xs text-[#57534E]">{draft.role}</p>
                          <p className="text-xs text-[#57534E]">{draft.specialty}</p>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5">
                          {ALL_DAYS.map((day) => {
                            const on = draft.shiftDays.includes(day);
                            return (
                              <button
                                key={day}
                                type="button"
                                onClick={() => toggleStaffDay(member, day)}
                                className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors cursor-pointer ${
                                  on
                                    ? 'bg-[#1C1917] text-white border-[#1C1917]'
                                    : 'bg-[#FAF7F4] text-[#57534E] border-[#D6CEC5]'
                                }`}
                              >
                                {day}
                              </button>
                            );
                          })}
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            type="time"
                            value={draft.shiftStart}
                            onChange={(e) => updateStaffDraft(member, { shiftStart: e.target.value })}
                            className="px-2.5 py-1.5 bg-[#FAF7F4] border border-[#D6CEC5] rounded-lg text-xs font-mono"
                          />
                          <span className="text-xs text-[#57534E]">–</span>
                          <input
                            type="time"
                            value={draft.shiftEnd}
                            onChange={(e) => updateStaffDraft(member, { shiftEnd: e.target.value })}
                            className="px-2.5 py-1.5 bg-[#FAF7F4] border border-[#D6CEC5] rounded-lg text-xs font-mono"
                          />
                          <button
                            type="button"
                            onClick={() => updateStaffDraft(member, { active: !draft.active })}
                            className="px-3 py-1.5 rounded-lg border border-[#D6CEC5] text-xs font-medium text-[#57534E] hover:text-[#1C1917] cursor-pointer"
                          >
                            {draft.active ? 'Disable' : 'Enable'}
                          </button>
                          <button
                            type="button"
                            disabled={!hasChanges || busyId === member.id}
                            onClick={() => handleSaveStaffRow(member)}
                            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors ${
                              hasChanges
                                ? 'bg-[#8E3B46] text-white hover:bg-[#6E2C35]'
                                : 'bg-[#F2ECE6] text-[#57534E] cursor-default'
                            }`}
                          >
                            {busyId === member.id ? 'Saving...' : 'Save Shift'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {scheduleSubTab === 'menu' && (
              <>
                {showNewServiceForm && (
                  <form
                    onSubmit={handleAddService}
                    className="p-5 bg-white border border-[#E5DDD5] rounded-xl space-y-3"
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                      <input
                        type="text"
                        placeholder="Treatment Name"
                        value={newSvcName}
                        onChange={(e) => setNewSvcName(e.target.value)}
                        className="px-3 py-2 bg-[#FAF7F4] border border-[#D6CEC5] rounded-lg text-sm"
                      />
                      <select
                        value={newSvcCategory}
                        onChange={(e) => setNewSvcCategory(e.target.value as ServiceCategory)}
                        className="px-3 py-2 bg-[#FAF7F4] border border-[#D6CEC5] rounded-lg text-sm"
                      >
                        {SERVICE_CATEGORIES.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        placeholder="Price (INR)"
                        value={newSvcPrice}
                        onChange={(e) => setNewSvcPrice(e.target.value)}
                        className="px-3 py-2 bg-[#FAF7F4] border border-[#D6CEC5] rounded-lg text-sm font-mono"
                      />
                      <input
                        type="number"
                        placeholder="Duration (mins)"
                        value={newSvcDuration}
                        onChange={(e) => setNewSvcDuration(e.target.value)}
                        className="px-3 py-2 bg-[#FAF7F4] border border-[#D6CEC5] rounded-lg text-sm font-mono"
                      />
                    </div>
                    <div className="flex gap-3">
                      <input
                        type="text"
                        placeholder="Service description for customers..."
                        value={newSvcDesc}
                        onChange={(e) => setNewSvcDesc(e.target.value)}
                        className="flex-1 px-3 py-2 bg-[#FAF7F4] border border-[#D6CEC5] rounded-lg text-sm"
                      />
                      <button
                        type="submit"
                        disabled={busyId === 'add_service'}
                        className="px-5 py-2 rounded-lg bg-[#8E3B46] text-white text-xs font-medium cursor-pointer"
                      >
                        Add Treatment
                      </button>
                    </div>
                  </form>
                )}

                <div className="bg-white border border-[#E5DDD5] rounded-xl overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-[#E5DDD5] text-xs font-medium text-[#57534E] bg-[#FAF7F4]">
                        <th className="py-3 px-4">Service</th>
                        <th className="py-3 px-4">Category</th>
                        <th className="py-3 px-4 text-right">Duration</th>
                        <th className="py-3 px-4 text-right">Price</th>
                        <th className="py-3 px-4">Visibility</th>
                        <th className="py-3 px-4 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E5DDD5] text-sm">
                      {services.map((svc) => (
                        <tr key={svc.id}>
                          <td className="py-3 px-4 font-medium text-[#1C1917]">{svc.name}</td>
                          <td className="py-3 px-4 text-[#57534E]">{svc.category}</td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums text-[#57534E]">
                            {svc.durationMins}m
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums font-medium text-[#1C1917]">
                            {formatCurrency(svc.price)}
                          </td>
                          <td className="py-3 px-4 text-xs font-medium">
                            <span className={svc.active ? 'text-[#15803D]' : 'text-[#57534E]'}>
                              {svc.active ? 'Listed' : 'Hidden'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <button
                              type="button"
                              disabled={busyId === svc.id}
                              onClick={() => handleToggleServiceActive(svc)}
                              className="px-3 py-1 rounded border border-[#D6CEC5] text-xs font-medium text-[#1C1917] hover:bg-[#F2ECE6] cursor-pointer"
                            >
                              {svc.active ? 'Hide' : 'Publish'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}

        {/* TAB 4: ATTENDANCE */}
        {activeTab === 'attendance' && (
          <div className="mt-6 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4 bg-white border border-[#E5DDD5] rounded-xl p-4">
              <div>
                <p className="text-sm font-semibold text-[#1C1917]">Daily Attendance Register</p>
                <p className="text-xs text-[#57534E]">
                  Record daily check-in, check-out, and presence status for each artist.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-[#57534E]">Register Date</label>
                <input
                  type="date"
                  value={attendanceDate}
                  onChange={(e) => setAttendanceDate(e.target.value)}
                  className="px-3 py-2 bg-[#FAF7F4] border border-[#D6CEC5] rounded-lg text-sm font-mono tabular-nums"
                />
              </div>
            </div>

            <div className="bg-white border border-[#E5DDD5] rounded-xl overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#E5DDD5] text-xs font-medium text-[#57534E] bg-[#FAF7F4]">
                    <th className="py-3 px-4">Artist</th>
                    <th className="py-3 px-4">Attendance Status</th>
                    <th className="py-3 px-4">Check-In</th>
                    <th className="py-3 px-4">Check-Out</th>
                    <th className="py-3 px-4">Notes</th>
                    <th className="py-3 px-4 text-right">Save</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5DDD5] text-sm">
                  {staff.map((member) => {
                    const entry = getAttendanceEntry(member.id, member.shiftStart);
                    const rowKey = `${member.id}_${attendanceDate}`;
                    const isDirty = Boolean(attDrafts[rowKey]);
                    const isSaved = attendance.some(
                      (a) => a.staffId === member.id && a.date === attendanceDate
                    );
                    return (
                      <tr key={member.id}>
                        <td className="py-3 px-4">
                          <div className="font-medium text-[#1C1917]">{member.name}</div>
                          <div className="text-xs text-[#57534E]">
                            Shift {member.shiftStart}–{member.shiftEnd}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex flex-wrap gap-1">
                            {(['Present', 'Half Day', 'Absent', 'On Leave'] as AttendanceStatus[]).map(
                              (st) => {
                                const selected = entry.status === st;
                                return (
                                  <button
                                    key={st}
                                    type="button"
                                    onClick={() => updateAttDraft(member, { status: st })}
                                    className={`px-2.5 py-1 rounded text-xs font-medium border cursor-pointer whitespace-nowrap ${
                                      selected
                                        ? st === 'Present'
                                          ? 'bg-[#15803D] text-white border-[#15803D]'
                                          : st === 'Half Day'
                                          ? 'bg-[#B45309] text-white border-[#B45309]'
                                          : 'bg-[#B91C1C] text-white border-[#B91C1C]'
                                        : 'bg-[#FAF7F4] text-[#57534E] border-[#D6CEC5]'
                                    }`}
                                  >
                                    {st}
                                  </button>
                                );
                              }
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <input
                            type="time"
                            value={entry.checkIn}
                            onChange={(e) => updateAttDraft(member, { checkIn: e.target.value })}
                            className="px-2 py-1 bg-[#FAF7F4] border border-[#D6CEC5] rounded text-xs font-mono"
                          />
                        </td>
                        <td className="py-3 px-4">
                          <input
                            type="time"
                            value={entry.checkOut}
                            onChange={(e) => updateAttDraft(member, { checkOut: e.target.value })}
                            className="px-2 py-1 bg-[#FAF7F4] border border-[#D6CEC5] rounded text-xs font-mono"
                          />
                        </td>
                        <td className="py-3 px-4">
                          <input
                            type="text"
                            value={entry.notes}
                            placeholder="Optional remark"
                            onChange={(e) => updateAttDraft(member, { notes: e.target.value })}
                            className="w-40 px-2.5 py-1 bg-[#FAF7F4] border border-[#D6CEC5] rounded text-xs"
                          />
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <button
                            type="button"
                            disabled={busyId === rowKey}
                            onClick={() => handleSaveAttendance(member)}
                            className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer ${
                              isDirty || !isSaved
                                ? 'bg-[#8E3B46] text-white hover:bg-[#6E2C35]'
                                : 'bg-[#F2ECE6] text-[#1C1917] hover:bg-[#E5DDD5]'
                            }`}
                          >
                            <Check className="w-3.5 h-3.5" />
                            {busyId === rowKey ? 'Saving' : isSaved && !isDirty ? 'Logged' : 'Save'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Attendance Cumulative Summary */}
            <div className="bg-white border border-[#E5DDD5] rounded-xl overflow-x-auto">
              <div className="px-4 py-3 border-b border-[#E5DDD5]">
                <h2 className="text-sm font-semibold text-[#1C1917]">
                  Cumulative Attendance Summary
                </h2>
              </div>
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#E5DDD5] text-xs font-medium text-[#57534E] bg-[#FAF7F4]">
                    <th className="py-2.5 px-4">Artist</th>
                    <th className="py-2.5 px-4 text-right">Present</th>
                    <th className="py-2.5 px-4 text-right">Half Day</th>
                    <th className="py-2.5 px-4 text-right">Absent</th>
                    <th className="py-2.5 px-4 text-right">On Leave</th>
                    <th className="py-2.5 px-4 text-right">Total Days Logged</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5DDD5] text-sm">
                  {attendanceSummary.map((row) => (
                    <tr key={row.staff.id}>
                      <td className="py-2.5 px-4 font-medium text-[#1C1917]">{row.staff.name}</td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums text-[#15803D]">
                        {row.present}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums text-[#B45309]">
                        {row.halfDay}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums text-[#B91C1C]">
                        {row.absent}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums text-[#57534E]">
                        {row.leave}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums font-medium text-[#1C1917]">
                        {row.totalLogged}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 5: REVENUE REPORTS */}
        {activeTab === 'reports' && (
          <div className="mt-6 space-y-6">
            {/* Period Filter */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-[#E5DDD5] rounded-xl p-4">
              <div className="flex items-center gap-1 p-1 bg-[#F2ECE6] rounded-lg border border-[#E5DDD5]">
                {(
                  [
                    { id: 'today', label: 'Today' },
                    { id: '7d', label: 'Last 7 Days' },
                    { id: '30d', label: 'Last 30 Days' },
                    { id: 'all', label: 'All Time' },
                    { id: 'custom', label: 'Custom Range' },
                  ] as const
                ).map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setReportRange(r.id)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer whitespace-nowrap ${
                      reportRange === r.id ? 'bg-white text-[#1C1917] shadow-xs' : 'text-[#57534E]'
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>

              {reportRange === 'custom' && (
                <div className="flex items-center gap-2 text-xs">
                  <input
                    type="date"
                    value={customStart}
                    onChange={(e) => setCustomStart(e.target.value)}
                    className="px-2.5 py-1.5 bg-[#FAF7F4] border border-[#D6CEC5] rounded-lg font-mono"
                  />
                  <span className="text-[#57534E]">to</span>
                  <input
                    type="date"
                    value={customEnd}
                    onChange={(e) => setCustomEnd(e.target.value)}
                    className="px-2.5 py-1.5 bg-[#FAF7F4] border border-[#D6CEC5] rounded-lg font-mono"
                  />
                </div>
              )}
            </div>

            {/* 4 KPI Strip */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-5 bg-white border border-[#E5DDD5] rounded-xl">
                <p className="text-xs text-[#57534E]">Collected Revenue</p>
                <p className="font-mono text-2xl font-semibold tabular-nums text-[#15803D] mt-1">
                  {formatCurrency(reportMetrics.collected)}
                </p>
                <p className="text-xs text-[#57534E] mt-1 tabular-nums">
                  Across {reportMetrics.totalCount} active bookings
                </p>
              </div>
              <div className="p-5 bg-white border border-[#E5DDD5] rounded-xl">
                <p className="text-xs text-[#57534E]">Gross Booking Value</p>
                <p className="font-mono text-2xl font-semibold tabular-nums text-[#1C1917] mt-1">
                  {formatCurrency(reportMetrics.grossValue)}
                </p>
                <p className="text-xs text-[#57534E] mt-1">Includes advance + full</p>
              </div>
              <div className="p-5 bg-white border border-[#E5DDD5] rounded-xl">
                <p className="text-xs text-[#57534E]">Pending Studio Balances</p>
                <p className="font-mono text-2xl font-semibold tabular-nums text-[#B45309] mt-1">
                  {formatCurrency(reportMetrics.pendingBalance)}
                </p>
                <p className="text-xs text-[#57534E] mt-1">Remaining on advance bookings</p>
              </div>
              <div className="p-5 bg-white border border-[#E5DDD5] rounded-xl">
                <p className="text-xs text-[#57534E]">Completed Sessions</p>
                <p className="font-mono text-2xl font-semibold tabular-nums text-[#1C1917] mt-1">
                  {reportMetrics.completedCount}
                </p>
                <p className="text-xs text-[#57534E] mt-1">Settled visits in period</p>
              </div>
            </div>

            {/* Daily Revenue Chart & Category Breakdown */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 p-5 bg-white border border-[#E5DDD5] rounded-xl">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold text-[#1C1917]">
                    Collected Revenue by Date
                  </h2>
                  <span className="text-xs text-[#57534E] font-mono">INR</span>
                </div>

                {reportMetrics.dailySeries.length === 0 ? (
                  <div className="h-52 flex items-center justify-center text-sm text-[#57534E]">
                    No revenue recorded in the selected date window.
                  </div>
                ) : (
                  <div className="h-56 flex items-end gap-3 pt-6 pb-2 border-b border-[#E5DDD5]">
                    {reportMetrics.dailySeries.map(([dateStr, val]) => {
                      const pct = Math.max(8, Math.round((val / maxDailyRev) * 100));
                      return (
                        <div
                          key={dateStr}
                          className="flex-1 flex flex-col items-center justify-end h-full group"
                        >
                          <span className="text-[11px] font-mono tabular-nums text-[#57534E] mb-1.5">
                            {formatCurrency(val)}
                          </span>
                          <div
                            style={{ height: `${pct}%` }}
                            className="w-full max-w-[44px] bg-[#8E3B46] group-hover:bg-[#6E2C35] rounded-t-md transition-colors"
                          />
                          <span className="text-[11px] font-mono text-[#57534E] mt-2">
                            {dateStr.slice(5)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="p-5 bg-white border border-[#E5DDD5] rounded-xl space-y-4">
                <h2 className="text-sm font-semibold text-[#1C1917]">Revenue by Category</h2>
                <div className="space-y-3.5">
                  {reportMetrics.byCategory.map(([cat, stat]) => {
                    const share =
                      reportMetrics.collected > 0
                        ? Math.round((stat.revenue / reportMetrics.collected) * 100)
                        : 0;
                    return (
                      <div key={cat} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium text-[#1C1917]">{cat}</span>
                          <span className="font-mono tabular-nums text-[#57534E]">
                            {formatCurrency(stat.revenue)} ({share}%)
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-[#F2ECE6] overflow-hidden">
                          <div
                            style={{ width: `${share}%` }}
                            className="h-full bg-[#8E3B46] rounded-full"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="pt-4 border-t border-[#E5DDD5] space-y-2">
                  <h3 className="text-xs font-semibold text-[#57534E]">Payment Methods</h3>
                  {reportMetrics.byMethod.length === 0 ? (
                    <p className="text-xs text-[#57534E]">No payments in range.</p>
                  ) : (
                    reportMetrics.byMethod.map(([method, amt]) => (
                      <div key={method} className="flex justify-between text-xs">
                        <span className="text-[#1C1917]">{method}</span>
                        <span className="font-mono tabular-nums font-medium text-[#1C1917]">
                          {formatCurrency(amt)}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Artist Revenue Leaderboard */}
            <div className="bg-white border border-[#E5DDD5] rounded-xl overflow-x-auto">
              <div className="px-4 py-3 border-b border-[#E5DDD5]">
                <h2 className="text-sm font-semibold text-[#1C1917]">
                  Artist Performance & Revenue Attribution
                </h2>
              </div>
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#E5DDD5] text-xs font-medium text-[#57534E] bg-[#FAF7F4]">
                    <th className="py-3 px-4">Artist</th>
                    <th className="py-3 px-4 text-right">Appointments</th>
                    <th className="py-3 px-4 text-right">Gross Value</th>
                    <th className="py-3 px-4 text-right">Collected Revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5DDD5] text-sm">
                  {reportMetrics.byStaff.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-[#57534E]">
                        No artist bookings in this date range.
                      </td>
                    </tr>
                  ) : (
                    reportMetrics.byStaff.map((row) => (
                      <tr key={row.name}>
                        <td className="py-3 px-4 font-medium text-[#1C1917]">{row.name}</td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-[#57534E]">
                          {row.visits}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-[#57534E]">
                          {formatCurrency(row.gross)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-[#1C1917]">
                          {formatCurrency(row.collected)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 6: AUTOMATED EMAILS */}
        {activeTab === 'emails' && (
          <div className="mt-6 space-y-5">
            <div className="p-5 bg-white border border-[#E5DDD5] rounded-xl grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-medium text-[#8E3B46]">Firebase Function Trigger 01</p>
                <p className="text-sm font-semibold text-[#1C1917] mt-1">
                  onAppointmentCreated (Instant Confirmation)
                </p>
                <p className="text-xs text-[#57534E] mt-1">
                  Automatically sends an HTML booking & payment receipt email whenever a customer books online.
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-[#8E3B46]">Firebase Function Trigger 02</p>
                <p className="text-sm font-semibold text-[#1C1917] mt-1">
                  sendAppointmentReminders (24h Scheduled Cron)
                </p>
                <p className="text-xs text-[#57534E] mt-1">
                  Checks hourly for confirmed next-day visits (IST) and dispatches appointment reminder emails.
                </p>
              </div>
            </div>

            <div className="bg-white border border-[#E5DDD5] rounded-xl overflow-x-auto">
              <div className="px-4 py-3 border-b border-[#E5DDD5] flex items-center justify-between">
                <h2 className="text-sm font-semibold text-[#1C1917]">
                  Email Dispatch Log ({emailLogs.length})
                </h2>
                <span className="text-xs text-[#57534E]">Tracked in /emailLogs</span>
              </div>
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#E5DDD5] text-xs font-medium text-[#57534E] bg-[#FAF7F4]">
                    <th className="py-3 px-4">Type</th>
                    <th className="py-3 px-4">Customer & Email</th>
                    <th className="py-3 px-4">Subject</th>
                    <th className="py-3 px-4">Visit Date</th>
                    <th className="py-3 px-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5DDD5] text-sm">
                  {emailLogs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-10 text-center text-[#57534E]">
                        No automated email logs recorded yet. Deploy Firebase Functions with SMTP secrets to log live dispatches.
                      </td>
                    </tr>
                  ) : (
                    emailLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-[#FAF7F4]/70">
                        <td className="py-3 px-4 capitalize text-xs font-medium text-[#1C1917]">
                          {log.emailType}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-medium text-[#1C1917]">{log.customerName}</div>
                          <div className="text-xs text-[#57534E]">{log.recipientEmail}</div>
                        </td>
                        <td className="py-3 px-4 text-xs text-[#57534E]">
                          <div>{log.subject}</div>
                          {log.errorMessage && (
                            <div className="text-[#B91C1C] mt-0.5">{log.errorMessage}</div>
                          )}
                        </td>
                        <td className="py-3 px-4 font-mono text-xs tabular-nums text-[#57534E]">
                          {log.scheduledDate}
                        </td>
                        <td className="py-3 px-4 text-xs font-medium">
                          <span
                            className={
                              log.status === 'Sent'
                                ? 'text-[#15803D]'
                                : log.status === 'Failed'
                                ? 'text-[#B91C1C]'
                                : 'text-[#B45309]'
                            }
                          >
                            {log.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
