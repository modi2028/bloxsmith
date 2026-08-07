"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { usePrefersReducedMotion } from "./use-reduced-motion";

gsap.registerPlugin(ScrollTrigger);

const REDUCED = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * A card that leans toward the cursor and lights up where the pointer is.
 *
 * Everything is written to CSS custom properties on the element rather than
 * React state — a card that re-rendered on mousemove would drop frames with
 * eight of them on screen. The glow is a radial gradient positioned from
 * those same properties, so one paint moves both.
 */
export function TiltCard({
  children,
  className = "",
  accent = "rgba(255,255,255,0.10)",
  intensity = 6,
  style,
}: {
  children: ReactNode;
  className?: string;
  accent?: string;
  /** Max tilt in degrees. */
  intensity?: number;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || REDUCED()) return;
    // Touch devices have no hover; the tilt would only fire on tap and feel
    // like a bug.
    if (!window.matchMedia("(hover: hover)").matches) return;

    let raf = 0;
    const onMove = (e: PointerEvent) => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const r = el.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width;
        const py = (e.clientY - r.top) / r.height;
        el.style.setProperty("--mx", `${px * 100}%`);
        el.style.setProperty("--my", `${py * 100}%`);
        el.style.setProperty("--rx", `${(0.5 - py) * intensity}deg`);
        el.style.setProperty("--ry", `${(px - 0.5) * intensity}deg`);
        el.style.setProperty("--glow-opacity", "1");
      });
    };
    const onLeave = () => {
      el.style.setProperty("--rx", "0deg");
      el.style.setProperty("--ry", "0deg");
      el.style.setProperty("--glow-opacity", "0");
    };

    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
    };
  }, [intensity]);

  return (
    <div
      ref={ref}
      className={`tilt-card ${className}`}
      style={{ ["--tilt-accent" as string]: accent, ...style }}
    >
      <span aria-hidden className="tilt-card__glow" />
      <div className="tilt-card__inner">{children}</div>
    </div>
  );
}

/**
 * A button that drifts toward the cursor as it approaches, then snaps back.
 * Small effect, disproportionate sense of responsiveness.
 */
export function MagneticLink({
  href,
  children,
  className = "",
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || REDUCED()) return;
    if (!window.matchMedia("(hover: hover)").matches) return;

    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const x = e.clientX - (r.left + r.width / 2);
      const y = e.clientY - (r.top + r.height / 2);
      gsap.to(el, {
        x: x * 0.28,
        y: y * 0.32,
        duration: 0.5,
        ease: "power3.out",
      });
    };
    const onLeave = () => {
      // Elastic on the way back is what makes it read as magnetic rather
      // than as laggy tracking.
      gsap.to(el, { x: 0, y: 0, duration: 0.8, ease: "elastic.out(1, 0.4)" });
    };

    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    return () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return (
    <a ref={ref} href={href} className={className}>
      {children}
    </a>
  );
}

/** Count from 0 to `to` when the number scrolls into view. */
export function CountUpNumber({
  to,
  suffix = "",
  duration = 1.6,
}: {
  to: number;
  suffix?: string;
  duration?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (REDUCED()) {
      el.textContent = `${to.toLocaleString()}${suffix}`;
      return;
    }

    const counter = { v: 0 };
    const ctx = gsap.context(() => {
      gsap.to(counter, {
        v: to,
        duration,
        ease: "power2.out",
        scrollTrigger: { trigger: el, start: "top 88%", once: true },
        onUpdate: () => {
          el.textContent = `${Math.round(counter.v).toLocaleString()}${suffix}`;
        },
      });
    }, el);
    return () => ctx.revert();
  }, [to, suffix, duration]);

  // Rendered with the final value so it is correct without JS and for
  // screen readers, then counted up from zero on entry.
  return <span ref={ref}>{`${to.toLocaleString()}${suffix}`}</span>;
}

/**
 * Draws an SVG path as it scrolls into view — used for the connector in the
 * "how it works" diagram so the flow reads as a flow.
 */
