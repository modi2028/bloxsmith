"use client";

import { useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, Lightformer } from "@react-three/drei";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import * as THREE from "three";
import { scrollProgress, starFocus } from "./scroll-progress";

/**
 * The Bloxsmith mark as a real 3D object.
 *
 * Geometry is generated rather than loaded: the brand mark is a faceted
 * five-point star, which is a handful of trig and an extrude — cheaper than
 * shipping a GLB, and it stays in sync with Logo.tsx by construction.
 *
 * The inner/outer ratio is taken from the SVG's own facet coordinates
 * (points ~30 units from centre, valleys ~11.8) so the silhouette matches the
 * 2D mark exactly.
 */
const OUTER_RADIUS = 1;
const INNER_RADIUS = 0.39;

const DEFAULT_COLOR = new THREE.Color("#c8ccd4");
const TIER_COLOR = new THREE.Color();

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
/** easeInOutCubic — used for every scroll-driven transition in the scene. */
const ease = (n: number) =>
  n < 0.5 ? 4 * n * n * n : 1 - Math.pow(-2 * n + 2, 3) / 2;

/**
 * One arm of the star: centre -> preceding valley -> point -> next valley.
 *
 * The mark is built from five of these rather than one solid star so the
 * finale can break it apart — you cannot separate arms that were extruded as
 * a single shape. Geometry is NOT centred, so each arm keeps the star's
 * centre as its origin and moving it outward along its own axis reads as the
 * star splitting rather than five shapes drifting.
 */
function armShape(index: number): THREE.Shape {
  const step = (Math.PI * 2) / 5;
  const point = index * step - Math.PI / 2;
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(
    Math.cos(point - step / 2) * INNER_RADIUS,
    Math.sin(point - step / 2) * INNER_RADIUS,
  );
  shape.lineTo(Math.cos(point) * OUTER_RADIUS, Math.sin(point) * OUTER_RADIUS);
  shape.lineTo(
    Math.cos(point + step / 2) * INNER_RADIUS,
    Math.sin(point + step / 2) * INNER_RADIUS,
  );
  shape.closePath();
  return shape;
}

