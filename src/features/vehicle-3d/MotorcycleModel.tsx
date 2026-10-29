import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { useApp, type ViewMode } from '../../app/store';
import { CATALOG, CATALOG_BY_ID, descendants } from '../../domain/catalog';
import { SENSOR_CANDIDATES } from '../../domain/sensors';
import type { ComponentGroup } from '../../domain/types';
import {
  ANCHORS,
  DIM,
  EXPLODE,
  beam,
  brakeDisc,
  hubMotorShell,
  profile,
  rimGeometry,
  starSpokes,
  tireGeometry,
  tube,
  vLogo,
  type V3,
} from './geometry';

const FOCUS: Record<ViewMode, ComponentGroup[] | null> = {
  externo: null,
  eletrico: ['energia', 'eletronica', 'propulsao'],
  mecanico: ['estrutura', 'dinamica'],
  sensores: ['instrumentacao'],
};

const SELECT_COLOR = new THREE.Color('#22d3ee');

// Materiais fixos (não selecionáveis isoladamente) compartilhados
const M = {
  rubber: new THREE.MeshStandardMaterial({ color: '#0f1013', roughness: 0.92, metalness: 0 }),
  chrome: new THREE.MeshStandardMaterial({ color: '#d6dbe1', roughness: 0.18, metalness: 1 }),
  darkMetal: new THREE.MeshStandardMaterial({ color: '#24282e', roughness: 0.45, metalness: 0.7 }),
  satinBlack: new THREE.MeshPhysicalMaterial({ color: '#141619', roughness: 0.55, metalness: 0.2, clearcoat: 0.3 }),
  gold: new THREE.MeshStandardMaterial({ color: '#c9a227', roughness: 0.28, metalness: 1 }),
  glass: new THREE.MeshPhysicalMaterial({
    color: '#1a2633',
    roughness: 0.05,
    metalness: 0,
    transmission: 0.6,
    transparent: true,
    opacity: 0.55,
  }),
  logo: new THREE.MeshStandardMaterial({ color: '#e5e9ee', roughness: 0.2, metalness: 1 }),
  plate: new THREE.MeshStandardMaterial({ color: '#d9dde2', roughness: 0.6, metalness: 0.1 }),
  amber: new THREE.MeshStandardMaterial({ color: '#7c4a03', emissive: '#f59e0b', emissiveIntensity: 0.6 }),
};

interface PartProps {
  id: string;
  color: string;
  metalness?: number;
  roughness?: number;
  clearcoat?: number;
  emissive?: string;
  emissiveIntensity?: number;
  children: (m: THREE.MeshPhysicalMaterial) => ReactNode;
}

/** Peça clicável mapeada a um componentId. Controla material, foco, isolamento e vista explodida. */
function Part({
  id,
  color,
  metalness = 0.3,
  roughness = 0.5,
  clearcoat = 0,
  emissive,
  emissiveIntensity = 0,
  children,
}: PartProps) {
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
    () =>
      new THREE.MeshPhysicalMaterial({
        color,
        metalness,
        roughness,
        clearcoat,
        clearcoatRoughness: 0.08,
        side: THREE.DoubleSide,
      }),
    [color, metalness, roughness, clearcoat],
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

  // Peças-filhas com material fixo (borracha, cromados) também ficam fantasmas no modo foco/isolamento
  useEffect(() => {
    ref.current?.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || mesh.material === mat) return;
      mesh.visible = !ghost || opacity > 0.1;
    });
  }, [ghost, opacity, mat]);

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

// ───────────────────────── Roda (pneu + aro + raios em estrela)

function Wheel({ center, spec, m, hubR }: { center: V3; spec: typeof DIM.front; m: THREE.Material; hubR: number }) {
  const geos = useMemo(
    () => ({
      tire: tireGeometry(spec.radius, spec.width, spec.rim),
      rim: rimGeometry(spec.rim, spec.width),
      spokes: starSpokes(hubR, spec.rim - 0.012, 0.018),
      inner: starSpokes(hubR, spec.rim - 0.012, 0.012),
    }),
    [spec, hubR],
  );
  useEffect(() => () => Object.values(geos).forEach((g) => g.dispose()), [geos]);
  const off = spec.width * 0.18;
  return (
    <group position={center}>
      <mesh geometry={geos.tire} material={M.rubber} castShadow />
      <mesh geometry={geos.rim} material={M.darkMetal} />
      {/* raios: face usinada (seleção) + núcleo escuro, nos dois lados */}
      <mesh geometry={geos.spokes} material={m} position={[0, 0, off]} />
      <mesh geometry={geos.spokes} material={m} position={[0, 0, -off]} />
      <mesh geometry={geos.inner} material={M.darkMetal} />
    </group>
  );
}

