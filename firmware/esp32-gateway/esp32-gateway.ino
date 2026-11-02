/*
 * EletricMotor — gateway de referência (ESP32) — EMGP v1
 *
 * Lê um sensor de temperatura DS18B20 no EIXO do motor hub (parte estática, junto à saída do cabo de fase —
 * a carcaça externa de um motor hub gira com a roda; o estator é fixo no eixo) — canal t1 —
 * e publica mensagens EMGP por:
 *   - USB serial (115200 baud)        → app: Conectividade → "Gateway USB (Web Serial)"
 *   - Bluetooth LE (Nordic UART/NUS)  → app: "Gateway Bluetooth (UART/NUS)"
 *   - HTTPS (opcional, Wi-Fi)         → função de ingestão na nuvem
 *
 * SEGURANÇA
 *   - Alimente o ESP32 por bateria/powerbank PRÓPRIA. NÃO derive alimentação da alta tensão nem do chicote da moto.
 *   - O dispositivo é somente leitura e não tem nenhuma conexão elétrica com a moto.
 *   - Cabo do sensor fixado longe de partes rotativas (roda/disco) e de fontes de calor do freio.
 *
 * Ligações (DS18B20): VCC 3V3, GND, DATA → GPIO 4 com resistor de 4,7 kΩ entre DATA e 3V3.
 *
 * Bibliotecas (Arduino Library Manager): OneWire, DallasTemperature, NimBLE-Arduino (2.x).
 * Placa: "ESP32 Dev Module" (Arduino-ESP32 3.x).
 */
#include <Arduino.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <NimBLEDevice.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include "secrets.h"  // copie de secrets.example.h

#define FW_NAME "esp32-gateway"
#define FW_VERSION "1.4.1"     // suba a cada gravação; o app EletricMotor lê esta linha para gerenciar atualizações
#define ONE_WIRE_PIN 4
#define FW_ANNOUNCE_MS 10000    // reanuncia a versão periodicamente (o app pode conectar depois do boot)
#define SAMPLE_MS 2000          // período de leitura
#define DS_RESCAN_MS 5000       // sem sensor: procura de novo no barramento (pode plugar sem reiniciar a placa)
#define HTTP_BATCH 10           // mensagens por POST (função aceita até 50; limite 1 req/s)

// Testes de bancada (só jumpers, sem componentes) — canais de diagnóstico, nunca mapeados para a moto:
//   v34  tensão no GPIO34 (V): jumper GPIO34→3V3 ≈ 3,1–3,3 V; GPIO34→GND ≈ 0 V
//   d27  GPIO27 com pull-up interno: solto = 1; jumper GPIO27→GND = 0
//   tq13 toque capacitivo no GPIO13 (T4): encostar o dedo na ponta do jumper faz o valor cair bastante
#define BENCH_ADC_PIN 34
#define BENCH_DIN_PIN 27
#define BENCH_TOUCH_PIN 13

// Escuta serial da moto (1.4.0) — SOMENTE RECEPÇÃO: a UART2 é aberta sem pino de TX, nada é enviado.
// Ligação (guia public/guia/teste-conector-3pinos.html): fio de sinal → divisor R1+R2 iguais → GPIO16; GND comum.
// Nunca ligue a linha direto no GPIO16: ele aceita no máximo 3,3 V.
// Procura a velocidade sozinha (5 s em cada) e trava na que der bytes com poucos erros de quadro.
//   canais: u2b velocidade em uso · u2n bytes no período · u2e erros de quadro/break no período · u2l 1 = travada
//   log:    "# u2 baud=... n=... err=... hex=AA BB ..." (até 48 bytes por período) para decodificar no PC
#define MOTO_RX_PIN 16
#define U2_DWELL_MS 5000
#define U2_IDLE_UNLOCK_MS 30000
#define V34_BURST_N 2000        // rajada de leituras no pino 34 (~80 ms): mostra se a linha é contínua ou pulsada
#define V34_EDGE_MV 1200        // limiar para contar subidas/descidas na rajada
const uint32_t U2_BAUDS[] = {115200, 9600, 19200, 38400, 57600, 4800, 2400, 1200};
const int U2_NBAUDS = sizeof U2_BAUDS / sizeof U2_BAUDS[0];

