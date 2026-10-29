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
    private val costMs: Int? = null,
    private val script: (baud: Int, call: Int) -> ByteArray?
) : SerialSession {
    var readback: ((Int) -> ChipReadback?)? = null
    override fun chipReadback(): ChipReadback? = readback?.invoke(baud)
    var baud = 0
    var closed = false
    val configured = mutableListOf<Int>()
    private var calls = 0
    var onRead: (() -> Unit)? = null

    override fun configure(baud: Int) { this.baud = baud; configured.add(baud); calls = 0 }
    override fun read(buf: ByteArray, timeoutMs: Int): Int {
        onRead?.invoke()
        clock.t += costMs ?: timeoutMs
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
val PATTERN33 = ByteArray(33) { (0x60 + (it * 7) % 0x9F).toByte() }
val NOISE = ByteArray(64) { (0x80 + it).toByte() }

/** Padrão de 33 bytes repetido, como o observado no ZIP real (v0.1.0). */
val PERIODIC_FLOOD = ByteArray(4096) { PATTERN33[it % 33] }


fun ioFail(): Nothing = throw IOException("USB get_status request failed")

private const val ESC = "\u001b"
val AT_BOOT_LOG: String = "ets Jul 29 2019 12:21:46\r\n\r\nrst:0x1 (POWERON_RESET),boot:0x13 (SPI_FAST_FLASH_BOOT)\r\n" +
    "configsip: 0, SPIWP:0xee\r\nclk_drv:0x00,q_drv:0x00,d_drv:0x00,cs0_drv:0x00,hd_drv:0x00,wp_drv:0x00\r\n" +
    "mode:DIO, clock div:2\r\nload:0x3fff0030,len:7672\r\nload:0x40078000,len:16432\r\nload:0x40080400,len:3704\r\nentry 0x4008067c\r\n" +
    "$ESC[0;32mI (27) boot: ESP-IDF qa-test-v4.3.3-20220423 2nd stage bootloader$ESC[0m\r\n" +
    "$ESC[0;32mI (31) boot: chip revision: 3$ESC[0m\r\n" +
    "$ESC[0;32mI (38) boot.esp32: SPI Speed      : 40MHz$ESC[0m\r\n" +
    "$ESC[0;32mI (43) boot.esp32: SPI Mode       : DIO$ESC[0m\r\n" +
    "$ESC[0;32mI (48) boot.esp32: SPI Flash Size : 4MB$ESC[0m\r\n" +
    "$ESC[0;32mI (61) boot: ## Label            Usage          Type ST Offset   Length$ESC[0m\r\n" +
    "$ESC[0;32mI (68) boot:  0 phy_init         RF data          01 01 0000f000 00001000$ESC[0m\r\n" +
    "$ESC[0;32mI (76) boot:  1 otadata          OTA data         01 00 00010000 00002000$ESC[0m\r\n" +
    "$ESC[0;32mI (83) boot:  2 nvs              WiFi data        01 02 00012000 0000e000$ESC[0m\r\n" +
    "$ESC[0;32mI (91) boot:  3 at_customize     unknown          40 00 00020000 000e0000$ESC[0m\r\n" +
    "$ESC[0;32mI (98) boot:  4 ota_0            OTA app          00 10 00100000 00180000$ESC[0m\r\n" +
    "$ESC[0;32mI (106) boot:  5 ota_1            OTA app          00 11 00280000 00180000$ESC[0m\r\n" +
    "module_name:WROOM-32\r\nmax tx power=78,ret=0\r\n2.4.0\r\n"

/** Pacotes de 32 B como os observados (dados reais), prontos para serem intercalados com o ruído de 33 B. */
val AT_BOOT_PACKETS: List<ByteArray> = AT_BOOT_LOG.toByteArray(Charsets.ISO_8859_1).toList().chunked(32).map { it.toByteArray() }
