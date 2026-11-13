import { useEffect, useRef, useState } from 'react';
import {
  ConfirmationResult,
  RecaptchaVerifier,
  User,
  signInWithPhoneNumber,
} from 'firebase/auth';
import { ArrowRight, KeyRound, Smartphone, X } from 'lucide-react';
import { auth } from '../lib/firebase';
import { formatIndiaPhone, isValidIndiaPhoneDigits } from '../types/salon';
import { IndiaPhoneInput } from './IndiaPhoneInput';

interface MobileAuthModalProps {
  open: boolean;
  onClose: () => void;
  onVerified: (user: User) => void;
  contextMessage?: string;
}

export function MobileAuthModal({
  open,
  onClose,
  onVerified,
  contextMessage,
}: MobileAuthModalProps) {
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [phoneDigits, setPhoneDigits] = useState('');
  const [otp, setOtp] = useState('');
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<ConfirmationResult | null>(null);

  const recaptchaRef = useRef<RecaptchaVerifier | null>(null);
  const recaptchaContainerId = 'sb-phone-recaptcha';

  useEffect(() => {
    if (!open) {
      if (recaptchaRef.current) {
        try {
          recaptchaRef.current.clear();
        } catch {
          // ignore cleanup error
        }
        recaptchaRef.current = null;
      }
      setStep('phone');
      setOtp('');
      setErrorMsg(null);
      setConfirmation(null);
    }
  }, [open]);

  if (!open) return null;

  const ensureRecaptcha = (): RecaptchaVerifier => {
    if (!recaptchaRef.current) {
      recaptchaRef.current = new RecaptchaVerifier(auth, recaptchaContainerId, {
        size: 'invisible',
      });
    }
    return recaptchaRef.current;
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!isValidIndiaPhoneDigits(phoneDigits)) {
      setErrorMsg('Please enter a valid 10-digit Indian mobile number after +91.');
      return;
    }

    setSending(true);
    try {
      const verifier = ensureRecaptcha();
      const e164 = formatIndiaPhone(phoneDigits);
      const result = await signInWithPhoneNumber(auth, e164, verifier);
      setConfirmation(result);
      setStep('otp');
    } catch (err) {
      const code = (err as { code?: string })?.code || '';
      if (
        code === 'auth/operation-not-allowed' ||
        code === 'auth/configuration-not-found'
      ) {
        setErrorMsg(
          'Phone OTP login is not enabled yet in Firebase Console. Enable Authentication → Sign-in method → Phone for project gen-lang-client-0621241830.'
        );
      } else if (code === 'auth/billing-not-enabled') {
        setErrorMsg(
          'Firebase Phone SMS requires billing or a Firebase Test Phone Number configured in Authentication → Sign-in method → Phone.'
        );
      } else if (code === 'auth/invalid-phone-number') {
        setErrorMsg('Please check your 10-digit +91 mobile number and try again.');
      } else {
        setErrorMsg(
          err instanceof Error
            ? err.message
            : 'Unable to send OTP right now. Please try again.'
        );
      }
      if (recaptchaRef.current) {
        try {
          recaptchaRef.current.clear();
        } catch {
          // ignore
        }
        recaptchaRef.current = null;
      }
    } finally {
      setSending(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!confirmation) {
      setStep('phone');
      return;
    }
    if (otp.trim().length !== 4) {
      setErrorMsg('Enter the 4-digit OTP sent to your mobile number.');
      return;
    }

    setVerifying(true);
    try {
      const cred = await confirmation.confirm(otp.trim());
      onVerified(cred.user);
    } catch (err) {
      const code = (err as { code?: string })?.code || '';
      if (code === 'auth/invalid-verification-code') {
        setErrorMsg('Incorrect 4-digit OTP code. Please double-check and try again.');
      } else if (code === 'auth/code-expired') {
        setErrorMsg('This OTP has expired. Please request a new code.');
      } else {
        setErrorMsg(err instanceof Error ? err.message : 'OTP verification failed.');
      }
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#1C1917]/55 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mobile-auth-title"
    >
      <div className="w-full max-w-md bg-[#FAF7F4] border border-[#E5DDD5] rounded-xl shadow-2xl overflow-hidden">
        <div className="px-6 py-4 bg-white border-b border-[#E5DDD5] flex items-center justify-between">
          <div>
            <p className="text-xs text-[#57534E]">Star Beauty Make-Up Studio</p>
            <h2 id="mobile-auth-title" className="font-display text-2xl font-semibold text-[#1C1917]">
              {step === 'phone' ? 'Customer Mobile Sign In' : 'Verify Mobile OTP'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close mobile sign in"
            className="w-9 h-9 flex items-center justify-center rounded-lg text-[#57534E] hover:bg-[#F2ECE6] cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {contextMessage && (
            <div className="px-3.5 py-2.5 rounded-lg bg-[#F2ECE6] border border-[#E5DDD5] text-xs text-[#1C1917]">
              {contextMessage}
            </div>
          )}

          {errorMsg && (
            <div
              role="alert"
              className="px-3.5 py-2.5 rounded-lg bg-[#FEE2E2]/70 border border-[#FCA5A5] text-xs text-[#991B1B] leading-relaxed"
            >
              {errorMsg}
            </div>
          )}

          {step === 'phone' ? (
            <form onSubmit={handleSendOtp} className="space-y-4">
              <div>
                <label
                  htmlFor="auth-mobile-input"
                  className="block text-xs font-medium text-[#1C1917] mb-1.5"
                >
                  Mobile Number (India +91 · 10 digits)
                </label>
                <IndiaPhoneInput
                  id="auth-mobile-input"
                  valueDigits={phoneDigits}
                  onChangeDigits={setPhoneDigits}
                />
              </div>

              <div id={recaptchaContainerId} />

              <button
                type="submit"
                disabled={sending}
                className="w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-[#8E3B46] hover:bg-[#6E2C35] disabled:opacity-60 text-white text-sm font-medium transition-colors cursor-pointer"
              >
                <Smartphone className="w-4 h-4" />
                {sending ? 'Sending OTP...' : 'Send 4-Digit OTP'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <div className="p-3 rounded-lg bg-white border border-[#E5DDD5] flex items-center justify-between text-xs">
                <span className="text-[#57534E]">
                  OTP sent to <strong className="font-mono text-[#1C1917]">+91 {phoneDigits}</strong>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setStep('phone');
                    setOtp('');
                    setErrorMsg(null);
                  }}
                  className="text-[#8E3B46] font-medium hover:underline cursor-pointer"
                >
                  Change
                </button>
              </div>

              <div>
                <label
                  htmlFor="auth-otp-input"
                  className="block text-xs font-medium text-[#1C1917] mb-1.5"
                >
                  Enter 4-Digit OTP
                </label>
                <input
                  id="auth-otp-input"
                  type="text"
                  inputMode="numeric"
                  maxLength={4}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="1234"
                  className="w-full px-3.5 py-2.5 bg-white border border-[#D6CEC5] rounded-lg text-base font-mono tracking-[0.35em] text-center text-[#1C1917] focus:outline-none focus:border-[#8E3B46]"
                />
              </div>

              <button
                type="submit"
                disabled={verifying}
                className="w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-[#8E3B46] hover:bg-[#6E2C35] disabled:opacity-60 text-white text-sm font-medium transition-colors cursor-pointer"
              >
                <KeyRound className="w-4 h-4" />
                {verifying ? 'Verifying...' : 'Verify OTP & Continue'}
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
