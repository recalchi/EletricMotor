package io.github.recalchi.esp32diag.core

enum class StepStatus(val symbol: String) { OK("✔"), WARN("⚠"), FAIL("✘"), SKIPPED("–") }

enum class DiagState(val label: String) {
    IDLE("Pronto"),
    DETECTING("Procurando dispositivo USB…"),
    PERMISSION("Aguardando permissão USB…"),
    OPENING("Abrindo porta serial…"),
    CONFIGURING("Configurando porta (115200 8N1)…"),
    READING("Escutando a saída serial…"),
    SCANNING_BAUD("Testando outras velocidades (somente leitura)…"),
    PROMPT_RESET("APERTE E SOLTE o botão EN/RESET da placa AGORA (o app não reseta)"),
    FINISHED("Concluído"),
    CANCELLED("Cancelado"),
    ERROR("Erro")
}

enum class Outcome(val label: String) {
    SERIAL_DATA_OK("Dados de texto recebidos do ESP32"),
    SERIAL_SILENT("Porta aberta, mas nenhum byte recebido"),
    SERIAL_GARBLED("Bytes recebidos, mas ilegíveis em todas as velocidades testadas"),
    SERIAL_RATE_ANOMALY("Fluxo de bytes mais rápido do que a velocidade configurada permite"),
    NO_DEVICE("Nenhum dispositivo USB detectado"),
    DRIVER_UNSUPPORTED("Dispositivo USB sem driver serial compatível"),
    PERMISSION_DENIED("Permissão USB negada"),
    PERMISSION_TIMEOUT("Permissão USB não respondida a tempo"),
    OPEN_FAILED("Não foi possível abrir a porta serial"),
    DISCONNECTED("Dispositivo desconectado durante a leitura"),
    CANCELLED("Diagnóstico cancelado"),
    INTERNAL_ERROR("Erro interno do aplicativo")
}

enum class Confidence(val label: String) { ALTA("alta"), MEDIA("média"), BAIXA("baixa") }

data class UsbEndpointInfo(val address: Int, val type: Int, val direction: Int, val maxPacketSize: Int)
data class UsbInterfaceInfo(val id: Int, val usbClass: Int, val endpoints: List<UsbEndpointInfo>)

data class UsbDeviceInfo(
    val id: String,
    val vid: Int,
    val pid: Int,
    val usbClass: Int,
    val manufacturer: String?,
    val product: String?,
    val hasPermission: Boolean,
    val interfaces: List<UsbInterfaceInfo>
) {
    val vidPid: String get() = "%04X:%04X".format(vid, pid)
    val isCp2102: Boolean get() = vid == 0x10C4 && pid == 0xEA60
}

data class Step(
    val id: String,
    val title: String,
    val status: StepStatus,
    val detail: String,
    val startedAtMs: Long,
    val durationMs: Long,
    val evidence: Map<String, String> = emptyMap()
)

class SerialChunk(val offsetMs: Long, val bytes: ByteArray)

class SerialCapture(
    val baud: Int,
    val startedAtMs: Long,
    val durationMs: Long,
    val chunks: List<SerialChunk>,
    val totalBytes: Int,
    val truncated: Boolean,
    val receivedBytes: Long = totalBytes.toLong(),
    val reads: Int = 0,
    val anomalous: Boolean = false,
    val dupChunks: Int = 0,
    val readSizes: String = ""
) {
    fun allBytes(): ByteArray {
        val out = java.io.ByteArrayOutputStream()
        chunks.forEach { out.write(it.bytes) }
        return out.toByteArray()
    }
}

data class WifiResult(
    val ranAtMs: Long,
    val wifiConnected: Boolean,
    val ssidInfo: String,
    val localIp: String?,
    val gateway: String?,
    val gatewayIsPrivate: Boolean,
    val tcp80: String,
    val httpStatusLine: String?,
    val httpHeaders: String?,
    val bodySample: String?,
    val notes: List<String>
)

class DiagReport(
    val startedAtMs: Long,
    val finishedAtMs: Long,
    val outcome: Outcome,
    val confidence: Confidence,
    val headline: String,
    val conclusions: List<String>,
    val nextSteps: List<String>,
    val steps: List<Step>,
    val devices: List<UsbDeviceInfo>,
    val selectedDevice: UsbDeviceInfo?,
    val driver: String?,
    val permissionState: String,
    val controlLines: String?,
    val reconnects: Int,
    val captures: List<SerialCapture>,
    val analyses: List<Analysis>,
    val chip: String? = null,
    val readbacks: List<String> = emptyList(),
    val resetPrompted: Boolean = false,
    val bannerAtMs: Long = -1,
    val bytesWritten: Int = 0
)