// Nordic UART Service (padrão de fato para UART sobre BLE)
#define NUS_SERVICE "6E400001-B5A3-F393-E0A9-E50E24DCCA9E"
#define NUS_TX      "6E400003-B5A3-F393-E0A9-E50E24DCCA9E"

OneWire oneWire(ONE_WIRE_PIN);
DallasTemperature sensors(&oneWire);
NimBLECharacteristic* txChar = nullptr;
bool bleClient = false;
uint16_t blePayload = 20;  // MTU negociado − 3; começa no mínimo do BLE (MTU 23)
uint32_t seq = 0;
String httpBuffer;
// DS18B20: endereço ROM (número de série de 64 bits; byte 0 = família, 0x28 = DS18B20)
DeviceAddress dsAddr;
bool dsFound = false;
bool dsFresh = false;       // primeira conversão após achar o sensor (85,00 °C aqui é o valor de power-on, não leitura)
String dsId;                // "28-AABBCCDDEEFF" (formato do Linux/1-Wire)
const char* dsState = "ausente";  // ok · ausente · parasita (sem VCC: fio vermelho fora do 3V3) · reset (85 °C)
int httpCount = 0;
// escuta da moto (UART2, só RX)
int u2Idx = 0;
bool u2Locked = false;
uint32_t u2Since = 0, u2LastByte = 0, u2Bytes = 0, u2Good = 0;
volatile uint32_t u2Errors = 0;
uint8_t u2Hex[48];
int u2HexN = 0;

void u2Open() {
  Serial2.end();
  Serial2.setRxBufferSize(12288);  // cobre a leitura do DS18B20 (~750 ms parada) a 115200 baud
  Serial2.onReceiveError([](hardwareSerial_error_t) { u2Errors++; });
  Serial2.begin(U2_BAUDS[u2Idx], SERIAL_8N1, MOTO_RX_PIN, -1);  // TX = -1: sem pino de transmissão
  u2Since = millis();
  u2Good = 0;
}

void u2Poll() {
  while (Serial2.available()) {
    uint8_t b = Serial2.read();
    u2Bytes++;
    u2LastByte = millis();
    if (u2HexN < (int)sizeof u2Hex) u2Hex[u2HexN++] = b;
  }
}

// chamado a cada período de amostra: publica o log em hexa e decide velocidade/trava
void u2Report(uint32_t& n, uint32_t& err) {
  n = u2Bytes;
  err = u2Errors;
  if (n || err) {
    String hex;
    for (int i = 0; i < u2HexN; i++) {
      char h[4];
      snprintf(h, sizeof h, "%02X ", u2Hex[i]);
      hex += h;
    }
    Serial.printf("# u2 baud=%lu n=%lu err=%lu hex=%s\n", (unsigned long)U2_BAUDS[u2Idx], (unsigned long)n,
                  (unsigned long)err, hex.c_str());
  }
  bool good = n >= 8 && err * 10 < n;
  u2Good = good ? u2Good + 1 : 0;
  if (!u2Locked && u2Good >= 2) {
    u2Locked = true;
    Serial.printf("# u2 travada em %lu baud\n", (unsigned long)U2_BAUDS[u2Idx]);
  }
  if (u2Locked && millis() - u2LastByte > U2_IDLE_UNLOCK_MS) {
    u2Locked = false;
    Serial.println("# u2 sem bytes ha 30 s: volta a procurar a velocidade");
  }
  u2Bytes = 0;
  u2Errors = 0;
  u2HexN = 0;
  if (!u2Locked && millis() - u2Since >= U2_DWELL_MS) {
    u2Idx = (u2Idx + 1) % U2_NBAUDS;
    u2Open();
  }
}

class ServerCallbacks : public NimBLEServerCallbacks {
  void onConnect(NimBLEServer*, NimBLEConnInfo&) override {
    bleClient = true;
    blePayload = 20;
  }
  void onMTUChange(uint16_t mtu, NimBLEConnInfo&) override { blePayload = mtu > 23 ? mtu - 3 : 20; }
  void onDisconnect(NimBLEServer*, NimBLEConnInfo&, int) override {
    bleClient = false;
    NimBLEDevice::startAdvertising();
  }
};

