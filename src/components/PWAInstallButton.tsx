import { useState } from 'react';
import { Download, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export function PWAInstallButton() {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className="inline-flex items-center gap-2 px-4 py-3 rounded-lg border border-[#D6CEC5] bg-white hover:bg-[#F2ECE6] text-xs font-medium text-[#1C1917] transition-colors cursor-pointer whitespace-nowrap shrink-0"
      >
        <Download className="w-3.5 h-3.5 text-[#8E3B46]" />
        Install App
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className="inline-flex items-center gap-2 px-4 py-3 rounded-lg border border-[#D6CEC5] bg-white hover:bg-[#F2ECE6] text-xs font-medium text-[#1C1917] transition-colors cursor-pointer whitespace-nowrap shrink-0"
        >
          <Smartphone className="w-3.5 h-3.5 text-[#8E3B46]" />
          Install App
        </button>

        {showIOSGuide && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-[#1C1917]/55 backdrop-blur-xs p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ios-install-title"
          >
            <div className="w-full max-w-sm rounded-xl bg-[#FAF7F4] border border-[#E5DDD5] p-6 shadow-2xl">
              <div className="flex items-center justify-between">
                <h3 id="ios-install-title" className="font-display text-xl font-semibold text-[#1C1917]">
                  Install Star Beauty App
                </h3>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  aria-label="Close install instructions"
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-[#57534E] hover:bg-[#F2ECE6] cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <ol className="mt-3 space-y-2 text-xs text-[#57534E] leading-relaxed list-decimal list-inside">
                <li>
                  Tap the <strong>Share</strong> icon in your Safari toolbar.
                </li>
                <li>
                  Scroll down and tap <strong>Add to Home Screen</strong>.
                </li>
                <li>
                  Tap <strong>Add</strong> to launch Star Beauty Make-Up Studio like a native app.
                </li>
              </ol>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="mt-5 w-full rounded-lg bg-[#8E3B46] hover:bg-[#6E2C35] py-2.5 text-xs font-medium text-white cursor-pointer"
              >
                Got it
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
}
