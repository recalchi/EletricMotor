import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import * as THREE from 'three';
import { useApp, type ViewMode } from '../../app/store';
import { CATALOG, CATALOG_BY_ID, descendants } from '../../domain/catalog';
import { SENSOR_CANDIDATES } from '../../domain/sensors';
import type { ComponentGroup } from '../../domain/types';
import { ANCHORS, DIM, EXPLODE, beam, profile, tube, type V3 } from './geometry';

const FOCUS: Record<ViewMode, ComponentGroup[] | null> = {
  externo: null,
  eletrico: ['energia', 'eletronica', 'propulsao'],
  mecanico: ['estrutura', 'dinamica'],
  sensores: ['instrumentacao'],
};

const SELECT_COLOR = new THREE.Color('#22d3ee');

interface PartProps {
  id: string;
  color: string;
  metalness?: number;
  roughness?: number;
  emissive?: string;
  emissiveIntensity?: number;
  children: (m: THREE.MeshStandardMaterial) => ReactNode;
}

/** Peça clicável mapeada a um componentId. Controla material, foco, isolamento e vista explodida. */
function Part({ id, color, metalness = 0.3, roughness = 0.5, emissive, emissiveIntensity = 0, children }: PartProps) {
  const comp = CATALOG_BY_ID[id];
  const ref = useRef<THREE.Group>(null);
  const selected = useApp((s) => s.selectedId === id);
  const hovered = useApp((s) => s.hoveredId === id);
  const exploded = useApp((s) => s.exploded);
  const hideFairings = useApp((s) => s.hideFairings);
  const xray = useApp((s) => s.xray);
  const viewMode = useApp((s) => s.viewMode);
  const isolateId = useApp((s) => s.isolateId);
  const reduced = useApp((s) => s.reducedMotion);
  const select = useApp((s) => s.select);
  const hover = useApp((s) => s.hover);

  const mat = useMemo(
    () => new THREE.MeshStandardMaterial({ color, metalness, roughness, side: THREE.DoubleSide }),
    [color, metalness, roughness],
  );
  useEffect(() => () => mat.dispose(), [mat]);

  const isolateSet = useMemo(() => (isolateId ? new Set([isolateId, ...descendants(isolateId)]) : null), [isolateId]);

  // Opacidade/realce conforme modo
  const focusGroups = FOCUS[viewMode];
  let opacity = 1;
  if (isolateSet && !isolateSet.has(id)) opacity = 0.06;
  else if (focusGroups && !focusGroups.includes(comp.group) && !(viewMode === 'mecanico' && id === 'hub-motor'))
    opacity = comp.isFairing ? 0.05 : 0.14;
  else if (xray && comp.isFairing) opacity = 0.12;
  if (selected) opacity = 1;

  const ghost = opacity < 1;
  mat.transparent = ghost;
  mat.opacity = opacity;
  mat.depthWrite = !ghost;
  const baseEm = emissive ? new THREE.Color(emissive) : new THREE.Color(0, 0, 0);
  if (selected) {
    mat.emissive.copy(SELECT_COLOR);
    mat.emissiveIntensity = 0.55;
  } else if (hovered) {
    mat.emissive.copy(SELECT_COLOR);
    mat.emissiveIntensity = 0.22;
  } else {
    mat.emissive.copy(baseEm);
    mat.emissiveIntensity = emissiveIntensity;
  }
  mat.needsUpdate = true;

  const visible = !(hideFairings && comp.isFairing) && (id !== 'gateway' || viewMode === 'sensores');
  const target = exploded ? (EXPLODE[id] ?? [0, 0, 0]) : [0, 0, 0];

  useFrame((_, dt) => {
    const g = ref.current;
    if (!g) return;
    const k = reduced ? 1 : Math.min(1, dt * 5);
    g.position.x += (target[0] - g.position.x) * k;
    g.position.y += (target[1] - g.position.y) * k;
    g.position.z += (target[2] - g.position.z) * k;
  });

  return (
    <group
      ref={ref}
      name={id}
      userData={{ componentId: id }}
      visible={visible}
      onClick={(e) => {
        e.stopPropagation();
        if (opacity < 0.1) return;
        select(id);
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        hover(id);
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        hover(null);
        document.body.style.cursor = '';
      }}
    >
      {children(mat)}
      {selected && <PartLabel id={id} />}
    </group>
  );
}

