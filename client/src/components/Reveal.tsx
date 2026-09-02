import { useEffect, useRef, useState, type ReactNode } from "react";

interface RevealProps {
  children: ReactNode;
  /** Stagger delay in ms, applied per-item by the caller (e.g. index * 80). */
  delay?: number;
  className?: string;
}

/** Fades an element up into place the first time it scrolls into view, then leaves it alone —
 * a real scroll-triggered reveal (IntersectionObserver), not just a mount animation. Falls back
 * to already-visible if IntersectionObserver isn't available, so content is never stuck hidden. */
export function Reveal({ children, delay = 0, className }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(typeof IntersectionObserver === "undefined");

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.2 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className={`reveal${visible ? " reveal--visible" : ""}${className ? ` ${className}` : ""}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}
