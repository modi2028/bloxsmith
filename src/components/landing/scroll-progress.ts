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

/**
 * Which tier card the pointer is over, if any.
 *
 * The lineup is HTML and the mark is WebGL, so they cannot address each other
 * directly — this is the seam between them. `x` is the card's centre as a
 * -1..1 fraction of the viewport, which the scene turns into a world offset.
 */
export const starFocus = {
  x: 0,
  /** 0 when nothing is hovered, 1 when the mark should commit to a card. */
  strength: 0,
  /** Tier accent as an rgb triplet in 0..1, or null for the default metal. */
  tint: null as [number, number, number] | null,
};

/** Called by the tier cards on hover. `hex` tints the metal to that tier. */
export function setStarFocus(
  x: number | null,
  hex: string | null = null,
): void {
  if (x == null) {
    starFocus.strength = 0;
    starFocus.tint = null;
    return;
  }
  starFocus.x = x;
  starFocus.strength = 1;
  starFocus.tint = hex
    ? [
        parseInt(hex.slice(1, 3), 16) / 255,
        parseInt(hex.slice(3, 5), 16) / 255,
        parseInt(hex.slice(5, 7), 16) / 255,
      ]
    : null;
}

/** Set by the hotspot in the final section; read by the 3D scene. */
export function setStarHover(hovering: boolean): void {
  scrollProgress.starHover = hovering ? 1 : 0;
}