function PartLabel({ id }: { id: string }) {
  const a = ANCHORS[id] ?? [0, 1, 0];
  return (
    <Html position={[a[0], a[1] + 0.14, a[2]]} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
      <div className="whitespace-nowrap rounded border border-cyanx-400/60 bg-ink-950/90 px-2 py-0.5 text-[11px] font-medium text-cyanx-300 shadow-glow">
        {CATALOG_BY_ID[id]?.name}
      </div>
    </Html>
  );
}

// ───────────────────────── Sub-geometrias

function Wheel({ center, motor, m }: { center: V3; motor?: boolean; m: THREE.Material }) {
  const geos = useMemo(() => {
    const tire = new THREE.TorusGeometry(DIM.wheelRadius - DIM.tireTube, DIM.tireTube, 18, 64);
    const rim = new THREE.TorusGeometry(DIM.wheelRadius - DIM.tireTube * 1.9, 0.016, 8, 64);
    const spokes: THREE.BufferGeometry[] = [];
    // Estrela de 5 braços em "V" (estilo da referência visual)
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      for (const off of [-0.16, 0.16]) {
        const r0 = motor ? 0.13 : 0.05;
        const r1 = DIM.wheelRadius - DIM.tireTube * 1.9;
        spokes.push(
          beam([Math.cos(a) * r0, Math.sin(a) * r0, 0], [Math.cos(a + off) * r1, Math.sin(a + off) * r1, 0], 0.011, 6),
        );
      }
    }
    return { tire, rim, spokes };
  }, [motor]);
  return (
    <group position={center}>
      <mesh geometry={geos.tire} castShadow>
        <meshStandardMaterial color="#111317" roughness={0.9} />
      </mesh>
      <mesh geometry={geos.rim} material={m} />
      {geos.spokes.map((g, i) => (
        <mesh key={i} geometry={g} material={m} />
      ))}
    </group>
  );
}

const rotZ = new THREE.Euler(Math.PI / 2, 0, 0);

