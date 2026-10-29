package io.github.recalchi.esp32diag.report

import io.github.recalchi.esp32diag.core.DiagReport
import io.github.recalchi.esp32diag.core.Redactor
import io.github.recalchi.esp32diag.core.SerialCapture
import io.github.recalchi.esp32diag.core.UsbDeviceInfo
import io.github.recalchi.esp32diag.core.WifiResult
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

data class DeviceInfo(
    val manufacturer: String,
    val model: String,
    val androidRelease: String,
    val sdkInt: Int,
    val abis: List<String>,
    val usbHostFeature: Boolean,
    val locale: String,
    val appVersionName: String,
    val appVersionCode: Long
)

object ReportBuilder {
    const val SCHEMA = 1
    private const val MAX_SERIAL_TXT = 600_000
    private const val HEXDUMP_BYTES = 256

    fun iso(ms: Long): String {
        val f = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSSXXX", Locale.US)
        f.timeZone = TimeZone.getDefault()
        return f.format(Date(ms))
    }

    /** Monta todos os arquivos do relatório (nome → bytes). */
    fun files(report: DiagReport, device: DeviceInfo, appLog: String, wifi: WifiResult?): LinkedHashMap<String, ByteArray> {
        val out = LinkedHashMap<String, ByteArray>()
        out["README.txt"] = readme(report).toByteArray(Charsets.UTF_8)
        out["summary.json"] = summary(report, device, wifi != null).toString(2).toByteArray(Charsets.UTF_8)
        out["device.json"] = deviceJson(device).toString(2).toByteArray(Charsets.UTF_8)
        out["usb.json"] = usbJson(report).toString(2).toByteArray(Charsets.UTF_8)
        out["serial.txt"] = serialTxt(report.captures).toByteArray(Charsets.UTF_8)
        if (wifi != null) out["wifi.json"] = wifiJson(wifi).toString(2).toByteArray(Charsets.UTF_8)
        out["app-log.txt"] = appLog.toByteArray(Charsets.UTF_8)
        return out
    }

    fun zip(files: Map<String, ByteArray>, timeMs: Long): ByteArray {
        val bos = ByteArrayOutputStream()
        ZipOutputStream(bos).use { z ->
            for ((name, data) in files) {
                val e = ZipEntry(name)
                e.time = timeMs
                z.putNextEntry(e)
                z.write(data)
                z.closeEntry()
            }
        }
        return bos.toByteArray()
    }

    fun summary(r: DiagReport, d: DeviceInfo, wifiIncluded: Boolean): JSONObject {
        val steps = JSONArray()
        r.steps.forEach { s ->
            steps.put(JSONObject().apply {
                put("id", s.id); put("title", s.title); put("status", s.status.name)
                put("detail", Redactor.text(s.detail))
                put("startedAt", iso(s.startedAtMs)); put("durationMs", s.durationMs)
                put("evidence", JSONObject(s.evidence.mapValues { Redactor.text(it.value) }))
            })
        }
        val caps = JSONArray()
        r.analyses.forEachIndexed { i, a ->
            caps.put(JSONObject().apply {
                put("baud", a.baud); put("bytes", a.totalBytes); put("printableRatio", "%.3f".format(Locale.US, a.printableRatio))
                put("lines", a.lineCount); put("kind", a.kind.name)
                put("signatures", JSONArray(a.signatures))
                put("truncated", r.captures.getOrNull(i)?.truncated ?: false)
                put("durationMs", r.captures.getOrNull(i)?.durationMs ?: 0)
            })
        }
        return JSONObject().apply {
            put("schema", SCHEMA)
            put("app", "ESP32 Serial Diagnostic")
            put("appVersion", d.appVersionName)
            put("startedAt", iso(r.startedAtMs)); put("finishedAt", iso(r.finishedAtMs))
            put("durationMs", r.finishedAtMs - r.startedAtMs)
            put("outcome", r.outcome.name); put("outcomeLabel", r.outcome.label)
            put("confidence", r.confidence.label)
            put("headline", r.headline)
            put("conclusions", JSONArray(r.conclusions.map { Redactor.text(it) }))
            put("nextSteps", JSONArray(r.nextSteps))
            put("selectedDevice", r.selectedDevice?.vidPid ?: JSONObject.NULL)
            put("driver", r.driver ?: JSONObject.NULL)
            put("permission", r.permissionState)
            put("controlLinesReadOnly", r.controlLines ?: JSONObject.NULL)
            put("reconnects", r.reconnects)
            put("bytesWrittenToDevice", r.bytesWritten)
            put("wifiModuleIncluded", wifiIncluded)
            put("captures", caps)
            put("steps", steps)
            put("limitations", JSONArray(listOf(
                "Leitura passiva: o app nunca escreve na serial, não reseta a placa e não altera DTR/RTS.",
                "Ausência de saída serial não prova defeito do ESP32.",
                "Nada foi enviado a servidores; este ZIP só sai do celular se você compartilhar."
            )))
        }
    }

