package io.github.recalchi.esp32diag.core

enum class Kind { EMPTY, TOO_FEW, TEXT, GARBLED }

data class Analysis(
    val baud: Int,
    val totalBytes: Int,
    val printableRatio: Double,
    val lineCount: Int,
    val kind: Kind,
    val signatures: List<String>,
    val preview: String,
    val period: Int? = null,
    val distinctBytes: Int = 0,
    val topBytes: String = "",
    val rateBps: Long = 0,
    val physicalMaxBps: Long = 0,
    val anomalous: Boolean = false
)

object SerialAnalyzer {
    private val signatureTable = listOf(
        "rst:0x" to "Banner de boot do ROM do ESP32 (reset detectado na saída)",
        "ESP-ROM:" to "Banner de boot do ROM do ESP32",
        "waiting for download" to "ESP32 em modo de gravação (bootloader): GPIO0 baixo no boot",
        "Guru Meditation" to "Firmware travou (Guru Meditation Error)",
        "Brownout detector" to "Brownout: alimentação insuficiente/instável",
        "invalid header" to "Bootloader não achou firmware válido na flash",
        "flash read err" to "Falha de leitura da flash",
        "{\"v\":1" to "Mensagens EMGP v1 do firmware gateway (EletricMotor)",
        "I (" to "Logs ESP-IDF (nível info)",
        "E (" to "Logs de erro do ESP-IDF"
    )

    fun analyze(baud: Int, bytes: ByteArray): Analysis {
        if (bytes.isEmpty()) return Analysis(baud, 0, 0.0, 0, Kind.EMPTY, emptyList(), "")
        var printable = 0
        var lines = 0
        for (b in bytes) {
            val v = b.toInt() and 0xFF
            if (v in 0x20..0x7E || v == 0x0A || v == 0x0D || v == 0x09) printable++
            if (v == 0x0A) lines++
        }
        val ratio = printable.toDouble() / bytes.size
        val text = String(bytes, Charsets.ISO_8859_1)
        val sigs = signatureTable.filter { text.contains(it.first) }.map { it.second }.distinct()
        val kind = when {
            bytes.size < 8 -> Kind.TOO_FEW
            ratio >= 0.85 -> Kind.TEXT
            else -> Kind.GARBLED
        }
        val preview = Redactor.text(
            text.take(400).map { c ->
                when {
                    c.code in 0x20..0x7E || c == '\n' -> c
                    c == '\r' || c == '\t' -> ' '
                    else -> '·'
                }
            }.joinToString("")
        )
        val hist = IntArray(256)
        bytes.forEach { hist[it.toInt() and 0xFF]++ }
        val top = hist.withIndex().filter { it.value > 0 }.sortedByDescending { it.value }.take(5)
            .joinToString(" ") { "%02X×%d".format(it.index, it.value) }
        return Analysis(baud, bytes.size, ratio, lines, kind, sigs, preview,
            period = period(bytes), distinctBytes = hist.count { it > 0 }, topBytes = top)
    }

    /** Menor período p (1..256) em que ≥95% dos bytes repetem p posições depois; null se não há. */
    fun period(b: ByteArray): Int? {
        if (b.size < 512) return null
        val start = 64
        for (p in 1..256) {
            val n = minOf(b.size, 2048) - start - p
            if (n < 128) return null
            var eq = 0
            for (i in start until start + n) if (b[i] == b[i + p]) eq++
            if (eq >= n * 0.95) return p
        }
        return null
    }
}
