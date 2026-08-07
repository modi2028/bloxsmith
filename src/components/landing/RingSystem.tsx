"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { usePrefersReducedMotion } from "./use-reduced-motion";

gsap.registerPlugin(ScrollTrigger);

/**
 * The build loop, as concentric rings.
 *
 * Rings are SVG rather than a second WebGL canvas: the hero already owns a
 * GPU context, and a second one for what is fundamentally four circles would
 * cost more than the entire rest of the page. SVG also gets crisp edges at
 * any size and real pointer events for free.
 *
 * Each ring assembles as you scroll through the pinned section, then the
 * system idles — rotating, with a node orbiting each ring — and cycles
 * through the stages on its own until the pointer takes over.
 */
const STAGES = [
  {
    id: "read",
    label: "Reads your place",
    detail:
      "Before touching anything it walks your hierarchy — what exists, what you have selected, what the parts are actually called.",
    tools: ["list_children", "get_selection", "get_properties"],
    accent: "#60a5fa",
    radius: 168,
  },
  {
    id: "search",
    label: "Finds reference",
    detail:
      "Searches the live web for how a real version looks, and the Creator Store for meshes worth using instead of building from blocks.",
    tools: ["web_search", "search_assets"],
    accent: "#a78bfa",
    radius: 132,
  },
  {
    id: "build",
    label: "Writes and applies",
    detail:
      "Creates instances, sets properties and writes complete Luau — applied straight into your open session, not pasted into a chat window.",
    tools: ["create_instance", "write_script", "insert_asset"],
    accent: "#f0abfc",
    radius: 96,
  },
  {
    id: "verify",
    label: "Checks its work",
    detail:
      "Re-reads what it just built, catches its own mistakes and corrects them — then keeps going until the whole request exists.",
    tools: ["list_children", "set_property"],
    accent: "#f59e0b",
    radius: 60,
  },
] as const;

const SIZE = 400;
const CENTER = SIZE / 2;
/** pathLength normalises every circle to 1 so dash maths is radius-agnostic. */
const PATH_LENGTH = 1;