    fun deviceJson(d: DeviceInfo) = JSONObject().apply {
        put("manufacturer", d.manufacturer); put("model", d.model)
        put("androidRelease", d.androidRelease); put("sdkInt", d.sdkInt)
        put("supportedAbis", JSONArray(d.abis)); put("usbHostFeature", d.usbHostFeature)
        put("locale", d.locale)
        put("appVersionName", d.appVersionName); put("appVersionCode", d.appVersionCode)
    }

    private fun usbDevice(u: UsbDeviceInfo) = JSONObject().apply {
        put("id", u.id)
        put("vidPid", u.vidPid)
        put("usbClass", u.usbClass)
        put("manufacturer", u.manufacturer ?: JSONObject.NULL)
        put("product", u.product ?: JSONObject.NULL)
        put("hasPermissionAtScan", u.hasPermission)
        put("interfaces", JSONArray(u.interfaces.map { i ->
            JSONObject().apply {
                put("id", i.id); put("class", i.usbClass)
                put("endpoints", JSONArray(i.endpoints.map { e ->
                    JSONObject().apply {
                        put("address", "0x%02X".format(e.address)); put("type", e.type)
                        put("direction", if (e.direction == 0x80) "IN" else "OUT"); put("maxPacketSize", e.maxPacketSize)
                    }
                }))
            }
        }))
    }

    fun usbJson(r: DiagReport) = JSONObject().apply {
        put("devices", JSONArray(r.devices.map { usbDevice(it) }))
        put("selected", r.selectedDevice?.vidPid ?: JSONObject.NULL)
        put("driver", r.driver ?: JSONObject.NULL)
        put("permission", r.permissionState)
        put("controlLinesReadOnly", r.controlLines ?: JSONObject.NULL)
        put("reconnects", r.reconnects)
        put("errors", JSONArray(r.steps.filter { it.status.name == "FAIL" }.map { Redactor.text("${it.id}: ${it.detail}") }))
    }

    fun wifiJson(w: WifiResult) = JSONObject().apply {
        put("ranAt", iso(w.ranAtMs))
        put("wifiConnected", w.wifiConnected)
        put("ssid", w.ssidInfo)
        put("localIp", w.localIp ?: JSONObject.NULL)
        put("gateway", w.gateway ?: JSONObject.NULL)
        put("gatewayIsPrivate", w.gatewayIsPrivate)
        put("tcp80", w.tcp80)
        put("httpStatusLine", w.httpStatusLine ?: JSONObject.NULL)
        put("httpHeaders", w.httpHeaders?.let { Redactor.text(it) } ?: JSONObject.NULL)
        put("bodySample", w.bodySample?.let { Redactor.text(it) } ?: JSONObject.NULL)
        put("notes", JSONArray(w.notes))
        put("request", "TCP connect + um único GET / (somente leitura, sem comandos)")
    }

