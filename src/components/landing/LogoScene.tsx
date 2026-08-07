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
  useFrame((state, delta) => {
    const m = mesh.current;
    if (!m) return;

    pointer.current.x = state.pointer.x;
    pointer.current.y = state.pointer.y;

    // Clamp delta: a backgrounded tab resumes with a huge delta and would
    // otherwise snap the logo through a whole rotation on the first frame.
    const dt = Math.min(delta, 0.1);
    const p = scrollProgress.value;

    // Continuous idle spin, plus scroll scrub. The scroll term dominates as
    // the hero leaves, so the logo visibly winds away rather than drifting.
    const spin = reducedMotion ? 0 : dt * 0.35;
    m.rotation.y += spin + p * dt * 2.2;

    const targetX = reducedMotion ? 0 : pointer.current.y * 0.35 + p * 0.6;
    const targetZ = reducedMotion ? 0 : -pointer.current.x * 0.25;
    m.rotation.x += (targetX - m.rotation.x) * Math.min(1, dt * 4);
    m.rotation.z += (targetZ - m.rotation.z) * Math.min(1, dt * 4);

    // Leaving the hero: shrink and lift out of centre, tied to progress.
    const scale = (1 - p * 0.55) * (viewport.width < 6 ? 0.72 : 1);
    m.scale.setScalar(Math.max(0.2, scale));
    m.position.y = p * 1.6;
    m.position.x = p * 0.8;
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
      <StarMesh reducedMotion={reducedMotion} />
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
