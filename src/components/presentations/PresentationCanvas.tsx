import { useEffect, useRef, useState } from 'react';
import { getSlideDimensions } from '@/lib/presentations/presentationDocument';
import { sanitizePresentationHtml } from '@/lib/presentations/presentationHtml';

/** Scale the fixed canvas from its host, so slide-provided JavaScript is unnecessary. */
export function PresentationCanvas({ html, title }: { html: string; title: string }) {
  const host = useRef<HTMLDivElement>(null);
  const [availableWidth, setAvailableWidth] = useState(0);
  const { width, height } = getSlideDimensions(html);
  useEffect(() => {
    if (!host.current) return;
    const observer = new ResizeObserver(([entry]) => setAvailableWidth(entry.contentRect.width));
    observer.observe(host.current);
    return () => observer.disconnect();
  }, []);
  return <div ref={host} className="relative w-full overflow-hidden" style={{ aspectRatio: `${width}/${height}` }}>
    <iframe title={title} srcDoc={sanitizePresentationHtml(html)} sandbox="" referrerPolicy="no-referrer"
      style={{ border: 0, width, height, transform: `scale(${availableWidth / width})`, transformOrigin: 'top left', position: 'absolute', inset: 0 }} />
  </div>;
}
