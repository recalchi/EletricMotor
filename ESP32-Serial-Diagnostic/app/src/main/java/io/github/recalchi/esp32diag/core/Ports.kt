package io.github.recalchi.esp32diag.core

import java.io.Closeable
import java.io.IOException

/** Marca o tempo; injetável para testes. */
interface Clock {
    fun now(): Long

    @Throws(InterruptedException::class)
    fun sleep(ms: Long)
}

object SystemClock : Clock {
    override fun now(): Long = System.currentTimeMillis()
    override fun sleep(ms: Long) = Thread.sleep(ms)
}

enum class ProbeStrategy(val label: String) {
    DEFAULT("detecção padrão da biblioteca"),
    FORCE_CP21XX("driver CP21xx forçado (fallback)")
}

enum class PermissionResult { GRANTED, DENIED, TIMEOUT }

class UsbOpenException(message: String, cause: Throwable? = null) : IOException(message, cause)

/** Leitura (GET) de registradores do chip USB-serial; nada é escrito. */
data class ChipReadback(val partNum: Int?, val baud: Long?, val lineCtl: Int?, val modemStatus: Int?) {
    val partName: String? get() = when (partNum) {
        0x01 -> "CP2101"; 0x02 -> "CP2102"; 0x03 -> "CP2103"; 0x04 -> "CP2104"; 0x05 -> "CP2105"
        0x06 -> "CP2108"; 0x07 -> "CP2109"; 0x20, 0x21, 0x22 -> "CP2102N"
        null -> null
        else -> "desconhecido(0x%02X)".format(partNum)
    }
    fun describe(): String = "chip=${partName ?: "n/d"}, baud lido=${baud ?: "n/d"}, " +
        "linha=${lineCtl?.let { "0x%04X".format(it) } ?: "n/d"}, modem=${modemStatus?.let { "0x%02X".format(it) } ?: "n/d"}"
}

/**
 * Sessão serial SOMENTE LEITURA. Por construção não existe método de escrita,
 * nem de alteração de DTR/RTS: a regra "nunca transmitir/resetar" é garantida pelo compilador.
 */
interface SerialSession : Closeable {
    @Throws(IOException::class)
    fun configure(baud: Int)

    /** Retorna o número de bytes lidos (0 em timeout). Lança IOException se o dispositivo sumir. */
    @Throws(IOException::class)
    fun read(buf: ByteArray, timeoutMs: Int): Int

    /** Leitura (GET) do estado das linhas de controle; nunca altera. */
    fun controlLinesReadOnly(): String?

    /** Lê de volta do chip o baud/linha efetivamente aplicados (somente GET). Null se não suportado. */
    fun chipReadback(): ChipReadback? = null
}

interface UsbGateway {
    fun listDevices(): List<UsbDeviceInfo>
    fun probeDriver(deviceId: String, strategy: ProbeStrategy): String?
    fun hasPermission(deviceId: String): Boolean
    fun requestPermission(deviceId: String, timeoutMs: Long): PermissionResult

    @Throws(UsbOpenException::class)
    fun open(deviceId: String, strategy: ProbeStrategy): SerialSession
}

data class DiagConfig(
    val baud: Int = 115200,
    val scanBauds: List<Int> = listOf(74880, 9600, 57600, 230400, 460800, 921600, 1_000_000, 2_000_000),
    val attachWaitMs: Long = 5000,
    val permissionTimeoutMs: Long = 30000,
    val openAttempts: Int = 3,
    val openTimeoutMs: Long = 8000,
    val readWindowMs: Long = 8000,
    val scanWindowMs: Long = 4000,
    /** Parar cedo só se já houver texto legível com pelo menos este volume. */
    val earlyTextBytes: Int = 512,
    /** Após este tempo, vazão acima do limite físico do baud encerra a captura (evidência suficiente). */
    val anomalyAfterMs: Long = 1500,
    val maxCaptureBytes: Int = 256 * 1024,
    val maxReconnects: Int = 2
)
