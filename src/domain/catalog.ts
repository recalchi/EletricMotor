import type { ComponentGroup, Spec, SignalDefinition, VehicleComponent } from './types';

/**
 * Catálogo estrutural da Voltz EVS.
 *
 * IMPORTANTE: os valores vêm, por enquanto, da especificação do proprietário e das pranchas conceituais
 * (imagens geradas). Nenhum foi confirmado por manual, etiqueta ou inspeção — por isso estão marcados como
 * `hipotese` ou `nao_verificado`. Atualize `evidence` e `source` conforme a matriz em docs/vehicle-evidence.
 */

const SPEC_DOC = 'Especificação do proprietário (12/10/2026)';
const PRANCHA = (n: number) => `Prancha conceitual ${n}/5 (imagem ilustrativa)`;

const hyp = (label: string, value: string, source: string, note?: string): Spec => ({
  label,
  value,
  evidence: 'hipotese',
  source,
  note,
});
/** Posição observada pelo proprietário na moto real (29/10/2026). */
const insp = (label: string, value: string): Spec => ({
  label,
  value,
  evidence: 'inspecao',
  source: 'Inspeção do proprietário (29/10/2026)',
});
const unk = (label: string, note?: string): Spec => ({
  label,
  value: '—',
  evidence: 'nao_verificado',
  source: 'Sem fonte',
  note,
});

const sig = (
  quantity: SignalDefinition['quantity'],
  unit: string,
  availability: SignalDefinition['availability'],
  note?: string,
): SignalDefinition => ({ quantity, unit, availability, note });

type Def = Omit<VehicleComponent, 'specs' | 'signals' | 'mesh3d' | 'coverage'> &
  Partial<Pick<VehicleComponent, 'specs' | 'signals' | 'mesh3d' | 'coverage'>>;

const c = (d: Def): VehicleComponent => ({
  specs: [],
  signals: [],
  mesh3d: true,
  coverage: 'nao_coberto',
  ...d,
});

export const GROUP_LABELS: Record<ComponentGroup, string> = {
  estrutura: 'Estrutura e acabamento',
  propulsao: 'Propulsão',
  energia: 'Energia',
  eletronica: 'Elétrica e eletrônica',
  dinamica: 'Dinâmica e segurança',
  instrumentacao: 'Instrumentação futura',
};

