/*
 * EletricMotor — gateway de referência (ESP32) — EMGP v1
 *
 * Lê um sensor de temperatura DS18B20 (ex.: colado na carcaça EXTERNA do motor hub, em ponto estático)
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
#define FW_VERSION "1.0.0"      // suba a cada gravação; o app EletricMotor lê esta linha para gerenciar atualizações
#define ONE_WIRE_PIN 4
#define FW_ANNOUNCE_MS 60000    // reanuncia a versão periodicamente (o app pode conectar depois do boot)
#define SAMPLE_MS 2000          // período de leitura
#define HTTP_BATCH 10           // mensagens por POST (função aceita até 50; limite 1 req/s)

// Nordic UART Service (padrão de fato para UART sobre BLE)
#define NUS_SERVICE "6E400001-B5A3-F393-E0A9-E50E24DCCA9E"
#define NUS_TX      "6E400003-B5A3-F393-E0A9-E50E24DCCA9E"

OneWire oneWire(ONE_WIRE_PIN);
DallasTemperature sensors(&oneWire);
NimBLECharacteristic* txChar = nullptr;
bool bleClient = false;
uint32_t seq = 0;
String httpBuffer;
int httpCount = 0;

class ServerCallbacks : public NimBLEServerCallbacks {
  void onConnect(NimBLEServer*, NimBLEConnInfo&) override { bleClient = true; }
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
  NimBLEAdvertising* adv = NimBLEDevice::getAdvertising();
  adv->addServiceUUID(NUS_SERVICE);
  adv->setName(DEVICE_ID);
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
    // NUS entrega em pedaços; o app remonta as linhas
    for (size_t i = 0; i < withNl.length(); i += 180) {
      String part = withNl.substring(i, i + 180);
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
  if (t == DEVICE_DISCONNECTED_C) {
    Serial.println("# sensor DS18B20 desconectado");
    return;
  }

  // ts só é enviado com relógio sincronizado (NTP); sem ele o app usa o horário de recebimento
  time_t now = time(nullptr);
  String ts = now > 1700000000 ? String(",\"ts\":") + String((uint64_t)now * 1000ULL) : String("");

  String line = String("{\"v\":1,\"dev\":\"") + DEVICE_ID + "\",\"seq\":" + String(seq++) + ts +
                ",\"ch\":{\"t1\":" + String(t, 2) + "},\"st\":{\"rssi\":" + String(WiFi.RSSI()) + "}}";
  publish(line);
}
