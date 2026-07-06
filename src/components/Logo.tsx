const PALETTES = {
  // Bloxsmith ember (default brand cube).
  ember: {
    id: "bs-top",
    left: "#B45309",
    right: "#EA580C",
    topFrom: "#FDE68A",
    topTo: "#F59E0B",
    spark: "#FDE68A",
  },
  // Blue cube — marks Pro models in the model picker.
  blue: {
    id: "bs-top-blue",
    left: "#1D4ED8",
    right: "#3B82F6",
    topFrom: "#BFDBFE",
    topTo: "#3B82F6",
    spark: "#BFDBFE",
  },
} as const;

export function LogoMark({
  size = 28,
  variant = "ember",
}: {
  size?: number;
  variant?: keyof typeof PALETTES;
}) {
  const p = PALETTES[variant];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden
      className="shrink-0"
    >
      <defs>
        <linearGradient
          id={p.id}
          x1="17"
          y1="12"
          x2="47"
          y2="29"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor={p.topFrom} />
          <stop offset="1" stopColor={p.topTo} />
        </linearGradient>
      </defs>
      <path d="M17 22.5 L32 31 L32 48 L17 39.5 Z" fill={p.left} />
      <path d="M47 22.5 L47 39.5 L32 48 L32 31 Z" fill={p.right} />
      <path d="M32 14 L47 22.5 L32 31 L17 22.5 Z" fill={`url(#${p.id})`} />
      <path
        d="M50 6 L51.8 10.2 L56 12 L51.8 13.8 L50 18 L48.2 13.8 L44 12 L48.2 10.2 Z"
        fill={p.spark}
      />
    </svg>
  );
}