export const CATALOG: VehicleComponent[] = [
  // ───────────── Estrutura
  c({
    id: 'frame',
    name: 'Quadro / chassi principal',
    group: 'estrutura',
    description: 'Estrutura principal que sustenta baterias, motor (via balança) e direção.',
    function: 'Rigidez estrutural e fixação dos conjuntos.',
    specs: [hyp('Material', 'Alumínio', PRANCHA(2), 'Pranchas indicam alumínio; confirmar em manual.')],
    coverage: 'inspecao_manual',
    maintenanceRule: { everyDays: 365, task: 'Inspeção visual de soldas, trincas e fixações' },
  }),
  c({
    id: 'subframe-rear',
    name: 'Subchassi traseiro',
    group: 'estrutura',
    parentId: 'frame',
    description: 'Suporte do banco e da carenagem traseira.',
    function: 'Sustentação do assento e lanterna.',
    coverage: 'inspecao_manual',
  }),
  c({
    id: 'seat',
    name: 'Banco',
    group: 'estrutura',
    description: 'Assento; dá acesso ao compartimento das baterias (a confirmar).',
    function: 'Assento do piloto/garupa.',
    specs: [unk('Acesso às baterias sob o banco', 'Verificar no manual do proprietário.')],
  }),
  c({
    id: 'battery-bay',
    name: 'Compartimento das baterias',
    group: 'estrutura',
    parentId: 'frame',
    description: 'Região central do quadro onde ficam as baterias removíveis.',
    function: 'Alojamento e proteção mecânica das baterias.',
    coverage: 'inspecao_manual',
    maintenanceRule: { everyDays: 90, task: 'Verificar umidade, sujeira e travas do compartimento' },
  }),
  c({
    id: 'fairing-tank',
    name: 'Carenagem superior (falso tanque)',
    group: 'estrutura',
    description: 'Carenagem que cobre a parte superior do compartimento central.',
    function: 'Acabamento e proteção.',
    isFairing: true,
  }),
  c({
    id: 'fairing-side-l',
    name: 'Carenagem lateral esquerda',
    group: 'estrutura',
    description: 'Painel lateral esquerdo.',
    function: 'Acabamento e proteção do compartimento.',
    isFairing: true,
  }),
  c({
    id: 'fairing-side-r',
    name: 'Carenagem lateral direita',
    group: 'estrutura',
    description: 'Painel lateral direito.',
    function: 'Acabamento e proteção do compartimento.',
    isFairing: true,
  }),
  c({
    id: 'fairing-tail',
    name: 'Carenagem traseira',
    group: 'estrutura',
    parentId: 'subframe-rear',
    description: 'Rabeta sob o banco.',
    function: 'Acabamento.',
    isFairing: true,
  }),
  c({
    id: 'fender-front',
    name: 'Paralama dianteiro',
    group: 'estrutura',
    description: 'Paralama sobre a roda dianteira.',
    function: 'Proteção contra respingos.',
    isFairing: true,
  }),
  c({
    id: 'handlebar',
    name: 'Guidão e comandos',
    group: 'estrutura',
    description: 'Guidão, manoplas, retrovisores e punhos.',
    function: 'Controle direcional e montagem dos comandos.',
    coverage: 'inspecao_manual',
  }),
  c({
    id: 'wheel-front',
    name: 'Roda dianteira',
    group: 'estrutura',
    description: 'Roda dianteira com discos de freio.',
    function: 'Rolagem e suporte do pneu.',
    specs: [hyp('Aro', '17"', PRANCHA(5))],
    coverage: 'inspecao_manual',
  }),
  c({
    id: 'wheel-rear',
    name: 'Roda traseira (com motor hub)',
    group: 'estrutura',
    description: 'Roda traseira que integra o motor elétrico de cubo.',
    function: 'Tração direta, sem corrente ou correia.',
    specs: [hyp('Aro', '17"', PRANCHA(5))],
    coverage: 'inspecao_manual',
  }),

  // ───────────── Propulsão
  c({
    id: 'hub-motor',
    name: 'Motor elétrico hub traseiro',
    group: 'propulsao',
    parentId: 'wheel-rear',
    description: 'Motor integrado ao cubo da roda traseira (tração direta).',
    function: 'Converte energia elétrica em torque na roda.',
    specs: [
      hyp('Tipo', 'Hub motor (cubo de roda)', SPEC_DOC, 'Confirmado como premissa de projeto; validar em manual.'),
      hyp('Potência nominal', '3.000 W', PRANCHA(1), 'Valor das pranchas conceituais; confirmar em etiqueta.'),
      unk('Potência de pico'),
      unk('Sensores Hall / temperatura internos'),
    ],
    signals: [
      sig('speed', 'km/h', 'a_investigar', 'Velocidade aparece no painel TFT; leitura eletrônica não validada.'),
      sig('rpm', 'rpm', 'a_investigar'),
      sig('temperature', '°C', 'sensor_futuro', 'Sensor de superfície externo proposto.'),
      sig('vibration', 'g', 'sensor_futuro'),
    ],
    coverage: 'nao_coberto',
  }),
  c({
    id: 'motor-controller',
    name: 'Controladora de tração (inversor)',
    group: 'propulsao',
    description: 'Controla corrente/tensão entregue ao motor hub.',
    function: 'Acionamento do motor e regeneração (se houver).',
    specs: [
      unk('Posição física exata', 'Pranchas divergem; não declarar sem inspeção.'),
      unk('Protocolo de comunicação'),
    ],
    signals: [
      sig('current', 'A', 'a_investigar'),
      sig('voltage', 'V', 'a_investigar'),
      sig('temperature', '°C', 'a_investigar'),
    ],
  }),
  c({
    id: 'motor-cables',
    name: 'Cabos de fase e conectores do motor',
    group: 'propulsao',
    parentId: 'hub-motor',
    description: 'Cabos entre controladora e motor hub.',
    function: 'Condução de potência e sinais do motor.',
    coverage: 'inspecao_manual',
    maintenanceRule: { everyDays: 180, task: 'Inspeção visual de isolação e conectores (sem desconectar sob tensão)' },
  }),

  // ───────────── Energia
  c({
    id: 'battery-a',
    name: 'Bateria A',
    group: 'energia',
    description: 'Bateria de lítio removível nº 1, com BMS próprio.',
    function: 'Armazenamento de energia de tração.',
    specs: [
      hyp('Tensão nominal', '72 V', SPEC_DOC, 'Confirmar etiqueta.'),
      hyp('Capacidade', '33,6 Ah', SPEC_DOC, 'Prancha 5 mostra 50 Ah / 3,6 kWh — conflito; confirmar etiqueta.'),
      hyp('Energia nominal', '≈ 2,42 kWh', SPEC_DOC, 'ESTIMADO: 72 V × 33,6 Ah.'),
      hyp('Química', 'Lítio (NMC?)', PRANCHA(5)),
    ],
    signals: [
      sig('soc', '%', 'a_investigar', 'Nível exibido no painel; pode ser registrado manualmente.'),
      sig('voltage', 'V', 'a_investigar'),
      sig('current', 'A', 'a_investigar'),
      sig('temperature', '°C', 'a_investigar'),
      sig('cycles', 'ciclos', 'a_investigar'),
    ],
    coverage: 'estimado',
  }),
  c({
    id: 'battery-b',
    name: 'Bateria B',
    group: 'energia',
    description: 'Bateria de lítio removível nº 2 (quando instalada).',
    function: 'Armazenamento de energia de tração.',
    specs: [
      hyp('Tensão nominal', '72 V', SPEC_DOC, 'Confirmar etiqueta.'),
      hyp('Capacidade', '33,6 Ah', SPEC_DOC, 'Conflito com prancha 5 (50 Ah).'),
      hyp('Energia nominal', '≈ 2,42 kWh', SPEC_DOC, 'ESTIMADO: 72 V × 33,6 Ah.'),
    ],
    signals: [
      sig('soc', '%', 'a_investigar'),
      sig('voltage', 'V', 'a_investigar'),
      sig('current', 'A', 'a_investigar'),
      sig('temperature', '°C', 'a_investigar'),
    ],
    coverage: 'estimado',
  }),
  c({
    id: 'bms-a',
    name: 'BMS da bateria A',
    group: 'energia',
    parentId: 'battery-a',
    description: 'Sistema de gerenciamento da bateria A — placa no topo da bateria, sob a tampa superior.',
    function: 'Proteção, balanceamento e medição das células.',
    specs: [
      insp('Posição', 'Topo da bateria (parte superior), não na lateral'),
      unk('Interface de comunicação (CAN/UART/BLE?)', 'NÃO presumir. Investigar documentação.'),
    ],
  }),
  c({
    id: 'bms-b',
    name: 'BMS da bateria B',
    group: 'energia',
    parentId: 'battery-b',
    description: 'Sistema de gerenciamento da bateria B — placa no topo da bateria, sob a tampa superior.',
    function: 'Proteção, balanceamento e medição das células.',
    specs: [insp('Posição', 'Topo da bateria (parte superior), não na lateral'), unk('Interface de comunicação')],
  }),
  c({
    id: 'charger',
    name: 'Carregador / módulo de carga',
    group: 'energia',
    description: 'Carregador (on-board ou externo — a confirmar).',
    function: 'Recarga das baterias a partir da rede.',
    specs: [unk('On-board ou externo', 'Prancha 2 mostra on-board; confirmar.'), unk('Potência de carga')],
    signals: [sig('power', 'W', 'sensor_futuro', 'Medidor de energia na tomada (externo, sem intervenção na moto).')],
  }),
  c({
    id: 'charge-port',
    name: 'Porta de carregamento',
    group: 'energia',
    description: 'Conector de entrada de carga.',
    function: 'Conexão ao carregador.',
    coverage: 'inspecao_manual',
  }),
  c({
    id: 'main-breaker',
    name: 'Disjuntor geral e conectores das baterias',
    group: 'energia',
    description:
      'Proteção e seccionamento do circuito de alta tensão. Fica embaixo do banco, sobre a carenagem — não é preso ao banco.',
    function: 'Proteção contra sobrecorrente; desligamento.',
    specs: [insp('Posição', 'Sob o banco, sobre a carenagem (acesso levantando o banco)')],
    coverage: 'inspecao_manual',
  }),
  c({
    id: 'dcdc',
    name: 'Conversor DC-DC',
    group: 'energia',
    description: 'Converte a tensão de tração para 12 V dos auxiliares (presumido).',
    function: 'Alimentação de iluminação, painel e comandos.',
    specs: [unk('Existência e localização')],
  }),

  // ───────────── Elétrica e eletrônica
  c({
    id: 'tft-dashboard',
    name: 'Painel TFT',
    group: 'eletronica',
    description: 'Painel de instrumentos digital.',
    function: 'Exibe velocidade, odômetro, nível de bateria, modos e avisos.',
    specs: [hyp('Conectividade', 'Bluetooth/app', PRANCHA(1), 'Não verificado; não presumir API.')],
    signals: [
      sig('odometer', 'km', 'a_investigar', 'Leitura visual → registro manual.'),
      sig('speed', 'km/h', 'a_investigar'),
    ],
    coverage: 'inspecao_manual',
  }),
  c({
    id: 'throttle',
    name: 'Acelerador',
    group: 'eletronica',
    parentId: 'handlebar',
    description: 'Punho acelerador eletrônico.',
    function: 'Comando de tração.',
    mesh3d: false,
  }),
  c({
    id: 'headlight',
    name: 'Farol LED',
    group: 'eletronica',
    description: 'Farol dianteiro LED com DRL.',
    function: 'Iluminação e sinalização.',
    coverage: 'inspecao_manual',
  }),
  c({
    id: 'taillight',
    name: 'Lanterna traseira LED',
    group: 'eletronica',
    description: 'Lanterna e luz de freio.',
    function: 'Sinalização traseira.',
    coverage: 'inspecao_manual',
  }),
  c({
    id: 'wiring-harness',
    name: 'Chicote elétrico',
    group: 'eletronica',
    description: 'Chicote de alta tensão e de sinais.',
    function: 'Interligação dos módulos.',
    specs: [unk('Topologia / pinagem', 'NÃO inventar pinagem.')],
    coverage: 'inspecao_manual',
  }),

  // ───────────── Dinâmica e segurança
  c({
    id: 'fork-front',
    name: 'Suspensão dianteira (garfo invertido)',
    group: 'dinamica',
    description: 'Garfo telescópico invertido.',
    function: 'Absorção de impactos e direção.',
    specs: [hyp('Tipo', 'Telescópico invertido', PRANCHA(1))],
    signals: [sig('vibration', 'mm', 'sensor_futuro', 'Sensor de curso proposto.')],
    coverage: 'inspecao_manual',
    maintenanceRule: { everyKm: 10000, task: 'Verificar retentores e óleo do garfo' },
  }),
  c({
    id: 'shock-rear',
    name: 'Amortecedor traseiro (monoshock)',
    group: 'dinamica',
    description: 'Amortecedor central traseiro.',
    function: 'Suspensão traseira.',
    coverage: 'inspecao_manual',
  }),
  c({
    id: 'swingarm',
    name: 'Balança traseira',
    group: 'dinamica',
    description: 'Braço oscilante que sustenta a roda/motor traseiro.',
    function: 'Ligação roda-quadro.',
    specs: [unk('Monobraço ou bibraço', 'Pranchas divergem.')],
    coverage: 'inspecao_manual',
  }),
  c({
    id: 'brake-front',
    name: 'Freio dianteiro',
    group: 'dinamica',
    description: 'Freio a disco dianteiro com sistema combinado.',
    function: 'Frenagem.',
    specs: [
      hyp('Discos', '1 ou 2 (conflito)', PRANCHA(1), 'Pranchas divergem entre 1 e 2 discos.'),
      hyp('Sistema', 'CBS', PRANCHA(1), 'Prancha 2 cita "ABS (CBS)" — confirmar.'),
    ],
    coverage: 'inspecao_manual',
    maintenanceRule: { everyKm: 3000, task: 'Verificar pastilhas, disco e fluido' },
  }),
  c({
    id: 'brake-rear',
    name: 'Freio traseiro',
    group: 'dinamica',
    description: 'Freio a disco traseiro.',
    function: 'Frenagem.',
    specs: [hyp('Discos', '1', PRANCHA(1))],
    coverage: 'inspecao_manual',
    maintenanceRule: { everyKm: 3000, task: 'Verificar pastilhas, disco e fluido' },
  }),
  c({
    id: 'tire-front',
    name: 'Pneu dianteiro',
    group: 'dinamica',
    parentId: 'wheel-front',
    description: 'Pneu dianteiro.',
    function: 'Aderência.',
    specs: [hyp('Medida', '110/70 R17', PRANCHA(2))],
    signals: [sig('pressure', 'psi', 'sensor_futuro', 'TPMS proposto.')],
    coverage: 'inspecao_manual',
    maintenanceRule: { everyDays: 15, task: 'Calibrar pressão (valor do manual)' },
    mesh3d: false,
  }),
  c({
    id: 'tire-rear',
    name: 'Pneu traseiro',
    group: 'dinamica',
    parentId: 'wheel-rear',
    description: 'Pneu traseiro.',
    function: 'Aderência e tração.',
    specs: [unk('Medida')],
    signals: [sig('pressure', 'psi', 'sensor_futuro', 'TPMS proposto.')],
    coverage: 'inspecao_manual',
    maintenanceRule: { everyDays: 15, task: 'Calibrar pressão (valor do manual)' },
    mesh3d: false,
  }),

  // ───────────── Instrumentação futura
  c({
    id: 'gateway',
    name: 'Gateway de telemetria ESP32 (em implantação)',
    group: 'instrumentacao',
    description:
      'Cérebro da instrumentação: ESP32 próprio que lê os sensores adicionais e publica EMGP por USB, Bluetooth e Wi‑Fi. ' +
      'Testado em bancada; ainda não montado na moto. Posição planejada: sob o banco/rabeta, longe da alta tensão.',
    function: 'Coleta, normalização e envio de dados ao serviço de ingestão (somente leitura da moto).',
    specs: [
      {
        label: 'Hardware',
        value: 'ESP32-D0WD-V3 rev 3.1, flash 4 MB, USB CP2102',
        evidence: 'inspecao',
        source: 'Leitura do chip por esptool (29/10/2026)',
      },
      {
        label: 'Firmware',
        value: 'esp32-gateway 1.0.0 (EMGP v1)',
        evidence: 'inspecao',
        source: 'Gravação verificada por hash + anúncio "# fw" no boot (29/10/2026)',
      },
      unk('Fixação e alimentação na moto', 'Bateria própria ou 12 V auxiliar com fusível — nunca da alta tensão.'),
    ],
    mesh3d: true,
  }),
];

export const CATALOG_BY_ID: Record<string, VehicleComponent> = Object.fromEntries(CATALOG.map((x) => [x.id, x]));

export function getComponent(id: string | null | undefined): VehicleComponent | undefined {
  return id ? CATALOG_BY_ID[id] : undefined;
}

/** Árvore: grupo → componentes raiz → filhos. */
export function buildTree() {
  const groups = Object.keys(GROUP_LABELS) as ComponentGroup[];
  return groups.map((g) => {
    const inGroup = CATALOG.filter((x) => x.group === g);
    const roots = inGroup.filter((x) => !x.parentId || CATALOG_BY_ID[x.parentId]?.group !== g);
    const children = (id: string) => CATALOG.filter((x) => x.parentId === id && x.group === g);
    return { group: g, label: GROUP_LABELS[g], roots, children };
  });
}

/** Ids filhos (qualquer grupo) para isolamento de conjuntos. */
export function descendants(id: string): string[] {
  const out: string[] = [];
  const walk = (pid: string) => {
    for (const x of CATALOG) {
      if (x.parentId !== pid) continue;
      out.push(x.id);
      walk(x.id);
    }
  };
  walk(id);
  return out;
}
