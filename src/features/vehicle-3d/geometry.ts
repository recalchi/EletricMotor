import * as THREE from 'three';

/**
 * Geometria da aproximação provisória. Eixos: X = comprimento (frente +X), Y = altura, Z = largura. Metros.
 * Proporções a partir das vistas técnicas APROXIMADAS das pranchas (≈ 2,02 m × 0,78 m × 1,09 m; banco ≈ 0,8 m)
 * — não é CAD.
 */
export type V3 = [number, number, number];

export const DIM = {
  frontAxle: [0.72, 0.3, 0] as V3,
  rearAxle: [-0.7, 0.3, 0] as V3,
  front: { radius: 0.295, width: 0.11, rim: 0.216 },
  rear: { radius: 0.3, width: 0.14, rim: 0.216 },
  headTop: [0.45, 0.93, 0] as V3,
  headBottom: [0.5, 0.74, 0] as V3,
  swingPivot: [-0.24, 0.42, 0] as V3,
  shroudZ: 0.165,
};

/** Âncoras (centro aproximado) de cada componente — usadas por rótulos e marcadores de sensores. */
export const ANCHORS: Record<string, V3> = {
  frame: [0.12, 0.72, 0.12],
  'subframe-rear': [-0.55, 0.78, 0.1],
  seat: [-0.45, 0.84, 0],
  'battery-bay': [0.06, 0.55, 0],
  'fairing-tank': [0.15, 0.9, 0],
  'fairing-side-l': [0.1, 0.56, -0.18],
  'fairing-side-r': [0.1, 0.56, 0.18],
  'fairing-tail': [-0.85, 0.86, 0],
  'fender-front': [0.72, 0.62, 0],
  handlebar: [0.4, 1.0, 0.3],
  'wheel-front': [0.72, 0.3, 0.07],
  'wheel-rear': [-0.7, 0.3, 0.09],
  'hub-motor': [-0.7, 0.3, 0.11],
  'motor-controller': [0.06, 0.33, 0.1],
  'motor-cables': [-0.4, 0.34, 0.12],
  'battery-a': [-0.07, 0.6, 0.12],
  'battery-b': [0.19, 0.6, 0.12],
  // BMS: placa no TOPO de cada bateria, sob a tampa (informado pelo proprietário)
  'bms-a': [-0.07, 0.765, 0],
  'bms-b': [0.19, 0.765, 0],
  charger: [0.36, 0.48, 0.08],
  'charge-port': [0.38, 0.76, 0.18],
  // Disjuntor: embaixo do banco, sobre a carenagem (não preso ao banco) — informado pelo proprietário
  'main-breaker': [-0.32, 0.745, 0.05],
  dcdc: [0.41, 0.6, 0.06],
  'tft-dashboard': [0.47, 0.99, 0],
  throttle: [0.4, 1.0, 0.36],
  headlight: [0.62, 0.86, 0],
  taillight: [-1.01, 0.875, 0],
  'wiring-harness': [0.25, 0.75, 0.1],
  'fork-front': [0.6, 0.6, 0.1],
  'shock-rear': [-0.32, 0.52, 0.05],
  swingarm: [-0.47, 0.36, 0.12],
  'brake-front': [0.72, 0.3, 0.1],
  'brake-rear': [-0.7, 0.3, -0.12],
  'tire-front': [0.72, 0.59, 0.05],
  'tire-rear': [-0.7, 0.6, 0.06],
  gateway: [-0.62, 0.8, 0],
};

