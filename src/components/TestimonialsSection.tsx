import { useMemo, useState } from 'react';
import { User } from 'firebase/auth';
import { ArrowRight, Star, X } from 'lucide-react';
import { ClientReview, ServiceItem } from '../types/salon';
import { createClientReview } from '../services/salonApi';

interface TestimonialsSectionProps {
  reviews: ClientReview[];
  services: ServiceItem[];
  user: User | null;
  onRequireSignIn: () => Promise<User | null>;
  onBookService: (service: ServiceItem) => void;
}

export function TestimonialsSection({
  reviews,
  services,
  user,
  onRequireSignIn,
  onBookService,
}: TestimonialsSectionProps) {
  const [composerOpen, setComposerOpen] = useState(false);
  const [selectedServiceId, setSelectedServiceId] = useState(services[0]?.id || '');
  const [clientName, setClientName] = useState(user?.displayName || '');
  const [clientContext, setClientContext] = useState('Studio Client');
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const activeServices = useMemo(() => services.filter((s) => s.active), [services]);

  const averageRating = useMemo(() => {
    if (reviews.length === 0) return '5.0';
    const sum = reviews.reduce((acc, r) => acc + r.rating, 0);
    return (sum / reviews.length).toFixed(1);
  }, [reviews]);

  const openComposer = () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    if (!selectedServiceId && activeServices[0]) {
      setSelectedServiceId(activeServices[0].id);
    }
    if (user?.displayName && !clientName) {
      setClientName(user.displayName);
    }
    setComposerOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const svc = activeServices.find((s) => s.id === selectedServiceId) || activeServices[0];
    if (!svc) {
      setErrorMsg('Please select a treatment.');
      return;
    }
    if (clientName.trim().length < 2) {
      setErrorMsg('Please enter your name.');
      return;
    }
    if (comment.trim().length < 10) {
      setErrorMsg('Please share at least 10 characters about your experience.');
      return;
    }

    setSubmitting(true);
    try {
      let currentUser = user;
      if (!currentUser) {
        currentUser = await onRequireSignIn();
        if (!currentUser) {
          setErrorMsg('Please sign in with Google to publish your review.');
          setSubmitting(false);
          return;
        }
      }

      await createClientReview({
        service: svc,
        clientName: clientName.trim(),
        clientContext: clientContext.trim() || 'Studio Client',
        rating,
        comment: comment.trim(),
      });

      setComment('');
      setRating(5);
      setComposerOpen(false);
      setSuccessMsg('Thank you — your review is now live on our studio page.');
    } catch {
      setErrorMsg('Unable to submit review right now. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section
      id="client-reviews"
      className="border-t border-[#E5DDD5] bg-white py-14 lg:py-16"
    >
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 pb-8 border-b border-[#E5DDD5]">
          <div>
            <p className="text-xs font-medium text-[#8E3B46] mb-1">Client Social Proof</p>
            <h2 className="font-display text-3xl sm:text-4xl font-semibold text-[#1C1917]">
              Verified Client Reviews
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-6">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-0.5" aria-label={`Average rating ${averageRating} out of 5`}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <Star
                    key={n}
                    className="w-4 h-4 text-[#8E3B46] fill-[#8E3B46]"
                  />
                ))}
              </div>
              <div className="text-xs text-[#57534E]">
                <span className="font-mono font-semibold text-[#1C1917] tabular-nums">
                  {averageRating} / 5
                </span>
                <span className="mx-1.5" aria-hidden="true">·</span>
                <span className="tabular-nums">{reviews.length} client reviews</span>
              </div>
            </div>

            <button
              type="button"
              onClick={openComposer}
              className="px-4 py-2 rounded-lg border border-[#D6CEC5] hover:border-[#8E3B46] hover:bg-[#FAF7F4] text-xs font-medium text-[#1C1917] transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              Write a Review
            </button>
          </div>
        </div>

        {successMsg && (
          <div className="mt-6 px-4 py-3 rounded-lg bg-[#DCFCE7]/60 border border-[#86EFAC] text-xs font-medium text-[#14532D]">
            {successMsg}
          </div>
        )}

        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
          {reviews.map((rev) => {
            const matchedService = services.find((s) => s.id === rev.serviceId);
            const filledStars = Math.round(rev.rating);

            return (
              <article
                key={rev.id}
                className="p-6 bg-[#FAF7F4] border border-[#E5DDD5] rounded-xl flex flex-col justify-between gap-5"
              >
                <div className="space-y-3">
                  {/* Rating + Service Name metadata line (Zero-pill discipline) */}
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#57534E]">
                    <div className="flex items-center gap-2">
                      <div
                        className="flex items-center gap-0.5"
                        aria-label={`Rated ${rev.rating} out of 5`}
                      >
                        {[1, 2, 3, 4, 5].map((starIdx) => (
                          <Star
                            key={starIdx}
                            className={`w-3.5 h-3.5 ${
                              starIdx <= filledStars
                                ? 'text-[#8E3B46] fill-[#8E3B46]'
                                : 'text-[#D6CEC5]'
                            }`}
                          />
                        ))}
                      </div>
                      <span className="font-mono font-medium text-[#1C1917] tabular-nums">
                        {rev.rating.toFixed(1)} / 5
                      </span>
                    </div>
                    <span className="font-mono tabular-nums">{rev.visitDate}</span>
                  </div>

                  <p className="text-xs font-medium text-[#8E3B46]">
                    {rev.serviceName}
                  </p>

                  <blockquote className="text-sm text-[#1C1917] leading-relaxed">
                    “{rev.comment}”
                  </blockquote>
                </div>

                <div className="pt-4 border-t border-[#E5DDD5] flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[#1C1917]">{rev.clientName}</p>
                    <p className="text-xs text-[#57534E]">{rev.clientContext}</p>
                  </div>

                  {matchedService && matchedService.active && (
                    <button
                      type="button"
                      onClick={() => onBookService(matchedService)}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-[#8E3B46] hover:text-[#6E2C35] transition-colors cursor-pointer whitespace-nowrap shrink-0"
                    >
                      Book this treatment
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </div>

      {/* Write a Review Dialog */}
      {composerOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#1C1917]/55 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="review-modal-title"
        >
          <div className="w-full max-w-lg bg-[#FAF7F4] border border-[#E5DDD5] rounded-xl shadow-2xl overflow-hidden">
            <div className="px-6 py-4 bg-white border-b border-[#E5DDD5] flex items-center justify-between">
              <div>
                <p className="text-xs text-[#57534E]">Star Beauty Make-Up Studio</p>
                <h3 id="review-modal-title" className="font-display text-2xl font-semibold text-[#1C1917]">
                  Share Your Experience
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setComposerOpen(false)}
                aria-label="Close review dialog"
                className="w-9 h-9 flex items-center justify-center rounded-lg text-[#57534E] hover:bg-[#F2ECE6] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {errorMsg && (
                <div className="px-4 py-2.5 rounded-lg bg-[#FEE2E2]/70 border border-[#FCA5A5] text-xs text-[#991B1B]">
                  {errorMsg}
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-[#1C1917] mb-1.5">
                  Service Received
                </label>
                <select
                  value={selectedServiceId}
                  onChange={(e) => setSelectedServiceId(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-[#D6CEC5] rounded-lg text-sm text-[#1C1917] focus:outline-none focus:border-[#8E3B46]"
                >
                  {activeServices.map((svc) => (
                    <option key={svc.id} value={svc.id}>
                      {svc.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#1C1917] mb-1.5">
                  Your Rating
                </label>
                <div className="flex items-center gap-2">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setRating(n)}
                      aria-label={`Rate ${n} stars`}
                      className="p-1.5 rounded-lg bg-white border border-[#E5DDD5] cursor-pointer"
                    >
                      <Star
                        className={`w-5 h-5 ${
                          n <= rating ? 'text-[#8E3B46] fill-[#8E3B46]' : 'text-[#D6CEC5]'
                        }`}
                      />
                    </button>
                  ))}
                  <span className="ml-2 font-mono text-xs font-medium text-[#1C1917] tabular-nums">
                    {rating.toFixed(1)} / 5
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#1C1917] mb-1.5">
                    Your Name
                  </label>
                  <input
                    type="text"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    placeholder="e.g., Meenakshi Rao"
                    maxLength={80}
                    className="w-full px-3.5 py-2 bg-white border border-[#D6CEC5] rounded-lg text-sm text-[#1C1917] focus:outline-none focus:border-[#8E3B46]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#1C1917] mb-1.5">
                    Occasion / Client Type
                  </label>
                  <input
                    type="text"
                    value={clientContext}
                    onChange={(e) => setClientContext(e.target.value)}
                    placeholder="e.g., Bridal Client"
                    maxLength={80}
                    className="w-full px-3.5 py-2 bg-white border border-[#D6CEC5] rounded-lg text-sm text-[#1C1917] focus:outline-none focus:border-[#8E3B46]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#1C1917] mb-1.5">
                  Review
                </label>
                <textarea
                  rows={3}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  maxLength={400}
                  placeholder="Tell future guests about your stylist, results, and studio visit..."
                  className="w-full px-3.5 py-2 bg-white border border-[#D6CEC5] rounded-lg text-sm text-[#1C1917] focus:outline-none focus:border-[#8E3B46]"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setComposerOpen(false)}
                  className="px-4 py-2 rounded-lg text-xs font-medium text-[#57534E] hover:text-[#1C1917] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2.5 rounded-lg bg-[#8E3B46] hover:bg-[#6E2C35] disabled:opacity-60 text-white text-xs font-medium cursor-pointer"
                >
                  {submitting
                    ? 'Publishing...'
                    : user
                    ? 'Publish Review'
                    : 'Sign in & Publish'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
