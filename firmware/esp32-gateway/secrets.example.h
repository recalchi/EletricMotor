// Copie para secrets.h (ignorado pelo Git) e preencha. NUNCA versione o token real.
#pragma once

#define DEVICE_ID "esp32-hub"            // igual ao ID cadastrado no app (campo "dev")

// Opcional: envio pela internet para a função de ingestão (deixe WIFI_SSID vazio para desativar)
#define WIFI_SSID ""
#define WIFI_PASSWORD ""
#define INGEST_URL "https://us-central1-SEU-PROJETO.cloudfunctions.net/ingest"
#define DEVICE_TOKEN ""                  // gerado em Conectividade → Dispositivos → Gerar token