const rotZ = new THREE.Euler(Math.PI / 2, 0, 0);

export function MotorcycleModel() {
  const g = useMemo(() => {
    const [fx, fy] = DIM.frontAxle;
    const [rx, ry] = DIM.rearAxle;
    const [px, py] = DIM.swingPivot;
    const Z = DIM.shroudZ;

    const shroudPts: [number, number][] = [
      [0.47, 0.885],
      [0.45, 0.66],
      [0.35, 0.38],
      [0.22, 0.29],
      [-0.1, 0.285],
      [-0.2, 0.33],
      [-0.22, 0.52],
      [-0.2, 0.76],
      [-0.1, 0.8],
      [0.26, 0.84],
    ];
    const insetPts: [number, number][] = [
      [0.4, 0.8],
      [0.38, 0.62],
      [0.28, 0.4],
      [0.18, 0.34],
      [-0.08, 0.34],
      [-0.15, 0.4],
      [-0.15, 0.7],
      [0.2, 0.77],
    ];

    return {
      // Quadro: longarinas duplas da coluna de direção ao pivô da balança
      frameSpars: [0.12, -0.12].map((z) =>
        tube(
          [
            [0.47, 0.86, z * 0.4],
            [0.32, 0.8, z],
            [0.05, 0.76, z],
            [-0.18, 0.66, z],
            [px, py, z],
          ],
          0.024,
        ),
      ),
      frameDown: [0.1, -0.1].map((z) =>
        tube(
          [
            [0.48, 0.78, z * 0.4],
            [0.42, 0.52, z],
            [0.26, 0.32, z],
            [-0.12, 0.3, z],
            [px, py, z],
          ],
          0.019,
        ),
      ),
      frameCross: [
        beam([0.3, 0.8, -0.12], [0.3, 0.8, 0.12], 0.013),
        beam([-0.16, 0.66, -0.12], [-0.16, 0.66, 0.12], 0.013),
        beam([0.1, 0.3, -0.1], [0.1, 0.3, 0.1], 0.013),
        beam([px, py, -0.13], [px, py, 0.13], 0.022),
      ],
      headTube: beam(DIM.headBottom, DIM.headTop, 0.034),
      subframe: [0.09, -0.09].flatMap((z) => [
        beam([-0.16, 0.76, z], [-0.96, 0.84, z * 0.75], 0.012),
        beam([-0.22, 0.52, z], [-0.68, 0.8, z * 0.85], 0.011),
      ]),
      pivotCover: new THREE.CylinderGeometry(0.055, 0.055, 0.012, 40),
      pivotLogo: vLogo(0.05),

      // Carenagens (preto brilhante) — laterais com painel interno vincado
      sideOuter: (z: number) => profile(shroudPts, 0.012, z, 0.008),
      sideInset: (z: number) => profile(insetPts, 0.008, z, 0.004),
      tank: profile(
        [
          [0.47, 0.9],
          [0.36, 0.955],
          [0.12, 0.945],
          [-0.12, 0.89],
          [-0.17, 0.83],
          [-0.12, 0.78],
          [0.3, 0.8],
        ],
        0.3,
        0,
        0.025,
      ),
      seatRider: profile(
        [
          [-0.1, 0.83],
          [-0.3, 0.815],
          [-0.52, 0.825],
          [-0.55, 0.79],
          [-0.12, 0.775],
        ],
        0.27,
        0,
        0.025,
      ),
      seatPillion: profile(
        [
          [-0.54, 0.84],
          [-0.82, 0.885],
          [-0.84, 0.86],
          [-0.56, 0.8],
        ],
        0.2,
        0,
        0.02,
      ),
      tail: profile(
        [
          [-0.5, 0.79],
          [-0.86, 0.86],
          [-1.03, 0.905],
          [-1.03, 0.875],
          [-0.9, 0.82],
          [-0.62, 0.74],
        ],
        0.17,
        0,
        0.015,
      ),
      plateArm: beam([-0.95, 0.84, 0], [-1.06, 0.6, 0], 0.012),
      plate: new THREE.BoxGeometry(0.008, 0.12, 0.2).translate(-1.065, 0.56, 0),
      rearSignals: [0.09, -0.09].map((z) => new THREE.BoxGeometry(0.03, 0.018, 0.018).translate(-1.06, 0.64, z * 1.4)),
      fender: new THREE.CylinderGeometry(0.335, 0.335, 0.13, 40, 1, true, Math.PI * 0.62, Math.PI * 0.52),
      hugger: new THREE.CylinderGeometry(0.345, 0.345, 0.15, 40, 1, true, Math.PI * 0.95, Math.PI * 0.4),

      // Direção e comandos
      bar: tube(
        [
          [0.38, 1.0, -0.37],
          [0.41, 0.99, -0.16],
          [0.42, 0.985, 0],
          [0.41, 0.99, 0.16],
          [0.38, 1.0, 0.37],
        ],
        0.012,
        32,
      ),
      grips: [0.33, -0.33].map((z) => beam([0.385, 1.0, z - 0.06], [0.38, 1.0, z + 0.06], 0.018)),
      levers: [0.25, -0.25].map((z) => beam([0.42, 0.995, z * 0.9], [0.43, 0.985, z * 1.45], 0.005)),
      risers: [0.06, -0.06].map((z) => beam([0.45, 0.94, z], [0.42, 0.985, z], 0.013)),
      tripleTop: new RoundedBoxGeometry(0.09, 0.025, 0.27, 2, 0.008).translate(0.452, 0.935, 0),
      tripleBottom: new RoundedBoxGeometry(0.09, 0.03, 0.27, 2, 0.008).translate(0.495, 0.77, 0),
      mirrors: [0.25, -0.25].flatMap((z) => [
        beam([0.41, 0.995, z], [0.38, 1.07, z * 1.12], 0.006),
        new RoundedBoxGeometry(0.025, 0.055, 0.12, 2, 0.01).translate(0.375, 1.085, z * 1.2),
      ]),
      tft: new RoundedBoxGeometry(0.02, 0.085, 0.15, 2, 0.006),
      tftScreen: new THREE.PlaneGeometry(0.13, 0.07),

      // Farol angular: máscara + lente + DRL em "sobrancelha" + bolha
      headMask: profile(
        [
          [0.52, 0.79],
          [0.66, 0.82],
          [0.69, 0.87],
          [0.66, 0.93],
          [0.55, 0.96],
          [0.5, 0.92],
        ],
        0.2,
        0,
        0.012,
      ),
      headLens: profile(
        [
          [0.655, 0.83],
          [0.685, 0.86],
          [0.685, 0.885],
          [0.655, 0.905],
        ],
        0.12,
        0,
        0.004,
      ),
      drl: [0.055, -0.055].map((z) =>
        tube(
          [
            [0.66, 0.925, z * 1.9],
            [0.68, 0.905, z],
            [0.69, 0.895, z * 0.2],
          ],
          0.005,
          16,
        ),
      ),
      flyscreen: profile(
        [
          [0.55, 0.96],
          [0.6, 0.955],
          [0.5, 1.03],
          [0.47, 1.02],
        ],
        0.14,
        0,
        0.003,
      ),

      // Suspensões e balança
      forkOuter: [0.1, -0.1].map((z) => beam([0.62, 0.55, z], [0.45, 0.96, z], 0.031, 20)),
      forkInner: [0.1, -0.1].map((z) => beam([fx, fy, z], [0.62, 0.55, z], 0.02, 16)),
      forkFoot: [0.1, -0.1].map((z) => new RoundedBoxGeometry(0.06, 0.07, 0.035, 2, 0.01).translate(fx, fy + 0.01, z)),
      forkCaps: [0.1, -0.1].map((z) => beam([0.452, 0.95, z], [0.448, 0.965, z], 0.026)),
      shockBody: beam([-0.42, 0.36, 0], [-0.3, 0.56, 0], 0.024),
      shockSpring: tube(
        Array.from({ length: 60 }, (_, i) => {
          const t = i / 59;
          const a = t * Math.PI * 2 * 8;
          const p = new THREE.Vector3(-0.42, 0.36, 0).lerp(new THREE.Vector3(-0.22, 0.68, 0), 0.25 + t * 0.55);
          return [p.x + Math.cos(a) * 0.035 * 0.85, p.y + Math.cos(a) * 0.035 * 0.5, Math.sin(a) * 0.035] as V3;
        }),
        0.006,
        240,
      ),
      shockRod: beam([-0.3, 0.56, 0], [-0.22, 0.68, 0], 0.01),
      swingarm: [0.12, -0.12].map((z) => beam([px, py, z], [rx, ry, z], 0.026, 6, 0.032)),
      swingCross: beam([px - 0.1, py - 0.035, -0.12], [px - 0.1, py - 0.035, 0.12], 0.02),

      // Freios
      discFront: brakeDisc(0.14, 0.075, 12),
      discRear: brakeDisc(0.11, 0.06, 10),
      caliper: new RoundedBoxGeometry(0.1, 0.055, 0.04, 3, 0.012),
      caliperSmall: new RoundedBoxGeometry(0.075, 0.045, 0.035, 3, 0.01),

      // Propulsão
      hubShell: hubMotorShell(0.15, 0.17),
      hubCover: new THREE.CylinderGeometry(0.1, 0.1, 0.012, 48),
      hubLogo: vLogo(0.08),
      frontHub: new THREE.CylinderGeometry(0.045, 0.045, 0.16, 24),
      controller: new RoundedBoxGeometry(0.2, 0.06, 0.16, 2, 0.008),
      fins: [-0.06, -0.03, 0, 0.03, 0.06].map((z) => new THREE.BoxGeometry(0.18, 0.02, 0.005).translate(0, 0.038, z)),
      motorCables: tube(
        [
          [-0.02, 0.33, 0.09],
          [-0.24, 0.4, 0.14],
          [-0.5, 0.35, 0.14],
          [-0.68, 0.31, 0.1],
        ],
        0.011,
      ),

      // Energia
      battery: new RoundedBoxGeometry(0.22, 0.34, 0.22, 3, 0.018),
      batteryCap: new RoundedBoxGeometry(0.2, 0.025, 0.2, 2, 0.008),
      batteryHandle: tube(
        [
          [-0.06, 0.0, 0],
          [-0.05, 0.035, 0],
          [0.05, 0.035, 0],
          [0.06, 0.0, 0],
        ],
        0.008,
        20,
      ),
      bayPlate: new THREE.BoxGeometry(0.56, 0.01, 0.28).translate(0.06, 0.38, 0),
      bayEnd: [-0.21, 0.33].map((x) => new THREE.BoxGeometry(0.01, 0.36, 0.28).translate(x, 0.56, 0)),
      charger: new RoundedBoxGeometry(0.15, 0.09, 0.15, 2, 0.01),
      dcdc: new RoundedBoxGeometry(0.08, 0.06, 0.1, 2, 0.006),
      breaker: new RoundedBoxGeometry(0.07, 0.04, 0.05, 2, 0.006),
      breakerLever: new RoundedBoxGeometry(0.012, 0.02, 0.022, 1, 0.003),
      bmsBoard: new RoundedBoxGeometry(0.12, 0.012, 0.08, 1, 0.003),
      port: new THREE.CylinderGeometry(0.026, 0.026, 0.03, 24),
      portCap: new THREE.CylinderGeometry(0.03, 0.03, 0.008, 24),

      // Chicote (laranja = alta tensão; fino = sinais)
      harness: [
        // alta tensão: topo das baterias → disjuntor (sob o banco) → controladora
        tube(
          [
            [0.19, 0.75, 0.05],
            [0.06, 0.775, 0.09],
            [-0.07, 0.75, 0.05],
            [-0.22, 0.755, 0.07],
            [-0.3, 0.745, 0.07],
            [-0.3, 0.55, 0.1],
            [-0.12, 0.37, 0.08],
            [0.02, 0.33, 0.06],
          ],
          0.009,
          80,
        ),
        tube(
          [
            [0.36, 0.66, 0.1],
            [0.44, 0.8, 0.06],
            [0.47, 0.95, 0.03],
            [0.47, 0.99, 0],
          ],
          0.005,
        ),
        tube(
          [
            [0.19, 0.75, -0.05],
            [-0.3, 0.77, -0.06],
            [-0.7, 0.82, -0.04],
            [-1.0, 0.875, 0],
          ],
          0.004,
        ),
      ],

      // Acessórios
      pegs: [0.19, -0.19].map((z) => beam([-0.2, 0.34, z * 0.6], [-0.2, 0.34, z], 0.012)),
      stand: [
        beam([-0.08, 0.31, -0.11], [0.0, 0.02, -0.26], 0.012),
        new THREE.BoxGeometry(0.06, 0.008, 0.04).translate(0.0, 0.015, -0.26),
      ],
      taillight: profile(
        [
          [-1.0, 0.885],
          [-1.035, 0.9],
          [-1.035, 0.88],
          [-1.0, 0.872],
        ],
        0.12,
        0,
        0.002,
      ),
      gateway: new RoundedBoxGeometry(0.09, 0.04, 0.07, 2, 0.008),
      Z,
    };
  }, []);

  const sideL = useMemo(() => ({ outer: g.sideOuter(-g.Z), inset: g.sideInset(-g.Z - 0.012) }), [g]);
  const sideR = useMemo(() => ({ outer: g.sideOuter(g.Z), inset: g.sideInset(g.Z + 0.012) }), [g]);

  useEffect(
    () => () => {
      Object.values(g)
        .flat()
        .forEach((x) => (x as THREE.BufferGeometry).dispose?.());
      [sideL, sideR].forEach((s) => (s.outer.dispose(), s.inset.dispose()));
    },
    [g, sideL, sideR],
  );

  const [fx, fy] = DIM.frontAxle;
  const [rx, ry] = DIM.rearAxle;
  const [px, py] = DIM.swingPivot;
  const BODY = { color: '#0b0c0e', metalness: 0.55, roughness: 0.22, clearcoat: 1 };

  return (
    <group>
      {/* ── Estrutura */}
      <Part id="frame" color="#9aa1aa" metalness={0.8} roughness={0.32}>
        {(m) => (
          <>
            {[...g.frameSpars, ...g.frameDown, ...g.frameCross, g.headTube].map((x, i) => (
              <mesh key={i} geometry={x} material={m} castShadow />
            ))}
            {/* tampas do pivô com o "V" (como nas referências) */}
            {[DIM.shroudZ + 0.02, -DIM.shroudZ - 0.02].map((z) => (
              <group key={z} position={[px, py, z]}>
                <mesh geometry={g.pivotCover} rotation={rotZ} material={M.satinBlack} />
                <mesh geometry={g.pivotLogo} position={[0, 0, z > 0 ? 0.008 : -0.008]} material={M.logo} />
              </group>
            ))}
            {g.pegs.map((x, i) => (
              <mesh key={`p${i}`} geometry={x} material={M.darkMetal} />
            ))}
            {g.stand.map((x, i) => (
              <mesh key={`s${i}`} geometry={x} material={M.darkMetal} />
            ))}
          </>
        )}
      </Part>
      <Part id="subframe-rear" color="#6b7280" metalness={0.7} roughness={0.4}>
        {(m) => (
          <>
            {g.subframe.map((x, i) => (
              <mesh key={i} geometry={x} material={m} />
            ))}
            <mesh geometry={g.plateArm} material={m} />
            <mesh geometry={g.plate} material={M.plate} />
            {g.rearSignals.map((x, i) => (
              <mesh key={`t${i}`} geometry={x} material={M.amber} />
            ))}
          </>
        )}
      </Part>
      <Part id="battery-bay" color="#1f2937" metalness={0.4} roughness={0.6}>
        {(m) => [g.bayPlate, ...g.bayEnd].map((x, i) => <mesh key={i} geometry={x} material={m} />)}
      </Part>
      <Part id="seat" color="#17191c" roughness={0.88} metalness={0.02}>
        {(m) => (
          <>
            <mesh geometry={g.seatRider} material={m} castShadow />
            <mesh geometry={g.seatPillion} material={m} castShadow />
          </>
        )}
      </Part>
      <Part id="fairing-tank" {...BODY}>
        {(m) => <mesh geometry={g.tank} material={m} castShadow />}
      </Part>
      <Part id="fairing-side-l" {...BODY}>
        {(m) => (
          <>
            <mesh geometry={sideL.outer} material={m} castShadow />
            <mesh geometry={sideL.inset} material={M.satinBlack} />
          </>
        )}
      </Part>
      <Part id="fairing-side-r" {...BODY}>
        {(m) => (
          <>
            <mesh geometry={sideR.outer} material={m} castShadow />
            <mesh geometry={sideR.inset} material={M.satinBlack} />
          </>
        )}
      </Part>
      <Part id="fairing-tail" {...BODY}>
        {(m) => <mesh geometry={g.tail} material={m} castShadow />}
      </Part>
      <Part id="fender-front" {...BODY}>
        {(m) => (
          <>
            <mesh geometry={g.fender} material={m} position={[fx, fy, 0]} rotation={rotZ} />
            <mesh geometry={g.hugger} material={M.satinBlack} position={[rx, ry, 0]} rotation={rotZ} />
          </>
        )}
      </Part>
      <Part id="handlebar" color="#1c1f24" metalness={0.6} roughness={0.35}>
        {(m) => (
          <>
            {[g.bar, ...g.risers, g.tripleTop, g.tripleBottom].map((x, i) => (
              <mesh key={i} geometry={x} material={m} />
            ))}
            {g.grips.map((x, i) => (
              <mesh key={`g${i}`} geometry={x} material={M.rubber} />
            ))}
            {g.levers.map((x, i) => (
              <mesh key={`l${i}`} geometry={x} material={M.chrome} />
            ))}
            {g.mirrors.map((x, i) => (
              <mesh key={`m${i}`} geometry={x} material={i % 2 ? M.satinBlack : m} />
            ))}
          </>
        )}
      </Part>

      {/* ── Rodas */}
      <Part id="wheel-front" color="#c8ced6" metalness={0.95} roughness={0.22}>
        {(m) => (
          <>
            <Wheel center={DIM.frontAxle} spec={DIM.front} m={m} hubR={0.05} />
            <mesh geometry={g.frontHub} material={M.darkMetal} position={[fx, fy, 0]} rotation={rotZ} />
          </>
        )}
      </Part>
      <Part id="wheel-rear" color="#c8ced6" metalness={0.95} roughness={0.22}>
        {(m) => <Wheel center={DIM.rearAxle} spec={DIM.rear} m={m} hubR={0.15} />}
      </Part>

      {/* ── Propulsão */}
      <Part id="hub-motor" color="#2b3036" metalness={0.85} roughness={0.35}>
        {(m) => (
          <group position={[rx, ry, 0]}>
            <mesh geometry={g.hubShell} material={m} castShadow />
            {[0.09, -0.09].map((z) => (
              <group key={z} position={[0, 0, z]}>
                <mesh geometry={g.hubCover} rotation={rotZ} material={M.satinBlack} />
                <mesh geometry={g.hubLogo} position={[0, 0, z > 0 ? 0.008 : -0.008]} material={M.logo} />
              </group>
            ))}
          </group>
        )}
      </Part>
      <Part id="motor-controller" color="#a3abb5" metalness={0.85} roughness={0.3}>
        {(m) => (
          <group position={[0.06, 0.33, 0]}>
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

      {/* ── Energia */}
      {(['battery-a', 'battery-b'] as const).map((id, i) => (
        <Part
          key={id}
          id={id}
          color="#123a73"
          metalness={0.3}
          roughness={0.35}
          emissive="#0ea5e9"
          emissiveIntensity={0.3}
        >
          {(m) => (
            <group position={[i === 0 ? -0.07 : 0.19, 0.56, 0]}>
              <mesh geometry={g.battery} material={m} castShadow />
              <mesh geometry={g.batteryCap} position={[0, 0.175, 0]} material={M.satinBlack} />
              <mesh geometry={g.batteryHandle} position={[0, 0.185, 0]} material={M.darkMetal} />
            </group>
          )}
        </Part>
      ))}
      <Part id="charger" color="#4b5563" metalness={0.6} roughness={0.4}>
        {(m) => <mesh geometry={g.charger} material={m} position={[0.36, 0.48, 0]} />}
      </Part>
      <Part id="dcdc" color="#64748b" metalness={0.6} roughness={0.4}>
        {(m) => <mesh geometry={g.dcdc} material={m} position={[0.41, 0.6, 0]} />}
      </Part>
      {(['bms-a', 'bms-b'] as const).map((id) => (
        <Part key={id} id={id} color="#166534" metalness={0.2} roughness={0.6} emissive="#22c55e" emissiveIntensity={0.15}>
          {(m) => <mesh geometry={g.bmsBoard} material={m} position={[ANCHORS[id][0], ANCHORS[id][1], -0.05]} />}
        </Part>
      ))}
      <Part id="main-breaker" color="#b91c1c" metalness={0.3} roughness={0.5}>
        {(m) => (
          <group position={ANCHORS['main-breaker']}>
            <mesh geometry={g.breaker} material={m} />
            <mesh geometry={g.breakerLever} material={M.satinBlack} position={[0, 0.028, 0]} />
          </group>
        )}
      </Part>
      <Part id="charge-port" color="#e5e7eb" metalness={0.5} roughness={0.4}>
        {(m) => (
          <group position={[0.38, 0.76, DIM.shroudZ + 0.015]}>
            <mesh geometry={g.port} material={m} rotation={rotZ} />
            <mesh geometry={g.portCap} material={M.satinBlack} rotation={rotZ} position={[0, 0, 0.018]} />
          </group>
        )}
      </Part>

      {/* ── Eletrônica */}
      <Part id="wiring-harness" color="#ea580c" roughness={0.6} emissive="#f97316" emissiveIntensity={0.2}>
        {(m) => g.harness.map((x, i) => <mesh key={i} geometry={x} material={m} />)}
      </Part>
      <Part id="tft-dashboard" color="#0b0f16" metalness={0.4} roughness={0.3}>
        {(m) => (
          <group position={[0.47, 0.99, 0]} rotation={[0, 0, -0.55]}>
            <mesh geometry={g.tft} material={m} />
            <mesh geometry={g.tftScreen} position={[-0.0105, 0, 0]} rotation={[0, -Math.PI / 2, 0]}>
              <meshStandardMaterial color="#03131f" emissive="#22d3ee" emissiveIntensity={0.45} />
            </mesh>
          </group>
        )}
      </Part>
      <Part id="headlight" color="#eaf7ff" emissive="#cdeeff" emissiveIntensity={1.1} metalness={0.1} roughness={0.08}>
        {(m) => (
          <>
            <mesh geometry={g.headMask} material={M.satinBlack} castShadow />
            <mesh geometry={g.headLens} material={m} />
            {g.drl.map((x, i) => (
              <mesh key={i} geometry={x} material={m} />
            ))}
            <mesh geometry={g.flyscreen} material={M.glass} />
          </>
        )}
      </Part>
      <Part id="taillight" color="#7f1d1d" emissive="#ef4444" emissiveIntensity={1.4}>
        {(m) => <mesh geometry={g.taillight} material={m} />}
      </Part>

      {/* ── Dinâmica */}
      <Part id="fork-front" color="#c9a227" metalness={1} roughness={0.25}>
        {(m) => (
          <>
            {g.forkOuter.map((x, i) => (
              <mesh key={`o${i}`} geometry={x} material={m} castShadow />
            ))}
            {g.forkInner.map((x, i) => (
              <mesh key={`i${i}`} geometry={x} material={M.chrome} />
            ))}
            {g.forkFoot.map((x, i) => (
              <mesh key={`f${i}`} geometry={x} material={M.darkMetal} />
            ))}
            {g.forkCaps.map((x, i) => (
              <mesh key={`c${i}`} geometry={x} material={M.darkMetal} />
            ))}
          </>
        )}
      </Part>
      <Part id="shock-rear" color="#c9a227" metalness={1} roughness={0.25}>
        {(m) => (
          <>
            <mesh geometry={g.shockBody} material={M.darkMetal} />
            <mesh geometry={g.shockSpring} material={m} />
            <mesh geometry={g.shockRod} material={M.chrome} />
          </>
        )}
      </Part>
      <Part id="swingarm" color="#8b939d" metalness={0.85} roughness={0.3}>
        {(m) => [...g.swingarm, g.swingCross].map((x, i) => <mesh key={i} geometry={x} material={m} castShadow />)}
      </Part>
      <Part id="brake-front" color="#b8bec6" metalness={0.95} roughness={0.28}>
        {(m) => (
          <>
            {[0.07, -0.07].map((z) => (
              <group key={z}>
                <mesh geometry={g.discFront} material={m} position={[fx, fy, z]} />
                <mesh
                  geometry={g.caliper}
                  material={M.darkMetal}
                  position={[fx - 0.1, fy + 0.085, z * 1.35]}
                  rotation={[0, 0, 0.7]}
                />
              </group>
            ))}
          </>
        )}
      </Part>
      <Part id="brake-rear" color="#b8bec6" metalness={0.95} roughness={0.28}>
        {(m) => (
          <>
            <mesh geometry={g.discRear} material={m} position={[rx, ry, -0.1]} />
            <mesh
              geometry={g.caliperSmall}
              material={M.darkMetal}
              position={[rx + 0.07, ry + 0.07, -0.12]}
              rotation={[0, 0, 0.7]}
            />
          </>
        )}
      </Part>

      {/* ── Instrumentação futura */}
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
