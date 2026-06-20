import React, { useState } from 'react';
import { RefreshCw, ImageOff } from 'lucide-react';
import { cn } from '../../lib/utils';
import { getAltImageUrl } from '../../utils/formatters';

interface SmartImageProps {
  src: string;
  className?: string;
  alt?: string;
  onClick?: () => void;
  referrerPolicy?: React.HTMLAttributeReferrerPolicy;
}

export const SmartImage: React.FC<SmartImageProps> = ({ 
  src, 
  className, 
  alt = "Image", 
  onClick,
  referrerPolicy = "no-referrer"
}) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [currentSrc, setCurrentSrc] = useState(src);
  const [retried, setRetried] = useState(false);

  const handleError = () => {
    if (!retried) {
      const altUrl = getAltImageUrl(currentSrc);
      if (altUrl !== currentSrc) {
        setRetried(true);
        setCurrentSrc(altUrl);
        return;
      }
    }
    setError(true);
    setLoading(false);
  };

  const handleLoad = () => {
    setLoading(false);
  };

  return (
    <div className={cn("relative overflow-hidden bg-slate-100", className)}>
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-50/50 backdrop-blur-[2px] z-10">
          <RefreshCw className="animate-spin text-blue-400" size={20} />
        </div>
      )}
      
      {error ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-100 text-slate-400 gap-2">
          <ImageOff size={24} />
          <span className="text-[10px] font-black uppercase tracking-tighter">Failed to load</span>
        </div>
      ) : (
        <img
          src={currentSrc}
          alt={alt}
          onLoad={handleLoad}
          onError={handleError}
          onClick={onClick}
          className={cn(
            "w-full h-full object-cover transition-all duration-700",
            loading ? "opacity-0 scale-110 blur-sm" : "opacity-100 scale-100 blur-0",
            onClick && "cursor-zoom-in"
          )}
          referrerPolicy={referrerPolicy}
        />
      )}
    </div>
  );
};