export function RingSystem() {
  const root = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [active, setActive] = useState(0);
  const [userPicked, setUserPicked] = useState(false);
  const reduced = usePrefersReducedMotion();

  // Rings assemble on scroll, outermost first.
  useEffect(() => {
    const el = root.current;
    const svg = svgRef.current;
    if (!el || !svg || reduced) return;

    const rings = Array.from(svg.querySelectorAll<SVGCircleElement>("[data-ring]"));
    const nodes = Array.from(svg.querySelectorAll<SVGGElement>("[data-node]"));

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: el,
          start: "top 75%",
          end: "top 25%",
          scrub: 0.7,
        },
      });

      rings.forEach((ring, i) => {
        tl.fromTo(
          ring,
          { strokeDashoffset: PATH_LENGTH, opacity: 0 },
          { strokeDashoffset: 0, opacity: 1, ease: "none" },
          i * 0.25,
        );
      });

      // Nodes pop in only once their ring has drawn, so nothing floats
      // unattached.
      tl.fromTo(
        nodes,
        { scale: 0, transformOrigin: "center" },
        { scale: 1, ease: "back.out(2)", stagger: 0.12 },
        0.5,
      );
    }, el);

    return () => ctx.revert();
  }, [reduced]);

  // Idle cycling, so the section is alive before anyone touches it. Stops for
  // good once the visitor picks a stage — fighting someone's selection is
  // worse than no animation.
  useEffect(() => {
    if (reduced || userPicked) return;
    const id = window.setInterval(() => {
      setActive((i) => (i + 1) % STAGES.length);
    }, 3200);
    return () => clearInterval(id);
  }, [reduced, userPicked]);

  return (
    <section
      ref={root}
      className="relative overflow-hidden px-6 py-28"
      aria-labelledby="loop-heading"
    >
      <div className="mx-auto w-full max-w-6xl">
        <p className="text-[11px] uppercase tracking-[0.25em] text-faint">
          Inside one message
        </p>
        <h2
          id="loop-heading"
          className="mt-4 max-w-2xl text-balance text-4xl font-semibold tracking-[-0.02em] sm:text-5xl"
        >
          It doesn&apos;t answer. It loops.
        </h2>
        <p className="mt-4 max-w-xl text-muted">
          One instruction sets off a full build cycle — reading, searching,
          writing and checking, over and over, until the thing exists.
        </p>

        <div className="mt-16 grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          {/* ---- The rings ---- */}
          <div className="relative mx-auto w-full max-w-[420px]">
            <svg
              ref={svgRef}
              viewBox={`0 0 ${SIZE} ${SIZE}`}
              className={`w-full ${reduced ? "" : "ring-system"}`}
              role="img"
              aria-label="Concentric rings, one per stage of the build loop"
            >
              <defs>
                {STAGES.map((s) => (
                  <radialGradient key={s.id} id={`glow-${s.id}`}>
                    <stop offset="0%" stopColor={s.accent} stopOpacity="0.55" />
                    <stop offset="100%" stopColor={s.accent} stopOpacity="0" />
                  </radialGradient>
                ))}
              </defs>

              {/* Faint guide rings so the system reads as a whole even
                  before the coloured strokes draw in. */}
              {STAGES.map((s) => (
                <circle
                  key={`guide-${s.id}`}
                  cx={CENTER}
                  cy={CENTER}
                  r={s.radius}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1"
                  className="text-line"
                />
              ))}

              {STAGES.map((s, i) => {
                const isActive = i === active;
                return (
                  <g key={s.id}>
                    <circle
                      data-ring
                      cx={CENTER}
                      cy={CENTER}
                      r={s.radius}
                      fill="none"
                      stroke={s.accent}
                      strokeWidth={isActive ? 2.5 : 1.4}
                      strokeLinecap="round"
                      pathLength={PATH_LENGTH}
                      strokeDasharray={PATH_LENGTH}
                      opacity={isActive ? 1 : 0.4}
                      style={{
                        transition:
                          "opacity 420ms ease, stroke-width 420ms ease",
                        filter: isActive
                          ? `drop-shadow(0 0 10px ${s.accent}88)`
                          : "none",
                      }}
                    />

                    {/* Orbiting node. The group spins; the dot rides it. */}
                    <g
                      data-node
                      className={reduced ? "" : `orbit orbit-${i}`}
                      style={{
                        transformOrigin: `${CENTER}px ${CENTER}px`,
                      }}
                    >
                      <circle
                        cx={CENTER + s.radius}
                        cy={CENTER}
                        r={isActive ? 7 : 4.5}
                        fill={s.accent}
                        style={{ transition: "r 380ms ease" }}
                      />
                      <circle
                        cx={CENTER + s.radius}
                        cy={CENTER}
                        r="18"
                        fill={`url(#glow-${s.id})`}
                        opacity={isActive ? 1 : 0}
                        style={{ transition: "opacity 420ms ease" }}
                      />
                    </g>
                  </g>
                );
              })}

              {/* Centre: the stage counter. */}
              <text
                x={CENTER}
                y={CENTER - 6}
                textAnchor="middle"
                className="fill-foreground"
                style={{ fontSize: 30, fontWeight: 600 }}
              >
                {String(active + 1).padStart(2, "0")}
              </text>
              <text
                x={CENTER}
                y={CENTER + 16}
                textAnchor="middle"
                className="fill-faint"
                style={{ fontSize: 10, letterSpacing: 2 }}
              >
                {`OF ${String(STAGES.length).padStart(2, "0")}`}
              </text>
            </svg>
          </div>

          {/* ---- The information ---- */}
          <div>
            <ul className="space-y-2">
              {STAGES.map((s, i) => {
                const isActive = i === active;
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      onPointerEnter={() => {
                        setActive(i);
                        setUserPicked(true);
                      }}
                      onFocus={() => {
                        setActive(i);
                        setUserPicked(true);
                      }}
                      onClick={() => {
                        setActive(i);
                        setUserPicked(true);
                      }}
                      aria-current={isActive}
                      className={`w-full rounded-xl border px-5 py-4 text-left transition-all duration-300 ${
                        isActive
                          ? "glass-card border-line-strong"
                          : "border-transparent hover:border-line"
                      }`}
                    >
                      <span className="flex items-center gap-3">
                        <span
                          className="size-2.5 shrink-0 rounded-full transition-transform duration-300"
                          style={{
                            background: s.accent,
                            transform: isActive ? "scale(1.4)" : "scale(1)",
                            boxShadow: isActive
                              ? `0 0 12px ${s.accent}`
                              : "none",
                          }}
                        />
                        <span
                          className={`text-base font-medium transition-colors ${
                            isActive ? "text-foreground" : "text-muted"
                          }`}
                        >
                          {s.label}
                        </span>
                      </span>

                      {/* Detail expands for the active stage only — a grid
                          row from 0fr to 1fr animates height without needing
                          a measured pixel value. */}
                      <span
                        className="grid transition-[grid-template-rows,opacity] duration-500"
                        style={{
                          gridTemplateRows: isActive ? "1fr" : "0fr",
                          opacity: isActive ? 1 : 0,
                        }}
                      >
                        <span className="overflow-hidden">
                          <span className="mt-3 block pl-[22px] text-sm leading-relaxed text-muted">
                            {s.detail}
                          </span>
                          <span className="mt-3 flex flex-wrap gap-1.5 pl-[22px]">
                            {s.tools.map((t) => (
                              <code
                                key={t}
                                className="rounded border border-line bg-surface px-1.5 py-0.5 font-mono text-[10px] text-faint"
                              >
                                {t}
                              </code>
                            ))}
                          </span>
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>

            <p className="mt-6 pl-5 text-xs text-faint">
              {userPicked
                ? "Hover a stage to explore the loop."
                : "Cycling — hover to take control."}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
