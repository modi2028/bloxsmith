export function LogoMark({ size = 28 }: { size?: number }) {
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
          id="bs-top"
          x1="17"
          y1="12"
          x2="47"
          y2="29"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#FDE68A" />
          <stop offset="1" stopColor="#F59E0B" />
        </linearGradient>
      </defs>
      <path d="M17 22.5 L32 31 L32 48 L17 39.5 Z" fill="#B45309" />
      <path d="M47 22.5 L47 39.5 L32 48 L32 31 Z" fill="#EA580C" />
      <path d="M32 14 L47 22.5 L32 31 L17 22.5 Z" fill="url(#bs-top)" />
      <path
        d="M50 6 L51.8 10.2 L56 12 L51.8 13.8 L50 18 L48.2 13.8 L44 12 L48.2 10.2 Z"
        fill="#FDE68A"
      />
    </svg>
  );
}