export function DrawLine({ className = "" }: { className?: string }) {
  const ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const svg = ref.current;
    if (!svg || REDUCED()) return;
    const path = svg.querySelector("path");
    if (!path) return;

    const len = path.getTotalLength();
    const ctx = gsap.context(() => {
      gsap.fromTo(
        path,
        { strokeDasharray: len, strokeDashoffset: len },
        {
          strokeDashoffset: 0,
          ease: "none",
          scrollTrigger: {
            trigger: svg,
            start: "top 85%",
            end: "bottom 55%",
            scrub: 0.8,
          },
        },
      );
    }, svg);
    return () => ctx.revert();
  }, []);

  return (
    <svg
      ref={ref}
      aria-hidden
      viewBox="0 0 1000 60"
      preserveAspectRatio="none"
      className={className}
    >
      <path
        d="M0 30 C 220 30, 240 8, 500 8 S 780 52, 1000 30"
        fill="none"
        stroke="url(#flow-grad)"
        strokeWidth="1.5"
      />
      <defs>
        <linearGradient id="flow-grad" x1="0" x2="1">
          <stop offset="0%" stopColor="#60a5fa" />
          <stop offset="50%" stopColor="#a78bfa" />
          <stop offset="100%" stopColor="#f59e0b" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/**
 * A looping mock of the product: a prompt types itself out, then build steps
 * stream in underneath. This is the closest the marketing page gets to
 * showing the thing actually working.
 */
const DEMO_PROMPTS = [
  {
    prompt: "Make a lava obby with 8 checkpoints",
    steps: [
      "Searching the Creator Store for “volcanic rock”",
      "Creating 24 platforms in Workspace",
      "Writing CheckpointService (ModuleScript)",
      "Wiring touch handlers + respawn",
    ],
  },
  {
    prompt: "Add a shop that sells speed boosts",
    steps: [
      "Creating ShopGui (ScreenGui)",
      "Writing PurchaseHandler (ServerScript)",
      "Adding remote with server-side validation",
      "Hooking leaderstats to currency",
    ],
  },
];

export function BuildDemo() {
  const [promptIndex, setPromptIndex] = useState(0);
  const [typed, setTyped] = useState("");
  const [visibleSteps, setVisibleSteps] = useState(0);
  const reduced = usePrefersReducedMotion();

  const current = DEMO_PROMPTS[promptIndex]!;

  // Derived rather than pushed into state: with reduced motion the demo is
  // simply shown complete, which needs no effect and no extra render.
  const shownPrompt = reduced ? current.prompt : typed;
  const shownSteps = reduced ? current.steps.length : visibleSteps;

  useEffect(() => {
    if (reduced) return;

    let cancelled = false;
    const timers: number[] = [];
    const wait = (ms: number) =>
      new Promise<void>((resolve) => {
        timers.push(window.setTimeout(resolve, ms));
      });

    (async () => {
      setTyped("");
      setVisibleSteps(0);
      await wait(500);
      for (let i = 1; i <= current.prompt.length; i++) {
        if (cancelled) return;
        setTyped(current.prompt.slice(0, i));
        // Jitter the cadence — perfectly even typing reads as a machine.
        await wait(28 + Math.random() * 45);
      }
      await wait(450);
      for (let s = 1; s <= current.steps.length; s++) {
        if (cancelled) return;
        setVisibleSteps(s);
        await wait(700);
      }
      await wait(2400);
      if (!cancelled) {
        setPromptIndex((i) => (i + 1) % DEMO_PROMPTS.length);
      }
    })();

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [promptIndex, current, reduced]);

  return (
    <div className="glass-card overflow-hidden rounded-2xl border border-line">
      <div className="flex items-center gap-2 border-b border-line px-5 py-3">
        <span className="size-2.5 rounded-full bg-red-500/60" />
        <span className="size-2.5 rounded-full bg-amber-500/60" />
        <span className="size-2.5 rounded-full bg-emerald-500/60" />
        <span className="ml-2 text-[11px] text-faint">Bloxsmith</span>
      </div>

      <div className="px-6 py-7">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 text-[11px] uppercase tracking-wider text-faint">
            You
          </span>
          <p className="min-h-[1.5rem] text-sm text-foreground">
            {shownPrompt}
            {!reduced && <span className="caret" aria-hidden />}
          </p>
        </div>

        <ul className="mt-6 space-y-2.5">
          {current.steps.map((step, i) => (
            <li
              key={step}
              className={`flex items-center gap-2.5 text-[13px] transition-all duration-500 ${
                i < shownSteps
                  ? "translate-y-0 opacity-100"
                  : "translate-y-1 opacity-0"
              }`}
            >
              {i < shownSteps - 1 ? (
                <svg
                  viewBox="0 0 16 16"
                  fill="none"
                  className="size-3.5 shrink-0 text-ember"
                >
                  <path
                    d="m3 8.5 3.2 3L13 5"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : (
                <span className="size-2 shrink-0 animate-pulse rounded-full bg-ember" />
              )}
              <span className="text-muted">{step}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