    fun serialTxt(caps: List<SerialCapture>): String {
        val sb = StringBuilder()
        sb.append("# Captura serial passiva (nenhum byte foi enviado ao dispositivo)\n")
        sb.append("# Decodificação: UTF-8 com substituição; controles não imprimíveis aparecem como '·'.\n")
        sb.append("# Senhas/tokens/e-mails/MAC/IP públicos são redigidos no texto; o hexdump abaixo é dos bytes originais (primeiros $HEXDUMP_BYTES).\n\n")
        if (caps.isEmpty()) sb.append("(nenhuma captura: a porta serial não chegou a ser lida)\n")
        for (c in caps) {
            sb.append("=== ${c.baud} baud | ${c.totalBytes} bytes | ${c.durationMs} ms | início ${iso(c.startedAtMs)}")
            if (c.truncated) sb.append(" | TRUNCADO")
            sb.append(" ===\n")
            if (c.chunks.isEmpty()) sb.append("(sem dados)\n")
            for (ch in c.chunks) {
                val text = String(ch.bytes, Charsets.UTF_8)
                    .map { ch2 -> if (ch2 == '\n' || ch2 == '\r' || ch2 == '\t' || ch2.code >= 0x20) ch2 else '·' }
                    .joinToString("")
                val ts = "[+%.3fs] ".format(Locale.US, ch.offsetMs / 1000.0)
                Redactor.text(text).replace("\r\n", "\n").replace('\r', '\n').trimEnd('\n').split('\n').forEach {
                    sb.append(ts).append(it).append('\n')
                }
                if (sb.length > MAX_SERIAL_TXT) {
                    sb.append("\n[serial.txt truncado em $MAX_SERIAL_TXT caracteres]\n")
                    return sb.toString()
                }
            }
            val head = c.allBytes().take(HEXDUMP_BYTES)
            if (head.isNotEmpty()) {
                sb.append("--- hexdump (primeiros ${head.size} bytes) ---\n")
                head.chunked(16).forEachIndexed { i, row ->
                    sb.append("%04X  ".format(i * 16))
                    sb.append(row.joinToString(" ") { "%02X".format(it.toInt() and 0xFF) }.padEnd(48))
                    sb.append("  ")
                    sb.append(row.map { b -> val v = b.toInt() and 0xFF; if (v in 0x20..0x7E) v.toChar() else '.' }.joinToString(""))
                    sb.append('\n')
                }
            }
            sb.append('\n')
        }
        return sb.toString()
    }

    fun readme(r: DiagReport): String = """
        ESP32 Serial Diagnostic — pacote de diagnóstico
        ================================================
        Gerado em: ${iso(r.finishedAtMs)}
        Resultado: ${r.outcome.label} (confiança ${r.confidence.label})

        Como compartilhar
        -----------------
        Envie ESTE arquivo .zip inteiro ao agente/desenvolvedor (não precisa abrir nem editar).

        Conteúdo
        --------
        summary.json  resultado por etapa, evidências, tempos e nível de confiança
        device.json   modelo do Android, versão do sistema e do app
        usb.json      dispositivos USB, VID/PID, interfaces/endpoints, driver, permissão, erros
        serial.txt    saída serial capturada (com timestamps e hexdump inicial)
        wifi.json     só existe se você executou o diagnóstico Wi-Fi opcional
        app-log.txt   log do próprio aplicativo (com dados sensíveis redigidos)

        Privacidade e segurança
        -----------------------
        - Nada é enviado automaticamente a nenhum servidor.
        - O app só LÊ a serial: não escreve, não reseta a placa, não altera DTR/RTS e não grava firmware.
        - Não coletamos senhas, tokens, localização, SSIDs de outras redes nem identificadores pessoais.
        - Você pode apagar os relatórios no botão "Excluir relatórios salvos".
    """.trimIndent() + "\n"
}