/** Deslocamento da vista explodida por componente. */
export const EXPLODE: Record<string, V3> = {
  frame: [0, 0, 0],
  'subframe-rear': [-0.12, 0.12, 0],
  seat: [-0.1, 0.42, 0],
  'battery-bay': [0, 0, 0],
  'fairing-tank': [0.05, 0.4, 0],
  'fairing-side-l': [0, 0.05, -0.45],
  'fairing-side-r': [0, 0.05, 0.45],
  'fairing-tail': [-0.3, 0.32, 0],
  'fender-front': [0.25, 0.25, 0],
  handlebar: [0.12, 0.36, 0],
  'tft-dashboard': [0.2, 0.52, 0],
  headlight: [0.45, 0.2, 0],
  taillight: [-0.45, 0.2, 0],
  'wheel-front': [0.55, -0.02, 0],
  'brake-front': [0.55, -0.02, 0.28],
  'fork-front': [0.32, 0.1, 0],
  'wheel-rear': [-0.55, -0.02, 0],
  'hub-motor': [-0.55, -0.02, 0.34],
  'brake-rear': [-0.55, -0.02, -0.3],
  swingarm: [-0.28, -0.1, 0],
  'shock-rear': [-0.15, 0.2, 0.25],
  'battery-a': [-0.05, 0.28, 0.42],
  'battery-b': [0.08, 0.28, 0.42],
  'bms-a': [-0.05, 0.42, 0.42],
  'bms-b': [0.08, 0.42, 0.42],
  'motor-controller': [-0.05, -0.26, 0.3],
  'motor-cables': [-0.3, -0.18, 0.25],
  charger: [0.15, -0.3, 0.2],
  'charge-port': [0.05, 0, 0.5],
  'main-breaker': [-0.1, 0.3, 0.35],
  dcdc: [0.2, -0.2, 0.3],
  'wiring-harness': [0, 0.1, 0.25],
  gateway: [-0.2, 0.55, 0],
};

/** Barra entre dois pontos (cilindro orientado). */
export function beam(a: V3, b: V3, r: number, seg = 12, r2 = r): THREE.BufferGeometry {
  const va = new THREE.Vector3(...a);
  const vb = new THREE.Vector3(...b);
  const len = va.distanceTo(vb);
  const g = new THREE.CylinderGeometry(r2, r, len, seg, 1);
  const mid = va.clone().add(vb).multiplyScalar(0.5);
  const dir = vb.clone().sub(va).normalize();
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir));
  g.translate(mid.x, mid.y, mid.z);
  return g;
}

/** Tubo suave por pontos. */
export function tube(points: V3[], r: number, seg = 48): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  return new THREE.TubeGeometry(curve, seg, r, 10, false);
}

/** Extrusão de perfil lateral (XY) com espessura em Z, centrada em z0. */
export function profile(pts: [number, number][], depth: number, z0 = 0, bevel = 0.012): THREE.BufferGeometry {
  const shape = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelSize: bevel,
    bevelThickness: bevel,
    bevelSegments: 3,
    curveSegments: 16,
  });
  g.translate(0, 0, z0 - depth / 2);
  g.computeVertexNormals();
  return g;
}

/** Gira uma geometria construída no plano XY (eixo Y) para que o eixo de revolução vire Z (eixo da roda). */
const toWheelAxis = (g: THREE.BufferGeometry) => g.rotateX(Math.PI / 2);

/** Pneu por revolução de um perfil arredondado (seção de pneu de moto). */
export function tireGeometry(radius: number, width: number, rimRadius: number): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [];
  const side = radius - rimRadius;
  const hw = width / 2;
  pts.push(new THREE.Vector2(rimRadius, -hw * 0.78));
  pts.push(new THREE.Vector2(rimRadius + side * 0.35, -hw * 0.98));
  // coroa: semi-elipse do ombro esquerdo ao direito
  for (let i = 0; i <= 16; i++) {
    const a = -Math.PI / 2 + (i / 16) * Math.PI;
    pts.push(new THREE.Vector2(radius - side * 0.45 + Math.cos(a) * side * 0.45, Math.sin(a) * hw));
  }
  pts.push(new THREE.Vector2(rimRadius + side * 0.35, hw * 0.98));
  pts.push(new THREE.Vector2(rimRadius, hw * 0.78));
  return toWheelAxis(new THREE.LatheGeometry(pts, 72));
}

