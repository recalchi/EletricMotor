package io.github.recalchi.esp32diag.core

import io.github.recalchi.esp32diag.report.DeviceInfo
import io.github.recalchi.esp32diag.report.ReportBuilder
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.ByteArrayInputStream
import java.util.zip.ZipInputStream

class ReportBuilderTest {
    private val device = DeviceInfo("samsung", "SM-TEST", "14", 34, listOf("arm64-v8a"), true, "pt-BR", "0.1.0", 1)

    private fun report(script: (Int, Int) -> ByteArray?): DiagReport {
        val clock = FakeClock()
        val gw = FakeGateway(clock).apply { permitted = true }
        gw.openResults.add { FakeSession(clock, script = script) }
        return runner(gw, clock).run()
    }

    private fun unzip(bytes: ByteArray): Map<String, ByteArray> {
        val out = LinkedHashMap<String, ByteArray>()
        ZipInputStream(ByteArrayInputStream(bytes)).use { z ->
            while (true) {
                val e = z.nextEntry ?: break
                out[e.name] = z.readBytes()
            }
        }
        return out
    }

    @Test fun zipContainsAllRequiredFilesAndIsReadable() {
        val r = report { _, _ -> BOOT_BANNER + EMGP_LINE }
        val files = ReportBuilder.files(r, device, "log\n", null)
        val zip = unzip(ReportBuilder.zip(files, r.finishedAtMs))
        assertEquals(setOf("README.txt", "summary.json", "device.json", "usb.json", "serial.txt", "app-log.txt"), zip.keys)
        assertFalse("wifi.json só existe se o módulo rodou", zip.containsKey("wifi.json"))
        val summary = JSONObject(String(zip["summary.json"]!!))
        assertEquals("SERIAL_DATA_OK", summary.getString("outcome"))
        assertEquals(0, summary.getInt("bytesWrittenToDevice"))
        assertTrue(summary.getJSONArray("steps").length() >= 5)
        assertEquals("10C4:EA60", JSONObject(String(zip["usb.json"]!!)).getJSONArray("devices").getJSONObject(0).getString("vidPid"))
        assertTrue(String(zip["serial.txt"]!!).contains("hexdump"))
    }

    @Test fun serialTxtIsTimestampedAndRedacted() {
        val r = report { _, _ -> "boot ok password=abc123 e-mail x@y.com\r\n".toByteArray() }
        val txt = ReportBuilder.serialTxt(r.captures)
        assertTrue(txt.contains("[+"))
        assertTrue(txt.contains("baud |"))
        val textPart = txt.substringBefore("--- hexdump")
        assertFalse(textPart.contains("abc123"))
        assertFalse(textPart.contains("x@y.com"))
    }

    @Test fun serialTxtIsBounded() {
        val r = report { _, _ -> ByteArray(4000) { 'A'.code.toByte() } }
        assertTrue(ReportBuilder.serialTxt(r.captures).length < 700_000)
    }

    @Test fun wifiJsonIncludedWhenModuleRan() {
        val r = report { _, _ -> null }
        val w = WifiResult(1L, true, "ESP_32BDD", "192.168.4.2", "192.168.4.1", true, "falhou", null, null, null, listOf("n"))
        val zip = unzip(ReportBuilder.zip(ReportBuilder.files(r, device, "", w), 0))
        val j = JSONObject(String(zip["wifi.json"]!!))
        assertEquals("192.168.4.1", j.getString("gateway"))
        assertTrue(JSONObject(String(zip["summary.json"]!!)).getBoolean("wifiModuleIncluded"))
    }

    @Test fun emptyCaptureStillProducesValidReport() {
        val clock = FakeClock()
        val gw = FakeGateway(clock).apply { devices.clear() }
        val r = runner(gw, clock).run()
        val zip = unzip(ReportBuilder.zip(ReportBuilder.files(r, device, "", null), 0))
        assertTrue(String(zip["serial.txt"]!!).contains("nenhuma captura"))
        assertEquals("NO_DEVICE", JSONObject(String(zip["summary.json"]!!)).getString("outcome"))
    }

    @Test fun repeatedLinesAreCollapsedAndRateEvidenceIsInSummary() {
        val clock = FakeClock()
        val gw = FakeGateway(clock).apply { permitted = true }
        val s = FakeSession(clock, costMs = 1) { _, _ -> PERIODIC_FLOOD }
        s.readback = { b -> ChipReadback(0x02, b.toLong(), 0x0800, 0) }
        gw.openResults.add { s }
        val r = runner(gw, clock).run()
        val txt = ReportBuilder.serialTxt(r.captures)
        assertTrue(txt.contains("repetida mais"))
        assertTrue(txt.contains("VAZÃO ACIMA DO LIMITE FÍSICO"))
        assertTrue(txt.length < 100_000)
        val sum = ReportBuilder.summary(r, device, false)
        assertEquals("CP2102", sum.getString("chip"))
        val c0 = sum.getJSONArray("captures").getJSONObject(0)
        assertTrue(c0.getBoolean("rateAnomaly"))
        assertEquals(33, c0.getInt("repeatPeriodBytes"))
        assertTrue(sum.getJSONArray("chipReadbacks").length() >= 2)
    }
}
