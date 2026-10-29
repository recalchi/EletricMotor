package io.github.recalchi.esp32diag.usb

import android.annotation.SuppressLint
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.hardware.usb.UsbConstants
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbManager
import android.os.Build
import com.hoho.android.usbserial.driver.Cp21xxSerialDriver
import com.hoho.android.usbserial.driver.ProbeTable
import com.hoho.android.usbserial.driver.UsbSerialDriver
import com.hoho.android.usbserial.driver.UsbSerialPort
import com.hoho.android.usbserial.driver.UsbSerialProber
import io.github.recalchi.esp32diag.core.AppLog
import io.github.recalchi.esp32diag.core.PermissionResult
import io.github.recalchi.esp32diag.core.ProbeStrategy
import io.github.recalchi.esp32diag.core.SerialSession
import io.github.recalchi.esp32diag.core.UsbDeviceInfo
import io.github.recalchi.esp32diag.core.UsbEndpointInfo
import io.github.recalchi.esp32diag.core.UsbGateway
import io.github.recalchi.esp32diag.core.UsbInterfaceInfo
import io.github.recalchi.esp32diag.core.UsbOpenException
import java.io.IOException
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

class AndroidUsbGateway(context: Context, private val log: AppLog) : UsbGateway {
    private val ctx = context.applicationContext
    private val usb = ctx.getSystemService(Context.USB_SERVICE) as UsbManager

    private fun device(id: String): UsbDevice? = usb.deviceList.values.firstOrNull { it.deviceName == id }

    private fun prober(strategy: ProbeStrategy): UsbSerialProber = when (strategy) {
        ProbeStrategy.DEFAULT -> UsbSerialProber.getDefaultProber()
        ProbeStrategy.FORCE_CP21XX -> UsbSerialProber(ProbeTable().apply {
            addProduct(0x10C4, 0xEA60, Cp21xxSerialDriver::class.java)
        })
    }

    override fun listDevices(): List<UsbDeviceInfo> = usb.deviceList.values.map { d ->
        UsbDeviceInfo(
            id = d.deviceName,
            vid = d.vendorId,
            pid = d.productId,
            usbClass = d.deviceClass,
            manufacturer = safe { d.manufacturerName },
            product = safe { d.productName },
            hasPermission = usb.hasPermission(d),
            interfaces = (0 until d.interfaceCount).map { i ->
                val itf = d.getInterface(i)
                UsbInterfaceInfo(
                    itf.id, itf.interfaceClass,
                    (0 until itf.endpointCount).map { e ->
                        val ep = itf.getEndpoint(e)
                        UsbEndpointInfo(ep.address, ep.type, ep.direction, ep.maxPacketSize)
                    }
                )
            }
        )
    }

    private inline fun <T> safe(block: () -> T): T? = try { block() } catch (_: Exception) { null }

    override fun probeDriver(deviceId: String, strategy: ProbeStrategy): String? {
        val d = device(deviceId) ?: return null
        return prober(strategy).probeDevice(d)?.javaClass?.simpleName
    }

    override fun hasPermission(deviceId: String): Boolean = device(deviceId)?.let { usb.hasPermission(it) } ?: false

    @SuppressLint("InlinedApi", "UnspecifiedRegisterReceiverFlag")
    override fun requestPermission(deviceId: String, timeoutMs: Long): PermissionResult {
        val d = device(deviceId) ?: return PermissionResult.DENIED
        val action = "${ctx.packageName}.USB_PERMISSION"
        val latch = CountDownLatch(1)
        val granted = AtomicReference<Boolean?>(null)
        val receiver = object : BroadcastReceiver() {
            override fun onReceive(c: Context, intent: Intent) {
                if (intent.action == action) {
                    granted.set(intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false))
                    latch.countDown()
                }
            }
        }
        if (Build.VERSION.SDK_INT >= 33) {
            ctx.registerReceiver(receiver, IntentFilter(action), Context.RECEIVER_NOT_EXPORTED)
        } else {
            ctx.registerReceiver(receiver, IntentFilter(action))
        }
        try {
            // Android 12+ exige FLAG_MUTABLE para o sistema preencher EXTRA_DEVICE/EXTRA_PERMISSION_GRANTED;
            // o intent é explícito (setPackage), como exigido no Android 14.
            val pi = PendingIntent.getBroadcast(
                ctx, 0, Intent(action).setPackage(ctx.packageName),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
            )
            usb.requestPermission(d, pi)
            log.i("usb", "pedido de permissão enviado para ${d.vendorId.toString(16)}:${d.productId.toString(16)}")
            if (!latch.await(timeoutMs, TimeUnit.MILLISECONDS)) {
                // O usuário pode ter concedido por "padrão do dispositivo" sem broadcast.
                return if (usb.hasPermission(d)) PermissionResult.GRANTED else PermissionResult.TIMEOUT
            }
            return if (granted.get() == true || usb.hasPermission(d)) PermissionResult.GRANTED else PermissionResult.DENIED
        } finally {
            try { ctx.unregisterReceiver(receiver) } catch (_: Exception) {}
        }
    }

    override fun open(deviceId: String, strategy: ProbeStrategy): SerialSession {
        val d = device(deviceId) ?: throw UsbOpenException("dispositivo não está mais conectado")
        val driver: UsbSerialDriver = prober(strategy).probeDevice(d)
            ?: throw UsbOpenException("nenhum driver para o dispositivo (${strategy.label})")
        val connection = usb.openDevice(d)
            ?: throw UsbOpenException("UsbManager.openDevice retornou null (sem permissão ou dispositivo ocupado)")
        val port = driver.ports.firstOrNull()
        if (port == null) {
            connection.close()
            throw UsbOpenException("driver sem portas")
        }
        try {
            port.open(connection)   // CP21xx: DTR e RTS ficam em nível inativo; nunca os alteramos.
        } catch (e: Exception) {
            try { connection.close() } catch (_: Exception) {}
            throw UsbOpenException("falha em open(): ${e.message ?: e}", e)
        }
        return PortSession(port)
    }

    private class PortSession(private val port: UsbSerialPort) : SerialSession {
        override fun configure(baud: Int) {
            try {
                port.setParameters(baud, 8, UsbSerialPort.STOPBITS_1, UsbSerialPort.PARITY_NONE)
            } catch (e: UnsupportedOperationException) {
                throw IOException("parâmetros não suportados: ${e.message}", e)
            }
        }

        override fun read(buf: ByteArray, timeoutMs: Int): Int = port.read(buf, timeoutMs)

        override fun controlLinesReadOnly(): String? = try {
            port.controlLines.joinToString(",") { it.name }.ifEmpty { "nenhuma ativa" }
        } catch (_: Exception) {
            null
        }

        override fun close() {
            try { port.close() } catch (_: Exception) {}
        }
    }
}