export function MotorcycleModel() {
  const g = useMemo(() => {
    const [fx, fy] = DIM.frontAxle;
    const [rx, ry] = DIM.rearAxle;
    const [px, py] = DIM.swingPivot;
    const side = (z: number) => z;
    return {
      frameSpars: [0.13, -0.13].map((z) =>
        tube(
          [
            [0.44, 0.95, side(z * 0.6)],
            [0.26, 0.9, z],
            [-0.02, 0.84, z],
            [-0.24, 0.74, z],
            [px, py, z],
          ],
          0.026,
        ),
      ),
      frameDown: [0.11, -0.11].map((z) =>
        tube(
          [
            [0.44, 0.9, z * 0.5],
            [0.37, 0.55, z],
            [0.15, 0.36, z],
            [-0.18, 0.36, z],
            [px, py, z],
          ],
          0.02,
        ),
      ),
      frameCross: [
        beam([0.25, 0.9, -0.13], [0.25, 0.9, 0.13], 0.014),
        beam([-0.2, 0.76, -0.13], [-0.2, 0.76, 0.13], 0.014),
        beam([0.1, 0.36, -0.11], [0.1, 0.36, 0.11], 0.014),
        beam([px, py, -0.13], [px, py, 0.13], 0.02),
      ],
      headTube: beam([0.47, 0.88, 0], [0.42, 1.04, 0], 0.035),
      subframe: [0.1, -0.1].flatMap((z) => [
        beam([-0.2, 0.84, z], [-0.98, 0.92, z * 0.8], 0.014),
        beam([-0.26, 0.6, z], [-0.72, 0.88, z * 0.9], 0.012),
      ]),
      swingarm: [0.12, -0.12].map((z) => beam([px, py, z], [rx, ry, z], 0.028, 4)),
      swingCross: beam([px - 0.08, py - 0.03, -0.12], [px - 0.08, py - 0.03, 0.12], 0.02),
      shockBody: beam([-0.46, 0.4, 0], [-0.32, 0.6, 0], 0.03),
      shockRod: beam([-0.32, 0.6, 0], [-0.24, 0.76, 0], 0.012),
      forkLower: [0.1, -0.1].map((z) => beam([fx, fy, z], [0.6, 0.62, z], 0.022)),
      forkUpper: [0.1, -0.1].map((z) => beam([0.6, 0.62, z], [0.42, 1.06, z], 0.032)),
      tripleTop: new THREE.BoxGeometry(0.08, 0.025, 0.28).translate(0.43, 1.06, 0),
      tripleBottom: new THREE.BoxGeometry(0.08, 0.025, 0.28).translate(0.475, 0.9, 0),
      bar: beam([0.37, 1.12, -0.37], [0.37, 1.12, 0.37], 0.013),
      risers: [0.07, -0.07].map((z) => beam([0.42, 1.07, z], [0.37, 1.12, z], 0.012)),
      grips: [0.33, -0.33].map((z) => beam([0.37, 1.12, z - 0.05], [0.37, 1.12, z + 0.05], 0.019)),
      mirrors: [0.27, -0.27].flatMap((z) => [
        beam([0.38, 1.12, z], [0.36, 1.32, z * 1.15], 0.006),
        new THREE.BoxGeometry(0.03, 0.06, 0.12).translate(0.36, 1.34, z * 1.18),
      ]),
      tft: new THREE.BoxGeometry(0.02, 0.085, 0.15),
      headlight: profile(
        [
          [0.5, 0.88],
          [0.62, 0.92],
          [0.64, 1.0],
          [0.56, 1.06],
          [0.48, 1.04],
        ],
        0.17,
      ),
      lens: profile(
        [
          [0.6, 0.93],
          [0.645, 0.96],
          [0.645, 1.0],
          [0.6, 1.02],
        ],
        0.12,
        0,
        0.004,
      ),
      tank: profile(
        [
          [0.42, 0.96],
          [0.3, 1.05],
          [0.02, 1.03],
          [-0.18, 0.96],
          [-0.17, 0.88],
          [0.02, 0.85],
          [0.32, 0.86],
        ],
        0.32,
      ),
      sideL: profile(
        [
          [0.42, 0.93],
          [0.41, 0.6],
          [0.28, 0.36],
          [-0.12, 0.32],
          [-0.24, 0.44],
          [-0.22, 0.84],
          [0.0, 0.87],
        ],
        0.014,
        -0.175,
        0.006,
      ),
      sideR: profile(
        [
          [0.42, 0.93],
          [0.41, 0.6],
          [0.28, 0.36],
          [-0.12, 0.32],
          [-0.24, 0.44],
          [-0.22, 0.84],
          [0.0, 0.87],
        ],
        0.014,
        0.175,
        0.006,
      ),
      tail: profile(
        [
          [-0.6, 0.91],
          [-1.02, 0.99],
          [-1.05, 0.94],
          [-0.72, 0.84],
        ],
        0.17,
      ),
      seat: profile(
        [
          [0.02, 0.98],
          [-0.25, 0.97],
          [-0.55, 1.0],
          [-0.74, 1.04],
          [-0.76, 0.99],
          [-0.5, 0.93],
          [-0.2, 0.9],
          [0.02, 0.92],
        ],
        0.26,
        0,
        0.02,
      ),
      fender: new THREE.CylinderGeometry(0.34, 0.34, 0.12, 32, 1, true, Math.PI * 0.62, Math.PI * 0.55),
      hubMotor: new THREE.CylinderGeometry(0.135, 0.135, 0.17, 40),
      hubCap: new THREE.CylinderGeometry(0.06, 0.06, 0.19, 24),
      frontHub: new THREE.CylinderGeometry(0.045, 0.045, 0.2, 20),
      disc: new THREE.CylinderGeometry(0.14, 0.14, 0.006, 40),
      discRear: new THREE.CylinderGeometry(0.11, 0.11, 0.006, 40),
      caliper: new THREE.BoxGeometry(0.07, 0.1, 0.035),
      battery: new THREE.BoxGeometry(0.24, 0.38, 0.24),
      batteryHandle: beam([-0.06, 0.86, 0], [0.06, 0.86, 0], 0.01),
      bayPlate: new THREE.BoxGeometry(0.62, 0.012, 0.3).translate(0.02, 0.43, 0),
      bayEnd: [-0.29, 0.33].map((x) => new THREE.BoxGeometry(0.012, 0.42, 0.3).translate(x, 0.63, 0)),
      controller: new THREE.BoxGeometry(0.2, 0.07, 0.16),
      fins: [-0.06, -0.02, 0.02, 0.06].map((z) => new THREE.BoxGeometry(0.18, 0.025, 0.006).translate(0, 0.045, z)),
      charger: new THREE.BoxGeometry(0.16, 0.09, 0.15),
      dcdc: new THREE.BoxGeometry(0.08, 0.06, 0.1),
      breaker: new THREE.BoxGeometry(0.05, 0.07, 0.04),
      port: new THREE.CylinderGeometry(0.025, 0.025, 0.035, 20),
      harness: [
        tube(
          [
            [-0.11, 0.84, 0.05],
            [0.02, 0.88, 0.1],
            [0.15, 0.84, 0.05],
            [0.33, 0.7, 0.12],
            [0.3, 0.45, 0.08],
            [-0.05, 0.38, 0.06],
            [-0.16, 0.36, 0.05],
          ],
          0.009,
          80,
        ),
        tube(
          [
            [0.33, 0.66, 0.1],
            [0.4, 0.86, 0.06],
            [0.44, 1.02, 0.04],
            [0.43, 1.13, 0],
          ],
          0.006,
        ),
        tube(
          [
            [0.15, 0.84, -0.05],
            [-0.3, 0.86, -0.06],
            [-0.7, 0.9, -0.04],
            [-1.0, 0.94, 0],
          ],
          0.005,
        ),
      ],
      motorCables: tube(
        [
          [-0.2, 0.34, 0.09],
          [-0.32, 0.42, 0.13],
          [-0.55, 0.36, 0.14],
          [-0.68, 0.31, 0.1],
        ],
        0.011,
      ),
      taillight: new THREE.BoxGeometry(0.02, 0.03, 0.12),
      gateway: new THREE.BoxGeometry(0.09, 0.04, 0.07),
    };
  }, []);

  useEffect(
    () => () => {
      // libera geometrias ao desmontar
      Object.values(g)
        .flat()
        .forEach((x) => (x as THREE.BufferGeometry).dispose?.());
    },
    [g],
  );

  const [fx, fy] = DIM.frontAxle;
  const [rx, ry] = DIM.rearAxle;

  return (
    <group>
      {/* Estrutura */}
      <Part id="frame" color="#8b949e" metalness={0.75} roughness={0.35}>
        {(m) => (
          <>
            {[...g.frameSpars, ...g.frameDown, ...g.frameCross, g.headTube].map((x, i) => (
              <mesh key={i} geometry={x} material={m} castShadow />
            ))}
          </>
        )}
      </Part>
      <Part id="subframe-rear" color="#6b7280" metalness={0.7} roughness={0.4}>
        {(m) => g.subframe.map((x, i) => <mesh key={i} geometry={x} material={m} />)}
      </Part>
      <Part id="battery-bay" color="#1f2937" metalness={0.4} roughness={0.6}>
        {(m) => [g.bayPlate, ...g.bayEnd].map((x, i) => <mesh key={i} geometry={x} material={m} />)}
      </Part>
      <Part id="seat" color="#1a1c20" roughness={0.85} metalness={0.05}>
        {(m) => <mesh geometry={g.seat} material={m} castShadow />}
      </Part>
      <Part id="fairing-tank" color="#0d0f12" metalness={0.6} roughness={0.25}>
        {(m) => <mesh geometry={g.tank} material={m} castShadow />}
      </Part>
      <Part id="fairing-side-l" color="#111317" metalness={0.6} roughness={0.28}>
        {(m) => <mesh geometry={g.sideL} material={m} />}
      </Part>
      <Part id="fairing-side-r" color="#111317" metalness={0.6} roughness={0.28}>
        {(m) => <mesh geometry={g.sideR} material={m} />}
      </Part>
      <Part id="fairing-tail" color="#0d0f12" metalness={0.6} roughness={0.25}>
        {(m) => <mesh geometry={g.tail} material={m} castShadow />}
      </Part>
      <Part id="fender-front" color="#0d0f12" metalness={0.5} roughness={0.3}>
        {(m) => <mesh geometry={g.fender} material={m} position={[fx, fy, 0]} rotation={rotZ} />}
      </Part>
      <Part id="handlebar" color="#2a2e35" metalness={0.6} roughness={0.4}>
        {(m) => (
          <>
            {[g.bar, ...g.risers, ...g.grips, ...g.mirrors, g.tripleTop, g.tripleBottom].map((x, i) => (
              <mesh key={i} geometry={x} material={m} />
            ))}
          </>
        )}
      </Part>

      {/* Rodas */}
      <Part id="wheel-front" color="#c3cad3" metalness={0.8} roughness={0.3}>
        {(m) => (
          <>
            <Wheel center={DIM.frontAxle} m={m} />
            <mesh geometry={g.frontHub} material={m} position={[fx, fy, 0]} rotation={rotZ} />
          </>
        )}
      </Part>
      <Part id="wheel-rear" color="#c3cad3" metalness={0.8} roughness={0.3}>
        {(m) => <Wheel center={DIM.rearAxle} motor m={m} />}
      </Part>

      {/* Propulsão */}
      <Part id="hub-motor" color="#374151" metalness={0.8} roughness={0.35}>
        {(m) => (
          <>
            <mesh geometry={g.hubMotor} material={m} position={[rx, ry, 0]} rotation={rotZ} castShadow />
            <mesh geometry={g.hubCap} position={[rx, ry, 0]} rotation={rotZ}>
              <meshStandardMaterial color="#9ca3af" metalness={0.9} roughness={0.2} />
            </mesh>
          </>
        )}
      </Part>
      <Part id="motor-controller" color="#9ca3af" metalness={0.8} roughness={0.3}>
        {(m) => (
          <group position={[-0.17, 0.33, 0]}>
            <mesh geometry={g.controller} material={m} />
            {g.fins.map((x, i) => (
              <mesh key={i} geometry={x} material={m} />
            ))}
          </group>
        )}
      </Part>
      <Part id="motor-cables" color="#f97316" roughness={0.5} emissive="#f97316" emissiveIntensity={0.25}>
        {(m) => <mesh geometry={g.motorCables} material={m} />}
      </Part>

      {/* Energia */}
      <Part id="battery-a" color="#123a73" metalness={0.3} roughness={0.35} emissive="#0ea5e9" emissiveIntensity={0.3}>
        {(m) => (
          <group position={[-0.11, 0.64, 0]}>
            <mesh geometry={g.battery} material={m} castShadow />
            <mesh geometry={g.batteryHandle} position={[0, -0.64, 0]} material={m} />
          </group>
        )}
      </Part>
      <Part id="battery-b" color="#123a73" metalness={0.3} roughness={0.35} emissive="#0ea5e9" emissiveIntensity={0.3}>
        {(m) => (
          <group position={[0.15, 0.64, 0]}>
            <mesh geometry={g.battery} material={m} castShadow />
            <mesh geometry={g.batteryHandle} position={[0, -0.64, 0]} material={m} />
          </group>
        )}
      </Part>
      <Part id="charger" color="#4b5563" metalness={0.6} roughness={0.4}>
        {(m) => <mesh geometry={g.charger} material={m} position={[0.3, 0.42, 0]} />}
      </Part>
      <Part id="dcdc" color="#64748b" metalness={0.6} roughness={0.4}>
        {(m) => <mesh geometry={g.dcdc} material={m} position={[0.38, 0.52, 0]} />}
      </Part>
      <Part id="main-breaker" color="#b91c1c" metalness={0.3} roughness={0.5}>
        {(m) => <mesh geometry={g.breaker} material={m} position={[0.33, 0.62, 0.12]} />}
      </Part>
      <Part id="charge-port" color="#e5e7eb" metalness={0.5} roughness={0.4}>
        {(m) => <mesh geometry={g.port} material={m} position={[0.33, 0.78, 0.18]} rotation={rotZ} />}
      </Part>

      {/* Eletrônica */}
      <Part id="wiring-harness" color="#ea580c" roughness={0.6} emissive="#f97316" emissiveIntensity={0.2}>
        {(m) => g.harness.map((x, i) => <mesh key={i} geometry={x} material={m} />)}
      </Part>
      <Part id="tft-dashboard" color="#0b1220" emissive="#22d3ee" emissiveIntensity={0.35} roughness={0.2}>
        {(m) => <mesh geometry={g.tft} material={m} position={[0.43, 1.16, 0]} rotation={[0, 0, -0.5]} />}
      </Part>
      <Part id="headlight" color="#e6f6ff" emissive="#bfefff" emissiveIntensity={0.9} metalness={0.2} roughness={0.15}>
        {(m) => (
          <>
            <mesh geometry={g.headlight}>
              <meshStandardMaterial color="#0d0f12" metalness={0.6} roughness={0.25} />
            </mesh>
            <mesh geometry={g.lens} material={m} />
          </>
        )}
      </Part>
      <Part id="taillight" color="#7f1d1d" emissive="#ef4444" emissiveIntensity={1.2}>
        {(m) => <mesh geometry={g.taillight} material={m} position={[-1.045, 0.955, 0]} />}
      </Part>

      {/* Dinâmica */}
      <Part id="fork-front" color="#d4a017" metalness={0.85} roughness={0.25}>
        {(m) => (
          <>
            {g.forkUpper.map((x, i) => (
              <mesh key={`u${i}`} geometry={x}>
                <meshStandardMaterial color="#1f2328" metalness={0.8} roughness={0.3} />
              </mesh>
            ))}
            {g.forkLower.map((x, i) => (
              <mesh key={`l${i}`} geometry={x} material={m} />
            ))}
          </>
        )}
      </Part>
      <Part id="shock-rear" color="#d4a017" metalness={0.85} roughness={0.25}>
        {(m) => (
          <>
            <mesh geometry={g.shockBody} material={m} />
            <mesh geometry={g.shockRod} material={m} />
          </>
        )}
      </Part>
      <Part id="swingarm" color="#7b8490" metalness={0.75} roughness={0.35}>
        {(m) => [...g.swingarm, g.swingCross].map((x, i) => <mesh key={i} geometry={x} material={m} castShadow />)}
      </Part>
      <Part id="brake-front" color="#b8bec6" metalness={0.9} roughness={0.2}>
        {(m) => (
          <>
            {[0.075, -0.075].map((z) => (
              <group key={z}>
                <mesh geometry={g.disc} material={m} position={[fx, fy, z]} rotation={rotZ} />
                <mesh geometry={g.caliper} position={[fx - 0.12, fy + 0.06, z * 1.25]}>
                  <meshStandardMaterial color="#1f2937" metalness={0.5} roughness={0.4} />
                </mesh>
              </group>
            ))}
          </>
        )}
      </Part>
      <Part id="brake-rear" color="#b8bec6" metalness={0.9} roughness={0.2}>
        {(m) => (
          <>
            <mesh geometry={g.discRear} material={m} position={[rx, ry, -0.1]} rotation={rotZ} />
            <mesh geometry={g.caliper} position={[rx + 0.06, ry + 0.09, -0.12]}>
              <meshStandardMaterial color="#1f2937" metalness={0.5} roughness={0.4} />
            </mesh>
          </>
        )}
      </Part>

      {/* Instrumentação futura */}
      <Part id="gateway" color="#fb923c" emissive="#fb923c" emissiveIntensity={0.5}>
        {(m) => <mesh geometry={g.gateway} material={m} position={ANCHORS.gateway} />}
      </Part>

      <SensorMarkers />
    </group>
  );
}

