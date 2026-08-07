/**
 * Shared scroll + interaction state for the landing page.
 *
 * Deliberately a mutable module object rather than React state or context:
 * these update on every scroll frame, and re-rendering the tree 60 times a
 * second to move one mesh would cost more than the mesh does. The Canvas
 * reads them inside useFrame, which is already running.
 */
export const scrollProgress = {
  /** 0 while the hero fills the viewport, 1 once it has fully scrolled away. */
  value: 0,
  /** 0 at the top of the document, 1 at the bottom. Drives the star's path. */
  page: 0,
  /** 1 while the pointer is over the final star hotspot, 0 otherwise. */
  starHover: 0,
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
  const vh = window.innerHeight || 1;
  scrollProgress.value = Math.min(1, Math.max(0, scrollY / (vh * HERO_SPAN)));

  const doc = document.documentElement;
  const scrollable = Math.max(1, doc.scrollHeight - vh);
  scrollProgress.page = Math.min(1, Math.max(0, scrollY / scrollable));
}

/** Set by the hotspot in the final section; read by the 3D scene. */
export function setStarHover(hovering: boolean): void {
  scrollProgress.starHover = hovering ? 1 : 0;
}
