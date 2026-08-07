"use client";

import { useEffect, useRef, type ReactNode } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

/**
 * Fade + rise as the element enters view, staggered across its children.
 *
 * The initial hidden state is set from JS rather than a CSS class, so if the
 * script never runs the content is simply visible — a marketing page that
 * renders blank without JavaScript is worse than one without animation.
 */
export function Reveal({
  children,
  className,
  stagger = 0.08,
  y = 28,
  selector,
}: {
  children: ReactNode;
  className?: string;
  /** Seconds between each child. 0 animates the block as one unit. */
  stagger?: number;
  y?: number;
  /** Which descendants to stagger. Defaults to direct children. */
  selector?: string;
}) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const targets: Element[] = selector
      ? Array.from(el.querySelectorAll(selector))
      : Array.from(el.children);
    if (targets.length === 0) return;

    const ctx = gsap.context(() => {
      gsap.fromTo(
        targets,
        { opacity: 0, y },
        {
          opacity: 1,
          y: 0,
          duration: 0.85,
          ease: "power3.out",
          stagger,
          scrollTrigger: {
            trigger: el,
            // Fire a little before the block is fully on screen, so content
            // is already settling by the time the eye reaches it.
            start: "top 85%",
            once: true,
          },
        },
      );
    }, el);

    return () => ctx.revert();
  }, [stagger, y, selector]);

  return (
    <div ref={root} className={className}>
      {children}
    </div>
  );
}