/** Marcadores no modo Sensores: ciano = leitura original a investigar; laranja = sensor proposto. */
function SensorMarkers() {
  const viewMode = useApp((s) => s.viewMode);
  const exploded = useApp((s) => s.exploded);
  const select = useApp((s) => s.select);
  const ref = useRef<THREE.Group>(null);
  const reduced = useApp((s) => s.reducedMotion);

  const markers = useMemo(() => {
    const original = CATALOG.filter((c) => c.signals.some((s) => s.availability === 'a_investigar')).map((c) => ({
      id: c.id,
      key: `o-${c.id}`,
      color: '#22d3ee',
      offset: [0, 0, 0.04] as V3,
    }));
    const proposed = SENSOR_CANDIDATES.filter((s) => s.status !== 'instalado').map((s, i) => ({
      id: s.componentId,
      key: `p-${s.id}`,
      color: '#fb923c',
      offset: [0.03 * ((i % 3) - 1), 0.05, 0.08] as V3,
    }));
    return [...original, ...proposed];
  }, []);

  useFrame(({ clock }) => {
    if (!ref.current || reduced) return;
    const s = 1 + Math.sin(clock.elapsedTime * 3) * 0.18;
    ref.current.children.forEach((c) => c.scale.setScalar(s));
  });

  if (viewMode !== 'sensores') return null;
  return (
    <group ref={ref}>
      {markers.map((m) => {
        const a = ANCHORS[m.id] ?? [0, 0.6, 0];
        const ex = exploded ? (EXPLODE[m.id] ?? [0, 0, 0]) : [0, 0, 0];
        return (
          <mesh
            key={m.key}
            position={[a[0] + ex[0] + m.offset[0], a[1] + ex[1] + m.offset[1], a[2] + ex[2] + m.offset[2]]}
            onClick={(e) => {
              e.stopPropagation();
              select(m.id);
            }}
          >
            <sphereGeometry args={[0.022, 16, 16]} />
            <meshBasicMaterial color={m.color} toneMapped={false} />
          </mesh>
        );
      })}
    </group>
  );
}
