"use client";

import { useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, Lightformer } from "@react-three/drei";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import * as THREE from "three";
import { scrollProgress } from "./scroll-progress";

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

function starShape(): THREE.Shape {
  const shape = new THREE.Shape();
  const points = 5;
  for (let i = 0; i < points * 2; i++) {
    // Start at the top point, matching the 2D mark's orientation.
    const angle = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
    const radius = i % 2 === 0 ? OUTER_RADIUS : INNER_RADIUS;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  return shape;
}

function StarMesh({ reducedMotion }: { reducedMotion: boolean }) {
  const mesh = useRef<THREE.Mesh>(null);
  const { viewport } = useThree();

  const geometry = useMemo(() => {
    const geo = new THREE.ExtrudeGeometry(starShape(), {
      depth: 0.28,
      bevelEnabled: true,
      // A wide, shallow bevel is what reads as "faceted" — it gives each arm
      // two planes that catch the light separately, like the 2D mark's
      // light/dark facet pairs.
      bevelThickness: 0.12,
      bevelSize: 0.09,
      bevelSegments: 3,
      curveSegments: 1,
    });
    geo.center();
    geo.computeVertexNormals();
    return geo;
  }, []);

  // Pointer is tracked in a ref and eased in useFrame rather than driving
  // state — a re-render per mousemove would cost far more than the tilt.
  const pointer = useRef({ x: 0, y: 0 });
  const elapsed = useRef(0);

  useFrame((state, delta) => {
    const m = mesh.current;
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
    const idleSpin = reducedMotion ? 0 : 0.34;
    m.rotation.y += (idleSpin + introSpin + p * 2.6) * dt;

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
    // Scroll shrinks it and carries it up and aside; the float keeps it alive
    // while the page is still.
    const float = reducedMotion ? 0 : Math.sin(t * 0.62) * 0.055;
    const small = viewport.width < 6;
    const base = small ? 0.72 : 1;
    const scale = base * introScale * (1 - p * 0.6);
    m.scale.setScalar(Math.max(0.15, scale));

    // Eases in from below on entry, then rises away as the hero leaves.
    const entryOffset = reducedMotion ? 0 : (1 - intro) * -1.1;
    m.position.y = entryOffset + float + p * 1.9;
    m.position.x = p * 0.9;
    m.position.z = (1 - intro) * -2.5;
  });

  return (
    <mesh ref={mesh} geometry={geometry} castShadow={false}>
      {/*
        Polished metal with a thin-film layer on top. iridescence is what
        shifts the highlights blue -> violet -> warm as it turns; without it
        a pure metal just reads as grey chrome.
      */}
      <meshPhysicalMaterial
        color="#c8ccd4"
        metalness={1}
        roughness={0.14}
        iridescence={1}
        iridescenceIOR={1.9}
        iridescenceThicknessRange={[120, 780]}
        clearcoat={1}
        clearcoatRoughness={0.08}
        envMapIntensity={1.5}
      />
    </mesh>
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
function Embers({ reducedMotion }: { reducedMotion: boolean }) {
  const group = useRef<THREE.Group>(null);

  const specs = useMemo(
    () =>
      Array.from({ length: 8 }, (_, i) => ({
        radius: 1.55 + (i % 4) * 0.32,
        speed: 0.22 + (i % 5) * 0.055,
        phase: (i / 8) * Math.PI * 2,
        tilt: (i % 2 === 0 ? 1 : -1) * (0.25 + (i % 3) * 0.18),
        size: 0.021 + (i % 3) * 0.009,
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
          <meshBasicMaterial color={s.color} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

/** A key light that orbits, so highlights sweep across the facets. */
function MovingKeyLight({ reducedMotion }: { reducedMotion: boolean }) {
  const light = useRef<THREE.PointLight>(null);
  useFrame((state) => {
    const l = light.current;
    if (!l || reducedMotion) return;
    const t = state.clock.elapsedTime * 0.28;
    l.position.set(Math.cos(t) * 4.5, 2.2 + Math.sin(t * 0.7) * 1.4, 4);
  });
  return (
    <pointLight ref={light} intensity={22} distance={14} color="#ffe6c0" />
  );
}

/**
 * Reflections come from Lightformers rendered to a small cubemap, not a
 * downloaded HDRI. Metal needs *something* to reflect or it renders black,
 * and this gives shaped highlights for a few KB instead of a multi-MB .hdr
 * over the network.
 */
function Studio() {
  return (
    <Environment resolution={256} frames={1}>
      <Lightformer
        form="rect"
        intensity={6}
        color="#bfdbfe"
        position={[-3, 2, 2]}
        scale={[5, 6, 1]}
      />
      <Lightformer
        form="rect"
        intensity={4}
        color="#a78bfa"
        position={[3, -1, 2]}
        scale={[4, 5, 1]}
      />
      <Lightformer
        form="circle"
        intensity={5}
        color="#f59e0b"
        position={[2, 3, -2]}
        scale={[3, 3, 1]}
      />
      <Lightformer
        form="rect"
        intensity={2}
        color="#ffffff"
        position={[0, -4, 1]}
        scale={[8, 2, 1]}
      />
    </Environment>
  );
}

export default function LogoScene({
  reducedMotion = false,
}: {
  reducedMotion?: boolean;
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
      <MovingKeyLight reducedMotion={reducedMotion} />
      <StarMesh reducedMotion={reducedMotion} />
      <Embers reducedMotion={reducedMotion} />
      <Studio />
      {!reducedMotion && (
        <EffectComposer enableNormalPass={false}>
          <Bloom
            intensity={0.55}
            luminanceThreshold={0.62}
            luminanceSmoothing={0.25}
            mipmapBlur
          />
        </EffectComposer>
      )}
    </Canvas>
  );
}
