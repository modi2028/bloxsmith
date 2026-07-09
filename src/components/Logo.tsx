/**
 * Bloxsmith mark — a faceted five-point star. Each point is split into a
 * light and a dark facet for the metallic look. Monochrome silver by
 * default; the blue variant marks Pro models in the picker.
 */
const PALETTES = {
  silver: { light: "#EDEDF1", dark: "#83838C" },
  blue: { light: "#BFDBFE", dark: "#3B82F6" },
} as const;

// Facet triangles (center → inner → outer), precomputed for viewBox 64.
const DARK_FACETS = [
  "M32 33 L25.06 23.45 L32 3 Z",
  "M32 33 L38.94 23.45 L60.53 23.73 Z",
  "M32 33 L43.22 36.65 L49.63 57.27 Z",
  "M32 33 L32 44.8 L14.37 57.27 Z",
  "M32 33 L20.78 36.65 L3.47 23.73 Z",
];
const LIGHT_FACETS = [
  "M32 33 L32 3 L38.94 23.45 Z",
  "M32 33 L60.53 23.73 L43.22 36.65 Z",
  "M32 33 L49.63 57.27 L32 44.8 Z",
  "M32 33 L14.37 57.27 L20.78 36.65 Z",
  "M32 33 L3.47 23.73 L25.06 23.45 Z",
];

export function LogoMark({
  size = 28,
  variant = "silver",
}: {
  size?: number;
  variant?: keyof typeof PALETTES | "ember";
}) {
  // "ember" is accepted for backwards compatibility and renders silver.
  const p = PALETTES[variant === "ember" ? "silver" : variant];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden
      className="shrink-0"
    >
      {DARK_FACETS.map((d, i) => (
        <path key={`d${i}`} d={d} fill={p.dark} />
      ))}
      {LIGHT_FACETS.map((d, i) => (
        <path key={`l${i}`} d={d} fill={p.light} />
      ))}
    </svg>
  );
}
