/**
 * Brand marks for the "Powered by" treatment — SVG recreations so nothing
 * external is loaded. Drop official assets into public/brand/ and swap here
 * if pixel-perfect logos are wanted later.
 */

/** Claude's terracotta starburst mark (brand-colored). */
export function ClaudeMark({ className = "size-4" }: { className?: string }) {
  const rays = [
    { a: 0, len: 30 },
    { a: 32, len: 26 },
    { a: 62, len: 30 },
    { a: 94, len: 24 },
    { a: 126, len: 29 },
    { a: 158, len: 25 },
    { a: 190, len: 30 },
    { a: 222, len: 26 },
    { a: 254, len: 29 },
    { a: 288, len: 25 },
    { a: 322, len: 28 },
  ];
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden>
      <g stroke="#D97757" strokeWidth="11" strokeLinecap="round">
        {rays.map((r, i) => (
          <line
            key={i}
            x1="50"
            y1="36"
            x2="50"
            y2={36 - r.len}
            transform={`rotate(${r.a} 50 50)`}
          />
        ))}
      </g>
    </svg>
  );
}

/** OpenAI's knot rosette (inherits currentColor). */
export function OpenAIMark({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden>
      <g fill="currentColor">
        {[0, 60, 120, 180, 240, 300].map((a) => (
          <ellipse
            key={a}
            cx="50"
            cy="28"
            rx="10.5"
            ry="24"
            transform={`rotate(${a + 26} 50 50)`}
          />
        ))}
      </g>
    </svg>
  );
}

/** Google Gemini sparkle (for when the provider lands). */
export function GeminiMark({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden>
      <path
        d="M50 4 C54 30 70 46 96 50 C70 54 54 70 50 96 C46 70 30 54 4 50 C30 46 46 30 50 4 Z"
        fill="currentColor"
      />
    </svg>
  );
}

/** Logo for an AI provider id ("anthropic" | "openai" | "google"). */
export function ProviderIcon({
  provider,
  className = "size-4",
}: {
  provider: string;
  className?: string;
}) {
  if (provider === "anthropic") return <ClaudeMark className={className} />;
  if (provider === "openai") return <OpenAIMark className={className} />;
  if (provider === "google") return <GeminiMark className={className} />;
  return null;
}

export function RobloxMark({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden>
      <path
        d="M24 2 98 22 78 98 2 78 Z M41 36 63 42 57 64 35 58 Z"
        fill="currentColor"
        fillRule="evenodd"
      />
    </svg>
  );
}

export function AnthropicWordmark({
  className = "",
}: {
  className?: string;
}) {
  return (
    <span
      className={`font-bold tracking-[0.18em] ${className}`}
      style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}
      aria-label="Anthropic"
    >
      ANTHROP\C
    </span>
  );
}

function BannerRow() {
  return (
    <div className="flex shrink-0 items-center gap-12 pr-12">
      <span className="flex items-center gap-2.5 text-sm text-muted">
        <span className="text-faint">Powered by</span>
        <AnthropicWordmark className="text-[13px] text-foreground" />
      </span>
      <span className="text-faint">✦</span>
      <span className="flex items-center gap-2 text-sm text-muted">
        <OpenAIMark className="size-4 text-foreground" />
        <span className="text-[13px] font-semibold text-foreground">
          ChatGPT
        </span>
      </span>
      <span className="text-faint">✦</span>
      <span className="flex items-center gap-2 text-sm text-muted">
        <RobloxMark className="size-4 text-foreground" />
        <span className="text-[13px] font-bold tracking-[0.25em] text-foreground">
          ROBLOX
        </span>
      </span>
      <span className="text-faint">✦</span>
      <span className="text-sm text-muted">
        Claude &amp; ChatGPT build it live in your Studio session
      </span>
      <span className="text-faint">✦</span>
      <span className="flex items-center gap-2.5">
        <span className="grid grid-cols-3 grid-rows-2 gap-[3px]">
          {[
            "bg-ember/50",
            "bg-stone-600",
            "bg-orange-700/70",
            "bg-stone-500",
            "bg-amber-600/60",
            "bg-red-800/60",
          ].map((tint, i) => (
            <span key={i} className={`size-2 rounded-[2px] ${tint}`} />
          ))}
        </span>
        <span className="text-sm text-muted">
          Build the next hit experience
        </span>
      </span>
      <span className="text-faint">✦</span>
    </div>
  );
}

/**
 * Infinitely scrolling "Powered by Anthropic × Roblox" strip. The animation
 * slides exactly -50%, so the content must be two IDENTICAL halves — three
 * rows per half keeps even ultrawide screens covered with no gaps.
 */
export function PoweredByBanner() {
  return (
    <div className="w-full overflow-hidden border-y border-line bg-surface/40 py-2.5 [mask-image:linear-gradient(90deg,transparent,black_12%,black_88%,transparent)]">
      <div className="flex w-max animate-marquee">
        <BannerRow />
        <BannerRow />
        <BannerRow />
        <BannerRow />
        <BannerRow />
        <BannerRow />
      </div>
    </div>
  );
}
