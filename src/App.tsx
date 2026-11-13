import { useEffect, useMemo, useState } from 'react';
import { User, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { ArrowRight, Calendar, Clock, Search, ShieldCheck, Menu, X } from 'lucide-react';
import { SEED_REVIEWS, SEED_SERVICES, SEED_STAFF } from './data/seedSalonData';
import { auth, googleProvider, testFirestoreConnection } from './lib/firebase';
import {
  ensureStudioSeededIfEmpty,
  subscribeAllAppointments,
  subscribeAllAttendance,
  subscribeAllCustomers,
  subscribeCustomerAppointments,
  subscribeEmailLogs,
  subscribeReviews,
  subscribeServices,
  subscribeStaff,
} from './services/salonApi';
import {
  ADMIN_EMAIL,
  Appointment,
  AttendanceRecord,
  ClientReview,
  CustomerProfile,
  EmailLog,
  SERVICE_CATEGORIES,
  ServiceCategory,
  ServiceItem,
  StaffMember,
  formatCurrency,
} from './types/salon';
import { StudioImage } from './components/StudioImage';
import { BookingModal } from './components/BookingModal';
import { CustomerBookingsView } from './components/CustomerBookingsView';
import { AdminDashboard } from './components/AdminDashboard';
import { TestimonialsSection } from './components/TestimonialsSection';
import { MobileAuthModal } from './components/MobileAuthModal';
import { PWAInstallButton } from './components/PWAInstallButton';
import { OfflineIndicator } from './components/OfflineIndicator';

type AppView = 'home' | 'bookings' | 'admin';

export default function App() {
  const [view, setView] = useState<AppView>('home');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [services, setServices] = useState<ServiceItem[]>(SEED_SERVICES);
  const [staff, setStaff] = useState<StaffMember[]>(SEED_STAFF);
  const [reviews, setReviews] = useState<ClientReview[]>(SEED_REVIEWS);
  const [customerAppointments, setCustomerAppointments] = useState<Appointment[]>([]);
  const [loadingCustomerApts, setLoadingCustomerApts] = useState(false);

  // Admin datasets
  const [allAppointments, setAllAppointments] = useState<Appointment[]>([]);
  const [allCustomers, setAllCustomers] = useState<CustomerProfile[]>([]);
  const [allAttendance, setAllAttendance] = useState<AttendanceRecord[]>([]);
  const [emailLogs, setEmailLogs] = useState<EmailLog[]>([]);

  // Menu filters
  const [categoryFilter, setCategoryFilter] = useState<'All' | ServiceCategory>('All');
  const [menuSearch, setMenuSearch] = useState('');

  // Booking & Mobile Auth Modal state
  const [bookingOpen, setBookingOpen] = useState(false);
  const [bookingInitialService, setBookingInitialService] = useState<ServiceItem | null>(null);
  const [bookingInitialStaff, setBookingInitialStaff] = useState<StaffMember | null>(null);
  const [bookingWalkInMode, setBookingWalkInMode] = useState(false);

  const [mobileAuthOpen, setMobileAuthOpen] = useState(false);
  const [mobileAuthContext, setMobileAuthContext] = useState<string | undefined>(undefined);
  const [pendingBookingOpts, setPendingBookingOpts] = useState<{
    service?: ServiceItem | null;
    stylist?: StaffMember | null;
  } | null>(null);

  const isAdmin = Boolean(
    user && user.emailVerified && user.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase()
  );

  // Initial Firebase connection & public catalog subscriptions
  useEffect(() => {
    testFirestoreConnection();

    const unsubServices = subscribeServices(
      (items) => {
        if (items.length > 0) setServices(items);
      },
      () => {
        // Fallback stays active if offline
      }
    );

    const unsubStaff = subscribeStaff(
      (items) => {
        if (items.length > 0) setStaff(items);
      },
      () => {
        // Fallback stays active if offline
      }
    );

    const unsubReviews = subscribeReviews(
      (items) => {
        if (items.length > 0) setReviews(items);
      },
      () => {
        // Fallback stays active if offline
      }
    );

    const unsubAuth = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
    });

    return () => {
      unsubServices();
      unsubStaff();
      unsubReviews();
      unsubAuth();
    };
  }, []);

  // Authenticated user subscriptions
  useEffect(() => {
    if (!authReady || !user) {
      setCustomerAppointments([]);
      setAllAppointments([]);
      setAllCustomers([]);
      setAllAttendance([]);
      setEmailLogs([]);
      return;
    }

    setLoadingCustomerApts(true);
    const unsubMyApts = subscribeCustomerAppointments(
      user.uid,
      (apts) => {
        setCustomerAppointments(apts);
        setLoadingCustomerApts(false);
      },
      () => setLoadingCustomerApts(false)
    );

    let unsubAllApts: (() => void) | undefined;
    let unsubAllCusts: (() => void) | undefined;
    let unsubAllAtt: (() => void) | undefined;
    let unsubEmailLogs: (() => void) | undefined;

    if (user.emailVerified && user.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
      ensureStudioSeededIfEmpty(false).catch(() => {});
      unsubAllApts = subscribeAllAppointments(setAllAppointments);
      unsubAllCusts = subscribeAllCustomers(setAllCustomers);
      unsubAllAtt = subscribeAllAttendance(setAllAttendance);
      unsubEmailLogs = subscribeEmailLogs(setEmailLogs);
    }

    return () => {
      unsubMyApts();
      unsubAllApts?.();
      unsubAllCusts?.();
      unsubAllAtt?.();
      unsubEmailLogs?.();
    };
  }, [authReady, user]);

  const handleAdminGoogleSignIn = async (): Promise<User | null> => {
    setAuthError(null);
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      return cred.user;
    } catch (err) {
      setAuthError(
        err instanceof Error && err.message.includes('popup-closed-by-user')
          ? 'Sign-in window was closed before completing.'
          : 'Could not complete Google Sign-In. Please allow popups and try again.'
      );
      return null;
    }
  };

  const openCustomerMobileAuth = (contextMsg?: string) => {
    setMobileAuthContext(contextMsg);
    setMobileAuthOpen(true);
  };

  const handleReviewRequireSignIn = async (): Promise<User | null> => {
    openCustomerMobileAuth('Sign in with your +91 mobile number and OTP to publish your review.');
    return null;
  };

  const handleSignOut = async () => {
    await signOut(auth);
    if (view === 'admin') setView('home');
  };

  const openBooking = (opts?: {
    service?: ServiceItem | null;
    stylist?: StaffMember | null;
    walkIn?: boolean;
  }) => {
    if (!opts?.walkIn && !user) {
      setPendingBookingOpts({
        service: opts?.service ?? null,
        stylist: opts?.stylist ?? null,
      });
      openCustomerMobileAuth(
        opts?.service
          ? `Sign in or sign up with your +91 mobile number and OTP to book ${opts.service.name}.`
          : 'Sign in or sign up with your +91 mobile number and OTP to book an appointment.'
      );
      return;
    }
    setBookingInitialService(opts?.service ?? null);
    setBookingInitialStaff(opts?.stylist ?? null);
    setBookingWalkInMode(Boolean(opts?.walkIn));
    setBookingOpen(true);
  };

  const visibleServices = useMemo(() => {
    const q = menuSearch.trim().toLowerCase();
    return services.filter((svc) => {
      if (!svc.active) return false;
      if (categoryFilter !== 'All' && svc.category !== categoryFilter) return false;
      if (!q) return true;
      return (
        svc.name.toLowerCase().includes(q) ||
        svc.description.toLowerCase().includes(q) ||
        svc.category.toLowerCase().includes(q)
      );
    });
  }, [services, categoryFilter, menuSearch]);

  const activeStaff = useMemo(() => staff.filter((s) => s.active), [staff]);

  const scrollToSection = (id: string) => {
    setMobileNavOpen(false);
    if (view !== 'home') {
      setView('home');
      setTimeout(() => {
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
      }, 60);
    } else {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF7F4] text-[#1C1917]">
      {/* Top Bar — Strict 3-Zone Contract */}
      <header className="sticky top-0 z-40 bg-[#FAF7F4]/95 backdrop-blur-sm border-b border-[#E5DDD5]">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-8">
          {/* Zone 1: Single-element brand wordmark */}
          <button
            type="button"
            onClick={() => setView('home')}
            className="font-display text-xl sm:text-[1.65rem] font-semibold tracking-[-0.015em] text-[#1C1917] whitespace-nowrap shrink-0 cursor-pointer"
          >
            Star Beauty Make-Up Studio
          </button>

          {/* Zone 2: 5 concise single-line nav links */}
          <nav className="hidden lg:flex items-center gap-7 text-sm font-medium text-[#57534E]">
            <button
              type="button"
              onClick={() => scrollToSection('service-menu')}
              className="hover:text-[#1C1917] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Service Menu
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('our-artists')}
              className="hover:text-[#1C1917] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Artists
            </button>
            <button
              type="button"
              onClick={() => setView('bookings')}
              className={`hover:text-[#1C1917] transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                view === 'bookings' ? 'text-[#8E3B46] underline underline-offset-4' : ''
              }`}
            >
              My Bookings
            </button>
            <button
              type="button"
              onClick={() => setView('admin')}
              className={`hover:text-[#1C1917] transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                view === 'admin' ? 'text-[#8E3B46] underline underline-offset-4' : ''
              }`}
            >
              Admin Studio
            </button>
            {user ? (
              <button
                type="button"
                onClick={handleSignOut}
                className="hover:text-[#1C1917] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Sign Out ({user.displayName?.split(' ')[0] || user.phoneNumber || 'Account'})
              </button>
            ) : (
              <button
                type="button"
                onClick={() => openCustomerMobileAuth()}
                className="hover:text-[#1C1917] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Sign In
              </button>
            )}
          </nav>

          {/* Zone 3: Single primary CTA + Mobile drawer trigger */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => openBooking()}
              className="hidden sm:inline-flex items-center px-5 py-2.5 rounded-lg bg-[#8E3B46] hover:bg-[#6E2C35] text-white text-xs font-medium tracking-wide transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              Book Appointment
            </button>
            <button
              type="button"
              onClick={() => setMobileNavOpen((v) => !v)}
              aria-label="Toggle navigation menu"
              className="lg:hidden w-10 h-10 flex items-center justify-center rounded-lg border border-[#E5DDD5] text-[#1C1917] cursor-pointer"
            >
              {mobileNavOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Menu */}
        {mobileNavOpen && (
          <div className="lg:hidden border-t border-[#E5DDD5] bg-white px-6 py-4 space-y-3 text-sm font-medium">
            <button
              type="button"
              onClick={() => scrollToSection('service-menu')}
              className="block w-full text-left py-2 text-[#1C1917]"
            >
              Service Menu
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('our-artists')}
              className="block w-full text-left py-2 text-[#1C1917]"
            >
              Artists
            </button>
            <button
              type="button"
              onClick={() => {
                setView('bookings');
                setMobileNavOpen(false);
              }}
              className="block w-full text-left py-2 text-[#1C1917]"
            >
              My Bookings
            </button>
            <button
              type="button"
              onClick={() => {
                setView('admin');
                setMobileNavOpen(false);
              }}
              className="block w-full text-left py-2 text-[#1C1917]"
            >
              Admin Studio
            </button>
            <div className="pt-2 border-t border-[#E5DDD5] flex items-center justify-between gap-3">
              {user ? (
                <button
                  type="button"
                  onClick={() => {
                    handleSignOut();
                    setMobileNavOpen(false);
                  }}
                  className="text-xs text-[#57534E]"
                >
                  Sign Out ({user.displayName || user.phoneNumber || user.email})
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setMobileNavOpen(false);
                    openCustomerMobileAuth();
                  }}
                  className="text-xs text-[#8E3B46] font-semibold"
                >
                  Sign In with Mobile OTP
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setMobileNavOpen(false);
                  openBooking();
                }}
                className="px-4 py-2 rounded-lg bg-[#8E3B46] text-white text-xs font-medium"
              >
                Book Appointment
              </button>
            </div>
          </div>
        )}
      </header>

      {authError && (
        <div className="bg-[#FEE2E2] border-b border-[#FCA5A5] text-[#991B1B] text-xs px-6 py-2.5 text-center">
          {authError}
        </div>
      )}

      {/* VIEW: HOME STOREFRONT */}
      {view === 'home' && (
        <main className="flex-1">
          {/* Hero Split — items-stretch for balanced 2-column geometry */}
          <section className="max-w-7xl mx-auto px-6 pt-10 pb-12 lg:pt-14 lg:pb-16">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-stretch">
              <div className="lg:col-span-6 flex flex-col justify-center py-2">
                <p className="text-xs font-medium tracking-wide text-[#8E3B46] mb-3">
                  Ladies Salon & Make-up Atelier · Tue–Sun, 09:30–20:00
                </p>
                <h1
                  className="font-display text-4xl sm:text-5xl lg:text-[3.5rem] font-semibold leading-[1.08] tracking-tight text-[#1C1917]"
                  style={{ textWrap: 'balance' }}
                >
                  Refined bridal artistry, luminous skin, and restorative hair rituals.
                </h1>
                <p className="mt-5 text-base text-[#57534E] leading-relaxed max-w-xl">
                  Welcome to Star Beauty Make-Up Studio. Browse our complete treatment menu, choose your preferred artist, and reserve your chair online with a flexible 30% advance deposit or full payment.
                </p>

                <div className="mt-8 flex flex-wrap items-center gap-4">
                  <button
                    type="button"
                    onClick={() => openBooking()}
                    className="inline-flex items-center gap-2 px-6 py-3.5 rounded-lg bg-[#8E3B46] hover:bg-[#6E2C35] text-white text-sm font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    Book an Appointment
                    <ArrowRight className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => scrollToSection('service-menu')}
                    className="inline-flex items-center px-5 py-3.5 rounded-lg border border-[#D6CEC5] bg-white hover:bg-[#F2ECE6] text-[#1C1917] text-sm font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    Explore Service Menu
                  </button>
                  <PWAInstallButton />
                </div>

                <div className="mt-8 pt-6 border-t border-[#E5DDD5] flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-[#57534E]">
                  <span>Bridal & HD Makeup</span>
                  <span aria-hidden="true">·</span>
                  <span>Botanical Hair Spa</span>
                  <span aria-hidden="true">·</span>
                  <span>Glass Skin Facials</span>
                  <span aria-hidden="true">·</span>
                  <span>Manicure & Lash Lounge</span>
                </div>
              </div>

              <div className="lg:col-span-6">
                <div className="relative h-72 sm:h-96 lg:h-full min-h-[380px] rounded-xl overflow-hidden border border-[#E5DDD5] bg-[#F2ECE6]">
                  <StudioImage
                    imageKey="hero"
                    alt="Star Beauty Make-Up Studio serene travertine vanity stations and natural daylight"
                    className="w-full h-full object-cover"
                    titleFallback="Star Beauty Make-Up Studio"
                  />
                  <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-[#1C1917]/65 via-[#1C1917]/25 to-transparent pointer-events-none" />
                  <div className="absolute bottom-4 left-5 right-5 flex items-end justify-between text-white">
                    <div>
                      <p className="text-xs text-white/85">Signature Vanity Suite</p>
                      <p className="font-display text-xl font-medium">
                        Private Bridal & Editorial Lounge
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Full-Width 4-Column Studio Proof Strip */}
            <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 border border-[#E5DDD5] bg-white rounded-xl divide-y sm:divide-y-0 sm:divide-x divide-[#E5DDD5]">
              <div className="p-5">
                <p className="text-xs font-medium text-[#8E3B46]">01. Flexible Payment</p>
                <p className="mt-1 text-sm font-semibold text-[#1C1917]">
                  30% Advance or 100% Full
                </p>
                <p className="mt-1 text-xs text-[#57534E]">
                  Reserve instantly via UPI, Card, or NetBanking with digital receipt.
                </p>
              </div>
              <div className="p-5">
                <p className="text-xs font-medium text-[#8E3B46]">02. Curated Artists</p>
                <p className="mt-1 text-sm font-semibold text-[#1C1917] tabular-nums">
                  {activeStaff.length} Senior Specialists
                </p>
                <p className="mt-1 text-xs text-[#57534E]">
                  Book directly against live weekly shift schedules.
                </p>
              </div>
              <div className="p-5">
                <p className="text-xs font-medium text-[#8E3B46]">03. Service Catalog</p>
                <p className="mt-1 text-sm font-semibold text-[#1C1917] tabular-nums">
                  {services.filter((s) => s.active).length} Signature Treatments
                </p>
                <p className="mt-1 text-xs text-[#57534E]">
                  Transparent timing and pricing across four studio disciplines.
                </p>
              </div>
              <div className="p-5">
                <p className="text-xs font-medium text-[#8E3B46]">04. Studio Hours</p>
                <p className="mt-1 text-sm font-semibold text-[#1C1917] font-mono tabular-nums">
                  09:30 – 20:00
                </p>
                <p className="mt-1 text-xs text-[#57534E]">
                  Open all week for scheduled sessions & bridal trials.
                </p>
              </div>
            </div>
          </section>

          {/* Service Menu Section */}
          <section id="service-menu" className="border-t border-[#E5DDD5] bg-white py-14 lg:py-16">
            <div className="max-w-7xl mx-auto px-6">
              <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 pb-8 border-b border-[#E5DDD5]">
                <div>
                  <p className="text-xs font-medium text-[#8E3B46] mb-1">Curated Treatments</p>
                  <h2 className="font-display text-3xl sm:text-4xl font-semibold text-[#1C1917]">
                    Studio Service Menu
                  </h2>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  {/* Segmented Category Filter */}
                  <div className="flex items-center gap-1 p-1 bg-[#FAF7F4] rounded-lg border border-[#E5DDD5] overflow-x-auto">
                    {(['All', ...SERVICE_CATEGORIES] as const).map((cat) => {
                      const active = categoryFilter === cat;
                      return (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setCategoryFilter(cat)}
                          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                            active
                              ? 'bg-[#1C1917] text-white'
                              : 'text-[#57534E] hover:text-[#1C1917]'
                          }`}
                        >
                          {cat === 'All' ? 'All Treatments' : cat}
                        </button>
                      );
                    })}
                  </div>

                  {/* Live Menu Search */}
                  <div className="relative min-w-[210px]">
                    <Search className="w-4 h-4 text-[#57534E] absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={menuSearch}
                      onChange={(e) => setMenuSearch(e.target.value)}
                      placeholder="Filter treatments..."
                      className="w-full pl-9 pr-3 py-2 bg-[#FAF7F4] border border-[#E5DDD5] rounded-lg text-xs text-[#1C1917] focus:outline-none focus:border-[#8E3B46]"
                    />
                  </div>
                </div>
              </div>

              {visibleServices.length === 0 ? (
                <div className="py-12 text-center text-sm text-[#57534E]">
                  No treatments match your search. Clear filters to view all studio services.
                </div>
              ) : (
                <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {visibleServices.map((svc) => (
                    <article
                      key={svc.id}
                      className="group bg-[#FAF7F4] border border-[#E5DDD5] rounded-xl overflow-hidden flex flex-col transition-transform duration-200 hover:-translate-y-0.5"
                    >
                      <div className="aspect-[4/3] w-full overflow-hidden bg-[#F2ECE6] border-b border-[#E5DDD5]">
                        <StudioImage
                          imageKey={svc.imageKey}
                          alt={`${svc.name} at Star Beauty Make-Up Studio`}
                          titleFallback={svc.name}
                          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                        />
                      </div>

                      <div className="p-5 flex-1 flex flex-col justify-between gap-4">
                        <div>
                          <div className="flex items-center gap-2 text-xs text-[#57534E]">
                            <span>{svc.category}</span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono tabular-nums">{svc.durationMins} mins</span>
                            {svc.featured && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="text-[#8E3B46] font-medium">Signature</span>
                              </>
                            )}
                          </div>
                          <h3 className="font-display text-2xl font-semibold text-[#1C1917] mt-1.5">
                            {svc.name}
                          </h3>
                          <p className="mt-2 text-xs text-[#57534E] leading-relaxed line-clamp-3">
                            {svc.description}
                          </p>
                        </div>

                        <div className="pt-4 border-t border-[#E5DDD5] flex items-center justify-between gap-3">
                          <div>
                            <p className="font-mono text-lg font-semibold text-[#1C1917] tabular-nums">
                              {formatCurrency(svc.price)}
                            </p>
                            <p className="text-[11px] text-[#57534E] tabular-nums">
                              Advance from {formatCurrency(Math.round(svc.price * 0.3))}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => openBooking({ service: svc })}
                            className="px-4 py-2 rounded-lg bg-[#8E3B46] hover:bg-[#6E2C35] text-white text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0"
                          >
                            Select & Book
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* Artists & Schedule Availability Section */}
          <section id="our-artists" className="max-w-7xl mx-auto px-6 py-14 lg:py-16">
            <div className="flex flex-wrap items-end justify-between gap-4 pb-8 border-b border-[#E5DDD5]">
              <div>
                <p className="text-xs font-medium text-[#8E3B46] mb-1">Studio Team</p>
                <h2 className="font-display text-3xl sm:text-4xl font-semibold text-[#1C1917]">
                  Artists & Weekly Availability
                </h2>
              </div>
              <p className="text-sm text-[#57534E] max-w-md">
                Every appointment pairs you directly with an artist whose studio shift matches your preferred date.
              </p>
            </div>

            <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {activeStaff.map((member) => (
                <div
                  key={member.id}
                  className="p-6 bg-white border border-[#E5DDD5] rounded-xl flex flex-col justify-between gap-5"
                >
                  <div>
                    <p className="text-xs font-medium text-[#8E3B46]">{member.role}</p>
                    <h3 className="font-display text-2xl font-semibold text-[#1C1917] mt-1">
                      {member.name}
                    </h3>
                    <p className="text-xs text-[#57534E] mt-2 leading-relaxed">
                      {member.specialty}
                    </p>
                  </div>

                  <div className="pt-4 border-t border-[#E5DDD5] space-y-3">
                    <div className="flex items-center justify-between text-xs text-[#57534E]">
                      <span className="inline-flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5" />
                        {member.shiftDays.join(', ')}
                      </span>
                      <span className="inline-flex items-center gap-1 font-mono tabular-nums text-[#1C1917]">
                        <Clock className="w-3.5 h-3.5 text-[#57534E]" />
                        {member.shiftStart}–{member.shiftEnd}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => openBooking({ stylist: member })}
                      className="w-full py-2.5 px-4 rounded-lg border border-[#D6CEC5] hover:border-[#8E3B46] hover:bg-[#FAF7F4] text-xs font-medium text-[#1C1917] transition-colors cursor-pointer"
                    >
                      Book with {member.name.split(' ')[0]}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Verified Client Reviews & Testimonials */}
          <TestimonialsSection
            reviews={reviews}
            services={services}
            user={user}
            onRequireSignIn={handleReviewRequireSignIn}
            onBookService={(svc) => openBooking({ service: svc })}
          />
        </main>
      )}

      {/* VIEW: MY BOOKINGS */}
      {view === 'bookings' && (
        <main className="flex-1">
          <CustomerBookingsView
            user={user}
            appointments={customerAppointments}
            loading={loadingCustomerApts}
            onSignIn={() => openCustomerMobileAuth()}
            onBookNew={() => openBooking()}
            onBackHome={() => setView('home')}
          />
        </main>
      )}

      {/* VIEW: ADMIN STUDIO */}
      {view === 'admin' && (
        <main className="flex-1">
          {!user ? (
            <section className="max-w-lg mx-auto px-6 py-20 text-center">
              <div className="p-8 bg-white border border-[#E5DDD5] rounded-xl space-y-4">
                <ShieldCheck className="w-8 h-8 text-[#8E3B46] mx-auto" strokeWidth={1.5} />
                <h1 className="font-display text-3xl font-semibold text-[#1C1917]">
                  Admin Studio Sign-In
                </h1>
                <p className="text-sm text-[#57534E] leading-relaxed">
                  Sign in with your verified studio administrator Google account to access customer visit history, staff schedules, daily attendance, automated email logs, and revenue reports.
                </p>
                <div className="pt-2 flex flex-col sm:flex-row gap-3 justify-center">
                  <button
                    type="button"
                    onClick={handleAdminGoogleSignIn}
                    className="px-5 py-2.5 rounded-lg bg-[#8E3B46] hover:bg-[#6E2C35] text-white text-sm font-medium cursor-pointer"
                  >
                    Sign in with Google
                  </button>
                  <button
                    type="button"
                    onClick={() => setView('home')}
                    className="px-5 py-2.5 rounded-lg border border-[#D6CEC5] text-sm font-medium text-[#57534E] hover:text-[#1C1917] cursor-pointer"
                  >
                    Return to Storefront
                  </button>
                </div>
              </div>
            </section>
          ) : !isAdmin ? (
            <section className="max-w-lg mx-auto px-6 py-20 text-center">
              <div className="p-8 bg-white border border-[#E5DDD5] rounded-xl space-y-4">
                <ShieldCheck className="w-8 h-8 text-[#B91C1C] mx-auto" strokeWidth={1.5} />
                <h1 className="font-display text-3xl font-semibold text-[#1C1917]">
                  Administrator Access Required
                </h1>
                <p className="text-sm text-[#57534E] leading-relaxed">
                  You are currently signed in as{' '}
                  <span className="font-medium text-[#1C1917]">
                    {user.email || user.phoneNumber}
                  </span>
                  . Studio administration is restricted to verified salon administrators ({ADMIN_EMAIL}).
                </p>
                <div className="pt-2 flex flex-col sm:flex-row gap-3 justify-center">
                  <button
                    type="button"
                    onClick={handleAdminGoogleSignIn}
                    className="px-5 py-2.5 rounded-lg bg-[#8E3B46] hover:bg-[#6E2C35] text-white text-sm font-medium cursor-pointer"
                  >
                    Switch Google Account
                  </button>
                  <button
                    type="button"
                    onClick={() => setView('home')}
                    className="px-5 py-2.5 rounded-lg border border-[#D6CEC5] text-sm font-medium text-[#57534E] hover:text-[#1C1917] cursor-pointer"
                  >
                    Return to Storefront
                  </button>
                </div>
              </div>
            </section>
          ) : (
            <AdminDashboard
              appointments={allAppointments}
              customers={allCustomers}
              staff={staff}
              services={services}
              attendance={allAttendance}
              emailLogs={emailLogs}
              onOpenWalkInBooking={() => openBooking({ walkIn: true })}
              onExitAdmin={() => setView('home')}
            />
          )}
        </main>
      )}

      {/* Quiet Editorial Footer (shown on customer storefront & my bookings) */}
      {view !== 'admin' && (
        <footer className="border-t border-[#E5DDD5] bg-white">
          <div className="max-w-7xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-[#57534E]">
            <div>
              <span className="font-display text-base font-semibold text-[#1C1917]">
                Star Beauty Make-Up Studio
              </span>
              <span className="mx-2" aria-hidden="true">·</span>
              <span>Ladies Salon, Bridal Artistry & Skin Atelier</span>
            </div>
            <div className="flex flex-wrap items-center gap-5">
              <button
                type="button"
                onClick={() => scrollToSection('service-menu')}
                className="hover:text-[#1C1917] cursor-pointer"
              >
                Service Menu
              </button>
              <button
                type="button"
                onClick={() => scrollToSection('client-reviews')}
                className="hover:text-[#1C1917] cursor-pointer"
              >
                Client Reviews
              </button>
              <button
                type="button"
                onClick={() => setView('bookings')}
                className="hover:text-[#1C1917] cursor-pointer"
              >
                My Bookings
              </button>
              <button
                type="button"
                onClick={() => setView('admin')}
                className="hover:text-[#1C1917] cursor-pointer"
              >
                Admin Studio
              </button>
              <PWAInstallButton />
              <span>© {new Date().getFullYear()} Star Beauty Make-Up Studio</span>
            </div>
          </div>
        </footer>
      )}

      {/* Booking & Advance/Full Payment Modal */}
      <BookingModal
        open={bookingOpen}
        onClose={() => setBookingOpen(false)}
        services={services}
        staff={staff}
        initialService={bookingInitialService}
        initialStaff={bookingInitialStaff}
        user={user}
        onRequireSignIn={handleAdminGoogleSignIn}
        asAdminWalkIn={bookingWalkInMode}
        onViewMyBookings={() => setView('bookings')}
      />

      {/* Customer Mobile + OTP Sign In / Sign Up Modal */}
      <MobileAuthModal
        open={mobileAuthOpen}
        contextMessage={mobileAuthContext}
        onClose={() => {
          setMobileAuthOpen(false);
          setPendingBookingOpts(null);
        }}
        onVerified={() => {
          setMobileAuthOpen(false);
          if (pendingBookingOpts) {
            const opts = pendingBookingOpts;
            setPendingBookingOpts(null);
            setBookingInitialService(opts.service ?? null);
            setBookingInitialStaff(opts.stylist ?? null);
            setBookingWalkInMode(false);
            setBookingOpen(true);
          }
        }}
      />
      <OfflineIndicator />
    </div>
  );
}