void setupBle() {
  NimBLEDevice::init(DEVICE_ID);
  NimBLEServer* server = NimBLEDevice::createServer();
  server->setCallbacks(new ServerCallbacks());
  NimBLEService* svc = server->createService(NUS_SERVICE);
  txChar = svc->createCharacteristic(NUS_TX, NIMBLE_PROPERTY::NOTIFY);
  svc->start();
  // Pacote de anúncio tem 31 bytes: flags (3) + UUID de 128 bits (18) + nome "esp32-hub" (11) não cabem juntos —
  // na 1.0.0 o UUID se perdia e o app (que filtra pelo serviço NUS) não achava a placa. Nome vai na resposta de varredura.
  NimBLEAdvertising* adv = NimBLEDevice::getAdvertising();
  NimBLEAdvertisementData advData;
  advData.setFlags(BLE_HS_ADV_F_DISC_GEN | BLE_HS_ADV_F_BREDR_UNSUP);
  advData.setCompleteServices(NimBLEUUID(NUS_SERVICE));
  adv->setAdvertisementData(advData);
  NimBLEAdvertisementData scanData;
  scanData.setName(DEVICE_ID);
  adv->setScanResponseData(scanData);
  adv->enableScanResponse(true);
  adv->start();
}

bool wifiEnabled() { return strlen(WIFI_SSID) > 0 && strlen(DEVICE_TOKEN) > 0; }

void flushHttp() {
  if (!wifiEnabled() || httpCount == 0 || WiFi.status() != WL_CONNECTED) return;
  WiFiClientSecure client;
  client.setInsecure();  // TODO produção: fixar o certificado raiz (setCACert) em vez de setInsecure()
  HTTPClient http;
  http.begin(client, INGEST_URL);
  http.addHeader("Authorization", String("Bearer ") + DEVICE_TOKEN);
  http.addHeader("Content-Type", "application/x-ndjson");
  int code = http.POST(httpBuffer);
  Serial.printf("# ingest HTTP %d\n", code);  // linhas iniciadas com # vão para o log do adaptador no app
  http.end();
  if (code == 200 || code == 400) {  // 400 = dados inválidos: descarta para não repetir indefinidamente
    httpBuffer = "";
    httpCount = 0;
  }
}

void publish(const String& line) {
  Serial.println(line);
  if (bleClient && txChar) {
    String withNl = line + "\n";
    // NUS entrega em pedaços do tamanho do MTU negociado (pedaço maior seria truncado); o app remonta as linhas
    size_t chunk = blePayload > 180 ? 180 : blePayload;
    for (size_t i = 0; i < withNl.length(); i += chunk) {
      String part = withNl.substring(i, i + chunk);
      txChar->setValue((uint8_t*)part.c_str(), part.length());
      txChar->notify();
      delay(5);
    }
  }
  if (wifiEnabled()) {
    httpBuffer += line + "\n";
    if (++httpCount >= HTTP_BATCH) flushHttp();
  }
}

void scanDs() {
  sensors.begin();
  bool found = sensors.getAddress(dsAddr, 0);
  if (found && !dsFound) {
    char id[20];
    snprintf(id, sizeof id, "%02X-%02X%02X%02X%02X%02X%02X", dsAddr[0], dsAddr[6], dsAddr[5], dsAddr[4], dsAddr[3],
             dsAddr[2], dsAddr[1]);
    dsId = id;
    sensors.setResolution(dsAddr, 12);
    dsFresh = true;
    bool crcOk = OneWire::crc8(dsAddr, 7) == dsAddr[7];
    Serial.printf("# ds18b20 encontrado id=%s familia=0x%02X crc=%s parasita=%d n=%d\n", id, dsAddr[0],
                  crcOk ? "ok" : "erro", sensors.isParasitePowerMode() ? 1 : 0, sensors.getDeviceCount());
  }
  dsFound = found;
}

void announceFirmware() {
  // Linha "#": o app trata como log do firmware, não como telemetria.
  Serial.printf("# fw name=%s version=%s emgp=1 dev=%s chip_rev=%d sdk=%s\n",
                FW_NAME, FW_VERSION, DEVICE_ID, (int)ESP.getChipRevision(), ESP.getSdkVersion());
}

void setup() {
  Serial.begin(115200);
  announceFirmware();
  scanDs();
  pinMode(BENCH_DIN_PIN, INPUT_PULLUP);
  analogSetPinAttenuation(BENCH_ADC_PIN, ADC_11db);  // faixa até ~3,1 V
  setupBle();
  u2Open();
  if (wifiEnabled()) {
    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    configTime(0, 0, "pool.ntp.org");  // timestamps em UTC
  }
}