function StarMesh({
  reducedMotion,
  dim = 1,
}: {
  reducedMotion: boolean;
  /** <1 tones the mark down where it sits behind content, e.g. the login card. */
  dim?: number;
}) {
  const group = useRef<THREE.Group>(null);
  const arms = useRef<(THREE.Mesh | null)[]>([]);
  /** Eased focus state, so the mark glides between cards instead of jumping. */
  const focus = useRef({ x: 0, strength: 0 });
  const tint = useRef(new THREE.Color("#c8ccd4"));
  const material = useRef<THREE.MeshPhysicalMaterial>(null);
  /** Eased 0..1 open amount, so the break is never instant on hover. */
  const openAmount = useRef(0);
  const { viewport } = useThree();

  const armGeometries = useMemo(() => {
    const opts = {
      depth: 0.28,
      bevelEnabled: true,
      bevelThickness: 0.12,
      bevelSize: 0.09,
      bevelSegments: 3,
      curveSegments: 1,
    } as const;
    return Array.from({ length: 5 }, (_, i) => {
      const g = new THREE.ExtrudeGeometry(armShape(i), opts);
      g.translate(0, 0, -0.14); // centre the extrusion on z without moving x/y
      g.computeVertexNormals();
      return g;
    });
  }, []);

  // Pointer is tracked in a ref and eased in useFrame rather than driving
  // state — a re-render per mousemove would cost far more than the tilt.
  const pointer = useRef({ x: 0, y: 0 });
  const elapsed = useRef(0);

  useFrame((state, delta) => {
    const m = group.current;
    if (!m) return;

    pointer.current.x = state.pointer.x;
    pointer.current.y = state.pointer.y;

    // Clamp delta: a backgrounded tab resumes with a huge delta and would
    // otherwise snap the logo through a whole rotation on the first frame.
    const dt = Math.min(delta, 0.1);
    elapsed.current += dt;
    const t = elapsed.current;
    const p = scrollProgress.value;

    // --- Entrance -------------------------------------------------------
    // The mark arrives rather than simply existing: it spins up fast, then
    // the extra rotation decays into the idle over ~4s while the scale
    // overshoots slightly and settles. INTRO is eased, never linear, so the
    // hand-off into the idle is invisible.
    const INTRO = 4.2;
    const introRaw = reducedMotion ? 1 : Math.min(1, t / INTRO);
    const intro = 1 - Math.pow(1 - introRaw, 4);
    // Decaying spin: fast at first, asymptotically approaching the idle rate.
    const introSpin = reducedMotion ? 0 : (1 - intro) * 5.5;
    // Overshoot: crosses 1 at ~70% and eases back down.
    const introScale = reducedMotion
      ? 1
      : intro < 1
        ? intro * (1 + 0.16 * Math.sin(intro * Math.PI))
        : 1;

    // --- Rotation -------------------------------------------------------
    // The scroll-driven spin is faded out for the finale: at the bottom the
    // hero term was still contributing ~2.6 rad/s, which span the broken-open
    // mark far too fast to read. Down there it turns on idle alone, slowed.
    const finaleCalm = 1 - ease(clamp01((scrollProgress.page - 0.76) / 0.24));
    const idleSpin = reducedMotion ? 0 : 0.34 * (0.45 + 0.55 * finaleCalm);
    m.rotation.y += (idleSpin + introSpin + p * 2.6 * finaleCalm) * dt;

    // Two out-of-phase oscillators on the other axes so the motion never
    // repeats visibly — a single sine reads as mechanical within a few turns.
    const bobX = reducedMotion ? 0 : Math.sin(t * 0.45) * 0.11;
    const bobZ = reducedMotion ? 0 : Math.cos(t * 0.31) * 0.08;

    const targetX = reducedMotion
      ? 0
      : pointer.current.y * 0.38 + bobX + p * 0.7;
    const targetZ = reducedMotion ? 0 : -pointer.current.x * 0.28 + bobZ;
    m.rotation.x += (targetX - m.rotation.x) * Math.min(1, dt * 3.5);
    m.rotation.z += (targetZ - m.rotation.z) * Math.min(1, dt * 3.5);

    // --- Position and scale ---------------------------------------------
    // The mark sits ABOVE the headline, not behind it. At full size it filled
    // roughly two thirds of the viewport dead centre, which put a bright,
    // moving, specular surface directly under the copy — unreadable. It is
    // now a hero element the text sits beneath.
    const float = reducedMotion ? 0 : Math.sin(t * 0.62) * 0.05;
    const small = viewport.width < 6;

    // The mark follows you down the whole document rather than leaving with
    // the hero. `page` is 0 at the top and 1 at the bottom; the two ramps
    // below carve that into three acts: it holds centre through the hero,
    // withdraws to the side and shrinks while you read, then comes back to
    // centre for the closing section.
    const pageP = scrollProgress.page;
    const withdraw = clamp01((pageP - 0.1) / 0.3);
    const homecoming = clamp01((pageP - 0.76) / 0.24);
    // Eased so neither transition has a visible start or stop.
    const away = ease(withdraw) * (1 - ease(homecoming));

    const base = small ? 0.62 : 0.92;
    const home = ease(homecoming);
    // Shrinks as it withdraws, and shrinks AGAIN for the finale. Broken open
    // the mark spans its own radius plus the arm travel — roughly twice the
    // closed silhouette — so at hero size the arms fly straight off both
    // edges of the screen and the break cannot be read. This keeps the whole
    // gesture inside the viewport.
    const scale = base * introScale * (1 - away * 0.62) * (1 - home * 0.34);
    m.scale.setScalar(Math.max(0.08, scale));

    // RESTING_Y is barely off centre — enough to sit above the headline's
    // optical centre without clipping the top point off the viewport.
    const RESTING_Y = small ? 0.22 : 0.16;
    const entryOffset = reducedMotion ? 0 : (1 - intro) * -1.3;
    // Drifts right and a little low while withdrawn, so it sits beside the
    // content instead of underneath it, then returns.
    // --- Tier focus ------------------------------------------------------
    // While the lineup is on screen the mark answers to whichever card is
    // hovered: it slides over that card, lifts clear of it, spins up and
    // takes the tier's colour. Eased, so moving between cards is a glide.
    const fs = focus.current;
    fs.x += (starFocus.x - fs.x) * Math.min(1, dt * 3);
    fs.strength += (starFocus.strength - fs.strength) * Math.min(1, dt * 3.5);
    const focusAmt = fs.strength;

    const halfWidth = viewport.width / 2;
    // Lift above the cards rather than hovering behind them, which read as
    // the mark being stuck rather than reacting.
    const focusLift = focusAmt * 1.15;
    const focusSpin = focusAmt * 1.8;

    m.rotation.y += focusSpin * dt;

    m.position.x =
      away * (small ? 0.9 : 1.9) * (1 - focusAmt) +
      fs.x * halfWidth * 0.72 * focusAmt;
    m.position.y = RESTING_Y + entryOffset + float - away * 0.35 + focusLift;
    m.position.z = (1 - intro) * -2.5 - away * 1.2 + focusAmt * 1.1;

    // Tint the metal toward the focused tier, back to steel when released.
    if (material.current) {
      const want = starFocus.tint;
      tint.current.lerp(
        want
          ? TIER_COLOR.setRGB(want[0], want[1], want[2])
          : DEFAULT_COLOR,
        Math.min(1, dt * 3),
      );
      material.current.color.copy(tint.current);
    }

    // --- Break open ------------------------------------------------------
    // Chases the hover flag rather than snapping to it, so the star opens and
    // closes with weight. Each arm travels along its OWN axis, which is why
    // the geometry was never centred.
    const target = reducedMotion ? 0 : scrollProgress.starHover;
    // Slow: the whole point is watching it happen.
    openAmount.current += (target - openAmount.current) * Math.min(1, dt * 1.35);
    const open = ease(clamp01(openAmount.current));

    const step = (Math.PI * 2) / 5;
    const STAGGER = 0.07;
    const span = 1 - STAGGER * 4;

    arms.current.forEach((arm, i) => {
      if (!arm) return;
      const angle = i * step - Math.PI / 2;

      // Each arm starts a beat after the last, so the mark unfolds instead of
      // all five leaving at once.
      const local = clamp01((open - i * STAGGER) / span);

      // Two phases, because a break is not a slide.
      //
      // TENSION: the arm pulls slightly INWARD first and holds — the mark
      // compresses, resisting. Then it gives, and easeOutBack throws it past
      // its resting place before it settles. The compression is what sells it
      // as something snapping apart rather than five pieces being moved.
      const TENSION = 0.26;
      let springy: number;
      if (local < TENSION) {
        const k = local / TENSION;
        springy = -0.075 * Math.sin(k * Math.PI);
      } else {
        const r = (local - TENSION) / (1 - TENSION);
        const c1 = 2.2;
        const c3 = c1 + 1;
        const t1 = r - 1;
        springy = r >= 1 ? 1 : 1 + c3 * t1 * t1 * t1 + c1 * t1 * t1;
      }

      // A short shudder right at the release, decaying fast — the crack.
      const sinceBreak = clamp01((local - TENSION) / 0.3);
      const shudder =
        local > TENSION && sinceBreak < 1
          ? Math.sin(sinceBreak * Math.PI * 7) * (1 - sinceBreak) * 0.045
          : 0;

      const push = springy * 1.02 + shudder;
      arm.position.set(
        Math.cos(angle) * push,
        Math.sin(angle) * push,
        // Alternating depth so they separate in 3D, not just on a flat plane.
        springy * (i % 2 === 0 ? 0.42 : -0.18),
      );

      // Only a hint of tumble. At half a radian the arms read as unrelated
      // blocks scattered on screen; kept small, the silhouette stays legible
      // as a star coming apart.
      arm.rotation.z = (springy * 0.16 + shudder * 1.4) * (i % 2 === 0 ? 1 : -1);
      arm.rotation.x = springy * 0.1;
      // A breath of scale on the way out — reads as release, not ejection.
      const pop = 1 + Math.sin(clamp01(local) * Math.PI) * 0.07;
      arm.scale.setScalar(pop);
    });
  });

  return (
    <group ref={group}>
      {armGeometries.map((geo, i) => (
        <mesh
          key={i}
          ref={(el) => {
            arms.current[i] = el;
          }}
          geometry={geo}
        >
          {/*
            Polished metal with a thin-film layer on top. iridescence is what
            shifts the highlights blue -> violet -> warm as it turns; without
            it a pure metal just reads as grey chrome.
          */}
          <meshPhysicalMaterial
            ref={i === 0 ? material : undefined}
            color="#c8ccd4"
            metalness={0.88}
            roughness={0.2}
            iridescence={1}
            iridescenceIOR={1.9}
            iridescenceThicknessRange={[120, 780]}
            clearcoat={1}
            clearcoatRoughness={0.08}
            envMapIntensity={1.8 * dim}
          />
        </mesh>
      ))}
    </group>
  );
}

