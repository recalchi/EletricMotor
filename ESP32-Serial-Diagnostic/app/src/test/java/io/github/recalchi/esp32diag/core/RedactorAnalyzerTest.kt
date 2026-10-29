package io.github.recalchi.esp32diag.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class RedactorAnalyzerTest {
    @Test fun redactsSecrets() {
        val s = Redactor.text("""WIFI password=abc123 e {"token":"xyz","ok":1} Authorization: Bearer qwerty""")
        assertFalse(s.contains("abc123"))
        assertFalse(s.contains("xyz"))
        assertFalse(s.contains("qwerty"))
        assertTrue(s.contains("\"ok\":1"))
    }

    @Test fun redactsPersonalIdentifiersButKeepsLocalNetwork() {
        val s = Redactor.text("mail a@b.com mac AA:BB:CC:DD:EE:FF gw 192.168.4.1 pub 8.8.8.8 ver 300.1.1.1")
        assertFalse(s.contains("a@b.com"))
        assertFalse(s.contains("AA:BB"))
        assertTrue(s.contains("192.168.4.1"))
        assertFalse(s.contains("8.8.8.8"))
        assertTrue(s.contains("300.1.1.1"))
    }

    @Test fun ssidPolicyKeepsOnlyEspNetworks() {
        assertTrue(Redactor.text("ssid=ESP_32BDD").contains("ESP_32BDD"))
        val other = Redactor.text("ssid=CasaDoJoao")
        assertFalse(other.contains("CasaDoJoao"))
    }

    @Test fun analyzerClassifiesKinds() {
        assertEquals(Kind.EMPTY, SerialAnalyzer.analyze(115200, ByteArray(0)).kind)
        assertEquals(Kind.TOO_FEW, SerialAnalyzer.analyze(115200, byteArrayOf(1, 2)).kind)
        assertEquals(Kind.TEXT, SerialAnalyzer.analyze(115200, EMGP_LINE).kind)
        assertEquals(Kind.GARBLED, SerialAnalyzer.analyze(115200, NOISE).kind)
    }

    @Test fun analyzerFindsBootSignatures() {
        val a = SerialAnalyzer.analyze(115200, BOOT_BANNER + "waiting for download\r\n".toByteArray())
        assertTrue(a.signatures.any { it.contains("modo de gravação") })
        assertTrue(a.signatures.any { it.contains("ROM") })
        val b = SerialAnalyzer.analyze(115200, "Brownout detector was triggered\r\n".toByteArray())
        assertTrue(b.signatures.any { it.contains("Brownout") })
    }

    @Test fun previewIsRedacted() {
        val a = SerialAnalyzer.analyze(115200, "connecting password=segredo123 ok\r\n".toByteArray())
        assertFalse(a.preview.contains("segredo123"))
    }

    @Test fun appLogRotatesAndRedacts() {
        val log = AppLog(maxLines = 3)
        repeat(10) { log.i("t", "linha $it token=abc$it") }
        val d = log.dump()
        assertTrue(d.contains("7 linhas antigas"))
        assertFalse(d.contains("abc9"))
        assertEquals(3, d.lines().count { it.contains(" I t: ") })
    }

    @Test fun detectsRepeatingPatternPeriod() {
        assertEquals(33, SerialAnalyzer.period(PERIODIC_FLOOD))
        val noise = java.util.Random(1).let { r -> ByteArray(2000) { r.nextInt(256).toByte() } }
        assertEquals(null, SerialAnalyzer.period(noise))
        assertEquals(null, SerialAnalyzer.period(ByteArray(100)))
    }

    @Test fun analyzerReportsByteDistribution() {
        val a = SerialAnalyzer.analyze(115200, PERIODIC_FLOOD)
        assertTrue(a.distinctBytes in 2..33)
        assertTrue(a.topBytes.contains("×"))
    }
}
