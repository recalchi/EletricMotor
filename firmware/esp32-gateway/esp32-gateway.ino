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
#define FW_VERSION "1.2.0"      // suba a cada gravação; o app EletricMotor lê esta linha para gerenciar atualizações
#define ONE_WIRE_PIN 4
#define FW_ANNOUNCE_MS 10000    // reanuncia a versão periodicamente (o app pode conectar depois do boot)
#define SAMPLE_MS 2000          // período de leitura
#define HTTP_BATCH 10           // mensagens por POST (função aceita até 50; limite 1 req/s)

// Testes de bancada (só jumpers, sem componentes) — canais de diagnóstico, nunca mapeados para a moto:
//   v34  tensão no GPIO34 (V): jumper GPIO34→3V3 ≈ 3,1–3,3 V; GPIO34→GND ≈ 0 V
//   d27  GPIO27 com pull-up interno: solto = 1; jumper GPIO27→GND = 0
//   tq13 toque capacitivo no GPIO13 (T4): encostar o dedo na ponta do jumper faz o valor cair bastante
#define BENCH_ADC_PIN 34
#define BENCH_DIN_PIN 27
#define BENCH_TOUCH_PIN 13

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
int httpCount = 0;

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

void announceFirmware() {
  // Linha "#": o app trata como log do firmware, não como telemetria.
  Serial.printf("# fw name=%s version=%s emgp=1 dev=%s chip_rev=%d sdk=%s\n",
                FW_NAME, FW_VERSION, DEVICE_ID, (int)ESP.getChipRevision(), ESP.getSdkVersion());
}

void setup() {
  Serial.begin(115200);
  announceFirmware();
  sensors.begin();
  pinMode(BENCH_DIN_PIN, INPUT_PULLUP);
  analogSetPinAttenuation(BENCH_ADC_PIN, ADC_11db);  // faixa até ~3,1 V
  setupBle();
  if (wifiEnabled()) {
    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    configTime(0, 0, "pool.ntp.org");  // timestamps em UTC
  }
}

void loop() {
  static uint32_t last = 0;
  static uint32_t lastAnnounce = 0;
  if (millis() - lastAnnounce >= FW_ANNOUNCE_MS) {
    lastAnnounce = millis();
    announceFirmware();
  }
  if (millis() - last < SAMPLE_MS) return;
  last = millis();

  sensors.requestTemperatures();
  float t = sensors.getTempCByIndex(0);
  bool hasTemp = t != DEVICE_DISCONNECTED_C;
  if (!hasTemp) Serial.println("# sensor DS18B20 desconectado");

  // ts só é enviado com relógio sincronizado (NTP); sem ele o app usa o horário de recebimento
  time_t now = time(nullptr);
  String ts = now > 1700000000 ? String(",\"ts\":") + String((uint64_t)now * 1000ULL) : String("");

  // A partir da 1.1.0 sempre publica: os canais de bancada permitem testar o caminho completo só com o ESP32
  String ch = String("\"v34\":") + String(analogReadMilliVolts(BENCH_ADC_PIN) / 1000.0, 3) +
              ",\"d27\":" + String(digitalRead(BENCH_DIN_PIN)) + ",\"tq13\":" + String(touchRead(BENCH_TOUCH_PIN));
  if (hasTemp) ch = String("\"t1\":") + String(t, 2) + "," + ch;
  String line = String("{\"v\":1,\"dev\":\"") + DEVICE_ID + "\",\"seq\":" + String(seq++) + ts + ",\"ch\":{" + ch +
                "},\"st\":{\"rssi\":" + String(WiFi.RSSI()) + ",\"up\":" + String(millis() / 1000) +
                ",\"heap\":" + String(ESP.getFreeHeap() / 1024) + ",\"ble\":" + String(bleClient ? 1 : 0) +
                ",\"ds\":\"" + (hasTemp ? "ok" : "ausente") + "\",\"fw\":\"" + FW_VERSION + "\"}}";
  publish(line);
}