/**
 * Embers orbiting the mark.
 *
 * Cheap depth: eight small emissive spheres on tilted orbits, some passing
 * behind the star and some in front. They also give the eye something to
 * track while the logo itself is turning slowly, which is what stops a slow
 * rotation reading as a stalled page.
 */
/** Kept in step with RESTING_Y in StarMesh so the embers orbit the mark. */
const EMBER_ORBIT_Y = 0.16;

function Embers({ reducedMotion }: { reducedMotion: boolean }) {
  const group = useRef<THREE.Group>(null);

  const specs = useMemo(
    () =>
      Array.from({ length: 8 }, (_, i) => ({
        // Sized against the mark's 0.58 scale — the old 1.55+ radii were
        // tuned for a star twice this size and would orbit out into the copy.
        radius: 1.15 + (i % 4) * 0.16,
        speed: 0.22 + (i % 5) * 0.055,
        phase: (i / 8) * Math.PI * 2,
        // Flattened orbits. A steeper tilt swings the embers down through
        // the headline, which is the collision the mark was raised to avoid.
        tilt: (i % 2 === 0 ? 1 : -1) * (0.18 + (i % 3) * 0.11),
        size: 0.012 + (i % 3) * 0.005,
        color: ["#bfdbfe", "#a78bfa", "#f59e0b"][i % 3]!,
      })),
    [],
  );

  useFrame((state) => {
    const g = group.current;
    if (!g || reducedMotion) return;
    const t = state.clock.elapsedTime;
    const p = scrollProgress.value;
    g.children.forEach((child, i) => {
      const s = specs[i]!;
      const a = t * s.speed + s.phase;
      child.position.set(
        Math.cos(a) * s.radius,
        Math.sin(a) * s.radius * s.tilt,
        Math.sin(a) * s.radius,
      );
    });
    // Ride with the mark. Left at the origin these orbited through the
    // headline, which is exactly the collision the mark was moved to avoid.
    g.position.y = EMBER_ORBIT_Y + p * 1.9;
    // Fade out with the hero rather than trailing into the next section.
    g.scale.setScalar(Math.max(0.001, 1 - p * 1.4));
  });

  if (reducedMotion) return null;

  return (
    <group ref={group}>
      {specs.map((s, i) => (
        <mesh key={i}>
          <sphereGeometry args={[s.size, 10, 10]} />
          {/* Emissive so bloom picks them up as genuine points of light. */}
          <meshBasicMaterial
            color={s.color}
            toneMapped={false}
            transparent
            opacity={0.85}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  );
}

/** A key light that orbits, so highlights sweep across the facets. */
function MovingKeyLight({
  reducedMotion,
  dim = 1,
}: {
  reducedMotion: boolean;
  dim?: number;
}) {
  const light = useRef<THREE.PointLight>(null);
  useFrame((state) => {
    const l = light.current;
    if (!l || reducedMotion) return;
    const t = state.clock.elapsedTime * 0.28;
    l.position.set(Math.cos(t) * 4.5, 2.2 + Math.sin(t * 0.7) * 1.4, 4);
  });
  return (
    <pointLight ref={light} intensity={9 * dim} distance={14} color="#ffe6c0" />
  );
}

/**
 * Reflections come from Lightformers rendered to a small cubemap, not a
 * downloaded HDRI. Metal needs *something* to reflect or it renders black,
 * and this gives shaped highlights for a few KB instead of a multi-MB .hdr
 * over the network.
 */
function Studio({ dim = 1 }: { dim?: number }) {
  return (
    <Environment resolution={256} frames={1}>
      <Lightformer
        form="rect"
        intensity={5.5 * dim}
        color="#bfdbfe"
        position={[-3, 2, 2]}
        scale={[5, 6, 1]}
      />
      <Lightformer
        form="rect"
        intensity={4 * dim}
        color="#a78bfa"
        position={[3, -1, 2]}
        scale={[4, 5, 1]}
      />
      <Lightformer
        form="circle"
        intensity={4.5 * dim}
        color="#f59e0b"
        position={[2, 3, -2]}
        scale={[3, 3, 1]}
      />
      <Lightformer
        form="rect"
        intensity={2.5 * dim}
        color="#ffffff"
        position={[0, -4, 1]}
        scale={[8, 2, 1]}
      />
      {/*
        The key to the front faces. Everything else sits beside or behind the
        star, so surfaces pointing at the camera had nothing to reflect and
        rendered black — read as a shadow across the front. This is the
        softbox in front of the subject: broad, soft, and the only reason the
        facing planes have any value at all.
      */}
      <Lightformer
        form="rect"
        intensity={1.5 * dim}
        color="#dbeafe"
        position={[0, 0.5, 7]}
        scale={[14, 12, 1]}
      />
    </Environment>
  );
}

export default function LogoScene({
  reducedMotion = false,
  dim = 1,
}: {
  reducedMotion?: boolean;
  /**
   * Global brightness multiplier. The login page puts a card directly over
   * the mark, and at full strength the metal blew through the glass and took
   * the card's text with it.
   */
  dim?: number;
}) {
  return (
    <Canvas
      // dpr is capped at 2: retina phones report 3+, which triples the
      // fragment cost of a full-screen metallic shader for no visible gain.
      dpr={[1, 2]}
      camera={{ position: [0, 0, 4.2], fov: 42 }}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      style={{ pointerEvents: "none" }}
    >
      <ambientLight intensity={0.35} />
      <directionalLight position={[4, 5, 5]} intensity={1.1} />
      <MovingKeyLight reducedMotion={reducedMotion} dim={dim} />
      <StarMesh reducedMotion={reducedMotion} dim={dim} />
      <Embers reducedMotion={reducedMotion} />
      <Studio dim={dim} />
      {!reducedMotion && (
        <EffectComposer enableNormalPass={false}>
          {/* Threshold raised so only genuine speculars bloom. At 0.62 the
              broad lit faces qualified too, which is what turned the mark
              into a white silhouette. */}
          <Bloom
            intensity={0.32}
            luminanceThreshold={0.85}
            luminanceSmoothing={0.2}
            mipmapBlur
          />
        </EffectComposer>
      )}
    </Canvas>
  );
}
