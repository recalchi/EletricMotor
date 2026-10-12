/**
 * Modelo de domínio do EletricMotor.
 * Regra central: componente cadastrado ≠ componente monitorado. Toda medição carrega sua origem.
 */

/** Origem do dado — visível em todas as telas. */
export type DataOrigin = 'REAL' | 'ESTIMADO' | 'SIMULADO' | 'INDISPONIVEL';

/** Grau de confirmação de uma afirmação técnica (matriz de evidências). */
export type EvidenceStatus = 'documento' | 'inspecao' | 'hipotese' | 'nao_verificado';

export type ComponentGroup = 'estrutura' | 'propulsao' | 'energia' | 'eletronica' | 'dinamica' | 'instrumentacao';

/** Como um componente é coberto pelo monitoramento. */
export type CoverageLevel = 'medido' | 'estimado' | 'inspecao_manual' | 'nao_coberto';

export interface Spec {
  label: string;
  value: string;
  evidence: EvidenceStatus;
  /** Referência da fonte (documento, foto, prancha conceitual…). */
  source: string;
  note?: string;
}

export interface VehicleComponent {
  id: string;
  name: string;
  group: ComponentGroup;
  parentId?: string;
  description: string;
  function: string;
  specs: Spec[];
  /** Grandezas que PODERIAM ser medidas e por qual meio — nunca afirmar existência sem evidência. */
  signals: SignalDefinition[];
  coverage: CoverageLevel;
  /** Mesh(es) no modelo 3D com mesmo id. */
  mesh3d: boolean;
  /** Mostrado no modo "carenagem" (ocultável). */
  isFairing?: boolean;
  /** Intervalo de manutenção como regra operacional (não é prova de falha). */
  maintenanceRule?: { everyKm?: number; everyDays?: number; task: string };
}

export type Quantity =
  | 'voltage'
  | 'current'
  | 'power'
  | 'temperature'
  | 'soc'
  | 'soh'
  | 'speed'
  | 'rpm'
  | 'energy'
  | 'pressure'
  | 'vibration'
  | 'cycles'
  | 'odometer'
  | 'humidity';

export interface SignalDefinition {
  quantity: Quantity;
  unit: string;
  /** Disponibilidade atual no veículo real. */
  availability: 'validado' | 'a_investigar' | 'sensor_futuro';
  note?: string;
}

/** Uma amostra de telemetria. Armazenada sempre em UTC (ms epoch). */
export interface TelemetrySample {
  vehicleId: string;
  componentId: string;
  sensorId: string;
  quantity: Quantity;
  value: number;
  unit: string;
  timestamp: number;
  origin: DataOrigin;
  quality: 'boa' | 'suspeita' | 'invalida';
  /** Tempo (ms) após o qual o dado é considerado desatualizado. */
  validForMs: number;
  parserVersion: string;
  deviceId: string;
}

export type Severity = 'info' | 'aviso' | 'critico';

export interface Alert {
  id: string;
  ruleId: string;
  componentId: string;
  severity: Severity;
  title: string;
  message: string;
  origin: DataOrigin;
  startedAt: number;
  endedAt?: number;
  acknowledgedAt?: number;
  suggestion: string;
}

export interface AlertRule {
  id: string;
  name: string;
  componentId: string;
  quantity: Quantity;
  op: '>' | '<';
  threshold: number;
  severity: Severity;
  enabled: boolean;
  suggestion: string;
  /** Regras com valores ilustrativos não representam limites seguros da EVS. */
  illustrative: boolean;
}

/** Foto anexada a um registro. `url` é dataURL (modo demo) ou URL do Firebase Storage. */
export interface Photo {
  path: string;
  url: string;
  name: string;
  takenAt: number;
}

export interface AuditEntry {
  id: string;
  at: number;
  action: 'criar' | 'atualizar' | 'excluir';
  collection: string;
  docId: string;
  summary: string;
  actor: string;
}

export interface MaintenanceRecord {
  id: string;
  date: string; // ISO yyyy-mm-dd
  odometerKm: number;
  componentId: string;
  kind: 'revisao' | 'reparo' | 'troca' | 'inspecao';
  description: string;
  parts: string;
  costBRL: number;
  workshop: string;
  photos?: Photo[];
}

export interface ManualInspection {
  id: string;
  date: string;
  componentId: string;
  condition: 'ok' | 'atencao' | 'substituir';
  notes: string;
  photos?: Photo[];
}

export interface BatteryProfile {
  id: 'battery-a' | 'battery-b';
  installed: boolean;
  serial: string;
  labelVoltageV: number | null;
  labelCapacityAh: number | null;
  labelVerified: boolean;
  notes: string;
}

export interface ManualBatteryReading {
  id: string;
  batteryId: 'battery-a' | 'battery-b';
  timestamp: number;
  voltageV: number | null;
  socPercent: number | null;
  source: string; // ex.: "painel TFT", "multímetro (com isolamento adequado)"
}

export interface ChargingSession {
  id: string;
  batteryId: 'battery-a' | 'battery-b' | 'ambas';
  start: string; // ISO datetime
  end: string;
  socStart: number | null;
  socEnd: number | null;
  energyKWh: number | null;
  location: string;
}

export interface Symptom {
  id: string;
  date: string;
  componentId: string;
  description: string;
  status: 'aberto' | 'investigando' | 'resolvido';
}

export interface VehicleProfile {
  id: string;
  name: string;
  model: string;
  year: number | null;
  variant: string;
  batteryCount: 1 | 2;
  odometerKm: number;
  vinVerified: boolean;
}

export interface SensorCandidate {
  id: string;
  name: string;
  objective: string;
  quantity: string;
  location: string;
  componentId: string;
  technology: string;
  interface: string;
  power: string;
  isolation: string;
  accuracy: string;
  sampleRate: string;
  feasibility: 'alta' | 'media' | 'baixa';
  risks: string;
  pendingValidation: string;
  estimatedCostBRL: string;
  status: 'proposto' | 'em_avaliacao' | 'instalado';
}

/** Canal de um dispositivo externo mapeado para componente/grandeza do catálogo, com calibração linear. */
export interface DeviceChannel {
  channel: string;
  componentId: string;
  quantity: Quantity;
  unit: string;
  /** valor = bruto × scale + offset */
  scale: number;
  offset: number;
}

export type DeviceTransport = 'serial' | 'ble-nus' | 'ble-ess' | 'https';

/**
 * Dispositivo de aquisição do proprietário (gateway/sensor externo).
 * Só produz dados REAIS depois de `status: 'validado'` (passo 6 do manual). Antes disso, as leituras
 * vão apenas para o console de teste.
 */
export interface DeviceProfile {
  id: string;
  name: string;
  transport: DeviceTransport;
  sensorCandidateId?: string;
  channels: DeviceChannel[];
  status: 'teste' | 'validado' | 'desativado';
  validatedAt?: number;
  validationNotes?: string;
  /** SHA-256 (hex) do token de ingestão HTTPS — o token em si nunca é armazenado. */
  tokenHash?: string;
  firmware?: string;
  createdAt: number;
  /** Prazo após o qual a leitura é exibida como desatualizada. */
  sampleValidityMs: number;
}
