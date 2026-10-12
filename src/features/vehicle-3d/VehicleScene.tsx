import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { ContactShadows, Environment, Grid, Lightformer, OrbitControls } from '@react-three/drei';
import { Component, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import * as THREE from 'three';
import { useApp } from '../../app/store';
import { MotorcycleModel } from './MotorcycleModel';
import { Fallback2D } from './Fallback2D';

export type CameraPreset = 'iso' | 'lateral' | 'frontal' | 'superior' | 'traseira';

const PRESETS: Record<CameraPreset, [number, number, number]> = {
  iso: [2.3, 1.35, 2.5],
  lateral: [0, 0.75, 3.3],
  frontal: [3.2, 0.9, 0],
  superior: [0, 3.6, 0.01],
  traseira: [-3.2, 1.0, 0.2],
};
const TARGET = new THREE.Vector3(0, 0.62, 0);

function CameraRig({ preset, nonce }: { preset: CameraPreset; nonce: number }) {
  const { camera } = useThree();
  const controls = useThree((s) => s.controls) as unknown as { target: THREE.Vector3; update(): void } | null;
  const goal = useRef<THREE.Vector3 | null>(null);
  const reduced = useApp((s) => s.reducedMotion);
  const aspect = useThree((s) => s.size.width / Math.max(1, s.size.height));
  useEffect(() => {
    // Em telas estreitas (celular) afasta a câmera para a moto inteira caber no quadro
    const k = Math.max(1, 1.45 / aspect);
    goal.current = new THREE.Vector3(...PRESETS[preset]).sub(TARGET).multiplyScalar(k).add(TARGET);
  }, [preset, nonce, aspect]);
  useFrame((_, dt) => {
    if (!goal.current) return;
    const k = reduced ? 1 : Math.min(1, dt * 4);
    camera.position.lerp(goal.current, k);
    controls?.target.lerp(TARGET, k);
    controls?.update();
    if (camera.position.distanceTo(goal.current) < 0.01) goal.current = null;
  });
  return null;
}

function hasWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    return Boolean(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

class GLBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function VehicleScene({
  preset = 'iso',
  presetNonce = 0,
  autoRotate = false,
  className,
}: {
  preset?: CameraPreset;
  presetNonce?: number;
  autoRotate?: boolean;
  className?: string;
}) {
  const [gl] = useState(hasWebGL);
  const select = useApp((s) => s.select);
  const reduced = useApp((s) => s.reducedMotion);
  const fallback = <Fallback2D />;
  if (!gl) return fallback;
  return (
    <div className={className ?? 'relative h-full w-full'}>
      <GLBoundary fallback={fallback}>
        <Canvas
          shadows
          dpr={[1, 2]}
          camera={{ position: PRESETS.iso, fov: 38, near: 0.05, far: 50 }}
          onPointerMissed={() => select(null)}
          gl={{ antialias: true, preserveDrawingBuffer: true }}
          data-testid="vehicle-canvas"
        >
          <color attach="background" args={['#050c18']} />
          <fog attach="fog" args={['#050c18', 6, 14]} />
          <ambientLight intensity={0.35} />
          <directionalLight position={[3, 5, 2]} intensity={1.6} castShadow shadow-mapSize={[1024, 1024]} />
          <directionalLight position={[-3, 2, -2]} intensity={0.6} color="#67e8f9" />
          <Suspense fallback={null}>
            <Environment resolution={128}>
              <Lightformer intensity={2} position={[0, 4, 0]} scale={[6, 2, 1]} rotation-x={Math.PI / 2} />
              <Lightformer
                intensity={1}
                color="#22d3ee"
                position={[-4, 1, 0]}
                scale={[2, 4, 1]}
                rotation-y={Math.PI / 2}
              />
              <Lightformer intensity={1} position={[4, 1, 2]} scale={[3, 3, 1]} rotation-y={-Math.PI / 2} />
            </Environment>
          </Suspense>
          <MotorcycleModel />
          <ContactShadows position={[0, 0.001, 0]} opacity={0.6} scale={4} blur={2.4} far={1.2} />
          <Grid
            position={[0, 0, 0]}
            args={[12, 12]}
            cellSize={0.25}
            cellThickness={0.6}
            cellColor="#0f2a44"
            sectionSize={1}
            sectionThickness={1}
            sectionColor="#155e75"
            fadeDistance={9}
            infiniteGrid
          />
          <OrbitControls
            makeDefault
            target={TARGET}
            enableDamping
            minDistance={1}
            maxDistance={9}
            maxPolarAngle={Math.PI / 2 - 0.02}
            autoRotate={autoRotate && !reduced}
            autoRotateSpeed={0.6}
          />
          <CameraRig preset={preset} nonce={presetNonce} />
        </Canvas>
      </GLBoundary>
      <div className="pointer-events-none absolute left-3 top-3 rounded border border-amber-400/40 bg-ink-950/80 px-2 py-1 text-[10px] font-semibold tracking-wider text-amber-300">
        MODELO PROVISÓRIO<span className="hidden sm:inline"> — aproximação geométrica, não é CAD</span>
      </div>
    </div>
  );
}