void loop() {
  static uint32_t last = 0;
  static uint32_t lastAnnounce = 0;
  u2Poll();
  if (millis() - lastAnnounce >= FW_ANNOUNCE_MS) {
    lastAnnounce = millis();
    announceFirmware();
  }
  if (millis() - last < SAMPLE_MS) return;
  last = millis();

  static uint32_t lastScan = 0;
  if (!dsFound && millis() - lastScan >= DS_RESCAN_MS) {
    lastScan = millis();
    scanDs();
  }
  float t = DEVICE_DISCONNECTED_C;
  if (dsFound) {
    sensors.requestTemperaturesByAddress(dsAddr);  // 12 bits: ~750 ms
    t = sensors.getTempC(dsAddr);
  }
  bool hasTemp = t != DEVICE_DISCONNECTED_C;
  if (dsFound && !hasTemp) {
    dsFound = false;  // sumiu do barramento: avisa uma vez e volta a procurar
    Serial.println("# sensor DS18B20 desconectado");
  }
  if (hasTemp && dsFresh && t == 85.0f) hasTemp = false;  // valor de power-on: descarta a primeira
  dsState = !dsFound ? "ausente" : sensors.isParasitePowerMode() ? "parasita" : !hasTemp ? "reset" : "ok";
  if (dsFound) dsFresh = false;

  // ts só é enviado com relógio sincronizado (NTP); sem ele o app usa o horário de recebimento
  time_t now = time(nullptr);
  String ts = now > 1700000000 ? String(",\"ts\":") + String((uint64_t)now * 1000ULL) : String("");

  // Rajada no pino 34: mínimo, máximo, média e número de cruzamentos do limiar (osciloscópio pobre)
  uint32_t vLo = UINT32_MAX, vHi = 0, vSum = 0, vEdges = 0;
  uint32_t vT0 = micros();
  bool vHigh = false;
  for (int i = 0; i < V34_BURST_N; i++) {
    uint32_t mv = analogReadMilliVolts(BENCH_ADC_PIN);
    vLo = min(vLo, mv); vHi = max(vHi, mv); vSum += mv;
    bool h = mv > V34_EDGE_MV;
    if (i && h != vHigh) vEdges++;
    vHigh = h;
  }
  uint32_t vUs = micros() - vT0;
  Serial.printf("# v34 burst n=%d us=%lu min=%lu max=%lu avg=%lu edges=%lu\n", V34_BURST_N, (unsigned long)vUs,
                (unsigned long)vLo, (unsigned long)vHi, (unsigned long)(vSum / V34_BURST_N), (unsigned long)vEdges);

  // A partir da 1.1.0 sempre publica: os canais de bancada permitem testar o caminho completo só com o ESP32
  String ch = String("\"v34\":") + String(analogReadMilliVolts(BENCH_ADC_PIN) / 1000.0, 3) +
              ",\"v34lo\":" + String(vLo / 1000.0, 3) + ",\"v34hi\":" + String(vHi / 1000.0, 3) +
              ",\"v34x\":" + String(vEdges) +
              ",\"d27\":" + String(digitalRead(BENCH_DIN_PIN)) + ",\"tq13\":" + String(touchRead(BENCH_TOUCH_PIN));
  if (hasTemp) ch = String("\"t1\":") + String(t, 2) + "," + ch;
  uint32_t u2n, u2e;
  u2Report(u2n, u2e);
  ch += ",\"u2b\":" + String(U2_BAUDS[u2Idx]) + ",\"u2n\":" + String(u2n) + ",\"u2e\":" + String(u2e) +
        ",\"u2l\":" + String(u2Locked ? 1 : 0);
  String line = String("{\"v\":1,\"dev\":\"") + DEVICE_ID + "\",\"seq\":" + String(seq++) + ts + ",\"ch\":{" + ch +
                "},\"st\":{\"rssi\":" + String(WiFi.RSSI()) + ",\"up\":" + String(millis() / 1000) +
                ",\"heap\":" + String(ESP.getFreeHeap() / 1024) + ",\"ble\":" + String(bleClient ? 1 : 0) +
                ",\"ds\":\"" + dsState + "\"" + (dsFound ? String(",\"dsid\":\"") + dsId + "\"" : String("")) +
                ",\"fw\":\"" + FW_VERSION + "\"}}";
  publish(line);
}
