package io.github.recalchi.esp32diag.core

import java.io.IOException

class FakeClock : Clock {
    @Volatile var t = 1_700_000_000_000L
    override fun now() = t
    override fun sleep(ms: Long) { t += ms }
}

val CP2102 = UsbDeviceInfo(
    id = "/dev/bus/usb/001/002", vid = 0x10C4, pid = 0xEA60, usbClass = 0,
    manufacturer = "Silicon Labs", product = "CP2102 USB to UART Bridge Controller", hasPermission = false,
    interfaces = listOf(UsbInterfaceInfo(0, 255, listOf(UsbEndpointInfo(0x81, 2, 0x80, 64), UsbEndpointInfo(0x01, 2, 0, 64))))
)

val UNKNOWN = CP2102.copy(id = "/dev/bus/usb/001/003", vid = 0x1234, pid = 0x5678)

/** Sessão falsa: `script(baud, callIndex)` devolve bytes, null (timeout) ou lança IOException. */
class FakeSession(
    private val clock: FakeClock,
    private val script: (baud: Int, call: Int) -> ByteArray?
) : SerialSession {
    var baud = 0
    var closed = false
    val configured = mutableListOf<Int>()
    private var calls = 0
    var onRead: (() -> Unit)? = null

    override fun configure(baud: Int) { this.baud = baud; configured.add(baud); calls = 0 }
    override fun read(buf: ByteArray, timeoutMs: Int): Int {
        onRead?.invoke()
        clock.t += timeoutMs
        val data = script(baud, calls++) ?: return 0
        System.arraycopy(data, 0, buf, 0, data.size)
        return data.size
    }
    override fun controlLinesReadOnly(): String? = "nenhuma ativa"
    override fun close() { closed = true }
}

class FakeGateway(private val clock: FakeClock) : UsbGateway {
    var devices: MutableList<UsbDeviceInfo> = mutableListOf(CP2102)
    var defaultDriver: String? = "Cp21xxSerialDriver"
    var forcedDriver: String? = "Cp21xxSerialDriver"
    var permitted = false
    var permissionResult = PermissionResult.GRANTED
    val openResults = ArrayDeque<() -> SerialSession>()
    var openCalls = 0
    var permissionRequests = 0
    var listFailure: RuntimeException? = null

    override fun listDevices(): List<UsbDeviceInfo> {
        listFailure?.let { throw it }
        return devices.toList()
    }
    override fun probeDriver(deviceId: String, strategy: ProbeStrategy): String? {
        val d = devices.firstOrNull { it.id == deviceId } ?: return null
        if (!d.isCp2102) return null
        return if (strategy == ProbeStrategy.DEFAULT) defaultDriver else forcedDriver
    }
    override fun hasPermission(deviceId: String) = permitted
    override fun requestPermission(deviceId: String, timeoutMs: Long): PermissionResult {
        permissionRequests++
        if (permissionResult == PermissionResult.GRANTED) permitted = true
        return permissionResult
    }
    override fun open(deviceId: String, strategy: ProbeStrategy): SerialSession {
        openCalls++
        val next = openResults.removeFirstOrNull() ?: throw UsbOpenException("sem sessão programada")
        return next()
    }
}

fun failOpen(msg: String = "falha simulada"): () -> SerialSession = { throw UsbOpenException(msg) }

fun runner(gw: UsbGateway, clock: Clock, cfg: DiagConfig = DiagConfig(), log: AppLog = AppLog()) =
    DiagnosticRunner(gw, clock, log, cfg)

val EMGP_LINE = "{\"v\":1,\"dev\":\"esp32-hub\",\"seq\":0,\"ch\":{\"t1\":24.81}}\r\n".toByteArray()
val BOOT_BANNER = "ets Jul 29 2019 12:21:46\r\n\r\nrst:0x1 (POWERON_RESET),boot:0x13 (SPI_FAST_FLASH_BOOT)\r\n".toByteArray()
val NOISE = ByteArray(64) { (0x80 + it).toByte() }

fun ioFail(): Nothing = throw IOException("USB get_status request failed")
