/**
 * Hero scroll progress, 0 -> 1, shared between the smooth-scroll driver and
 * the 3D scene.
 *
 * Deliberately a mutable module object rather than React state or context:
 * this updates on every scroll frame, and re-rendering the tree 60 times a
 * second to move one mesh would cost more than the mesh does. The Canvas
 * reads it inside useFrame, which is already running.
 */
export const scrollProgress = {
  /** 0 while the hero fills the viewport, 1 once it has fully scrolled away. */
  value: 0,
};

/**
 * How many viewport heights the hero occupies. The hero section is this tall
 * with a sticky inner frame, so the logo's scroll choreography plays out over
 * a long runway instead of being over in one flick of the wheel.
 */
export const HERO_SPAN = 2.2;

/** Recompute from the current scroll offset. Cheap enough to call per frame. */
export function updateScrollProgress(scrollY: number): void {
  if (typeof window === "undefined") return;
  const span = (window.innerHeight || 1) * HERO_SPAN;
  scrollProgress.value = Math.min(1, Math.max(0, scrollY / span));
}