/** Aro (barril) por revolução. */
export function rimGeometry(rimRadius: number, width: number): THREE.BufferGeometry {
  const hw = width * 0.4;
  const pts = [
    new THREE.Vector2(rimRadius - 0.022, -hw),
    new THREE.Vector2(rimRadius + 0.008, -hw - 0.006),
    new THREE.Vector2(rimRadius - 0.004, -hw + 0.012),
    new THREE.Vector2(rimRadius - 0.006, hw - 0.012),
    new THREE.Vector2(rimRadius + 0.008, hw + 0.006),
    new THREE.Vector2(rimRadius - 0.022, hw),
  ];
  return toWheelAxis(new THREE.LatheGeometry(pts, 72));
}

/** Cinco raios em "V" (estrela) extrudados — estilo das rodas da referência visual. */
export function starSpokes(innerR: number, outerR: number, thickness: number): THREE.BufferGeometry {
  const shapes: THREE.Shape[] = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + Math.PI / 2;
    for (const side of [-1, 1]) {
      const a0 = a + side * 0.07;
      const a1 = a + side * 0.24;
      const w0 = 0.03;
      const w1 = 0.016;
      const p = (r: number, ang: number) => new THREE.Vector2(Math.cos(ang) * r, Math.sin(ang) * r);
      const s = new THREE.Shape([
        p(innerR, a0 - w0),
        p(outerR, a1 - w1 / outerR),
        p(outerR, a1 + w1 / outerR),
        p(innerR, a0 + w0),
      ]);
      shapes.push(s);
    }
  }
  const g = new THREE.ExtrudeGeometry(shapes, {
    depth: thickness,
    bevelEnabled: true,
    bevelSize: 0.004,
    bevelThickness: 0.004,
    bevelSegments: 2,
  });
  g.translate(0, 0, -thickness / 2);
  return g;
}

/** Disco de freio ondulado (wave) com furação. */
export function brakeDisc(outerR: number, innerR: number, holes: number): THREE.BufferGeometry {
  const s = new THREE.Shape();
  const n = 96;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = outerR + Math.sin(a * 12) * 0.005;
    if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const hole = new THREE.Path();
  hole.absarc(0, 0, innerR, 0, Math.PI * 2, true);
  s.holes.push(hole);
  for (let i = 0; i < holes; i++) {
    const a = (i / holes) * Math.PI * 2;
    const rr = (outerR + innerR) / 2 + 0.01;
    const h = new THREE.Path();
    h.absarc(Math.cos(a) * rr, Math.sin(a) * rr, 0.0055, 0, Math.PI * 2, true);
    s.holes.push(h);
  }
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.005, bevelEnabled: false, curveSegments: 12 });
  g.translate(0, 0, -0.0025);
  return g;
}

/** Emblema "V" (marca) extrudado, no plano XY. */
export function vLogo(size: number, depth = 0.006): THREE.BufferGeometry {
  const k = size / 2;
  const s = new THREE.Shape([
    new THREE.Vector2(-k, k),
    new THREE.Vector2(-k * 0.55, k),
    new THREE.Vector2(0, -k * 0.35),
    new THREE.Vector2(k * 0.55, k),
    new THREE.Vector2(k, k),
    new THREE.Vector2(0, -k),
  ]);
  const g = new THREE.ExtrudeGeometry(s, {
    depth,
    bevelEnabled: true,
    bevelSize: 0.0015,
    bevelThickness: 0.0015,
    bevelSegments: 1,
  });
  g.translate(0, 0, -depth / 2);
  return g;
}

/** Carcaça do motor hub com aletas radiais (revolução). */
export function hubMotorShell(radius: number, width: number): THREE.BufferGeometry {
  const hw = width / 2;
  const pts = [
    new THREE.Vector2(0.04, -hw),
    new THREE.Vector2(radius * 0.92, -hw),
    new THREE.Vector2(radius, -hw * 0.82),
    new THREE.Vector2(radius, hw * 0.82),
    new THREE.Vector2(radius * 0.92, hw),
    new THREE.Vector2(0.04, hw),
  ];
  return toWheelAxis(new THREE.LatheGeometry(pts, 64));
}
