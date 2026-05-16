/**
 * ImageLightbox — Full-screen modal to view images in large format.
 * Click the backdrop or the X button to close.
 */

import { useEffect } from 'react';
import { X, ZoomIn } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ImageLightboxProps {
  src: string;
  alt?: string;
  onClose: () => void;
}

export function ImageLightbox({ src, alt = 'Imagen', onClose }: ImageLightboxProps) {
  // Close on Escape key
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <button
        className="absolute top-4 right-4 z-50 rounded-full bg-white/10 p-2 text-white hover:bg-white/20 transition-colors"
        onClick={onClose}
        aria-label="Cerrar"
      >
        <X className="h-6 w-6" />
      </button>
      <img
        src={src}
        alt={alt}
        className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}

/** Wrapper to make any image clickable to expand */
interface ExpandableImageProps {
  src: string;
  alt?: string;
  className?: string;
  lightboxOpen: boolean;
  onOpenLightbox: () => void;
  onCloseLightbox: () => void;
}

export function ExpandableImage({
  src,
  alt = 'Imagen',
  className,
  lightboxOpen,
  onOpenLightbox,
  onCloseLightbox,
}: ExpandableImageProps) {
  return (
    <>
      <div className="relative group cursor-pointer" onClick={onOpenLightbox}>
        <img src={src} alt={alt} className={cn('transition-opacity', className)} />
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors rounded-lg flex items-center justify-center">
          <ZoomIn className="h-6 w-6 text-white opacity-0 group-hover:opacity-80 transition-opacity drop-shadow-lg" />
        </div>
      </div>
      {lightboxOpen && (
        <ImageLightbox src={src} alt={alt} onClose={onCloseLightbox} />
      )}
    </>
  );
}
