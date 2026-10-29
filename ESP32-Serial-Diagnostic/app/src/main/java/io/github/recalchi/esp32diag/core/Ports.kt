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
    val scanBauds: List<Int> = listOf(74880, 9600, 57600),
    val attachWaitMs: Long = 5000,
    val permissionTimeoutMs: Long = 30000,
    val openAttempts: Int = 3,
    val openTimeoutMs: Long = 8000,
    val readWindowMs: Long = 8000,
    val scanWindowMs: Long = 4000,
    val earlyStopBytes: Int = 4096,
    val maxCaptureBytes: Int = 256 * 1024,
    val maxReconnects: Int = 2
)
