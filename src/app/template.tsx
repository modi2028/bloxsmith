/**
 * A template re-mounts on every navigation (unlike layout), so this wraps each
 * page in a quick opacity fade for smooth transitions between routes.
 * Opacity-only — never a transform — so fixed overlays (islands, modals) keep
 * their viewport positioning during the animation.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-fade flex min-h-dvh flex-col">{children}</div>;
}
