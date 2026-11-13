import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { IMAGE_MAP, ImageKey } from '../types/salon';

interface StudioImageProps {
  imageKey: ImageKey | 'hero';
  alt: string;
  className?: string;
  titleFallback?: string;
}

export function StudioImage({
  imageKey,
  alt,
  className = '',
  titleFallback,
}: StudioImageProps) {
  const [failed, setFailed] = useState(false);
  const src = IMAGE_MAP[imageKey];

  if (failed || !src) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-gradient-to-br from-[#F2ECE6] via-[#EAE1D8] to-[#DFD3C6] text-[#57534E] p-6 text-center ${className}`}
        role="img"
        aria-label={alt}
      >
        <Sparkles className="w-6 h-6 text-[#8E3B46] mb-2" strokeWidth={1.5} />
        <span className="font-display text-lg font-medium text-[#1C1917]">
          {titleFallback || 'Star Beauty Make-Up Studio'}
        </span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
    />
  );
}
