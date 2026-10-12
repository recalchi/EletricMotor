import * as THREE from 'three';

/**
 * Geometria da aproximação provisória. Eixos: X = comprimento (frente +X), Y = altura, Z = largura. Metros.
 * Proporções baseadas nas dimensões APROXIMADAS das pranchas (≈ 2,02 m × 0,78 m × 1,09 m) — não é CAD.
 */
export type V3 = [number, number, number];

export const DIM = {
  wheelRadius: 0.3,
  tireTube: 0.065,
  rearAxle: [-0.7, 0.3, 0] as V3,
  frontAxle: [0.72, 0.3, 0] as V3,
  steeringHead: [0.44, 0.98, 0] as V3,
  swingPivot: [-0.26, 0.46, 0] as V3,
};

/** Âncoras (centro aproximado) de cada componente — usadas por rótulos e marcadores de sensores. */
export const ANCHORS: Record<string, V3> = {
  frame: [0.1, 0.82, 0.13],
  'subframe-rear': [-0.6, 0.86, 0.1],
  seat: [-0.42, 0.98, 0],
  'battery-bay': [0.02, 0.62, 0],
  'fairing-tank': [0.12, 0.98, 0],
  'fairing-side-l': [0.05, 0.62, -0.18],
  'fairing-side-r': [0.05, 0.62, 0.18],
  'fairing-tail': [-0.85, 0.92, 0],
  'fender-front': [0.72, 0.62, 0],
  handlebar: [0.36, 1.12, 0.3],
  'wheel-front': [0.72, 0.3, 0.08],
  'wheel-rear': [-0.7, 0.3, 0.08],
  'hub-motor': [-0.7, 0.3, 0.1],
  'motor-controller': [-0.18, 0.36, 0.1],
  'motor-cables': [-0.45, 0.38, 0.12],
  'battery-a': [-0.11, 0.66, 0.13],
  'battery-b': [0.15, 0.66, 0.13],
  'bms-a': [-0.11, 0.48, 0.13],
  'bms-b': [0.15, 0.48, 0.13],
  charger: [0.32, 0.4, 0.08],
  'charge-port': [0.33, 0.78, 0.18],
  'main-breaker': [0.33, 0.62, 0.14],
  dcdc: [0.38, 0.5, 0.06],
  'tft-dashboard': [0.43, 1.16, 0],
  throttle: [0.36, 1.12, 0.36],
  headlight: [0.58, 0.98, 0],
  taillight: [-1.0, 0.94, 0],
  'wiring-harness': [0.2, 0.8, 0.1],
  'fork-front': [0.6, 0.62, 0.1],
  'shock-rear': [-0.36, 0.6, 0.05],
  swingarm: [-0.48, 0.38, 0.12],
  'brake-front': [0.72, 0.3, 0.12],
  'brake-rear': [-0.7, 0.3, -0.12],
  'tire-front': [0.72, 0.6, 0.06],
  'tire-rear': [-0.7, 0.6, 0.06],
  gateway: [-0.62, 0.9, 0],
};

/** Deslocamento da vista explodida por componente. */
export const EXPLODE: Record<string, V3> = {
  frame: [0, 0, 0],
  'subframe-rear': [-0.12, 0.12, 0],
  seat: [-0.1, 0.45, 0],
  'battery-bay': [0, 0, 0],
  'fairing-tank': [0.05, 0.42, 0],
  'fairing-side-l': [0, 0.05, -0.45],
  'fairing-side-r': [0, 0.05, 0.45],
  'fairing-tail': [-0.3, 0.32, 0],
  'fender-front': [0.25, 0.25, 0],
  handlebar: [0.12, 0.38, 0],
  'tft-dashboard': [0.2, 0.55, 0],
  headlight: [0.45, 0.2, 0],
  taillight: [-0.45, 0.2, 0],
  'wheel-front': [0.55, -0.02, 0],
  'brake-front': [0.55, -0.02, 0.28],
  'fork-front': [0.32, 0.1, 0],
  'wheel-rear': [-0.55, -0.02, 0],
  'hub-motor': [-0.55, -0.02, 0.32],
  'brake-rear': [-0.55, -0.02, -0.28],
  swingarm: [-0.28, -0.1, 0],
  'shock-rear': [-0.15, 0.2, 0.25],
  'battery-a': [-0.05, 0.25, 0.42],
  'battery-b': [0.08, 0.25, 0.42],
  'motor-controller': [-0.05, -0.28, 0.3],
  'motor-cables': [-0.3, -0.18, 0.25],
  charger: [0.15, -0.3, 0.2],
  'charge-port': [0.05, 0, 0.5],
  'main-breaker': [0.12, 0.05, 0.5],
  dcdc: [0.2, -0.2, 0.3],
  'wiring-harness': [0, 0.1, 0.25],
  gateway: [-0.2, 0.55, 0],
};

/** Barra entre dois pontos (cilindro orientado). */
export function beam(a: V3, b: V3, r: number, seg = 10): THREE.BufferGeometry {
  const va = new THREE.Vector3(...a);
  const vb = new THREE.Vector3(...b);
  const len = va.distanceTo(vb);
  const g = new THREE.CylinderGeometry(r, r, len, seg, 1);
  const mid = va.clone().add(vb).multiplyScalar(0.5);
  const dir = vb.clone().sub(va).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  g.applyQuaternion(q);
  g.translate(mid.x, mid.y, mid.z);
  return g;
}

/** Tubo suave por pontos. */
export function tube(points: V3[], r: number, seg = 48): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  return new THREE.TubeGeometry(curve, seg, r, 8, false);
}

/** Extrusão de perfil lateral (XY) com espessura em Z, centrada em z0. */
export function profile(pts: [number, number][], depth: number, z0 = 0, bevel = 0.012): THREE.BufferGeometry {
  const shape = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelSize: bevel,
    bevelThickness: bevel,
    bevelSegments: 2,
    curveSegments: 16,
  });
  g.translate(0, 0, z0 - depth / 2);
  g.computeVertexNormals();
  return g;
}
